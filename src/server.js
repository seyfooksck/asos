require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
const logger = require('./utils/logger');
const cluster = require('cluster');

// Worker ID for logging
const workerId = cluster.isWorker ? cluster.worker.id : 'main';

// API Routes
const authRoutes = require('./routes/auth');
const domainRoutes = require('./routes/domains');
const mailRoutes = require('./routes/mail');
const dockerRoutes = require('./routes/docker');
const systemRoutes = require('./routes/system');
const appsRoutes = require('./routes/apps');

// Page Routes
const pageRoutes = require('./routes/pages');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// View Engine - EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// MongoDB URI
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/asos';

// Session with MongoDB Store (cluster için gerekli)
app.use(session({
  secret: process.env.JWT_SECRET || 'asos-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: MONGODB_URI,
    ttl: 24 * 60 * 60, // 1 gün
    autoRemove: 'native'
  }),
  cookie: {
    secure: false, // HTTPS için true yapın
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 1 gün
  }
}));

// Flash messages
app.use(flash());

// Global variables for views
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.user = req.session.user || null;
  next();
});

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Socket.io bağlantısı
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Global socket.io erişimi
app.set('io', io);

// Page Routes (EJS)
app.use('/', pageRoutes);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/mail', mailRoutes);
app.use('/api/docker', dockerRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/apps', appsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: require('../package.json').version
  });
});

// 404 Handler
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint bulunamadı' });
  }
  res.status(404).render('errors/404', {
    title: 'Sayfa Bulunamadı'
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ 
      error: 'Sunucu hatası', 
      message: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
  
  res.status(500).render('errors/500', {
    title: 'Sunucu Hatası',
    error: process.env.NODE_ENV === 'development' ? err : null
  });
});

// MongoDB bağlantısı ve sunucu başlatma
const PORT = process.env.PORT || 3000;

mongoose.connect(MONGODB_URI)
  .then(async () => {
    logger.info(`[Worker ${workerId}] MongoDB bağlantısı başarılı`);
    
    // Sadece ilk worker admin oluştursun (race condition önleme)
    if (!cluster.isWorker || cluster.worker.id === 1) {
      const User = require('./models/User');
      const adminExists = await User.findOne({ role: 'admin' });
      
      if (!adminExists) {
        const bcrypt = require('bcryptjs');
        const adminEmail = (process.env.ADMIN_EMAIL || 'admin@localhost').toLowerCase().trim();
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
        
        logger.info('Admin kullanıcısı oluşturuluyor: ' + adminEmail);
        
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        
        await User.create({
          email: adminEmail,
          password: hashedPassword,
          name: 'Admin',
          role: 'admin',
          isActive: true
        });
        
        logger.info('Admin kullanıcısı oluşturuldu: ' + adminEmail);
      }
    }
    
    server.listen(PORT, () => {
      logger.info(`[Worker ${workerId}] ASOS Panel ${PORT} portunda çalışıyor`);
    });
  })
  .catch((err) => {
    logger.error(`[Worker ${workerId}] MongoDB bağlantı hatası:`, err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info(`[Worker ${workerId}] SIGTERM sinyali alındı, kapatılıyor...`);
  server.close(() => {
    mongoose.connection.close(false, () => {
      logger.info(`[Worker ${workerId}] Bağlantılar kapatıldı`);
      process.exit(0);
    });
  });
});
