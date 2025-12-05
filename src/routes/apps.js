const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { auth, adminOnly } = require('../middleware/auth');
const appsController = require('../controllers/AppsController');

const router = express.Router();

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// App store - Tüm uygulamaları listele
router.get('/', auth, appsController.getApps.bind(appsController));

// Tek bir uygulamanın detayları
router.get('/:id', auth, [
  param('id').isMongoId()
], validate, appsController.getApp.bind(appsController));

// Yeni uygulama ekle (admin)
router.post('/', auth, adminOnly, [
  body('name').notEmpty().withMessage('Uygulama adı gerekli'),
  body('slug').notEmpty().withMessage('Slug gerekli'),
  body('image').notEmpty().withMessage('Docker image gerekli'),
  body('category').optional().isIn(['productivity', 'communication', 'development', 'media', 'storage', 'other'])
], validate, appsController.createApp.bind(appsController));

// Uygulama güncelle (admin)
router.put('/:id', auth, adminOnly, [
  param('id').isMongoId()
], validate, appsController.updateApp.bind(appsController));

// Uygulama sil (admin)
router.delete('/:id', auth, adminOnly, [
  param('id').isMongoId()
], validate, appsController.deleteApp.bind(appsController));

// Yüklü uygulamalar
router.get('/installed/list', auth, appsController.getInstalledApps.bind(appsController));

// Tek bir yüklü uygulamanın detayları
router.get('/installed/:id', auth, [
  param('id').isMongoId()
], validate, appsController.getInstalledApp.bind(appsController));

// Uygulama yükle
router.post('/:id/install', auth, adminOnly, [
  param('id').isMongoId(),
  body('subdomain').notEmpty().withMessage('Subdomain gerekli'),
  body('domainId').isMongoId().withMessage('Geçerli bir domain ID gerekli')
], validate, appsController.installApp.bind(appsController));

// Uygulama kaldır
router.delete('/installed/:id', auth, adminOnly, [
  param('id').isMongoId()
], validate, appsController.uninstallApp.bind(appsController));

// Uygulama başlat
router.post('/installed/:id/start', auth, adminOnly, [
  param('id').isMongoId()
], validate, appsController.startInstalledApp.bind(appsController));

// Uygulama durdur
router.post('/installed/:id/stop', auth, adminOnly, [
  param('id').isMongoId()
], validate, appsController.stopInstalledApp.bind(appsController));

// Uygulama yeniden başlat
router.post('/installed/:id/restart', auth, adminOnly, [
  param('id').isMongoId()
], validate, appsController.restartInstalledApp.bind(appsController));

// Uygulama logları
router.get('/installed/:id/logs', auth, [
  param('id').isMongoId()
], validate, appsController.getInstalledAppLogs.bind(appsController));

// Varsayılan uygulamaları seed et
router.post('/seed', auth, adminOnly, appsController.seedApps.bind(appsController));

module.exports = router;
