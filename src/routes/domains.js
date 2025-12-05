const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, adminOnly } = require('../middleware/auth');
const domainController = require('../controllers/DomainController');

const router = express.Router();

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Domain CRUD
router.get('/', auth, domainController.getAll.bind(domainController));
router.get('/:id', auth, domainController.getOne.bind(domainController));

router.post('/', auth, [
  body('name').trim().notEmpty().matches(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/)
], validate, domainController.create.bind(domainController));

router.put('/:id', auth, domainController.update.bind(domainController));
router.delete('/:id', auth, domainController.delete.bind(domainController));

// DNS kayıtları
router.post('/:id/dns', auth, [
  body('type').isIn(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']),
  body('name').trim().notEmpty(),
  body('value').trim().notEmpty()
], validate, domainController.addDnsRecord.bind(domainController));

router.put('/:id/dns/:recordId', auth, domainController.updateDnsRecord.bind(domainController));
router.delete('/:id/dns/:recordId', auth, domainController.deleteDnsRecord.bind(domainController));

// Domain doğrulama ve SSL
router.post('/:id/verify', auth, domainController.verify.bind(domainController));
router.post('/:id/ssl', auth, domainController.getSSL.bind(domainController));
router.post('/:id/ssl/renew', auth, domainController.renewSSL.bind(domainController));

module.exports = router;
