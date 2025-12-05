const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // Önce session kontrolü (web UI için)
    if (req.session && req.session.user) {
      const user = await User.findById(req.session.user._id);
      if (user && user.isActive) {
        req.user = user;
        return next();
      }
    }
    
    // JWT token kontrolü (API için)
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Yetkilendirme gerekli' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Geçersiz token veya kullanıcı aktif değil' });
    }
    
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Geçersiz token' });
  }
};

const adminOnly = async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Bu işlem için admin yetkisi gerekli' });
  }
  next();
};

module.exports = { auth, adminOnly };
