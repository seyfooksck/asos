/**
 * ASOS Cluster Mode
 * Multi-core CPU kullanarak yüksek performans
 */

const cluster = require('cluster');
const os = require('os');
const path = require('path');

// Worker sayısı - CPU çekirdek sayısı veya env'den
const numWorkers = process.env.CLUSTER_WORKERS 
  ? parseInt(process.env.CLUSTER_WORKERS) 
  : Math.min(os.cpus().length, 4); // Max 4 worker

if (cluster.isMaster) {
  const logger = require('./utils/logger');
  
  logger.info(`===========================================`);
  logger.info(`ASOS Panel - Cluster Mode`);
  logger.info(`Master process ${process.pid} starting...`);
  logger.info(`CPU Cores: ${os.cpus().length}`);
  logger.info(`Starting ${numWorkers} workers...`);
  logger.info(`===========================================`);

  // Worker'ları başlat
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  // Worker crash olursa yeniden başlat
  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
    cluster.fork();
  });

  // Worker online olunca log
  cluster.on('online', (worker) => {
    logger.info(`Worker ${worker.process.pid} is online`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('Master received SIGTERM, shutting down workers...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGTERM');
    }
  });

  process.on('SIGINT', () => {
    logger.info('Master received SIGINT, shutting down workers...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGTERM');
    }
    process.exit(0);
  });

} else {
  // Worker process - ana server'ı çalıştır
  require('./server');
}
