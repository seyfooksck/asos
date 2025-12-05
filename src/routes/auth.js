const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, adminOnly } = require('../middleware/auth');
const authController = require('../controllers/AuthController');

const router = express.Router();

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], validate, authController.login.bind(authController));

// Get current user
router.get('/me', auth, authController.getMe.bind(authController));

// Change password
router.put('/password', auth, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], validate, authController.changePassword.bind(authController));

// Update profile
router.put('/profile', auth, [
  body('name').optional().trim().notEmpty()
], validate, authController.updateProfile.bind(authController));

// Logout
router.post('/logout', auth, authController.logout.bind(authController));

// Admin routes
router.get('/users', auth, adminOnly, authController.getAllUsers.bind(authController));

router.post('/users', auth, adminOnly, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().notEmpty()
], validate, authController.createUser.bind(authController));

router.delete('/users/:id', auth, adminOnly, authController.deleteUser.bind(authController));

module.exports = router;
