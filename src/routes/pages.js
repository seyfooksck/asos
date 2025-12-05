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
    
    const user = await User.findOne({ email });
    if (!user) {
      req.flash('error_msg', 'Geçersiz e-posta veya şifre');
      return res.redirect('/login');
    }

    if (!user.isActive) {
      req.flash('error_msg', 'Hesabınız devre dışı bırakılmış');
      return res.redirect('/login');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      req.flash('error_msg', 'Geçersiz e-posta veya şifre');
      return res.redirect('/login');
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

    req.flash('success_msg', 'Başarıyla giriş yaptınız');
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    req.flash('error_msg', 'Giriş yapılırken bir hata oluştu');
    res.redirect('/login');
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
