const mongoose = require('mongoose');

const mailAccountSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  domain: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Domain',
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  displayName: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  quota: {
    type: Number,
    default: 1073741824 // 1GB in bytes
  },
  usedQuota: {
    type: Number,
    default: 0
  },
  forwardingEnabled: {
    type: Boolean,
    default: false
  },
  forwardingAddress: {
    type: String
  },
  autoReplyEnabled: {
    type: Boolean,
    default: false
  },
  autoReplySubject: {
    type: String
  },
  autoReplyMessage: {
    type: String
  },
  aliases: [{
    type: String,
    lowercase: true
  }],
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true
});

// Email için index
mailAccountSchema.index({ email: 1 });
mailAccountSchema.index({ domain: 1 });
mailAccountSchema.index({ owner: 1 });

module.exports = mongoose.model('MailAccount', mailAccountSchema);
