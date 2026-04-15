require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const http = require('http');

// Routes
const apiRoutes = require('./routes/api');
const apiEnhanced = require('./routes/api_enhanced');
const v2Routes = require('./routes/v2');

// Database
const initializeDatabase = require('./db/schema');
const seedDatabase = require('./db/seed');
const pool = require('./db');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const WS_PORT = process.env.WS_PORT || 5001;

// Optimized Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(bodyParser.json({ limit: '10mb' })); // Optimized limit
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Request logging (lightweight)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 500) {
      console.log(`⚠️  Slow request [${req.method}] ${req.path} - ${duration}ms`);
    }
  });
  next();
});

// Health check with detailed info
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    name: 'ClearPath v2.1',
    version: '2.1.0',
    timestamp: new Date().toISOString(),
    features: [
      '7D Route Scoring Algorithm',
      'Women\'s Safety & Emergency SOS',
      'Real-time Location Sharing',
      'Crowd-sourced Hazard Detection',
      'Emergency Response Integration',
      'Police Control Unit',
      'Hospital & Medical Services',
      'Environmental Analysis',
      'WebSocket Real-time Updates',
      'Response Caching (30s TTL)'
    ],
    api: 'v2.1'
  });
});

// API routes with compression
app.use('/api', apiRoutes);
app.use('/api', apiEnhanced);
app.use('/api', v2Routes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Server error'
  });
});

// WebSocket with optimization
const wss = new WebSocket.Server({ port: WS_PORT });
const clients = new Set();

// WebSocket heartbeat to detect stale connections
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('connection', (ws) => {
  ws.isAlive = true;
  clients.add(ws);
  console.log(`✅ WebSocket connected (${clients.size} active)`);

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'subscribe') {
        ws.subscriptions = ws.subscriptions || new Set();
        ws.subscriptions.add(data.channel);
        console.log(`📢 Subscribed: ${data.channel} (${ws.subscriptions.size} channels)`);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`❌ WebSocket disconnected (${clients.size} active)`);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });
});

// Broadcast with optimization
global.broadcastUpdate = (channel, data) => {
  let count = 0;
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && 
        client.subscriptions && 
        client.subscriptions.has(channel)) {
      try {
        client.send(JSON.stringify({
          channel,
          data,
          timestamp: new Date().toISOString()
        }));
        count++;
      } catch (error) {
        console.error('Broadcast error:', error);
      }
    }
  });
  if (count > 0 && process.env.DEBUG) {
    console.log(`📤 Broadcasted to ${count} clients on ${channel}`);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM: Starting graceful shutdown...');
  clearInterval(heartbeat);
  wss.close();
  server.close(async () => {
    await pool.end();
    console.log('✅ Server closed gracefully');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('❌ Timeout: Force shutting down');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 SIGINT: Shutting down...');
  clearInterval(heartbeat);
  wss.close();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
});

// Initialize and start server
async function startServer() {
  try {
    console.log('🔧 Initializing database...');
    await initializeDatabase();
    await seedDatabase();
    
    server.listen(PORT, () => {
      console.log(`\n╔══════════════════════════════════════════════════╗`);
      console.log(`║  ✅ ClearPath Backend v2.1 - Ready              ║`);
      console.log(`╟──────────────────────────────────────────────────╢`);
      console.log(`║  🌐 HTTP:      http://localhost:${PORT}        ║`);
      console.log(`║  📡 WebSocket: ws://localhost:${WS_PORT}       ║`);
      console.log(`║  📍 Database:  ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}      ║`);
      console.log(`╟──────────────────────────────────────────────────╢`);
      console.log(`║  ⚡ Features:                                    ║`);
      console.log(`║  • 7D Route Scoring (Real-time)                 ║`);
      console.log(`║  • Women's Safety SOS (Instant)                 ║`);
      console.log(`║  • Hazard Detection (Crowd-sourced)             ║`);
      console.log(`║  • Police Integration (Dashboard)               ║`);
      console.log(`║  • Response Caching (30s TTL)                   ║`);
      console.log(`║  • WebSocket Broadcasting                       ║`);
      console.log(`║  • 20+ API Endpoints                            ║`);
      console.log(`╚══════════════════════════════════════════════════╝\n`);
    });
  } catch (error) {
    console.error('❌ Database initialization failed. Some features may not work. Error:', error.message);
    // Continue starting server even if DB fails for UI testing
    server.listen(PORT, () => {
      console.log(`\n⚠️ Server started WITHOUT database connection on port ${PORT}`);
    });
  }
}

startServer();
