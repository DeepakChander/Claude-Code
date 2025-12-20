import { config } from 'dotenv';

// Load environment variables
config();

console.log('Testing OpenRouter Configuration...\n');

console.log('Environment Variables:');
console.log('- ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL);
console.log(
  '- ANTHROPIC_AUTH_TOKEN:',
  process.env.ANTHROPIC_AUTH_TOKEN
    ? '***' + process.env.ANTHROPIC_AUTH_TOKEN.slice(-4)
    : 'NOT SET'
);
console.log('- ANTHROPIC_MODEL:', process.env.ANTHROPIC_MODEL);
console.log('\n');

// Test that environment is properly configured
if (!process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error('❌ ERROR: ANTHROPIC_AUTH_TOKEN not set in .env file');
  process.exit(1);
}

if (!process.env.ANTHROPIC_BASE_URL) {
  console.error('❌ ERROR: ANTHROPIC_BASE_URL not set in .env file');
  process.exit(1);
}

console.log('✅ OpenRouter configuration looks good!');
console.log('\nReady to test Agent SDK in next phase.');
