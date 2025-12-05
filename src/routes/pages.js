const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();

// Auth middleware for pages
const ensureAuth = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  req.flash('error_msg', 'Lütfen giriş yapın');
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
  if (!req.session.user) {
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
    const { email, password } = req.body;
    
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
    res.redirect('/dashboard');
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
