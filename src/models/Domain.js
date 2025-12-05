const mongoose = require('mongoose');

const dnsRecordSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'],
    required: true
  },
  name: {
    type: String,
    required: true
  },
  value: {
    type: String,
    required: true
  },
  ttl: {
    type: Number,
    default: 3600
  },
  priority: {
    type: Number,
    default: 10
  }
});

const domainSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String
  },
  dnsRecords: [dnsRecordSchema],
  sslEnabled: {
    type: Boolean,
    default: false
  },
  sslCertPath: {
    type: String
  },
  sslKeyPath: {
    type: String
  },
  sslExpiresAt: {
    type: Date
  },
  mailEnabled: {
    type: Boolean,
    default: false
  },
  settings: {
    catchAll: {
      type: Boolean,
      default: false
    },
    catchAllAddress: {
      type: String
    },
    spfRecord: {
      type: String
    },
    dkimEnabled: {
      type: Boolean,
      default: false
    },
    dmarcRecord: {
      type: String
    }
  }
}, {
  timestamps: true
});

// Domain adı için index
domainSchema.index({ name: 1 });
domainSchema.index({ owner: 1 });

module.exports = mongoose.model('Domain', domainSchema);
