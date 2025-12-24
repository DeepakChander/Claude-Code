const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CERT_DIR = process.env.CERT_DIR || path.join(__dirname, '..', 'certs');
const KEY_PATH = path.join(CERT_DIR, 'server.key');
const CERT_PATH = path.join(CERT_DIR, 'server.cert');

// Ensure cert directory exists
if (!fs.existsSync(CERT_DIR)) {
    console.log(`Creating directory: ${CERT_DIR}`);
    fs.mkdirSync(CERT_DIR, { recursive: true });
}

// Generate Certs using OpenSSL
try {
    if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
        console.log('Certificates already exist. Skipping generation.');
        process.exit(0);
    }

    console.log('Generating Self-Signed SSL Certificates...');

    // OpenSSL command for self-signed cert valid for 365 days
    // CN=16.171.8.128 is important for the IP
    const cmd = `openssl req -nodes -new -x509 -keyout "${KEY_PATH}" -out "${CERT_PATH}" -days 365 -subj "/C=US/ST=State/L=City/O=OpenAnalyst/OU=Backend/CN=16.171.8.128"`;

    execSync(cmd, { stdio: 'inherit' });

    console.log('✅ Certificates generated successfully!');
    console.log(`Key: ${KEY_PATH}`);
    console.log(`Cert: ${CERT_PATH}`);
    console.log('\nAdd these paths to your .env file:');
    console.log(`SSL_KEY_PATH=${KEY_PATH}`);
    console.log(`SSL_CERT_PATH=${CERT_PATH}`);

} catch (error) {
    console.error('❌ Failed to generate certificates. Ensure OpenSSL is installed and in your PATH.');
    console.error(error.message);
    process.exit(1);
}
