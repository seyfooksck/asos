const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, adminOnly } = require('../middleware/auth');
const mailController = require('../controllers/MailController');

const router = express.Router();

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Mail hesapları CRUD
router.get('/', auth, mailController.getAll.bind(mailController));
router.get('/domain/:domainId', auth, mailController.getByDomain.bind(mailController));
router.get('/:id', auth, mailController.getOne.bind(mailController));

router.post('/', auth, [
  body('username').trim().notEmpty().matches(/^[a-zA-Z0-9._-]+$/),
  body('password').isLength({ min: 6 }),
  body('domainId').isMongoId()
], validate, mailController.create.bind(mailController));

router.put('/:id', auth, mailController.update.bind(mailController));
router.delete('/:id', auth, mailController.delete.bind(mailController));

// Şifre değiştirme
router.put('/:id/password', auth, [
  body('password').isLength({ min: 6 })
], validate, mailController.changePassword.bind(mailController));

// İstatistikler
router.get('/:id/stats', auth, mailController.getStats.bind(mailController));

// Domain için mail etkinleştir
router.post('/enable/:domainId', auth, mailController.enableMailForDomain.bind(mailController));

module.exports = router;
