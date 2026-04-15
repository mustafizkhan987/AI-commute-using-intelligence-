const { Pool } = require('pg');
require('dotenv').config();

// Optimized connection pool with proper configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'clearpath_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  
  // Performance Configuration
  max: parseInt(process.env.DB_POOL_SIZE) || 20,           // Connection pool size
  min: parseInt(process.env.DB_POOL_MIN) || 5,            // Min idle connections
  idleTimeoutMillis: 30000,                                // Idle timeout
  connectionTimeoutMillis: 2000,                           // Connection timeout
  maxUses: 7500,                                           // Max uses per connection
  
  // Statement cache for prepared statements
  statement_timeout: 30000,                                // Query timeout
  query_timeout: 30000,
});

// Connection pool event handlers
pool.on('connect', (client) => {
  client.query('SET application_name = \'clearpath\';');
  client.query('SET timezone = \'UTC\';');
});

pool.on('error', (error, client) => {
  console.error('❌ Unexpected error on idle client:', error);
  process.exitCode = 1;
});

pool.on('connect', () => {
  console.log('✅ Database pool initialized (size: ' + (process.env.DB_POOL_SIZE || 20) + ')');
});

// Query logging with performance metrics (dev only)
const originalQuery = pool.query.bind(pool);
pool.query = function(text, values, callback) {
  const start = Date.now();
  const handleResult = (err, res) => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && duration > 100) {
      console.warn(`⚠️  Slow query (${duration}ms):`, text.substring(0, 60) + '...');
    }
    if (typeof callback === 'function') callback(err, res);
    return res;
  };
  
  if (typeof callback === 'function') {
    return originalQuery(text, values, handleResult);
  } else {
    return originalQuery(text, values).then(res => {
      const duration = Date.now() - start;
      if (process.env.NODE_ENV === 'development' && duration > 100) {
        console.warn(`⚠️  Slow query (${duration}ms):`, text.substring(0, 60) + '...');
      }
      return res;
    });
  }
};

module.exports = pool;
