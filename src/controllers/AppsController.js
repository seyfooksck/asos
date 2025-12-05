const App = require('../models/App');
const InstalledApp = require('../models/InstalledApp');
const Docker = require('dockerode');
const logger = require('../utils/logger');

class AppsController {
  constructor() {
    this.docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });
  }

  /**
   * Mevcut uygulama listesi (App Store)
   * GET /api/apps
   */
  async getApps(req, res) {
    try {
      const { category, search } = req.query;
      const query = {};

      if (category) {
        query.category = category;
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      const apps = await App.find(query).sort({ isPopular: -1, name: 1 });
      res.json(apps);
    } catch (error) {
      logger.error('Uygulama listesi hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Tek uygulama detayı
   * GET /api/apps/:id
   */
  async getApp(req, res) {
    try {
      const app = await App.findById(req.params.id);
      
      if (!app) {
        return res.status(404).json({ error: 'Uygulama bulunamadı' });
      }
      
      res.json(app);
    } catch (error) {
      logger.error('Uygulama detay hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Yeni uygulama ekle (Admin)
   * POST /api/apps
   */
  async createApp(req, res) {
    try {
      const {
        name, slug, description, icon, category,
        dockerImage, dockerTag, ports, volumes,
        environment, minMemory, minCpu, website,
        documentation, isPopular
      } = req.body;

      // Slug kontrolü
      const existingApp = await App.findOne({ slug });
      if (existingApp) {
        return res.status(400).json({ error: 'Bu slug zaten kullanımda' });
      }

      const app = new App({
        name, slug, description, icon, category,
        dockerImage, dockerTag, ports, volumes,
        environment, minMemory, minCpu, website,
        documentation, isPopular
      });

      await app.save();

      logger.info(`Yeni uygulama eklendi: ${name} by ${req.user.email}`);

      res.status(201).json(app);
    } catch (error) {
      logger.error('Uygulama ekleme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Uygulama güncelle (Admin)
   * PUT /api/apps/:id
   */
  async updateApp(req, res) {
    try {
      const app = await App.findById(req.params.id);
      
      if (!app) {
        return res.status(404).json({ error: 'Uygulama bulunamadı' });
      }

      const allowedUpdates = [
        'name', 'description', 'icon', 'category',
        'dockerImage', 'dockerTag', 'ports', 'volumes',
        'environment', 'minMemory', 'minCpu', 'website',
        'documentation', 'isPopular'
      ];

      allowedUpdates.forEach(field => {
        if (req.body[field] !== undefined) {
          app[field] = req.body[field];
        }
      });

      await app.save();

      res.json(app);
    } catch (error) {
      logger.error('Uygulama güncelleme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Uygulama sil (Admin)
   * DELETE /api/apps/:id
   */
  async deleteApp(req, res) {
    try {
      const app = await App.findById(req.params.id);
      
      if (!app) {
        return res.status(404).json({ error: 'Uygulama bulunamadı' });
      }

      await app.deleteOne();

      logger.info(`Uygulama silindi: ${app.name} by ${req.user.email}`);

      res.json({ message: 'Uygulama silindi' });
    } catch (error) {
      logger.error('Uygulama silme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Kurulu uygulamalar
   * GET /api/apps/installed
   */
  async getInstalledApps(req, res) {
    try {
      const query = req.user.role === 'admin' ? {} : { owner: req.user._id };
      
      const installedApps = await InstalledApp.find(query)
        .populate('app')
        .populate('domain', 'name')
        .populate('owner', 'name email')
        .sort({ createdAt: -1 });

      // Container durumlarını güncelle
      for (let installed of installedApps) {
        if (installed.containerId) {
          try {
            const container = this.docker.getContainer(installed.containerId);
            const info = await container.inspect();
            installed.status = info.State.Running ? 'running' : 'stopped';
          } catch (e) {
            installed.status = 'error';
          }
        }
      }
      
      res.json(installedApps);
    } catch (error) {
      logger.error('Kurulu uygulama listesi hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Uygulama kur
   * POST /api/apps/:id/install
   */
  async installApp(req, res) {
    try {
      const app = await App.findById(req.params.id);
      
      if (!app) {
        return res.status(404).json({ error: 'Uygulama bulunamadı' });
      }

      const {
        containerName,
        domainId,
        subdomain,
        ports,
        volumes,
        environment,
        memory,
        cpu
      } = req.body;

      // Container adı kontrolü
      const existingInstall = await InstalledApp.findOne({ containerName });
      if (existingInstall) {
        return res.status(400).json({ error: 'Bu container adı zaten kullanımda' });
      }

      const io = req.app.get('io');

      // InstalledApp kaydı oluştur
      const installedApp = new InstalledApp({
        app: app._id,
        owner: req.user._id,
        domain: domainId || undefined,
        subdomain,
        containerName,
        status: 'installing',
        ports: ports || app.ports,
        volumes: volumes || app.volumes,
        environment: environment || app.environment,
        memory: memory || app.minMemory,
        cpu: cpu || app.minCpu
      });

      await installedApp.save();

      io.emit('app:install:start', { appId: installedApp._id, name: app.name });

      // Image çek
      try {
        io.emit('app:install:progress', { appId: installedApp._id, step: 'pulling', message: 'Image çekiliyor...' });
        
        await new Promise((resolve, reject) => {
          this.docker.pull(`${app.dockerImage}:${app.dockerTag}`, (err, stream) => {
            if (err) return reject(err);
            
            this.docker.modem.followProgress(stream, (err, output) => {
              if (err) return reject(err);
              resolve(output);
            }, (event) => {
              io.emit('app:install:progress', { appId: installedApp._id, step: 'pulling', ...event });
            });
          });
        });

        // Port binding
        const exposedPorts = {};
        const portBindings = {};
        
        const appPorts = ports || app.ports || [];
        appPorts.forEach(p => {
          const containerPort = `${p.container}/${p.protocol || 'tcp'}`;
          exposedPorts[containerPort] = {};
          portBindings[containerPort] = [{ HostPort: String(p.host) }];
        });

        // Volume binding
        const binds = [];
        const appVolumes = volumes || app.volumes || [];
        appVolumes.forEach(v => {
          binds.push(`${v.host}:${v.container}`);
        });

        // Environment variables
        const envArray = [];
        const appEnv = environment || app.environment || [];
        appEnv.forEach(e => {
          if (e.value) {
            envArray.push(`${e.key}=${e.value}`);
          }
        });

        io.emit('app:install:progress', { appId: installedApp._id, step: 'creating', message: 'Container oluşturuluyor...' });

        // Container oluştur
        const container = await this.docker.createContainer({
          Image: `${app.dockerImage}:${app.dockerTag}`,
          name: containerName,
          ExposedPorts: exposedPorts,
          Env: envArray,
          HostConfig: {
            PortBindings: portBindings,
            Binds: binds,
            RestartPolicy: { Name: 'unless-stopped' },
            Memory: (memory || app.minMemory || 512) * 1024 * 1024,
            NanoCpus: (cpu || app.minCpu || 1) * 1e9
          }
        });

        // Container başlat
        io.emit('app:install:progress', { appId: installedApp._id, step: 'starting', message: 'Container başlatılıyor...' });
        await container.start();

        // InstalledApp güncelle
        installedApp.containerId = container.id;
        installedApp.status = 'running';
        installedApp.logs.push({
          timestamp: new Date(),
          message: 'Uygulama başarıyla kuruldu',
          level: 'info'
        });
        await installedApp.save();

        logger.info(`Uygulama kuruldu: ${app.name} (${containerName}) by ${req.user.email}`);
        io.emit('app:install:complete', { appId: installedApp._id, name: app.name });

        res.status(201).json({
          message: 'Uygulama başarıyla kuruldu',
          installedApp
        });

      } catch (dockerError) {
        installedApp.status = 'error';
        installedApp.logs.push({
          timestamp: new Date(),
          message: dockerError.message,
          level: 'error'
        });
        await installedApp.save();

        io.emit('app:install:error', { appId: installedApp._id, error: dockerError.message });
        
        logger.error('Uygulama kurulum hatası:', dockerError);
        res.status(500).json({ error: 'Uygulama kurulamadı', details: dockerError.message });
      }

    } catch (error) {
      logger.error('Uygulama kurulum hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Kurulu uygulama detayı
   * GET /api/apps/installed/:id
   */
  async getInstalledApp(req, res) {
    try {
      const installedApp = await InstalledApp.findById(req.params.id)
        .populate('app')
        .populate('domain', 'name')
        .populate('owner', 'name email');

      if (!installedApp) {
        return res.status(404).json({ error: 'Kurulu uygulama bulunamadı' });
      }

      // Yetki kontrolü
      if (req.user.role !== 'admin' && installedApp.owner._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu uygulama için yetkiniz yok' });
      }

      // Container durumunu güncelle
      if (installedApp.containerId) {
        try {
          const container = this.docker.getContainer(installedApp.containerId);
          const info = await container.inspect();
          const stats = await container.stats({ stream: false });
          
          installedApp._doc.containerInfo = {
            state: info.State,
            stats: {
              memory: {
                usage: stats.memory_stats?.usage || 0,
                limit: stats.memory_stats?.limit || 0
              }
            }
          };
        } catch (e) {
          installedApp._doc.containerInfo = { state: { Status: 'error' } };
        }
      }

      res.json(installedApp);
    } catch (error) {
      logger.error('Kurulu uygulama detay hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Kurulu uygulamayı başlat
   * POST /api/apps/installed/:id/start
   */
  async startInstalledApp(req, res) {
    try {
      const installedApp = await InstalledApp.findById(req.params.id);

      if (!installedApp) {
        return res.status(404).json({ error: 'Kurulu uygulama bulunamadı' });
      }

      // Yetki kontrolü
      if (req.user.role !== 'admin' && installedApp.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu uygulama için yetkiniz yok' });
      }

      const container = this.docker.getContainer(installedApp.containerId);
      await container.start();

      installedApp.status = 'running';
      installedApp.logs.push({
        timestamp: new Date(),
        message: 'Uygulama başlatıldı',
        level: 'info'
      });
      await installedApp.save();

      logger.info(`Uygulama başlatıldı: ${installedApp.containerName} by ${req.user.email}`);

      res.json({ message: 'Uygulama başlatıldı' });
    } catch (error) {
      logger.error('Uygulama başlatma hatası:', error);
      res.status(500).json({ error: 'Uygulama başlatılamadı' });
    }
  }

  /**
   * Kurulu uygulamayı durdur
   * POST /api/apps/installed/:id/stop
   */
  async stopInstalledApp(req, res) {
    try {
      const installedApp = await InstalledApp.findById(req.params.id);

      if (!installedApp) {
        return res.status(404).json({ error: 'Kurulu uygulama bulunamadı' });
      }

      // Yetki kontrolü
      if (req.user.role !== 'admin' && installedApp.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu uygulama için yetkiniz yok' });
      }

      const container = this.docker.getContainer(installedApp.containerId);
      await container.stop();

      installedApp.status = 'stopped';
      installedApp.logs.push({
        timestamp: new Date(),
        message: 'Uygulama durduruldu',
        level: 'info'
      });
      await installedApp.save();

      logger.info(`Uygulama durduruldu: ${installedApp.containerName} by ${req.user.email}`);

      res.json({ message: 'Uygulama durduruldu' });
    } catch (error) {
      logger.error('Uygulama durdurma hatası:', error);
      res.status(500).json({ error: 'Uygulama durdurulamadı' });
    }
  }

  /**
   * Kurulu uygulamayı yeniden başlat
   * POST /api/apps/installed/:id/restart
   */
  async restartInstalledApp(req, res) {
    try {
      const installedApp = await InstalledApp.findById(req.params.id);

      if (!installedApp) {
        return res.status(404).json({ error: 'Kurulu uygulama bulunamadı' });
      }

      // Yetki kontrolü
      if (req.user.role !== 'admin' && installedApp.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu uygulama için yetkiniz yok' });
      }

      const container = this.docker.getContainer(installedApp.containerId);
      await container.restart();

      installedApp.status = 'running';
      installedApp.logs.push({
        timestamp: new Date(),
        message: 'Uygulama yeniden başlatıldı',
        level: 'info'
      });
      await installedApp.save();

      logger.info(`Uygulama yeniden başlatıldı: ${installedApp.containerName} by ${req.user.email}`);

      res.json({ message: 'Uygulama yeniden başlatıldı' });
    } catch (error) {
      logger.error('Uygulama yeniden başlatma hatası:', error);
      res.status(500).json({ error: 'Uygulama yeniden başlatılamadı' });
    }
  }

  /**
   * Kurulu uygulamayı kaldır
   * DELETE /api/apps/installed/:id
   */
  async uninstallApp(req, res) {
    try {
      const installedApp = await InstalledApp.findById(req.params.id);

      if (!installedApp) {
        return res.status(404).json({ error: 'Kurulu uygulama bulunamadı' });
      }

      // Yetki kontrolü
      if (req.user.role !== 'admin' && installedApp.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu uygulama için yetkiniz yok' });
      }

      // Container'ı sil
      if (installedApp.containerId) {
        try {
          const container = this.docker.getContainer(installedApp.containerId);
          try {
            await container.stop();
          } catch (e) {
            // Zaten durmuş olabilir
          }
          await container.remove({ force: true });
        } catch (e) {
          logger.warn('Container silme hatası:', e);
        }
      }

      const containerName = installedApp.containerName;
      await installedApp.deleteOne();

      logger.info(`Uygulama kaldırıldı: ${containerName} by ${req.user.email}`);

      res.json({ message: 'Uygulama kaldırıldı' });
    } catch (error) {
      logger.error('Uygulama kaldırma hatası:', error);
      res.status(500).json({ error: 'Uygulama kaldırılamadı' });
    }
  }

  /**
   * Kurulu uygulama logları
   * GET /api/apps/installed/:id/logs
   */
  async getInstalledAppLogs(req, res) {
    try {
      const installedApp = await InstalledApp.findById(req.params.id);

      if (!installedApp) {
        return res.status(404).json({ error: 'Kurulu uygulama bulunamadı' });
      }

      // Yetki kontrolü
      if (req.user.role !== 'admin' && installedApp.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu uygulama için yetkiniz yok' });
      }

      // Container loglarını al
      let containerLogs = '';
      if (installedApp.containerId) {
        try {
          const container = this.docker.getContainer(installedApp.containerId);
          const logs = await container.logs({
            stdout: true,
            stderr: true,
            tail: parseInt(req.query.tail) || 100,
            timestamps: true
          });
          containerLogs = logs.toString();
        } catch (e) {
          // Container erişilemez
        }
      }

      res.json({
        appLogs: installedApp.logs,
        containerLogs
      });
    } catch (error) {
      logger.error('Uygulama log hatası:', error);
      res.status(500).json({ error: 'Loglar alınamadı' });
    }
  }

  /**
   * Varsayılan uygulamaları yükle (seed)
   * POST /api/apps/seed
   */
  async seedApps(req, res) {
    try {
      const defaultApps = [
        {
          name: 'WordPress',
          slug: 'wordpress',
          description: 'Popüler blog ve CMS platformu',
          icon: '📝',
          category: 'web',
          dockerImage: 'wordpress',
          dockerTag: 'latest',
          ports: [{ container: 80, host: 8080 }],
          volumes: [{ container: '/var/www/html', host: '/data/wordpress' }],
          environment: [
            { key: 'WORDPRESS_DB_HOST', value: '', required: true, description: 'MySQL host' },
            { key: 'WORDPRESS_DB_USER', value: '', required: true, description: 'MySQL kullanıcı' },
            { key: 'WORDPRESS_DB_PASSWORD', value: '', required: true, description: 'MySQL şifre' },
            { key: 'WORDPRESS_DB_NAME', value: 'wordpress', required: true, description: 'Veritabanı adı' }
          ],
          minMemory: 256,
          minCpu: 0.5,
          website: 'https://wordpress.org',
          isPopular: true
        },
        {
          name: 'MySQL',
          slug: 'mysql',
          description: 'Popüler ilişkisel veritabanı',
          icon: '🗄️',
          category: 'database',
          dockerImage: 'mysql',
          dockerTag: '8.0',
          ports: [{ container: 3306, host: 3306 }],
          volumes: [{ container: '/var/lib/mysql', host: '/data/mysql' }],
          environment: [
            { key: 'MYSQL_ROOT_PASSWORD', value: '', required: true, description: 'Root şifresi' },
            { key: 'MYSQL_DATABASE', value: '', required: false, description: 'Varsayılan veritabanı' }
          ],
          minMemory: 512,
          minCpu: 1,
          website: 'https://mysql.com',
          isPopular: true
        },
        {
          name: 'PostgreSQL',
          slug: 'postgresql',
          description: 'Güçlü açık kaynak veritabanı',
          icon: '🐘',
          category: 'database',
          dockerImage: 'postgres',
          dockerTag: '15',
          ports: [{ container: 5432, host: 5432 }],
          volumes: [{ container: '/var/lib/postgresql/data', host: '/data/postgres' }],
          environment: [
            { key: 'POSTGRES_PASSWORD', value: '', required: true, description: 'Postgres şifresi' },
            { key: 'POSTGRES_USER', value: 'postgres', required: false, description: 'Kullanıcı adı' },
            { key: 'POSTGRES_DB', value: '', required: false, description: 'Varsayılan veritabanı' }
          ],
          minMemory: 512,
          minCpu: 1,
          website: 'https://postgresql.org',
          isPopular: true
        },
        {
          name: 'Redis',
          slug: 'redis',
          description: 'In-memory veri yapısı deposu',
          icon: '⚡',
          category: 'database',
          dockerImage: 'redis',
          dockerTag: '7',
          ports: [{ container: 6379, host: 6379 }],
          volumes: [{ container: '/data', host: '/data/redis' }],
          environment: [],
          minMemory: 128,
          minCpu: 0.25,
          website: 'https://redis.io',
          isPopular: true
        },
        {
          name: 'Nginx',
          slug: 'nginx',
          description: 'Yüksek performanslı web sunucusu',
          icon: '🌐',
          category: 'web',
          dockerImage: 'nginx',
          dockerTag: 'alpine',
          ports: [{ container: 80, host: 80 }, { container: 443, host: 443 }],
          volumes: [
            { container: '/usr/share/nginx/html', host: '/data/nginx/html' },
            { container: '/etc/nginx/conf.d', host: '/data/nginx/conf' }
          ],
          environment: [],
          minMemory: 64,
          minCpu: 0.25,
          website: 'https://nginx.org',
          isPopular: true
        },
        {
          name: 'Nextcloud',
          slug: 'nextcloud',
          description: 'Kendi bulut depolama çözümünüz',
          icon: '☁️',
          category: 'storage',
          dockerImage: 'nextcloud',
          dockerTag: 'latest',
          ports: [{ container: 80, host: 8081 }],
          volumes: [{ container: '/var/www/html', host: '/data/nextcloud' }],
          environment: [
            { key: 'MYSQL_HOST', value: '', required: true, description: 'MySQL host' },
            { key: 'MYSQL_DATABASE', value: 'nextcloud', required: true, description: 'Veritabanı adı' },
            { key: 'MYSQL_USER', value: '', required: true, description: 'MySQL kullanıcı' },
            { key: 'MYSQL_PASSWORD', value: '', required: true, description: 'MySQL şifre' }
          ],
          minMemory: 512,
          minCpu: 1,
          website: 'https://nextcloud.com',
          isPopular: true
        },
        {
          name: 'GitLab',
          slug: 'gitlab',
          description: 'DevOps platform - Git repository yönetimi',
          icon: '🦊',
          category: 'development',
          dockerImage: 'gitlab/gitlab-ce',
          dockerTag: 'latest',
          ports: [
            { container: 80, host: 8082 },
            { container: 443, host: 8443 },
            { container: 22, host: 2222 }
          ],
          volumes: [
            { container: '/etc/gitlab', host: '/data/gitlab/config' },
            { container: '/var/log/gitlab', host: '/data/gitlab/logs' },
            { container: '/var/opt/gitlab', host: '/data/gitlab/data' }
          ],
          environment: [
            { key: 'GITLAB_OMNIBUS_CONFIG', value: '', required: false, description: 'GitLab konfigürasyonu' }
          ],
          minMemory: 4096,
          minCpu: 2,
          website: 'https://gitlab.com',
          isPopular: true
        },
        {
          name: 'Portainer',
          slug: 'portainer',
          description: 'Docker yönetim arayüzü',
          icon: '🐳',
          category: 'monitoring',
          dockerImage: 'portainer/portainer-ce',
          dockerTag: 'latest',
          ports: [{ container: 9000, host: 9000 }],
          volumes: [
            { container: '/data', host: '/data/portainer' },
            { container: '/var/run/docker.sock', host: '/var/run/docker.sock' }
          ],
          environment: [],
          minMemory: 128,
          minCpu: 0.25,
          website: 'https://portainer.io',
          isPopular: true
        },
        {
          name: 'Grafana',
          slug: 'grafana',
          description: 'Metrik görselleştirme platformu',
          icon: '📊',
          category: 'monitoring',
          dockerImage: 'grafana/grafana',
          dockerTag: 'latest',
          ports: [{ container: 3000, host: 3001 }],
          volumes: [{ container: '/var/lib/grafana', host: '/data/grafana' }],
          environment: [
            { key: 'GF_SECURITY_ADMIN_PASSWORD', value: '', required: true, description: 'Admin şifresi' }
          ],
          minMemory: 256,
          minCpu: 0.5,
          website: 'https://grafana.com',
          isPopular: false
        },
        {
          name: 'Node.js',
          slug: 'nodejs',
          description: 'JavaScript runtime ortamı',
          icon: '💚',
          category: 'development',
          dockerImage: 'node',
          dockerTag: '20-alpine',
          ports: [{ container: 3000, host: 3002 }],
          volumes: [{ container: '/app', host: '/data/nodejs' }],
          environment: [
            { key: 'NODE_ENV', value: 'production', required: false, description: 'Ortam' }
          ],
          minMemory: 256,
          minCpu: 0.5,
          website: 'https://nodejs.org',
          isPopular: false
        }
      ];

      let created = 0;
      let skipped = 0;

      for (const appData of defaultApps) {
        const exists = await App.findOne({ slug: appData.slug });
        if (!exists) {
          await App.create(appData);
          created++;
        } else {
          skipped++;
        }
      }

      logger.info(`Varsayılan uygulamalar yüklendi: ${created} oluşturuldu, ${skipped} atlandı`);

      res.json({ 
        message: 'Varsayılan uygulamalar yüklendi',
        created,
        skipped
      });
    } catch (error) {
      logger.error('Uygulama seed hatası:', error);
      res.status(500).json({ error: 'Uygulamalar yüklenemedi' });
    }
  }
}

module.exports = new AppsController();
