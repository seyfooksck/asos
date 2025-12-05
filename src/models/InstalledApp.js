const mongoose = require('mongoose');

const installedAppSchema = new mongoose.Schema({
  app: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'App',
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  domain: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Domain'
  },
  subdomain: {
    type: String
  },
  containerId: {
    type: String
  },
  containerName: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['installing', 'running', 'stopped', 'error', 'updating'],
    default: 'installing'
  },
  ports: [{
    container: Number,
    host: Number,
    protocol: String
  }],
  volumes: [{
    container: String,
    host: String
  }],
  environment: [{
    key: String,
    value: String
  }],
  memory: {
    type: Number,
    default: 512
  },
  cpu: {
    type: Number,
    default: 1
  },
  autoStart: {
    type: Boolean,
    default: true
  },
  backupEnabled: {
    type: Boolean,
    default: false
  },
  lastBackup: {
    type: Date
  },
  logs: [{
    timestamp: Date,
    message: String,
    level: {
      type: String,
      enum: ['info', 'warn', 'error']
    }
  }]
}, {
  timestamps: true
});

installedAppSchema.index({ owner: 1 });
installedAppSchema.index({ containerId: 1 });
installedAppSchema.index({ status: 1 });

module.exports = mongoose.model('InstalledApp', installedAppSchema);
