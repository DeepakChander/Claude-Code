import { config } from 'dotenv';
import { Pool } from 'pg';

config();

async function testDatabaseConnection() {
  console.log('Testing Database Connection...\n');

  if (!process.env.DATABASE_URL) {
    console.log('⚠️  DATABASE_URL not set in .env file');
    console.log('   Please add your Supabase database URL to continue.');
    console.log(
      '   Format: postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres'
    );
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Test connection
    const client = await pool.connect();
    console.log('✅ Successfully connected to database');

    // Test query
    const result = await client.query(
      'SELECT NOW() as current_time, version()'
    );
    console.log('✅ Database query successful');
    console.log('- Current Time:', result.rows[0].current_time);
    console.log('- PostgreSQL Version:', result.rows[0].version.split(',')[0]);

    client.release();
    await pool.end();

    console.log('\n✅ Database connection test passed!');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    await pool.end();
    process.exit(1);
  }
}

testDatabaseConnection();
