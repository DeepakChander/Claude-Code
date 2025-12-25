# OpenAnalyst AWS EC2 Implementation Guide

Complete guide for the OpenAnalyst deployment across 3 AWS EC2 instances.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Server Allocation](#server-allocation)
3. [Credentials Reference](#credentials-reference)
4. [Deployment Phases](#deployment-phases)
5. [Service Configuration](#service-configuration)
6. [Windmill Setup](#windmill-setup)
7. [Troubleshooting](#troubleshooting)
8. [Maintenance](#maintenance)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      FRONTEND SERVER (13.48.55.155)                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   Next.js (Port 3000)                            │   │
│  │  • User Interface                                                │   │
│  │  • Server-Side Rendering                                         │   │
│  │  • Static Asset Serving                                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌────────────────────────────────┐   ┌────────────────────────────────────┐
│ BRAIN + WS HUB (13.49.125.60)  │   │ ORCHESTRATION (13.60.42.124)       │
│ ┌────────────────────────────┐ │   │ ┌──────────────────────────────┐   │
│ │   Brain API (Port 3456)    │ │   │ │    Agno (Port 8001)          │   │
│ │  • Authentication          │ │──▶│ │   • Agent Coordination       │   │
│ │  • Chat Processing         │ │   │ │   • Task Planning            │   │
│ │  • Skill Management        │ │   │ │   • Execution Management     │   │
│ └────────────────────────────┘ │   │ └──────────────────────────────┘   │
│ ┌────────────────────────────┐ │   │ ┌──────────────────────────────┐   │
│ │  WebSocket Hub (Port 8002) │ │   │ │   Windmill (Port 8000)       │   │
│ │  • Real-time Updates       │ │   │ │   • Workflow Engine          │   │
│ │  • Task Progress           │ │   │ │   • Script Execution         │   │
│ │  • Live Notifications      │ │   │ │   • Job Scheduling           │   │
│ └────────────────────────────┘ │   │ └──────────────────────────────┘   │
└────────────────────────────────┘   │ ┌──────────────────────────────┐   │
                │                     │ │   Redis (Port 6379)          │   │
                │                     │ │   • Pub/Sub Messaging        │   │
                └────────────────────▶│ │   • Session Cache            │   │
                                      │ └──────────────────────────────┘   │
                                      │ ┌──────────────────────────────┐   │
                                      │ │   PostgreSQL (Port 5432)     │   │
                                      │ │   • Windmill Database        │   │
                                      │ └──────────────────────────────┘   │
                                      └────────────────────────────────────┘
                                                        │
                                                        ▼
                                      ┌────────────────────────────────────┐
                                      │         MongoDB Atlas              │
                                      │   • User Data                      │
                                      │   • Conversations                  │
                                      │   • History                        │
                                      └────────────────────────────────────┘
```

### Data Flow

1. **User Request Flow:**
   - User → Frontend → Brain API → Agno → Windmill → Response

2. **Real-time Updates Flow:**
   - Task Progress → Redis Pub/Sub → WebSocket Hub → Frontend

3. **Storage Flow:**
   - User Data → MongoDB Atlas
   - Workflow Data → PostgreSQL (Windmill)
   - Session Cache → Redis

---

## Server Allocation

| Server | IP Address | PEM Key | Services | Ports |
|--------|------------|---------|----------|-------|
| Frontend | 13.48.55.155 | Frontend-Server.pem | Next.js | 3000 |
| Brain + WS Hub | 13.49.125.60 | Brian-WSHub.pem | Brain, WebSocket Hub | 3456, 8002 |
| Orchestration | 13.60.42.124 | Orchestration-Server.pem | Agno, Windmill, Redis, PostgreSQL | 8001, 8000, 6379, 5432 |

### PEM Key Locations

```
C:\Users\hp\Desktop\Claude-Code\Brian-WSHub.pem
C:\Users\hp\Desktop\Claude-Code\Orchestration-Server.pem
C:\Users\hp\Desktop\Claude-Code\Frontend-Server.pem
```

### SSH Access

```bash
# Frontend Server
ssh -i "Frontend-Server.pem" ubuntu@13.48.55.155

# Brain + WebSocket Hub Server
ssh -i "Brian-WSHub.pem" ubuntu@13.49.125.60

# Orchestration Server
ssh -i "Orchestration-Server.pem" ubuntu@13.60.42.124
```

---

## Credentials Reference

### Windmill

| Field | Value |
|-------|-------|
| URL | http://13.60.42.124:8000 |
| Email | admin@windmill.dev |
| Password | changeme |
| API Token | Bv7Slg229K5bxjtqnNmjdf8S67oR8HcI |
| Workspace | openanalyst |

### JWT Configuration

| Field | Value |
|-------|-------|
| Secret | BjPbxeGt/6iYXWgr6N6AC3ZE2C2B4KD3yRENZ/g2ENj6YNLm2JNNrivOnyFMfeJZwqtUlN/OzezG3fK1HLqZ+A== |
| Expires In | 7d |

### Brain API

| Field | Value |
|-------|-------|
| Master API Key | 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1 |

### Tavily (Web Search)

| Field | Value |
|-------|-------|
| API Key | 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 |

### MongoDB Atlas

| Field | Value |
|-------|-------|
| URI | mongodb+srv://rishabhk_db_user:lKhXklOgLfyxTmgp@openanalystweb.arnodzc.mongodb.net/openanalyst |
| Database | openanalyst |

### PostgreSQL (Windmill)

| Field | Value |
|-------|-------|
| Host | localhost (internal) |
| User | postgres |
| Password | changeme |
| Database | windmill |

### Redis

| Field | Value |
|-------|-------|
| URL | redis://13.60.42.124:6379 |

---

## Deployment Phases

### Phase 0: Push to GitHub ✅

**Branch:** `aws-deployment`

```bash
git checkout -b aws-deployment
git add .
git commit -m "feat: add all phases for AWS deployment"
git push -u origin aws-deployment
```

### Phase 1: Deploy Orchestration Server ✅

**Server:** 13.60.42.124

1. Install Docker and Docker Compose:
```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose git
sudo usermod -aG docker ubuntu
```

2. Clone repository:
```bash
git clone -b aws-deployment https://github.com/DeepakChander/Claude-Code.git openanalyst
```

3. Create docker-compose.orchestration.yml with:
   - PostgreSQL (port 5432)
   - Redis (port 6379)
   - Windmill Server (port 8000)
   - Windmill Worker
   - Agno (port 8001)

4. Start services:
```bash
cd ~/openanalyst
sudo docker-compose -f docker-compose.orchestration.yml up -d
```

5. Initialize Windmill workspace:
```bash
# Login to get token
curl -X POST 'http://localhost:8000/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@windmill.dev","password":"changeme"}'

# Create workspace
curl -X POST 'http://localhost:8000/api/workspaces/create' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"id":"openanalyst","name":"OpenAnalyst"}'
```

### Phase 2: Deploy Brain + WebSocket Hub ✅

**Server:** 13.49.125.60

1. Install Node.js 20 and PM2:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
npm install -g pm2
```

2. Clone repository:
```bash
git clone -b aws-deployment https://github.com/DeepakChander/Claude-Code.git openanalyst
```

3. Configure Brain .env:
```bash
cat > ~/openanalyst/services/brain/.env << 'EOF'
PORT=3456
NODE_ENV=production
MONGODB_URI=mongodb+srv://rishabhk_db_user:lKhXklOgLfyxTmgp@openanalystweb.arnodzc.mongodb.net/openanalyst
JWT_SECRET=BjPbxeGt/6iYXWgr6N6AC3ZE2C2B4KD3yRENZ/g2ENj6YNLm2JNNrivOnyFMfeJZwqtUlN/OzezG3fK1HLqZ+A==
JWT_EXPIRES_IN=7d
MASTER_API_KEY=714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1
REDIS_URL=redis://13.60.42.124:6379
AGNO_URL=http://13.60.42.124:8001
WINDMILL_URL=http://13.60.42.124:8000
WINDMILL_TOKEN=Bv7Slg229K5bxjtqnNmjdf8S67oR8HcI
WINDMILL_WORKSPACE=openanalyst
TAVILY_API_KEY=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
WS_HUB_URL=ws://localhost:8002/ws
EOF
```

4. Configure WebSocket Hub .env:
```bash
cat > ~/openanalyst/services/websocket-hub/.env << 'EOF'
PORT=8002
NODE_ENV=production
REDIS_URL=redis://13.60.42.124:6379
EOF
```

5. Build and start services:
```bash
cd ~/openanalyst/services/brain && npm install && npm run build
cd ~/openanalyst/services/websocket-hub && npm install && npm run build

pm2 start dist/app.js --name brain --cwd ~/openanalyst/services/brain
pm2 start dist/index.js --name websocket-hub --cwd ~/openanalyst/services/websocket-hub
pm2 save
pm2 startup
```

### Phase 3: Deploy Frontend ✅

**Server:** 13.48.55.155

1. Install Node.js 20 and PM2:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
npm install -g pm2
```

2. Clone repository:
```bash
git clone -b aws-deployment https://github.com/DeepakChander/Claude-Code.git openanalyst
```

3. Configure .env:
```bash
cat > ~/openanalyst/frontend/.env << 'EOF'
NEXT_PUBLIC_WS_URL=ws://13.49.125.60:8002/ws
NEXT_PUBLIC_API_URL=http://13.49.125.60:3456
EOF
```

4. Build and start:
```bash
cd ~/openanalyst/frontend
npm install
npm run build
pm2 start npm --name frontend -- start
pm2 save
pm2 startup
```

### Phase 4: Test Endpoints ✅

| Endpoint | Status |
|----------|--------|
| http://13.60.42.124:8001/health | ✅ Healthy |
| http://13.60.42.124:8000/api/version | ✅ v1.598.0 |
| http://13.49.125.60:3456/health | ✅ OK |
| http://13.49.125.60:8002/health | ✅ Healthy |
| http://13.48.55.155:3000 | ⚠️ Open port 3000 in Security Group |

---

## Service Configuration

### Environment Files

#### Brain Service (.env)

```ini
PORT=3456
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
JWT_SECRET=...
JWT_EXPIRES_IN=7d
MASTER_API_KEY=...
REDIS_URL=redis://13.60.42.124:6379
AGNO_URL=http://13.60.42.124:8001
WINDMILL_URL=http://13.60.42.124:8000
WINDMILL_TOKEN=...
WINDMILL_WORKSPACE=openanalyst
TAVILY_API_KEY=...
WS_HUB_URL=ws://localhost:8002/ws
```

#### WebSocket Hub (.env)

```ini
PORT=8002
NODE_ENV=production
REDIS_URL=redis://13.60.42.124:6379
```

#### Frontend (.env)

```ini
NEXT_PUBLIC_WS_URL=ws://13.49.125.60:8002/ws
NEXT_PUBLIC_API_URL=http://13.49.125.60:3456
```

---

## Windmill Setup

### Accessing Windmill

1. Navigate to: http://13.60.42.124:8000
2. Login with:
   - Email: admin@windmill.dev
   - Password: changeme
3. Select workspace: openanalyst

### Creating Scripts

1. Go to **Scripts** → **Create Script**
2. Choose language (TypeScript, Python, etc.)
3. Define inputs and code
4. Save and deploy

### Creating Flows

1. Go to **Flows** → **Create Flow**
2. Add steps (scripts, branches, loops)
3. Configure triggers
4. Deploy

### API Usage

```bash
# Execute script
curl -X POST "http://13.60.42.124:8000/api/w/openanalyst/jobs/run/p/f/script_path" \
  -H "Authorization: Bearer Bv7Slg229K5bxjtqnNmjdf8S67oR8HcI" \
  -H "Content-Type: application/json" \
  -d '{"param1": "value1"}'
```

---

## Troubleshooting

### Check Service Status

```bash
# Orchestration Server
ssh -i "Orchestration-Server.pem" ubuntu@13.60.42.124
sudo docker-compose -f docker-compose.orchestration.yml ps
sudo docker-compose -f docker-compose.orchestration.yml logs -f

# Brain + WebSocket Hub
ssh -i "Brian-WSHub.pem" ubuntu@13.49.125.60
pm2 list
pm2 logs

# Frontend
ssh -i "Frontend-Server.pem" ubuntu@13.48.55.155
pm2 list
pm2 logs frontend
```

### Common Issues

#### 1. Port Not Accessible

Check AWS Security Group rules:
- Orchestration: 8000, 8001, 6379, 5432
- Brain: 3456, 8002
- Frontend: 3000

#### 2. Service Not Starting

```bash
# Check logs
pm2 logs <service-name>

# Check if port is in use
sudo lsof -i :<port>

# Restart service
pm2 restart <service-name>
```

#### 3. Database Connection Failed

```bash
# Test MongoDB connection
curl http://13.49.125.60:3456/health

# Test Redis connection
redis-cli -h 13.60.42.124 ping
```

#### 4. WebSocket Connection Failed

```bash
# Verify WebSocket Hub is running
curl http://13.49.125.60:8002/health

# Check Redis pub/sub
redis-cli -h 13.60.42.124 SUBSCRIBE test
```

### Restart All Services

```bash
# Orchestration Server
ssh -i "Orchestration-Server.pem" ubuntu@13.60.42.124
cd ~/openanalyst
sudo docker-compose -f docker-compose.orchestration.yml restart

# Brain + WebSocket Hub
ssh -i "Brian-WSHub.pem" ubuntu@13.49.125.60
pm2 restart all

# Frontend
ssh -i "Frontend-Server.pem" ubuntu@13.48.55.155
pm2 restart frontend
```

---

## Maintenance

### Update Code

```bash
# On any server
cd ~/openanalyst
git pull origin aws-deployment
```

Then rebuild and restart services as needed.

### View Logs

```bash
# Docker services (Orchestration)
sudo docker-compose -f docker-compose.orchestration.yml logs -f <service>

# PM2 services (Brain/Frontend)
pm2 logs <service-name>
```

### Backup

```bash
# MongoDB (via Atlas dashboard or mongodump)
mongodump --uri="mongodb+srv://..."

# PostgreSQL (Windmill)
docker exec windmill-postgres pg_dump -U postgres windmill > windmill_backup.sql
```

### Scale Services

```bash
# Scale PM2 processes
pm2 scale brain 4

# Scale Docker containers
sudo docker-compose -f docker-compose.orchestration.yml up -d --scale windmill-worker=3
```

---

## AWS Security Group Configuration

### Orchestration Server (13.60.42.124)

| Port | Protocol | Source | Description |
|------|----------|--------|-------------|
| 22 | TCP | Your IP | SSH |
| 8000 | TCP | 13.49.125.60/32 | Windmill (Brain only) |
| 8001 | TCP | 13.49.125.60/32 | Agno (Brain only) |
| 6379 | TCP | 13.49.125.60/32 | Redis (Brain only) |

### Brain + WebSocket Hub (13.49.125.60)

| Port | Protocol | Source | Description |
|------|----------|--------|-------------|
| 22 | TCP | Your IP | SSH |
| 3456 | TCP | 0.0.0.0/0 | Brain API |
| 8002 | TCP | 0.0.0.0/0 | WebSocket Hub |

### Frontend (13.48.55.155)

| Port | Protocol | Source | Description |
|------|----------|--------|-------------|
| 22 | TCP | Your IP | SSH |
| 3000 | TCP | 0.0.0.0/0 | Next.js Frontend |
| 80 | TCP | 0.0.0.0/0 | HTTP (optional) |
| 443 | TCP | 0.0.0.0/0 | HTTPS (optional) |

---

## Final Endpoints

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://13.48.55.155:3000 | User Interface |
| Brain API | http://13.49.125.60:3456 | Core API |
| Brain Health | http://13.49.125.60:3456/health | Health Check |
| WebSocket | ws://13.49.125.60:8002/ws | Real-time |
| WS Health | http://13.49.125.60:8002/health | WS Health |
| Agno | http://13.60.42.124:8001 | Orchestration |
| Agno Health | http://13.60.42.124:8001/health | Agno Health |
| Windmill | http://13.60.42.124:8000 | Workflow Engine |
| Windmill API | http://13.60.42.124:8000/api | Windmill API |

---

*Deployment completed: December 24, 2025*
*Branch: aws-deployment*
*Repository: https://github.com/DeepakChander/Claude-Code*
