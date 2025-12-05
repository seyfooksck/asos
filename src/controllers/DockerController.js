const Docker = require('dockerode');
const logger = require('../utils/logger');

class DockerController {
  constructor() {
    this.docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });
  }

  /**
   * Docker durumu
   * GET /api/docker/status
   */
  async getStatus(req, res) {
    try {
      const info = await this.docker.info();
      const version = await this.docker.version();
      
      res.json({
        status: 'running',
        version: version.Version,
        apiVersion: version.ApiVersion,
        containers: info.Containers,
        containersRunning: info.ContainersRunning,
        containersStopped: info.ContainersStopped,
        images: info.Images,
        memoryTotal: info.MemTotal,
        cpus: info.NCPU
      });
    } catch (error) {
      logger.error('Docker status hatası:', error);
      res.status(500).json({ 
        status: 'error',
        error: 'Docker bağlantısı kurulamadı' 
      });
    }
  }

  /**
   * Tüm containerları listele
   * GET /api/docker/containers
   */
  async listContainers(req, res) {
    try {
      const containers = await this.docker.listContainers({ all: true });
      
      const formattedContainers = containers.map(container => ({
        id: container.Id,
        name: container.Names[0]?.replace('/', ''),
        image: container.Image,
        state: container.State,
        status: container.Status,
        ports: container.Ports,
        created: new Date(container.Created * 1000)
      }));
      
      res.json(formattedContainers);
    } catch (error) {
      logger.error('Container listesi hatası:', error);
      res.status(500).json({ error: 'Container listesi alınamadı' });
    }
  }

  /**
   * Container detayları
   * GET /api/docker/containers/:id
   */
  async getContainer(req, res) {
    try {
      const container = this.docker.getContainer(req.params.id);
      const info = await container.inspect();
      const stats = await container.stats({ stream: false });
      
      res.json({
        id: info.Id,
        name: info.Name.replace('/', ''),
        image: info.Config.Image,
        state: info.State,
        created: info.Created,
        ports: info.NetworkSettings.Ports,
        mounts: info.Mounts,
        env: info.Config.Env,
        stats: {
          cpu: this._calculateCpuPercent(stats),
          memory: {
            usage: stats.memory_stats?.usage || 0,
            limit: stats.memory_stats?.limit || 0,
            percent: stats.memory_stats?.limit ? 
              ((stats.memory_stats.usage / stats.memory_stats.limit) * 100).toFixed(2) : 0
          }
        }
      });
    } catch (error) {
      logger.error('Container detay hatası:', error);
      res.status(500).json({ error: 'Container detayları alınamadı' });
    }
  }

  /**
   * Container başlat
   * POST /api/docker/containers/:id/start
   */
  async startContainer(req, res) {
    try {
      const container = this.docker.getContainer(req.params.id);
      await container.start();
      
      logger.info(`Container başlatıldı: ${req.params.id} by ${req.user.email}`);
      
      res.json({ message: 'Container başlatıldı' });
    } catch (error) {
      logger.error('Container başlatma hatası:', error);
      res.status(500).json({ error: 'Container başlatılamadı' });
    }
  }

  /**
   * Container durdur
   * POST /api/docker/containers/:id/stop
   */
  async stopContainer(req, res) {
    try {
      const container = this.docker.getContainer(req.params.id);
      await container.stop();
      
      logger.info(`Container durduruldu: ${req.params.id} by ${req.user.email}`);
      
      res.json({ message: 'Container durduruldu' });
    } catch (error) {
      logger.error('Container durdurma hatası:', error);
      res.status(500).json({ error: 'Container durdurulamadı' });
    }
  }

  /**
   * Container yeniden başlat
   * POST /api/docker/containers/:id/restart
   */
  async restartContainer(req, res) {
    try {
      const container = this.docker.getContainer(req.params.id);
      await container.restart();
      
      logger.info(`Container yeniden başlatıldı: ${req.params.id} by ${req.user.email}`);
      
      res.json({ message: 'Container yeniden başlatıldı' });
    } catch (error) {
      logger.error('Container yeniden başlatma hatası:', error);
      res.status(500).json({ error: 'Container yeniden başlatılamadı' });
    }
  }

  /**
   * Container sil
   * DELETE /api/docker/containers/:id
   */
  async removeContainer(req, res) {
    try {
      const container = this.docker.getContainer(req.params.id);
      
      // Önce durdur
      try {
        await container.stop();
      } catch (e) {
        // Zaten durmuş olabilir
      }
      
      await container.remove({ force: req.query.force === 'true' });
      
      logger.info(`Container silindi: ${req.params.id} by ${req.user.email}`);
      
      res.json({ message: 'Container silindi' });
    } catch (error) {
      logger.error('Container silme hatası:', error);
      res.status(500).json({ error: 'Container silinemedi' });
    }
  }

  /**
   * Container logları
   * GET /api/docker/containers/:id/logs
   */
  async getContainerLogs(req, res) {
    try {
      const container = this.docker.getContainer(req.params.id);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: parseInt(req.query.tail) || 100,
        timestamps: true
      });
      
      res.json({ logs: logs.toString() });
    } catch (error) {
      logger.error('Container log hatası:', error);
      res.status(500).json({ error: 'Container logları alınamadı' });
    }
  }

  /**
   * Container exec (komut çalıştır)
   * POST /api/docker/containers/:id/exec
   */
  async execContainer(req, res) {
    try {
      const { cmd } = req.body;
      
      if (!cmd || !Array.isArray(cmd)) {
        return res.status(400).json({ error: 'Komut gerekli (array formatında)' });
      }

      const container = this.docker.getContainer(req.params.id);
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true
      });
      
      const stream = await exec.start();
      
      let output = '';
      stream.on('data', (data) => {
        output += data.toString();
      });
      
      stream.on('end', () => {
        res.json({ output });
      });
    } catch (error) {
      logger.error('Container exec hatası:', error);
      res.status(500).json({ error: 'Komut çalıştırılamadı' });
    }
  }

  /**
   * Container oluştur ve başlat
   * POST /api/docker/containers
   */
  async createContainer(req, res) {
    try {
      const { 
        name, 
        image, 
        ports, 
        volumes, 
        env, 
        network,
        memory,
        cpus,
        restart
      } = req.body;

      if (!image) {
        return res.status(400).json({ error: 'Image gerekli' });
      }

      // Port binding oluştur
      const exposedPorts = {};
      const portBindings = {};
      
      if (ports && Array.isArray(ports)) {
        ports.forEach(p => {
          const containerPort = `${p.container}/${p.protocol || 'tcp'}`;
          exposedPorts[containerPort] = {};
          portBindings[containerPort] = [{ HostPort: String(p.host) }];
        });
      }

      // Volume binding oluştur
      const binds = [];
      if (volumes && Array.isArray(volumes)) {
        volumes.forEach(v => {
          binds.push(`${v.host}:${v.container}`);
        });
      }

      // Environment variables
      const envArray = [];
      if (env && Array.isArray(env)) {
        env.forEach(e => {
          envArray.push(`${e.key}=${e.value}`);
        });
      }

      const containerConfig = {
        Image: image,
        name: name,
        ExposedPorts: exposedPorts,
        Env: envArray,
        HostConfig: {
          PortBindings: portBindings,
          Binds: binds,
          RestartPolicy: { Name: restart || 'unless-stopped' },
          Memory: memory ? memory * 1024 * 1024 : undefined,
          NanoCpus: cpus ? cpus * 1e9 : undefined
        }
      };

      if (network) {
        containerConfig.HostConfig.NetworkMode = network;
      }

      const container = await this.docker.createContainer(containerConfig);
      await container.start();

      const info = await container.inspect();

      logger.info(`Container oluşturuldu: ${name} by ${req.user.email}`);

      res.status(201).json({
        message: 'Container oluşturuldu ve başlatıldı',
        container: {
          id: info.Id,
          name: info.Name.replace('/', ''),
          state: info.State.Status
        }
      });
    } catch (error) {
      logger.error('Container oluşturma hatası:', error);
      res.status(500).json({ error: 'Container oluşturulamadı', details: error.message });
    }
  }

  /**
   * Image listesi
   * GET /api/docker/images
   */
  async listImages(req, res) {
    try {
      const images = await this.docker.listImages();
      
      const formattedImages = images.map(image => ({
        id: image.Id,
        repoTags: image.RepoTags,
        size: image.Size,
        created: new Date(image.Created * 1000)
      }));
      
      res.json(formattedImages);
    } catch (error) {
      logger.error('Image listesi hatası:', error);
      res.status(500).json({ error: 'Image listesi alınamadı' });
    }
  }

  /**
   * Image çek
   * POST /api/docker/images/pull
   */
  async pullImage(req, res) {
    try {
      const { image, tag = 'latest' } = req.body;
      
      if (!image) {
        return res.status(400).json({ error: 'Image adı gerekli' });
      }

      const io = req.app.get('io');
      
      const stream = await this.docker.pull(`${image}:${tag}`);
      
      this.docker.modem.followProgress(stream, (err, output) => {
        if (err) {
          logger.error('Image pull hatası:', err);
          io.emit('docker:pull:error', { image, error: err.message });
          return res.status(500).json({ error: 'Image çekilemedi' });
        }
        
        logger.info(`Image çekildi: ${image}:${tag} by ${req.user.email}`);
        io.emit('docker:pull:complete', { image, tag });
        res.json({ message: 'Image başarıyla çekildi' });
      }, (event) => {
        io.emit('docker:pull:progress', { image, ...event });
      });
    } catch (error) {
      logger.error('Image pull hatası:', error);
      res.status(500).json({ error: 'Image çekilemedi' });
    }
  }

  /**
   * Image sil
   * DELETE /api/docker/images/:id
   */
  async removeImage(req, res) {
    try {
      const image = this.docker.getImage(req.params.id);
      await image.remove({ force: req.query.force === 'true' });
      
      logger.info(`Image silindi: ${req.params.id} by ${req.user.email}`);
      
      res.json({ message: 'Image silindi' });
    } catch (error) {
      logger.error('Image silme hatası:', error);
      res.status(500).json({ error: 'Image silinemedi' });
    }
  }

  /**
   * Network listesi
   * GET /api/docker/networks
   */
  async listNetworks(req, res) {
    try {
      const networks = await this.docker.listNetworks();
      res.json(networks);
    } catch (error) {
      logger.error('Network listesi hatası:', error);
      res.status(500).json({ error: 'Network listesi alınamadı' });
    }
  }

  /**
   * Network oluştur
   * POST /api/docker/networks
   */
  async createNetwork(req, res) {
    try {
      const { name, driver = 'bridge' } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Network adı gerekli' });
      }

      const network = await this.docker.createNetwork({
        Name: name,
        Driver: driver
      });

      logger.info(`Network oluşturuldu: ${name} by ${req.user.email}`);

      res.status(201).json({ message: 'Network oluşturuldu', id: network.id });
    } catch (error) {
      logger.error('Network oluşturma hatası:', error);
      res.status(500).json({ error: 'Network oluşturulamadı' });
    }
  }

  /**
   * Volume listesi
   * GET /api/docker/volumes
   */
  async listVolumes(req, res) {
    try {
      const { Volumes } = await this.docker.listVolumes();
      res.json(Volumes);
    } catch (error) {
      logger.error('Volume listesi hatası:', error);
      res.status(500).json({ error: 'Volume listesi alınamadı' });
    }
  }

  /**
   * Volume oluştur
   * POST /api/docker/volumes
   */
  async createVolume(req, res) {
    try {
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Volume adı gerekli' });
      }

      const volume = await this.docker.createVolume({ Name: name });

      logger.info(`Volume oluşturuldu: ${name} by ${req.user.email}`);

      res.status(201).json({ message: 'Volume oluşturuldu', name: volume.name });
    } catch (error) {
      logger.error('Volume oluşturma hatası:', error);
      res.status(500).json({ error: 'Volume oluşturulamadı' });
    }
  }

  // Private metodlar
  _calculateCpuPercent(stats) {
    if (!stats.cpu_stats || !stats.precpu_stats) return 0;
    
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuCount = stats.cpu_stats.online_cpus || 1;
    
    if (systemDelta > 0 && cpuDelta > 0) {
      return ((cpuDelta / systemDelta) * cpuCount * 100).toFixed(2);
    }
    
    return 0;
  }
}

module.exports = new DockerController();
