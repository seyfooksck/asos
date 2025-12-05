const bcrypt = require('bcryptjs');
const MailAccount = require('../models/MailAccount');
const Domain = require('../models/Domain');
const shell = require('shelljs');
const fs = require('fs').promises;
const logger = require('../utils/logger');

class MailController {
  /**
   * Tüm mail hesaplarını listele
   * GET /api/mail
   */
  async getAll(req, res) {
    try {
      const query = req.user.role === 'admin' ? {} : { owner: req.user._id };
      const accounts = await MailAccount.find(query)
        .populate('domain', 'name')
        .populate('owner', 'name email')
        .select('-password')
        .sort({ createdAt: -1 });
      
      res.json(accounts);
    } catch (error) {
      logger.error('Mail listesi hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Domain'e ait mail hesapları
   * GET /api/mail/domain/:domainId
   */
  async getByDomain(req, res) {
    try {
      const domain = await Domain.findById(req.params.domainId);
      
      if (!domain) {
        return res.status(404).json({ error: 'Domain bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && domain.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu domain için yetkiniz yok' });
      }

      const accounts = await MailAccount.find({ domain: req.params.domainId })
        .select('-password')
        .sort({ createdAt: -1 });
      
      res.json(accounts);
    } catch (error) {
      logger.error('Mail listesi hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Tek mail hesabı getir
   * GET /api/mail/:id
   */
  async getOne(req, res) {
    try {
      const account = await MailAccount.findById(req.params.id)
        .populate('domain', 'name')
        .populate('owner', 'name email')
        .select('-password');
      
      if (!account) {
        return res.status(404).json({ error: 'Mail hesabı bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && account.owner._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu hesap için yetkiniz yok' });
      }
      
      res.json(account);
    } catch (error) {
      logger.error('Mail getirme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Yeni mail hesabı oluştur
   * POST /api/mail
   */
  async create(req, res) {
    try {
      const { username, password, domainId, displayName, quota } = req.body;
      
      // Domain kontrolü
      const domain = await Domain.findById(domainId);
      if (!domain) {
        return res.status(404).json({ error: 'Domain bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && domain.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu domain için yetkiniz yok' });
      }

      // Mail etkin mi kontrol et
      if (!domain.mailEnabled) {
        return res.status(400).json({ error: 'Bu domain için mail servisi etkin değil' });
      }

      const email = `${username}@${domain.name}`;
      
      // Email var mı kontrol et
      const existingAccount = await MailAccount.findOne({ email });
      if (existingAccount) {
        return res.status(400).json({ error: 'Bu email adresi zaten kayıtlı' });
      }

      // Şifreyi hashle (Dovecot için)
      const hashedPassword = await bcrypt.hash(password, 10);

      const account = new MailAccount({
        email,
        password: hashedPassword,
        domain: domain._id,
        owner: req.user._id,
        displayName: displayName || username,
        quota: quota || 1073741824
      });

      await account.save();
      
      // Postfix/Dovecot konfigürasyonunu güncelle
      await this._updateMailConfig(domain.name, email, hashedPassword);
      
      logger.info(`Yeni mail hesabı oluşturuldu: ${email} by ${req.user.email}`);
      
      res.status(201).json({
        account: {
          id: account._id,
          email: account.email,
          displayName: account.displayName,
          quota: account.quota,
          domain: domain.name
        },
        message: 'Mail hesabı başarıyla oluşturuldu'
      });
    } catch (error) {
      logger.error('Mail oluşturma hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Mail hesabı güncelle
   * PUT /api/mail/:id
   */
  async update(req, res) {
    try {
      const account = await MailAccount.findById(req.params.id);
      
      if (!account) {
        return res.status(404).json({ error: 'Mail hesabı bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && account.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu hesap için yetkiniz yok' });
      }

      const allowedUpdates = [
        'displayName', 'isActive', 'quota',
        'forwardingEnabled', 'forwardingAddress',
        'autoReplyEnabled', 'autoReplySubject', 'autoReplyMessage',
        'aliases'
      ];
      
      const updates = Object.keys(req.body)
        .filter(key => allowedUpdates.includes(key))
        .reduce((obj, key) => {
          obj[key] = req.body[key];
          return obj;
        }, {});

      Object.assign(account, updates);
      await account.save();
      
      res.json({
        account: {
          id: account._id,
          email: account.email,
          displayName: account.displayName,
          isActive: account.isActive,
          quota: account.quota,
          forwardingEnabled: account.forwardingEnabled,
          forwardingAddress: account.forwardingAddress,
          autoReplyEnabled: account.autoReplyEnabled
        }
      });
    } catch (error) {
      logger.error('Mail güncelleme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Mail şifre değiştir
   * PUT /api/mail/:id/password
   */
  async changePassword(req, res) {
    try {
      const account = await MailAccount.findById(req.params.id);
      
      if (!account) {
        return res.status(404).json({ error: 'Mail hesabı bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && account.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu hesap için yetkiniz yok' });
      }

      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      account.password = hashedPassword;
      await account.save();
      
      // Dovecot şifresini güncelle
      const domain = await Domain.findById(account.domain);
      await this._updateMailConfig(domain.name, account.email, hashedPassword);
      
      logger.info(`Mail şifresi değiştirildi: ${account.email}`);
      
      res.json({ message: 'Şifre başarıyla değiştirildi' });
    } catch (error) {
      logger.error('Mail şifre değiştirme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Mail hesabı sil
   * DELETE /api/mail/:id
   */
  async delete(req, res) {
    try {
      const account = await MailAccount.findById(req.params.id)
        .populate('domain');
      
      if (!account) {
        return res.status(404).json({ error: 'Mail hesabı bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && account.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu hesap için yetkiniz yok' });
      }

      const email = account.email;
      const domainName = account.domain.name;
      
      await account.deleteOne();
      
      // Postfix/Dovecot konfigürasyonundan kaldır
      await this._removeMailConfig(domainName, email);
      
      logger.info(`Mail hesabı silindi: ${email} by ${req.user.email}`);
      
      res.json({ message: 'Mail hesabı başarıyla silindi' });
    } catch (error) {
      logger.error('Mail silme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Mail istatistikleri
   * GET /api/mail/:id/stats
   */
  async getStats(req, res) {
    try {
      const account = await MailAccount.findById(req.params.id);
      
      if (!account) {
        return res.status(404).json({ error: 'Mail hesabı bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && account.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu hesap için yetkiniz yok' });
      }

      // Mail dizin boyutunu hesapla
      const [username, domain] = account.email.split('@');
      const mailDir = `/var/mail/vhosts/${domain}/${username}`;
      let usedQuota = 0;
      
      try {
        const result = shell.exec(`du -sb ${mailDir} 2>/dev/null | cut -f1`, { silent: true });
        if (result.code === 0) {
          usedQuota = parseInt(result.stdout.trim()) || 0;
        }
      } catch (e) {
        // Dizin yoksa veya hata varsa 0 döner
      }

      res.json({
        email: account.email,
        quota: account.quota,
        usedQuota,
        usedPercent: Math.round((usedQuota / account.quota) * 100),
        lastLogin: account.lastLogin
      });
    } catch (error) {
      logger.error('Mail stats hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Domain için mail servisini etkinleştir
   * POST /api/mail/enable/:domainId
   */
  async enableMailForDomain(req, res) {
    try {
      const domain = await Domain.findById(req.params.domainId);
      
      if (!domain) {
        return res.status(404).json({ error: 'Domain bulunamadı' });
      }
      
      // Yetki kontrolü
      if (req.user.role !== 'admin' && domain.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Bu domain için yetkiniz yok' });
      }

      domain.mailEnabled = true;
      
      // SPF kaydı ekle
      const spfRecord = `v=spf1 mx a ~all`;
      domain.settings.spfRecord = spfRecord;
      
      // MX kaydı ekle (yoksa)
      const hasMX = domain.dnsRecords.some(r => r.type === 'MX');
      if (!hasMX) {
        domain.dnsRecords.push({
          type: 'MX',
          name: '@',
          value: `mail.${domain.name}`,
          ttl: 3600,
          priority: 10
        });
      }

      await domain.save();
      
      // Postfix vhosts'a ekle
      await this._addDomainToVhosts(domain.name);
      
      logger.info(`Mail servisi etkinleştirildi: ${domain.name}`);
      
      res.json({ 
        message: 'Mail servisi etkinleştirildi',
        domain,
        dnsRecords: [
          { type: 'MX', name: '@', value: `mail.${domain.name}`, priority: 10 },
          { type: 'TXT', name: '@', value: spfRecord },
          { type: 'A', name: 'mail', value: 'SUNUCU_IP_ADRESI' }
        ]
      });
    } catch (error) {
      logger.error('Mail etkinleştirme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  // Private metodlar
  async _updateMailConfig(domain, email, hashedPassword) {
    const vhostsPath = '/etc/postfix/vhosts';
    const vmailboxPath = '/etc/postfix/vmailbox';
    const dovecotUsersPath = '/etc/dovecot/users';
    
    try {
      // Virtual hosts dosyasına domain ekle
      const vhosts = await fs.readFile(vhostsPath, 'utf8').catch(() => '');
      if (!vhosts.includes(domain)) {
        await fs.appendFile(vhostsPath, `${domain}\n`);
      }
      
      // Virtual mailbox dosyasına email ekle
      const vmailbox = await fs.readFile(vmailboxPath, 'utf8').catch(() => '');
      const [username, dom] = email.split('@');
      const mailboxEntry = `${email} ${dom}/${username}/`;
      
      if (!vmailbox.includes(email)) {
        await fs.appendFile(vmailboxPath, `${mailboxEntry}\n`);
      }
      
      // Dovecot users dosyasını güncelle
      let dovecotUsers = await fs.readFile(dovecotUsersPath, 'utf8').catch(() => '');
      const userEntry = `${email}:${hashedPassword}`;
      
      if (dovecotUsers.includes(`${email}:`)) {
        const lines = dovecotUsers.split('\n').map(line => {
          if (line.startsWith(`${email}:`)) {
            return userEntry;
          }
          return line;
        });
        dovecotUsers = lines.join('\n');
      } else {
        dovecotUsers += `${userEntry}\n`;
      }
      
      await fs.writeFile(dovecotUsersPath, dovecotUsers);
      
      // Postfix hash map'leri güncelle
      shell.exec('postmap /etc/postfix/vmailbox', { silent: true });
      
      // Servisleri yenile
      shell.exec('systemctl reload postfix dovecot', { silent: true });
      
      logger.info(`Mail konfigürasyonu güncellendi: ${email}`);
    } catch (error) {
      logger.error('Mail konfigürasyon hatası:', error);
      throw error;
    }
  }

  async _removeMailConfig(domain, email) {
    const vmailboxPath = '/etc/postfix/vmailbox';
    const dovecotUsersPath = '/etc/dovecot/users';
    
    try {
      // Virtual mailbox dosyasından email sil
      let vmailbox = await fs.readFile(vmailboxPath, 'utf8').catch(() => '');
      vmailbox = vmailbox.split('\n').filter(line => !line.startsWith(email)).join('\n');
      await fs.writeFile(vmailboxPath, vmailbox);
      
      // Dovecot users dosyasından sil
      let dovecotUsers = await fs.readFile(dovecotUsersPath, 'utf8').catch(() => '');
      dovecotUsers = dovecotUsers.split('\n').filter(line => !line.startsWith(`${email}:`)).join('\n');
      await fs.writeFile(dovecotUsersPath, dovecotUsers);
      
      // Postfix hash map'leri güncelle
      shell.exec('postmap /etc/postfix/vmailbox', { silent: true });
      
      // Servisleri yenile
      shell.exec('systemctl reload postfix dovecot', { silent: true });
      
      logger.info(`Mail konfigürasyonundan kaldırıldı: ${email}`);
    } catch (error) {
      logger.error('Mail konfigürasyon kaldırma hatası:', error);
    }
  }

  async _addDomainToVhosts(domain) {
    const vhostsPath = '/etc/postfix/vhosts';
    
    try {
      const vhosts = await fs.readFile(vhostsPath, 'utf8').catch(() => '');
      if (!vhosts.includes(domain)) {
        await fs.appendFile(vhostsPath, `${domain}\n`);
        shell.exec('systemctl reload postfix', { silent: true });
      }
    } catch (error) {
      logger.error('Vhosts güncelleme hatası:', error);
    }
  }
}

module.exports = new MailController();
