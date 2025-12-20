#!/bin/bash

# ============================================
# OpenAnalyst API - AWS EC2 Deployment Script
# ============================================

set -e

echo "=========================================="
echo "OpenAnalyst API Deployment"
echo "=========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration - UPDATE THESE VALUES
OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-sk-or-v1-YOUR_KEY_HERE}"
DATABASE_URL="${DATABASE_URL:-postgresql://user:pass@host:5432/db}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 64)}"
APP_DIR="/home/ubuntu/openanalyst-api"

# Check if running as correct user
if [ "$USER" != "ubuntu" ]; then
    echo -e "${RED}Please run as ubuntu user${NC}"
    exit 1
fi

# Step 1: Install dependencies
echo -e "\n${YELLOW}Step 1: Installing system dependencies...${NC}"
sudo apt update
sudo apt install -y nodejs npm git postgresql-client

# Check Node version
NODE_VERSION=$(node -v | cut -d'.' -f1 | tr -d 'v')
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}Upgrading Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# Step 2: Install Claude Code (if not installed)
echo -e "\n${YELLOW}Step 2: Checking Claude Code...${NC}"
if ! command -v claude &> /dev/null; then
    echo "Installing Claude Code..."
    curl -fsSL https://claude.ai/install.sh | bash
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
    export PATH="$HOME/.local/bin:$PATH"
fi
claude --version

# Step 3: Configure OpenRouter environment
echo -e "\n${YELLOW}Step 3: Configuring OpenRouter...${NC}"
cat >> ~/.bashrc << 'EOF'

# OpenRouter Configuration for Claude Code
export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
export ANTHROPIC_AUTH_TOKEN="${OPENROUTER_API_KEY}"
export ANTHROPIC_API_KEY=""
export ANTHROPIC_MODEL="anthropic/claude-sonnet-4"
EOF

source ~/.bashrc

# Step 4: Create project directory
echo -e "\n${YELLOW}Step 4: Setting up project...${NC}"
mkdir -p $APP_DIR
cd $APP_DIR

# Step 5: Copy project files (assuming they're in current directory)
# If using git:
# git clone YOUR_REPO_URL .

# Step 6: Install backend dependencies
echo -e "\n${YELLOW}Step 5: Installing backend dependencies...${NC}"
cd backend
npm install

# Step 7: Create .env file
echo -e "\n${YELLOW}Step 6: Creating environment file...${NC}"
cat > .env << EOF
# OpenRouter Configuration
ANTHROPIC_BASE_URL=https://openrouter.ai/api
ANTHROPIC_AUTH_TOKEN=${OPENROUTER_API_KEY}
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=anthropic/claude-sonnet-4

# Server Configuration
PORT=3456
NODE_ENV=production
HOST=0.0.0.0

# Database Configuration
DATABASE_URL=${DATABASE_URL}

# Security Configuration
JWT_SECRET=${JWT_SECRET}

# Workspace Configuration
WORKSPACE_BASE_PATH=/home/ubuntu/workspaces
MAX_WORKSPACE_SIZE_MB=500

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
EOF

# Step 8: Create workspaces directory
echo -e "\n${YELLOW}Step 7: Creating workspaces directory...${NC}"
mkdir -p /home/ubuntu/workspaces
chmod 755 /home/ubuntu/workspaces

# Step 9: Initialize database
echo -e "\n${YELLOW}Step 8: Initializing database...${NC}"
cd $APP_DIR
if [ -f "database/init.sql" ]; then
    PGPASSWORD=$(echo $DATABASE_URL | grep -oP '(?<=:)[^@]+(?=@)') psql $DATABASE_URL -f database/init.sql || echo "Database might already be initialized"
fi

# Step 10: Build the application
echo -e "\n${YELLOW}Step 9: Building application...${NC}"
cd $APP_DIR/backend
npm run build

# Step 11: Install PM2
echo -e "\n${YELLOW}Step 10: Setting up PM2...${NC}"
sudo npm install -g pm2

# Stop existing if running
pm2 delete openanalyst-api 2>/dev/null || true

# Start the application
pm2 start dist/app.js --name openanalyst-api

# Configure PM2 to start on boot
pm2 save
pm2 startup | tail -1 | sudo bash

# Step 12: Install CLI (optional)
echo -e "\n${YELLOW}Step 11: Installing CLI...${NC}"
cd $APP_DIR/cli
npm install
npm run build
sudo npm link

# Step 13: Configure CLI
openanalyst config set-url http://localhost:3456

# Final status
echo -e "\n${GREEN}=========================================="
echo "Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "API URL: http://$(curl -s ifconfig.me):3456"
echo ""
echo "Test with:"
echo "  curl http://$(curl -s ifconfig.me):3456/health"
echo ""
echo "Get token:"
echo "  curl -X POST http://$(curl -s ifconfig.me):3456/api/auth/token \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"userId\": \"550e8400-e29b-41d4-a716-446655440000\"}'"
echo ""
echo "PM2 commands:"
echo "  pm2 logs openanalyst-api  # View logs"
echo "  pm2 restart openanalyst-api  # Restart"
echo "  pm2 status  # Check status"
echo ""
