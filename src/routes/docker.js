const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, adminOnly } = require('../middleware/auth');
const dockerController = require('../controllers/DockerController');

const router = express.Router();

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Docker durumu
router.get('/status', auth, dockerController.getStatus.bind(dockerController));

// Container işlemleri
router.get('/containers', auth, dockerController.listContainers.bind(dockerController));
router.get('/containers/:id', auth, dockerController.getContainer.bind(dockerController));
router.get('/containers/:id/logs', auth, dockerController.getContainerLogs.bind(dockerController));

router.post('/containers', auth, adminOnly, dockerController.createContainer.bind(dockerController));
router.post('/containers/:id/start', auth, dockerController.startContainer.bind(dockerController));
router.post('/containers/:id/stop', auth, dockerController.stopContainer.bind(dockerController));
router.post('/containers/:id/restart', auth, dockerController.restartContainer.bind(dockerController));
router.post('/containers/:id/exec', auth, adminOnly, dockerController.execContainer.bind(dockerController));
router.delete('/containers/:id', auth, adminOnly, dockerController.removeContainer.bind(dockerController));

// Image işlemleri
router.get('/images', auth, dockerController.listImages.bind(dockerController));
router.post('/images/pull', auth, adminOnly, dockerController.pullImage.bind(dockerController));
router.delete('/images/:id', auth, adminOnly, dockerController.removeImage.bind(dockerController));

// Network işlemleri
router.get('/networks', auth, dockerController.listNetworks.bind(dockerController));
router.post('/networks', auth, adminOnly, dockerController.createNetwork.bind(dockerController));

// Volume işlemleri
router.get('/volumes', auth, dockerController.listVolumes.bind(dockerController));
router.post('/volumes', auth, adminOnly, dockerController.createVolume.bind(dockerController));

module.exports = router;
