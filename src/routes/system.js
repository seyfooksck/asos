const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, adminOnly } = require('../middleware/auth');
const systemController = require('../controllers/SystemController');

const router = express.Router();

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Sistem bilgileri
router.get('/info', auth, systemController.getInfo.bind(systemController));
router.get('/stats', auth, systemController.getStats.bind(systemController));
router.get('/cpu', auth, systemController.getCpu.bind(systemController));
router.get('/memory', auth, systemController.getMemory.bind(systemController));
router.get('/disk', auth, systemController.getDisk.bind(systemController));

// Güncelleme kontrolü
router.get('/check-update', auth, systemController.checkUpdate.bind(systemController));
router.post('/update', auth, adminOnly, systemController.performUpdate.bind(systemController));

// Servis yönetimi
router.get('/services', auth, systemController.getServices.bind(systemController));
router.post('/services/:service/:action', auth, adminOnly, systemController.controlService.bind(systemController));
router.post('/restart', auth, adminOnly, systemController.restart.bind(systemController));

// Log yönetimi
router.get('/logs', auth, adminOnly, systemController.getLogs.bind(systemController));
router.get('/logs/:type', auth, adminOnly, systemController.getLogs.bind(systemController));

// Firewall yönetimi
router.get('/firewall', auth, adminOnly, systemController.getFirewall.bind(systemController));
router.post('/firewall', auth, adminOnly, [
  body('port').isNumeric(),
  body('protocol').optional().isIn(['tcp', 'udp']),
  body('action').optional().isIn(['allow', 'deny'])
], validate, systemController.addFirewallRule.bind(systemController));
router.delete('/firewall/:ruleNumber', auth, adminOnly, systemController.removeFirewallRule.bind(systemController));

// Sistem işlemleri
router.post('/reboot', auth, adminOnly, systemController.reboot.bind(systemController));
router.post('/nginx/reload', auth, adminOnly, systemController.reloadNginx.bind(systemController));
router.post('/ssl/renew', auth, adminOnly, systemController.renewAllSSL.bind(systemController));

// Backup işlemleri
router.get('/backups', auth, adminOnly, systemController.listBackups.bind(systemController));
router.post('/backup', auth, adminOnly, systemController.createBackup.bind(systemController));

module.exports = router;
