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

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'ClearPath Backend - Enhanced AI Commute Intelligence Engine', 
    status: 'running',
    version: '2.0',
    features: [
      'Route Scoring (7D algorithm)',
      'Women\'s Safety & Emergency SOS',
      'Real-time Location Sharing',
      'Hazard Detection & Crowd-sourcing',
      'Emergency Response System',
      'Police Integration & Control Unit',
      'Hospital & Medical Services',
      'Environmental Analysis',
      'Real-time WebSocket Updates'
    ]
  });
});

// API routes
app.use('/api', apiRoutes);
app.use('/api', apiEnhanced);
app.use('/api', v2Routes);

// WebSocket for real-time updates
const wss = new WebSocket.Server({ server, port: WS_PORT });
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('🔌 WebSocket client connected');
  clients.add(ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'subscribe') {
        ws.subscriptions = ws.subscriptions || new Set();
        ws.subscriptions.add(data.channel);
        console.log(`📢 Client subscribed to: ${data.channel}`);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('❌ WebSocket client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Broadcast real-time updates
global.broadcastUpdate = (channel, data) => {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && 
        client.subscriptions && 
        client.subscriptions.has(channel)) {
      client.send(JSON.stringify({
        channel,
        data,
        timestamp: new Date().toISOString()
      }));
    }
  });
};

// Initialize database on startup
async function startServer() {
  try {
    console.log('🔧 Initializing database...');
    await initializeDatabase();
    await seedDatabase();
    
    server.listen(PORT, () => {
      console.log(`\n✅ ClearPath Backend v2.0 - Enhanced Bangalore Edition`);
      console.log(`📍 HTTP Server running on http://localhost:${PORT}`);
      console.log(`🔌 WebSocket Server running on ws://localhost:${WS_PORT}`);
      console.log(`\n📊 Available Endpoints (v2):`);
      console.log(`   ✓ Route Search: GET/POST /api/v2/routes/search`);
      console.log(`   ✓ Score Routes: POST /api/v2/score-route`);
      console.log(`   ✓ Women's Safety: POST /api/v2/women-safety/emergency`);
      console.log(`   ✓ Location Sharing: POST /api/v2/women-safety/share-location`);
      console.log(`   ✓ Hazard Reporting: POST /api/v2/hazard/report`);
      console.log(`   ✓ Nearest Police: GET /api/v2/nearest-police/:lat/:lon`);
      console.log(`   ✓ Nearest Hospitals: GET /api/v2/hospitals/nearest`);
      console.log(`   ✓ Control Dashboard: GET /api/v2/control/dashboard`);
      console.log(`   ✓ Emergency Alerts: GET /api/v2/control/dashboard`);
      console.log(`   ✓ User Management: POST /api/v2/users/register`);
      console.log(`   ✓ Statistics: GET /api/v2/stats/incidents\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  server.close();
  await pool.end();
  process.exit(0);
});

startServer();
