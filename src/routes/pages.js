const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'asos-secret-key';
const JWT_EXPIRES = '7d'; // 7 gün

// Auth middleware for pages - hem session hem JWT cookie kontrolü
const ensureAuth = async (req, res, next) => {
  // Session kontrolü
  if (req.session && req.session.user) {
    return next();
  }
  
  // JWT cookie kontrolü
  const token = req.cookies.asos_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (user && user.isActive) {
        // Session'ı yeniden oluştur
        req.session.user = {
          _id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        };
        return next();
      }
    } catch (err) {
      // Token geçersiz, cookie'yi sil
      res.clearCookie('asos_token');
    }
  }
  
  res.redirect('/login');
};

const ensureAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  req.flash('error_msg', 'Bu sayfaya erişim yetkiniz yok');
  res.redirect('/dashboard');
};

const ensureGuest = (req, res, next) => {
  if (!req.session.user && !req.cookies.asos_token) {
    return next();
  }
  res.redirect('/dashboard');
};

// Login page
router.get('/login', ensureGuest, (req, res) => {
  res.render('auth/login', {
    layout: 'layouts/auth',
    title: 'Giriş'
  });
});

// Login POST
router.post('/login', ensureGuest, async (req, res) => {
  try {
    const { email, password, remember } = req.body;
    
    console.log('Login attempt for:', email);
    
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      console.log('User not found:', email);
      return res.render('auth/login', {
        layout: 'layouts/auth',
        title: 'Giriş',
        error: 'Geçersiz e-posta veya şifre'
      });
    }

    console.log('User found:', user.email, 'isActive:', user.isActive);

    if (!user.isActive) {
      return res.render('auth/login', {
        layout: 'layouts/auth',
        title: 'Giriş',
        error: 'Hesabınız devre dışı bırakılmış'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password match:', isMatch);
    
    if (!isMatch) {
      return res.render('auth/login', {
        layout: 'layouts/auth',
        title: 'Giriş',
        error: 'Geçersiz e-posta veya şifre'
      });
    }

    // JWT token oluştur
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    // Set session
    req.session.user = {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    console.log('Login successful for:', email);
    
    // Session'ı kaydet ve sonra redirect yap
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.render('auth/login', {
          layout: 'layouts/auth',
          title: 'Giriş',
          error: 'Oturum kaydedilirken bir hata oluştu'
        });
      }
      
      // JWT token'ı cookie'ye kaydet (7 gün veya session)
      const cookieOptions = {
        httpOnly: true,
        secure: false, // HTTPS için true yapın
        sameSite: 'lax',
        maxAge: remember ? 7 * 24 * 60 * 60 * 1000 : undefined // Beni hatırla: 7 gün
      };
      
      res.cookie('asos_token', token, cookieOptions);
      console.log('Session and JWT saved, redirecting to dashboard');
      res.redirect('/dashboard');
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.render('auth/login', {
      layout: 'layouts/auth',
      title: 'Giriş',
      error: 'Giriş yapılırken bir hata oluştu'
    });
  }
});

// Logout
router.get('/logout', (req, res) => {
  // JWT cookie'yi temizle
  res.clearCookie('asos_token');
  
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/login');
  });
});

// Root redirect
router.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

// Dashboard
router.get('/dashboard', ensureAuth, (req, res) => {
  res.render('pages/dashboard', {
    title: 'Dashboard',
    activePage: 'dashboard'
  });
});

// Domains
router.get('/domains', ensureAuth, (req, res) => {
  res.render('pages/domains', {
    title: 'Domainler',
    activePage: 'domains'
  });
});

// Mail
router.get('/mail', ensureAuth, (req, res) => {
  res.render('pages/mail', {
    title: 'E-posta',
    activePage: 'mail'
  });
});

// Apps
router.get('/apps', ensureAuth, (req, res) => {
  res.render('pages/apps', {
    title: 'Uygulamalar',
    activePage: 'apps'
  });
});

// Docker
router.get('/docker', ensureAuth, (req, res) => {
  res.render('pages/docker', {
    title: 'Docker',
    activePage: 'docker'
  });
});

// System
router.get('/system', ensureAuth, ensureAdmin, (req, res) => {
  res.render('pages/system', {
    title: 'Sistem',
    activePage: 'system'
  });
});

// Users (Admin only)
router.get('/users', ensureAuth, ensureAdmin, (req, res) => {
  res.render('pages/users', {
    title: 'Kullanıcılar',
    activePage: 'users'
  });
});

module.exports = router;
