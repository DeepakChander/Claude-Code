import { config } from 'dotenv';
import { Pool } from 'pg';
import { existsSync } from 'fs';
import { resolve } from 'path';

config();

async function validatePhase1() {
  console.log('='.repeat(60));
  console.log('PHASE 1 VALIDATION');
  console.log('='.repeat(60));
  console.log('\n');

  let allPassed = true;

  // Check 1: Claude Code Installation
  console.log('1. Checking Claude Code installation...');
  console.log('   ⚠️  Please verify manually: run `claude --version`');
  console.log('');

  // Check 2: Project Structure
  console.log('2. Checking project structure...');
  const requiredDirs = [
    'src/config',
    'src/models',
    'src/services',
    'src/controllers',
    'src/routes',
    'src/middleware',
    'src/utils',
    'tests',
    '../database/migrations',
    '../workspaces',
  ];

  for (const dir of requiredDirs) {
    const path = resolve(__dirname, '..', dir);
    if (existsSync(path)) {
      console.log(`   ✅ ${dir}`);
    } else {
      console.log(`   ❌ ${dir} - MISSING`);
      allPassed = false;
    }
  }
  console.log('');

  // Check 3: Node.js & npm
  console.log('3. Checking Node.js version...');
  const nodeVersion = process.version;
  console.log(`   ✅ Node.js ${nodeVersion}`);
  console.log('');

  // Check 4: Environment Variables
  console.log('4. Checking environment variables...');
  const requiredEnvVars = [
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_MODEL',
    'PORT',
  ];

  const optionalEnvVars = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];

  for (const envVar of requiredEnvVars) {
    if (
      process.env[envVar] &&
      !process.env[envVar]?.includes('YOUR_') &&
      !process.env[envVar]?.includes('_HERE')
    ) {
      const value =
        envVar.includes('TOKEN') || envVar.includes('KEY')
          ? '***' + process.env[envVar]!.slice(-4)
          : process.env[envVar];
      console.log(`   ✅ ${envVar}: ${value}`);
    } else {
      console.log(`   ❌ ${envVar} - NOT SET or contains placeholder`);
      allPassed = false;
    }
  }

  console.log('   --- Optional (for database) ---');
  for (const envVar of optionalEnvVars) {
    if (
      process.env[envVar] &&
      !process.env[envVar]?.includes('YOUR_') &&
      !process.env[envVar]?.includes('_HERE')
    ) {
      const value =
        envVar.includes('TOKEN') || envVar.includes('KEY') || envVar.includes('URL')
          ? '***' + process.env[envVar]!.slice(-8)
          : process.env[envVar];
      console.log(`   ✅ ${envVar}: ${value}`);
    } else {
      console.log(`   ⚠️  ${envVar} - Not configured yet`);
    }
  }
  console.log('');

  // Check 5: Database Connection (optional)
  console.log('5. Testing database connection...');
  if (
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes('YOUR_') &&
    !process.env.DATABASE_URL.includes('_HERE')
  ) {
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
      });

      const client = await pool.connect();
      await client.query('SELECT 1');
      console.log('   ✅ Database connection successful');
      client.release();
      await pool.end();
    } catch (error) {
      console.log(
        '   ❌ Database connection failed:',
        (error as Error).message
      );
      // Don't fail the whole validation for optional database
    }
  } else {
    console.log('   ⚠️  DATABASE_URL not configured - skipping database test');
  }
  console.log('');

  // Check 6: TypeScript Build
  console.log('6. TypeScript configuration...');
  if (existsSync(resolve(__dirname, '..', 'tsconfig.json'))) {
    console.log('   ✅ tsconfig.json exists');
  } else {
    console.log('   ❌ tsconfig.json missing');
    allPassed = false;
  }
  console.log('');

  // Final Result
  console.log('='.repeat(60));
  if (allPassed) {
    console.log('✅ PHASE 1 VALIDATION PASSED');
    console.log('You are ready to proceed to Phase 2!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Add your Supabase credentials to .env (if not done)');
    console.log('2. Run: npx ts-node src/test-database.ts');
    console.log('3. Proceed to Phase 2 implementation');
  } else {
    console.log('❌ PHASE 1 VALIDATION FAILED');
    console.log('Please fix the issues above before proceeding.');
  }
  console.log('='.repeat(60));

  process.exit(allPassed ? 0 : 1);
}

validatePhase1();
