const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

class AuthController {
  /**
   * Kullanıcı girişi
   * POST /api/auth/login
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });

      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Geçersiz email veya şifre' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Geçersiz email veya şifre' });
      }

      // Son giriş zamanını güncelle
      user.lastLogin = new Date();
      await user.save();

      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      logger.info(`Kullanıcı girişi: ${email}`);

      res.json({
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } catch (error) {
      logger.error('Login hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Mevcut kullanıcı bilgisi
   * GET /api/auth/me
   */
  async getMe(req, res) {
    res.json({
      user: {
        id: req.user._id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role
      }
    });
  }

  /**
   * Şifre değiştir
   * PUT /api/auth/password
   */
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await User.findById(req.user._id);

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Mevcut şifre yanlış' });
      }

      user.password = await bcrypt.hash(newPassword, 10);
      await user.save();

      logger.info(`Şifre değiştirildi: ${user.email}`);

      res.json({ message: 'Şifre başarıyla değiştirildi' });
    } catch (error) {
      logger.error('Şifre değiştirme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Profil güncelle
   * PUT /api/auth/profile
   */
  async updateProfile(req, res) {
    try {
      const { name } = req.body;
      const user = await User.findById(req.user._id);

      if (name) user.name = name;
      await user.save();

      res.json({
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } catch (error) {
      logger.error('Profil güncelleme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Çıkış
   * POST /api/auth/logout
   */
  async logout(req, res) {
    res.json({ message: 'Başarıyla çıkış yapıldı' });
  }

  /**
   * Tüm kullanıcıları listele (Admin)
   * GET /api/auth/users
   */
  async getAllUsers(req, res) {
    try {
      const users = await User.find()
        .select('-password')
        .sort({ createdAt: -1 });
      
      res.json(users);
    } catch (error) {
      logger.error('Kullanıcı listesi hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Yeni kullanıcı oluştur (Admin)
   * POST /api/auth/users
   */
  async createUser(req, res) {
    try {
      const { email, password, name, role } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: 'Bu email zaten kayıtlı' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = new User({
        email,
        password: hashedPassword,
        name,
        role: role || 'user'
      });

      await user.save();

      logger.info(`Yeni kullanıcı oluşturuldu: ${email} by ${req.user.email}`);

      res.status(201).json({
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } catch (error) {
      logger.error('Kullanıcı oluşturma hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }

  /**
   * Kullanıcı sil (Admin)
   * DELETE /api/auth/users/:id
   */
  async deleteUser(req, res) {
    try {
      const user = await User.findById(req.params.id);
      
      if (!user) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }

      if (user._id.toString() === req.user._id.toString()) {
        return res.status(400).json({ error: 'Kendinizi silemezsiniz' });
      }

      await user.deleteOne();

      logger.info(`Kullanıcı silindi: ${user.email} by ${req.user.email}`);

      res.json({ message: 'Kullanıcı başarıyla silindi' });
    } catch (error) {
      logger.error('Kullanıcı silme hatası:', error);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  }
}

module.exports = new AuthController();
