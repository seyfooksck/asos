const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'asos-secret-key';

const auth = async (req, res, next) => {
  try {
    // 1. Önce session kontrolü (web UI için)
    if (req.session && req.session.user) {
      const user = await User.findById(req.session.user._id);
      if (user && user.isActive) {
        req.user = user;
        return next();
      }
    }
    
    // 2. JWT cookie kontrolü (otomatik login için)
    const cookieToken = req.cookies?.asos_token;
    if (cookieToken) {
      try {
        const decoded = jwt.verify(cookieToken, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (user && user.isActive) {
          req.user = user;
          // Session'ı da güncelle
          if (req.session) {
            req.session.user = {
              _id: user._id,
              email: user.email,
              name: user.name,
              role: user.role
            };
          }
          return next();
        }
      } catch (e) {
        // Cookie token geçersiz, devam et
      }
    }
    
    // 3. Authorization header kontrolü (API için)
    const headerToken = req.header('Authorization')?.replace('Bearer ', '');
    if (headerToken) {
      const decoded = jwt.verify(headerToken, JWT_SECRET);
      const user = await User.findById(decoded.userId);
      
      if (user && user.isActive) {
        req.user = user;
        req.token = headerToken;
        return next();
      }
    }
    
    return res.status(401).json({ error: 'Yetkilendirme gerekli' });
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
