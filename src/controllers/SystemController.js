const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const logger = require('../utils/logger');
const https = require('https');
const fs = require('fs');
const path = require('path');

// package.json'dan versiyon bilgisini otomatik çek
const packageJson = require('../../package.json');
const CURRENT_VERSION = packageJson.version;
const GITHUB_REPO = 'seyfooksck/asos'; // GitHub repo for updates

class SystemController {
  /**
   * Sistem bilgisi
   * GET /api/system/info
   */
  async getInfo(req, res) {
    try {
      // Get IP address
      let ip = '-';
      const interfaces = os.networkInterfaces();
      for (const iface of Object.values(interfaces)) {
        for (const config of iface) {
          if (config.family === 'IPv4' && !config.internal) {
            ip = config.address;
            break;
          }
        }
      }

      const info = {
        hostname: os.hostname(),
        ip: ip,
        platform: os.platform(),
        os: `${os.type()} ${os.release()}`,
        arch: os.arch(),
        uptime: os.uptime(),
        loadavg: os.loadavg(),
        totalmem: os.totalmem(),
        freemem: os.freemem(),
        cpus: os.cpus().length,
        version: CURRENT_VERSION,
        nodeVersion: process.version
      };
      
      res.json({ success: true, data: info });
    } catch (error) {
      logger.error('Sistem bilgisi hatası:', error);
      res.status(500).json({ success: false, error: 'Sistem bilgisi alınamadı' });
    }
  }

  /**
   * Sistem istatistikleri (CPU, RAM, Disk)
   * GET /api/system/stats
   */
  async getStats(req, res) {
    try {
      // CPU usage
      const cpus = os.cpus();
      let totalIdle = 0, totalTick = 0;
      
      for (const cpu of cpus) {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      }
      
      const cpuUsage = 100 - Math.round(100 * totalIdle / totalTick);
      
      // Memory usage
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      
      // Disk usage
      let disk = { total: 0, used: 0, free: 0, usedPercent: 0 };
      try {
        const { stdout } = await execAsync("df -B1 / | tail -1 | awk '{print $2,$3,$4}'");
        const parts = stdout.trim().split(/\s+/);
        disk = {
          total: parseInt(parts[0]),
          used: parseInt(parts[1]),
          free: parseInt(parts[2]),
          usedPercent: (parseInt(parts[1]) / parseInt(parts[0])) * 100
        };
      } catch (e) {
        // Ignore disk errors on Windows
      }
      
      res.json({
        success: true,
        data: {
          cpu: cpuUsage,
          memory: {
            total: totalMem,
            used: usedMem,
            free: freeMem,
            usedPercent: (usedMem / totalMem) * 100
          },
          disk: disk
        }
      });
    } catch (error) {
      logger.error('Sistem istatistikleri hatası:', error);
      res.status(500).json({ success: false, error: 'İstatistikler alınamadı' });
    }
  }

  /**
   * Güncelleme kontrolü
   * GET /api/system/check-update
   */
  async checkUpdate(req, res) {
    try {
      // Simulate update check (in production, check GitHub releases)
      const updateData = {
        currentVersion: CURRENT_VERSION,
        latestVersion: CURRENT_VERSION,
        updateAvailable: false,
        releaseNotes: ''
      };

      // Check GitHub releases
      try {
        const latestRelease = await this.fetchLatestRelease();
        if (latestRelease && latestRelease.tag_name) {
          const latestVersion = latestRelease.tag_name.replace('v', '');
          updateData.latestVersion = latestVersion;
          updateData.updateAvailable = this.compareVersions(latestVersion, CURRENT_VERSION) > 0;
          updateData.releaseNotes = latestRelease.body || '';
          updateData.downloadUrl = latestRelease.zipball_url;
        }
      } catch (e) {
        // GitHub check failed, assume no update
        logger.warn('GitHub güncelleme kontrolü başarısız:', e.message);
      }
      
      res.json({ success: true, data: updateData });
    } catch (error) {
      logger.error('Güncelleme kontrolü hatası:', error);
      res.status(500).json({ success: false, error: 'Güncelleme kontrolü yapılamadı' });
    }
  }

