const Domain = require('../models/Domain');
const { v4: uuidv4 } = require('uuid');
const shell = require('shelljs');
const dns = require('dns').promises;
const logger = require('../utils/logger');

class DomainController {
  /**
   * Tüm domainleri listele
   * GET /api/domains
   */
  async getAll(req, res) {
    try {
      const query = req.user.role === 'admin' ? {} : { owner: req.user._id };
      const domains = await Domain.find(query)
        .populate('owner', 'name email')
        .sort({ createdAt: -1 });
      
      res.json(domains);
    } catch (error) {
      logger.error('Domain listesi hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Tek domain getir
   * GET /api/domains/:id
   */
  async getOne(req, res) {
    try {
      const domain = await Domain.findById(req.params.id)
        .populate('owner', 'name email');
      
      if (!domain) {
        return res.status(404).json({ error: 'Domain bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && domain.owner._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu domain için yetkiniz yok' });
      }
      
      res.json(domain);
    } catch (error) {
      logger.error('Domain getirme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Yeni domain ekle
   * POST /api/domains
   */
  async create(req, res) {
    try {
      const { name } = req.body;
      
      // Domain var mı kontrol et
      const existingDomain = await Domain.findOne({ name: name.toLowerCase() });
      if (existingDomain) {
        return res.status(400).json({ error: 'Bu domain zaten kayıtlı' });
      }

      // Doğrulama token'ı oluştur
      const verificationToken = uuidv4();

      const domain = new Domain({
        name: name.toLowerCase(),
        owner: req.user._id,
        verificationToken,
        dnsRecords: [
          { type: 'A', name: '@', value: '127.0.0.1', ttl: 3600 },
          { type: 'MX', name: '@', value: `mail.${name.toLowerCase()}`, ttl: 3600, priority: 10 }
        ]
      });

      await domain.save();
      
      logger.info(`Yeni domain eklendi: ${name} by ${req.user.email}`);
      
      res.status(201).json({
        domain,
        message: 'Domain başarıyla eklendi. Doğrulama için TXT kaydı eklemeniz gerekiyor.',
        verificationRecord: {
          type: 'TXT',
          name: '_asos-verify',
          value: verificationToken
        }
      });
    } catch (error) {
      logger.error('Domain ekleme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Domain güncelle
   * PUT /api/domains/:id
   */
  async update(req, res) {
    try {
      const domain = await Domain.findById(req.params.id);
      
      if (!domain) {
        return res.status(404).json({ error: 'Domain bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && domain.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu domain için yetkiniz yok' });
      }

      const allowedUpdates = ['isActive', 'mailEnabled', 'settings'];
      const updates = Object.keys(req.body)
        .filter(key => allowedUpdates.includes(key))
        .reduce((obj, key) => {
          obj[key] = req.body[key];
          return obj;
        }, {});

      Object.assign(domain, updates);
      await domain.save();
      
      logger.info(`Domain güncellendi: ${domain.name} by ${req.user.email}`);
      
      res.json(domain);
    } catch (error) {
      logger.error('Domain güncelleme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Domain sil
   * DELETE /api/domains/:id
   */
  async delete(req, res) {
    try {
      const domain = await Domain.findById(req.params.id);
      
      if (!domain) {
        return res.status(404).json({ error: 'Domain bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && domain.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu domain için yetkiniz yok' });
      }

      await domain.deleteOne();
      
      logger.info(`Domain silindi: ${domain.name} by ${req.user.email}`);
      
      res.json({ message: 'Domain başarıyla silindi' });
    } catch (error) {
      logger.error('Domain silme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * DNS kaydı ekle
   * POST /api/domains/:id/dns
   */
  async addDnsRecord(req, res) {
    try {
      const domain = await Domain.findById(req.params.id);
      
      if (!domain) {
        return res.status(404).json({ error: 'Domain bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && domain.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu domain için yetkiniz yok' });
      }

      const { type, name, value, ttl, priority } = req.body;
      
      domain.dnsRecords.push({
        type,
        name,
        value,
        ttl: ttl || 3600,
        priority: priority || 10
      });

      await domain.save();
      
      logger.info(`DNS kaydı eklendi: ${type} ${name} -> ${value} for ${domain.name}`);
      
      res.json(domain);
    } catch (error) {
      logger.error('DNS kaydı ekleme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * DNS kaydı güncelle
   * PUT /api/domains/:id/dns/:recordId
   */
  async updateDnsRecord(req, res) {
    try {
      const domain = await Domain.findById(req.params.id);
      
      if (!domain) {
        return res.status(404).json({ error: 'Domain bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && domain.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu domain için yetkiniz yok' });
      }

      const record = domain.dnsRecords.id(req.params.recordId);
      if (!record) {
        return res.status(404).json({ error: 'DNS kaydı bulunamadı' });
      }

      const { type, name, value, ttl, priority } = req.body;
      if (type) record.type = type;
      if (name) record.name = name;
      if (value) record.value = value;
      if (ttl) record.ttl = ttl;
      if (priority) record.priority = priority;

      await domain.save();
      
      res.json(domain);
    } catch (error) {
      logger.error('DNS kaydı güncelleme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * DNS kaydı sil
   * DELETE /api/domains/:id/dns/:recordId
   */
  async deleteDnsRecord(req, res) {
    try {
      const domain = await Domain.findById(req.params.id);
      
      if (!domain) {
        return res.status(404).json({ error: 'Domain bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && domain.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu domain için yetkiniz yok' });
      }

      domain.dnsRecords = domain.dnsRecords.filter(
        record => record._id.toString() !== req.params.recordId
      );

      await domain.save();
      
      res.json(domain);
    } catch (error) {
      logger.error('DNS kaydı silme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Domain doğrula
   * POST /api/domains/:id/verify
   */
  async verify(req, res) {
    try {
      const domain = await Domain.findById(req.params.id);
      
      if (!domain) {
        return res.status(404).json({ error: 'Domain bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && domain.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu domain için yetkiniz yok' });
      }

      try {
        const records = await dns.resolveTxt(`_asos-verify.${domain.name}`);
        const flatRecords = records.flat();
        
        if (flatRecords.includes(domain.verificationToken)) {
          domain.isVerified = true;
          await domain.save();
          
          logger.info(`Domain doğrulandı: ${domain.name}`);
          
          return res.json({ 
            message: 'Domain başarıyla doğrulandı',
            domain
          });
        }
      } catch (dnsError) {
        // DNS hatası - kayıt bulunamadı
      }

      res.status(400).json({ 
        error: 'Domain doğrulanamadı',
        hint: `_asos-verify.${domain.name} TXT kaydı bulunamadı veya değer eşleşmiyor`
      });
    } catch (error) {
      logger.error('Domain doğrulama hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * SSL sertifikası al (Let's Encrypt)
   * POST /api/domains/:id/ssl
   */
  async getSSL(req, res) {
    try {
      const domain = await Domain.findById(req.params.id);
      
      if (!domain) {
        return res.status(404).json({ error: 'Domain bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && domain.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu domain için yetkiniz yok' });
      }

      if (!domain.isVerified) {
        return res.status(400).json({ error: 'Önce domain doğrulanmalı' });
      }

      // Certbot ile SSL sertifikası al
      const certbotCmd = `certbot certonly --webroot -w /var/www/html -d ${domain.name} -d www.${domain.name} --non-interactive --agree-tos -m ${process.env.LETSENCRYPT_EMAIL}`;
      
      const result = shell.exec(certbotCmd, { silent: true });
      
      if (result.code === 0) {
        domain.sslEnabled = true;
        domain.sslCertPath = `/etc/letsencrypt/live/${domain.name}/fullchain.pem`;
        domain.sslKeyPath = `/etc/letsencrypt/live/${domain.name}/privkey.pem`;
        domain.sslExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        await domain.save();
        
        logger.info(`SSL sertifikası alındı: ${domain.name}`);
        
        res.json({ 
          message: 'SSL sertifikası başarıyla alındı',
          domain
        });
      } else {
        logger.error(`SSL hatası: ${result.stderr}`);
        res.status(500).json({ error: 'SSL sertifikası alınamadı', details: result.stderr });
      }
    } catch (error) {
      logger.error('SSL hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * SSL sertifikasını yenile
   * POST /api/domains/:id/ssl/renew
   */
  async renewSSL(req, res) {
    try {
      const domain = await Domain.findById(req.params.id);
      
      if (!domain) {
        return res.status(404).json({ error: 'Domain bulunamadı' });
      }
      
      if (!domain.sslEnabled) {
        return res.status(400).json({ error: 'Bu domain için SSL etkin değil' });
      }

      const result = shell.exec(`certbot renew --cert-name ${domain.name}`, { silent: true });
      
      if (result.code === 0) {
        domain.sslExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        await domain.save();
        
        logger.info(`SSL yenilendi: ${domain.name}`);
        
        res.json({ message: 'SSL sertifikası yenilendi', domain });
      } else {
        res.status(500).json({ error: 'SSL yenilenemedi', details: result.stderr });
      }
    } catch (error) {
      logger.error('SSL yenileme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }
}

module.exports = new DomainController();
