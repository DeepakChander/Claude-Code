import { Pool, PoolConfig } from 'pg';
import { config } from 'dotenv';

config();

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection not established
};

// Create singleton pool instance
export const pool = new Pool(poolConfig);

// Handle pool errors
pool.on('error', err => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});

export default pool;
