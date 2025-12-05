const mongoose = require('mongoose');

const appSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  description: {
    type: String
  },
  icon: {
    type: String
  },
  category: {
    type: String,
    enum: ['web', 'database', 'mail', 'storage', 'monitoring', 'development', 'other'],
    default: 'other'
  },
  dockerImage: {
    type: String,
    required: true
  },
  dockerTag: {
    type: String,
    default: 'latest'
  },
  ports: [{
    container: Number,
    host: Number,
    protocol: {
      type: String,
      enum: ['tcp', 'udp'],
      default: 'tcp'
    }
  }],
  volumes: [{
    container: String,
    host: String
  }],
  environment: [{
    key: String,
    value: String,
    required: {
      type: Boolean,
      default: false
    },
    description: String
  }],
  minMemory: {
    type: Number,
    default: 256 // MB
  },
  minCpu: {
    type: Number,
    default: 0.5
  },
  website: {
    type: String
  },
  documentation: {
    type: String
  },
  isPopular: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('App', appSchema);