  /**
   * Fetch latest release from GitHub
   */
  fetchLatestRelease() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_REPO}/releases/latest`,
        method: 'GET',
        headers: {
          'User-Agent': 'ASOS-Panel',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      req.end();
    });
  }

  /**
   * Compare semantic versions
   */
  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
      if ((parts1[i] || 0) > (parts2[i] || 0)) return 1;
      if ((parts1[i] || 0) < (parts2[i] || 0)) return -1;
    }
    return 0;
  }

  /**
   * ASOS güncelleme
   * POST /api/system/update
   */
  async performUpdate(req, res) {
    try {
      const io = req.app.get('io');
      
      io?.emit('system:update:start', { message: 'Güncelleme başlıyor...' });
      
      // Pull latest from git
      await execAsync('cd /opt/asos && git pull origin main');
      
      // Install dependencies
      await execAsync('cd /opt/asos && npm install --production');
      
      // Restart service
      await execAsync('systemctl restart asos');
      
      io?.emit('system:update:complete', { message: 'Güncelleme tamamlandı' });
      logger.info(`ASOS güncellendi by ${req.user?.email}`);
      
      res.json({ success: true, message: 'Güncelleme tamamlandı, servis yeniden başlatılıyor...' });
    } catch (error) {
      const io = req.app.get('io');
      io?.emit('system:update:error', { error: error.message });
      logger.error('ASOS güncelleme hatası:', error);
      res.status(500).json({ success: false, error: 'Güncelleme yapılamadı: ' + error.message });
    }
  }

  /**
   * Sistem logları
   * GET /api/system/logs
   */
  async getLogs(req, res) {
    try {
      const lines = parseInt(req.query.lines) || 100;
      let logs = '';
      
      try {
        const { stdout } = await execAsync(`journalctl -u asos -n ${lines} --no-pager 2>/dev/null || tail -n ${lines} /var/log/asos/combined.log 2>/dev/null || echo "Log dosyası bulunamadı"`);
        logs = stdout;
      } catch (e) {
        logs = 'Log dosyası okunamadı: ' + e.message;
      }
      
      res.json({ success: true, data: logs });
    } catch (error) {
      logger.error('Log okuma hatası:', error);
      res.status(500).json({ success: false, error: 'Loglar alınamadı' });
    }
  }

  /**
   * Servisleri yeniden başlat
   * POST /api/system/restart
   */
  async restart(req, res) {
    try {
      logger.info(`ASOS servisi yeniden başlatılıyor by ${req.user?.email}`);
      
      res.json({ success: true, message: 'Servis yeniden başlatılıyor...' });
      
      setTimeout(async () => {
        try {
          await execAsync('systemctl restart asos');
        } catch (e) {
          logger.error('Restart hatası:', e);
        }
      }, 1000);
    } catch (error) {
      logger.error('Restart hatası:', error);
      res.status(500).json({ success: false, error: 'Yeniden başlatma hatası' });
    }
  }

  /**
   * CPU kullanımı
   * GET /api/system/cpu
   */
  async getCpu(req, res) {
    try {
      const cpus = os.cpus();
      const loadAvg = os.loadavg();
      
      res.json({
        cores: cpus.length,
        model: cpus[0]?.model,
        speed: cpus[0]?.speed,
        loadAverage: {
          '1min': loadAvg[0],
          '5min': loadAvg[1],
          '15min': loadAvg[2]
        }
      });
    } catch (error) {
      logger.error('CPU bilgisi hatası:', error);
      res.status(500).json({ error: 'CPU bilgisi alınamadı' });
    }
  }

  /**
   * Bellek kullanımı
   * GET /api/system/memory
   */
  async getMemory(req, res) {
    try {
      const total = os.totalmem();
      const free = os.freemem();
      const used = total - free;
      
      res.json({
        total,
        free,
        used,
        usedPercent: ((used / total) * 100).toFixed(2)
      });
    } catch (error) {
      logger.error('Bellek bilgisi hatası:', error);
      res.status(500).json({ error: 'Bellek bilgisi alınamadı' });
    }
  }

  /**
   * Disk kullanımı
   * GET /api/system/disk
   */
  async getDisk(req, res) {
    try {
      const { stdout } = await execAsync("df -h / --output=size,used,avail,pcent | tail -1");
      const parts = stdout.trim().split(/\s+/);
      
      res.json({
        total: parts[0],
        used: parts[1],
        available: parts[2],
        usedPercent: parts[3]
      });
    } catch (error) {
      logger.error('Disk bilgisi hatası:', error);
      res.status(500).json({ error: 'Disk bilgisi alınamadı' });
    }
  }

  /**
   * Servis durumları
   * GET /api/system/services
   */
  async getServices(req, res) {
    try {
      const services = ['nginx', 'postfix', 'dovecot', 'docker', 'mongod', 'asos'];
      const statuses = {};
      
      const checkService = async (service) => {
        try {
          const { stdout } = await execAsync(`systemctl is-active ${service}`);
          statuses[service] = stdout.trim() === 'active' ? 'running' : 'stopped';
        } catch {
          statuses[service] = 'stopped';
        }
      };
      
      await Promise.all(services.map(checkService));
      
      res.json(statuses);
    } catch (error) {
      logger.error('Servis durumu hatası:', error);
      res.status(500).json({ error: 'Servis durumları alınamadı' });
    }
  }

  /**
   * Servis kontrol (başlat/durdur/yeniden başlat)
   * POST /api/system/services/:service/:action
   */
  async controlService(req, res) {
    try {
      const { service, action } = req.params;
      const allowedServices = ['nginx', 'postfix', 'dovecot', 'docker'];
      const allowedActions = ['start', 'stop', 'restart', 'reload'];
      
      if (!allowedServices.includes(service)) {
        return res.status(400).json({ error: 'Geçersiz servis' });
      }
      
      if (!allowedActions.includes(action)) {
        return res.status(400).json({ error: 'Geçersiz işlem' });
      }

      await execAsync(`systemctl ${action} ${service}`);
      
      logger.info(`Servis ${action}: ${service} by ${req.user.email}`);
      res.json({ message: `${service} servisi ${action} edildi` });
    } catch (error) {
      logger.error('Servis kontrol hatası:', error);
      res.status(500).json({ error: `Servis ${req.params.action} yapılamadı` });
    }
  }

  /**
   * Sistem logları
   * GET /api/system/logs/:type
   */
  async getLogs(req, res) {
    try {
      const { type } = req.params;
      const lines = parseInt(req.query.lines) || 100;
      
      const logPaths = {
        'system': '/var/log/syslog',
        'nginx': '/var/log/nginx/error.log',
        'mail': '/var/log/mail.log',
        'asos': '/var/log/asos/combined.log'
      };
      
      if (!logPaths[type]) {
        return res.status(400).json({ error: 'Geçersiz log tipi' });
      }

      const { stdout } = await execAsync(`tail -n ${lines} ${logPaths[type]}`);
      
      res.json({ logs: stdout });
    } catch (error) {
      logger.error('Log okuma hatası:', error);
      res.status(500).json({ error: 'Log dosyası okunamadı' });
    }
  }

  /**
   * Firewall kuralları
   * GET /api/system/firewall
   */
  async getFirewall(req, res) {
    try {
      const { stdout } = await execAsync('ufw status numbered');
      res.json({ rules: stdout });
    } catch (error) {
      logger.error('Firewall hatası:', error);
      res.status(500).json({ error: 'Firewall durumu alınamadı' });
    }
  }

  /**
   * Firewall kural ekle
   * POST /api/system/firewall
   */
  async addFirewallRule(req, res) {
    try {
      const { port, protocol = 'tcp', action = 'allow' } = req.body;
      
      if (!port || isNaN(port)) {
        return res.status(400).json({ error: 'Geçerli bir port numarası gerekli' });
      }

      await execAsync(`ufw ${action} ${port}/${protocol}`);
      
      logger.info(`Firewall kuralı eklendi: ${port}/${protocol} ${action} by ${req.user.email}`);
      res.json({ message: 'Firewall kuralı eklendi' });
    } catch (error) {
      logger.error('Firewall hatası:', error);
      res.status(500).json({ error: 'Firewall kuralı eklenemedi' });
    }
  }

  /**
   * Firewall kural sil
   * DELETE /api/system/firewall/:ruleNumber
   */
  async removeFirewallRule(req, res) {
    try {
      const { ruleNumber } = req.params;
      
      await execAsync(`ufw --force delete ${ruleNumber}`);
      
      logger.info(`Firewall kuralı silindi: ${ruleNumber} by ${req.user.email}`);
      res.json({ message: 'Firewall kuralı silindi' });
    } catch (error) {
      logger.error('Firewall silme hatası:', error);
      res.status(500).json({ error: 'Firewall kuralı silinemedi' });
    }
  }

  /**
   * Sistem güncelle
   * POST /api/system/update
   */
  async updateSystem(req, res) {
    try {
      const io = req.app.get('io');
      
      io.emit('system:update:start');
      
      const { stdout, stderr } = await execAsync('apt update && apt upgrade -y');
      
      io.emit('system:update:complete');
      logger.info(`Sistem güncellendi by ${req.user.email}`);
      res.json({ message: 'Sistem güncellendi', output: stdout });
    } catch (error) {
      const io = req.app.get('io');
      io.emit('system:update:error', { error: error.message });
      logger.error('Sistem güncelleme hatası:', error);
      res.status(500).json({ error: 'Sistem güncellenemedi' });
    }
  }

  /**
   * Sistem yeniden başlat
   * POST /api/system/reboot
   */
  async reboot(req, res) {
    try {
      logger.info(`Sistem yeniden başlatılıyor by ${req.user.email}`);
      
      res.json({ message: 'Sistem yeniden başlatılıyor...' });
      
      setTimeout(() => {
        exec('reboot');
      }, 2000);
    } catch (error) {
      logger.error('Reboot hatası:', error);
      res.status(500).json({ error: 'Reboot hatası' });
    }
  }

  /**
   * Nginx konfigürasyonu yeniden yükle
   * POST /api/system/nginx/reload
   */
  async reloadNginx(req, res) {
    try {
      // Önce syntax kontrolü
      const { stdout: testOutput } = await execAsync('nginx -t');
      
      await execAsync('systemctl reload nginx');
      
      logger.info(`Nginx yeniden yüklendi by ${req.user.email}`);
      res.json({ message: 'Nginx yeniden yüklendi' });
    } catch (error) {
      logger.error('Nginx reload hatası:', error);
      res.status(500).json({ error: 'Nginx yeniden yüklenemedi', details: error.message });
    }
  }

  /**
   * SSL sertifikalarını yenile
   * POST /api/system/ssl/renew
   */
  async renewAllSSL(req, res) {
    try {
      const { stdout } = await execAsync('certbot renew');
      
      logger.info(`SSL sertifikaları yenilendi by ${req.user.email}`);
      res.json({ message: 'SSL sertifikaları yenilendi', output: stdout });
    } catch (error) {
      logger.error('SSL yenileme hatası:', error);
      res.status(500).json({ error: 'SSL sertifikaları yenilenemedi' });
    }
  }

  /**
   * Backup oluştur
   * POST /api/system/backup
   */
  async createBackup(req, res) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = '/var/backups/asos';
      const backupFile = `${backupDir}/backup-${timestamp}.tar.gz`;

      // Backup dizini oluştur
      await execAsync(`mkdir -p ${backupDir}`);

      // MongoDB backup
      await execAsync(`mongodump --out ${backupDir}/mongo-${timestamp}`);

      // Konfigürasyon dosyalarını yedekle
      await execAsync(`tar -czvf ${backupFile} ${backupDir}/mongo-${timestamp} /etc/postfix /etc/dovecot /etc/nginx/sites-available /var/mail`);

      // Geçici mongo dump'ı sil
      await execAsync(`rm -rf ${backupDir}/mongo-${timestamp}`);

      logger.info(`Backup oluşturuldu: ${backupFile} by ${req.user.email}`);
      res.json({ message: 'Backup oluşturuldu', file: backupFile });
    } catch (error) {
      logger.error('Backup hatası:', error);
      res.status(500).json({ error: 'Backup oluşturulamadı' });
    }
  }

  /**
   * Backup listesi
   * GET /api/system/backups
   */
  async listBackups(req, res) {
    try {
      const { stdout } = await execAsync('ls -la /var/backups/asos/*.tar.gz 2>/dev/null || echo ""');
      
      const backups = stdout.trim().split('\n')
        .filter(line => line.includes('.tar.gz'))
        .map(line => {
          const parts = line.split(/\s+/);
          return {
            name: parts[parts.length - 1],
            size: parts[4],
            date: `${parts[5]} ${parts[6]} ${parts[7]}`
          };
        });
      
      res.json(backups);
    } catch (error) {
      logger.error('Backup listesi hatası:', error);
      res.status(500).json({ error: 'Backup listesi alınamadı' });
    }
  }
}

module.exports = new SystemController();
