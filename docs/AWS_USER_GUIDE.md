# OpenAnalyst API - AWS EC2 User Guide

Guide for deploying and using OpenAnalyst API on AWS EC2 for global access.

---

## Prerequisites

- AWS EC2 instance (Ubuntu 22.04+, t3.medium recommended)
- SSH access to EC2
- OpenRouter API key (https://openrouter.ai)
- PostgreSQL database (Supabase, RDS, or self-hosted)

---

## Server Deployment

### 1. SSH into EC2

```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

### 2. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Install Claude Code

```bash
curl -fsSL https://claude.ai/install.sh | bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
claude --version
```

### 4. Configure OpenRouter

Add to `~/.bashrc`:

```bash
export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
export ANTHROPIC_AUTH_TOKEN="sk-or-v1-YOUR_OPENROUTER_KEY"
export ANTHROPIC_API_KEY=""
```

Then reload:
```bash
source ~/.bashrc
```

### 5. Upload Project

From your local machine:
```bash
scp -i your-key.pem -r openanalyst-api ubuntu@YOUR_EC2_IP:~/
```

### 6. Install & Configure

```bash
cd ~/openanalyst-api/backend
npm install

# Edit .env
nano .env
```

Set in `.env`:
```env
ANTHROPIC_BASE_URL=https://openrouter.ai/api
ANTHROPIC_AUTH_TOKEN=sk-or-v1-YOUR_KEY
ANTHROPIC_API_KEY=
PORT=3456
HOST=0.0.0.0
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/db
JWT_SECRET=your-production-secret
WORKSPACE_BASE_PATH=/home/ubuntu/workspaces
```

### 7. Initialize Database

```bash
node -e "
const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(fs.readFileSync('../database/init.sql', 'utf8'))
  .then(() => console.log('Database initialized'))
  .finally(() => pool.end());
"
```

### 8. Create Workspaces Directory

```bash
mkdir -p /home/ubuntu/workspaces
chmod 755 /home/ubuntu/workspaces
```

### 9. Build & Start with PM2

```bash
npm run build
sudo npm install -g pm2
pm2 start dist/app.js --name openanalyst-api
pm2 save
pm2 startup
```

### 10. Configure AWS Security Group

In AWS Console > EC2 > Security Groups, add inbound rules:

| Port | Source | Description |
|------|--------|-------------|
| 22 | Your IP | SSH |
| 3456 | 0.0.0.0/0 | API (public) |

---

## Global Access URL

Your API is now available at:

```
http://YOUR_EC2_PUBLIC_IP:3456
```

Get your public IP:
```bash
curl ifconfig.me
```

---

## Using the API (Remote)

### From Any Machine

```bash
# Health check
curl http://YOUR_EC2_IP:3456/health

# Get token
curl -X POST http://YOUR_EC2_IP:3456/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "550e8400-e29b-41d4-a716-446655440000"}'

# Run Claude
curl -X POST http://YOUR_EC2_IP:3456/api/agent/run-sync \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello from anywhere!"}'
```

---

## Using the CLI (Remote)

### Install CLI on Your Local Machine

```bash
cd cli
npm install
npm run build
npm link
```

### Configure for Remote Server

```bash
# Set API URL to your EC2 public IP
openanalyst config set-url http://YOUR_EC2_PUBLIC_IP:3456

# Verify
openanalyst config show
```

### Login

```bash
openanalyst auth login -u 550e8400-e29b-41d4-a716-446655440000 -e you@example.com
```

### Check Connection

```bash
openanalyst health
openanalyst auth status
```

### Run Prompts

```bash
# Run a prompt
openanalyst run "Analyze the project structure"

# Continue conversation
openanalyst continue "Create documentation for it"

# Interactive mode
openanalyst i
```

---

## Using Postman (Remote)

### 1. Import Collection

Import `OpenAnalyst.postman_collection.json`

### 2. Set Base URL

1. Click collection > Variables
2. Set `baseUrl` to `http://YOUR_EC2_PUBLIC_IP:3456`
3. Save

### 3. Generate Token

Run the "Generate Token" request first.

### 4. Test All Endpoints

The token is automatically used for all requests.

---

## Server Management

### View Logs

```bash
pm2 logs openanalyst-api
```

### Restart Server

```bash
pm2 restart openanalyst-api
```

### Stop Server

```bash
pm2 stop openanalyst-api
```

### Check Status

```bash
pm2 status
```

### Update Code

```bash
cd ~/openanalyst-api
git pull  # or scp new files
cd backend
npm install
npm run build
pm2 restart openanalyst-api
```

---

## Optional: HTTPS with Nginx

### Install Nginx & Certbot

```bash
sudo apt install nginx certbot python3-certbot-nginx -y
```

### Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/openanalyst
```

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;  # Required for SSE
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/openanalyst /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Get SSL Certificate

```bash
sudo certbot --nginx -d yourdomain.com
```

Now accessible at: `https://yourdomain.com`

---

## Troubleshooting

### API not accessible from outside

1. Check Security Group allows port 3456
2. Verify `HOST=0.0.0.0` in `.env`
3. Check firewall: `sudo ufw status`

### Claude Code not using OpenRouter

```bash
echo $ANTHROPIC_BASE_URL
echo $ANTHROPIC_AUTH_TOKEN
echo $ANTHROPIC_API_KEY  # Should be empty
```

### PM2 not starting on reboot

```bash
pm2 startup
# Run the command it outputs
pm2 save
```

### Database connection issues

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

---

## Quick Reference

```bash
# Server commands
pm2 logs openanalyst-api    # View logs
pm2 restart openanalyst-api # Restart
pm2 status                  # Status

# CLI commands
openanalyst health          # Check API
openanalyst run "prompt"    # Run prompt
openanalyst continue "more" # Continue
openanalyst i               # Interactive
openanalyst conversations   # History

# Get public IP
curl ifconfig.me
```
