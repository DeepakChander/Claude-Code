# AWS EC2 Setup Guide - OpenAnalyst API with OpenRouter

## Prerequisites

- AWS EC2 instance running Ubuntu 22.04+ (t3.medium or larger recommended)
- Node.js 20+
- Claude Code installed
- OpenRouter API key (get from https://openrouter.ai)

---

## Quick Deploy (Automated)

Upload and run the deploy script:

```bash
# On your local machine, upload files to EC2
scp -i your-key.pem -r . ubuntu@YOUR_EC2_IP:~/openanalyst-api/

# SSH into EC2
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# Run deployment
cd ~/openanalyst-api
chmod +x deploy.sh
export OPENROUTER_API_KEY="sk-or-v1-YOUR_KEY"
export DATABASE_URL="mongodb://localhost:27017/claude-code"
./deploy.sh
```

---

## Manual Setup

---

## Step 1: Configure Claude Code on EC2 with OpenRouter

SSH into your EC2 instance:

```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_IP
```

### Option A: Shell Profile (Recommended)

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
# OpenRouter Configuration for Claude Code
export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
export ANTHROPIC_AUTH_TOKEN="sk-or-v1-YOUR_OPENROUTER_API_KEY"
export ANTHROPIC_API_KEY=""  # MUST be empty

# Optional: Override default models
export ANTHROPIC_MODEL="anthropic/claude-sonnet-4"
```

Then reload:
```bash
source ~/.bashrc
```

### Option B: System-wide (for services)

Create `/etc/environment.d/openrouter.conf`:

```bash
sudo mkdir -p /etc/environment.d
sudo tee /etc/environment.d/openrouter.conf << 'EOF'
ANTHROPIC_BASE_URL="https://openrouter.ai/api"
ANTHROPIC_AUTH_TOKEN="sk-or-v1-YOUR_OPENROUTER_API_KEY"
ANTHROPIC_API_KEY=""
EOF
```

### Verify Claude Code Works

```bash
claude --version
claude -p "Hello, respond with just 'OK'" --output-format json
```

---

## Step 2: Get Your OpenRouter API Key

1. Go to https://openrouter.ai
2. Sign up or log in
3. Navigate to **Keys** in the dashboard
4. Create a new API key
5. Copy the key (starts with `sk-or-`)

### Where to Put the Key

**In your EC2 shell profile (~/.bashrc):**
```bash
export ANTHROPIC_AUTH_TOKEN="sk-or-v1-YOUR_KEY_HERE"
```

**In the backend .env file:**
```bash
ANTHROPIC_AUTH_TOKEN=sk-or-v1-YOUR_KEY_HERE
```

---

## Step 3: Deploy the Backend

### Clone the Project

```bash
cd ~
git clone YOUR_REPO_URL openanalyst-api
cd openanalyst-api/backend
```

### Install Dependencies

```bash
npm install
```

### Configure Environment

Edit the `.env` file:

```bash
nano .env
```

```env
# ============================================
# OPENROUTER CONFIGURATION
# ============================================
ANTHROPIC_BASE_URL=https://openrouter.ai/api
ANTHROPIC_AUTH_TOKEN=sk-or-v1-YOUR_OPENROUTER_KEY_HERE
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=anthropic/claude-sonnet-4

# ============================================
# SERVER CONFIGURATION
# ============================================
PORT=3456
NODE_ENV=production
HOST=0.0.0.0

# ============================================
# DATABASE CONFIGURATION
# ============================================
DATABASE_URL=mongodb://localhost:27017/claude-code

# ============================================
# SECURITY CONFIGURATION
# ============================================
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# ============================================
# WORKSPACE CONFIGURATION
# ============================================
WORKSPACE_BASE_PATH=/home/ubuntu/workspaces
MAX_WORKSPACE_SIZE_MB=500

# ============================================
# RATE LIMITING
# ============================================
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Initialize Database (MongoDB)

MongoDB initializes databases and collections automatically upon first write. No manual schema initialization SQL script is needed.


### Create Workspaces Directory

```bash
sudo mkdir -p /home/ubuntu/workspaces
sudo chown ubuntu:ubuntu /home/ubuntu/workspaces
```

### Build and Test

```bash
npm run build
npm start
```

Test the API:
```bash
curl http://localhost:3456/health
```

---

## Step 4: Run as a Service (PM2)

### Install PM2

```bash
sudo npm install -g pm2
```

### Start the Application

```bash
cd ~/openanalyst-api/backend
pm2 start dist/app.js --name openanalyst-api
```

### Configure Auto-start

```bash
pm2 save
pm2 startup
# Run the command it outputs
```

### PM2 Commands

```bash
pm2 status              # Check status
pm2 logs openanalyst-api # View logs
pm2 restart openanalyst-api # Restart
pm2 stop openanalyst-api    # Stop
```

---

## Step 5: Configure Security Group for Global Access

In AWS Console (EC2 > Security Groups), add these inbound rules:

| Port | Protocol | Source | Description |
|------|----------|--------|-------------|
| 22 | TCP | Your IP | SSH access |
| 3456 | TCP | 0.0.0.0/0 | API (public access) |
| 80 | TCP | 0.0.0.0/0 | HTTP (for nginx) |
| 443 | TCP | 0.0.0.0/0 | HTTPS (for nginx with SSL) |

### How to Configure:

1. Go to **EC2 Dashboard** > **Security Groups**
2. Select your instance's security group
3. Click **Edit inbound rules**
4. Add rules for ports 3456, 80, 443 with source `0.0.0.0/0`
5. Click **Save rules**

### Get Your Public IP:

```bash
# On EC2
curl ifconfig.me
```

Your API will be accessible at: `http://YOUR_PUBLIC_IP:3456`

---

## Step 6: (Optional) Nginx Reverse Proxy with SSL

### Install Nginx

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx -y
```

### Configure Nginx

```bash
sudo tee /etc/nginx/sites-available/openanalyst << 'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN.com;

    location / {
        proxy_pass http://localhost:3456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;

        # SSE support
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/openanalyst /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Get SSL Certificate

```bash
sudo certbot --nginx -d YOUR_DOMAIN.com
```

---

## Troubleshooting

### Claude Code Not Using OpenRouter

Check environment variables are set:
```bash
echo $ANTHROPIC_BASE_URL
echo $ANTHROPIC_AUTH_TOKEN
echo $ANTHROPIC_API_KEY  # Should be empty
```

### API Key Issues

Verify your OpenRouter key:
```bash
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer sk-or-v1-YOUR_KEY"
```

### Permission Denied for Workspaces

```bash
sudo chown -R ubuntu:ubuntu /home/ubuntu/workspaces
chmod 755 /home/ubuntu/workspaces
```

### Database Connection Failed

Test connection:
```bash
psql $DATABASE_URL -c "SELECT 1"
```

### Port Already in Use

```bash
sudo lsof -i :3456
sudo kill -9 PID
```

---

## OpenRouter Models Reference

Available via OpenRouter:

| Model | OpenRouter ID | Notes |
|-------|---------------|-------|
| Claude Sonnet 4 | `anthropic/claude-sonnet-4` | Recommended |
| Claude Opus 4.1 | `anthropic/claude-opus-4.1` | Most capable |
| Claude Haiku 4.5 | `anthropic/claude-haiku-4.5` | Fastest |
| GPT-4o | `openai/gpt-4o` | Alternative |
| Gemini 2.0 | `google/gemini-2.0-flash-thinking-exp:free` | Free tier |

Set default model:
```bash
export ANTHROPIC_MODEL="anthropic/claude-sonnet-4"
```

---

## Quick Reference Commands

```bash
# Start server
cd ~/openanalyst-api/backend && pm2 start dist/app.js --name api

# View logs
pm2 logs api

# Restart
pm2 restart api

# Check health
curl http://localhost:3456/health

# Get token
curl -X POST http://localhost:3456/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "550e8400-e29b-41d4-a716-446655440000"}'

# Test Claude (streaming)
curl -N -X POST http://localhost:3456/api/agent/run \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello"}'
```

---

---

## Testing from Postman (Global Access)

### 1. Import the Postman Collection

1. Open Postman
2. Click **Import** > **File**
3. Select `OpenAnalyst.postman_collection.json`

### 2. Configure Base URL

1. Click on the collection name
2. Go to **Variables** tab
3. Set `baseUrl` to `http://YOUR_EC2_PUBLIC_IP:3456`
4. Click **Save**

### 3. Get Your Token

1. Run the **Generate Token** request
2. The token is automatically saved to collection variables

### 4. Test Endpoints

Now all other requests will use the token automatically.

### Example Test Flow:

```
1. Health Check     → Verify API is running
2. Generate Token   → Get authentication token
3. Run Sync         → Test a simple prompt
4. List Conversations → See your conversation history
```

### cURL Test from Anywhere:

```bash
# Health check
curl http://YOUR_EC2_IP:3456/health

# Get token
curl -X POST http://YOUR_EC2_IP:3456/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "550e8400-e29b-41d4-a716-446655440000"}'

# Run Claude (replace TOKEN with actual token)
curl -X POST http://YOUR_EC2_IP:3456/api/agent/run-sync \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, Claude!"}'
```

---

## Environment Variables Summary

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_BASE_URL` | Yes | `https://openrouter.ai/api` |
| `ANTHROPIC_AUTH_TOKEN` | Yes | Your OpenRouter API key |
| `ANTHROPIC_API_KEY` | Yes | **MUST be empty** |
| `ANTHROPIC_MODEL` | No | Default model to use |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing tokens |
| `PORT` | No | Server port (default: 3456) |
| `WORKSPACE_BASE_PATH` | No | Where to store workspaces |
