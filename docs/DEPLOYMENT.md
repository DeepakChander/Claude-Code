# OpenAnalyst API - Production Deployment Guide

## Quick Start (Docker)

### Prerequisites
- Ubuntu EC2 instance (16.171.8.128)
- Docker and Docker Compose installed

### 1. Install Docker (First Time Only)

```bash
# SSH to your EC2
ssh -i claude-code.pem ubuntu@16.171.8.128

# Run the install script
cd ~/Claude-Code
chmod +x scripts/install-docker.sh
./scripts/install-docker.sh

# Apply group changes
newgrp docker
```

### 2. Configure Environment

```bash
# Copy the production template
cp backend/.env.production.example backend/.env.production

# Edit with your actual values
nano backend/.env.production
```

**Required values to configure:**
- `MONGODB_URI` - Your MongoDB Atlas connection string
- `ANTHROPIC_AUTH_TOKEN` - Your OpenRouter API key
- `JWT_SECRET` - Generate with: `openssl rand -base64 32`
- `API_KEY` - Your API key for authentication

### 3. Deploy

```bash
# Run the deployment script
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### 4. Verify

```bash
# Check health
curl http://localhost:3456/health

# Check from external
curl http://16.171.8.128:3456/health
```

---

## Manual Docker Commands

### Start Services
```bash
docker compose up -d
```

### Stop Services
```bash
docker compose down
```

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f kafka
docker compose logs -f kafka-worker
```

### Rebuild After Code Changes
```bash
git pull
docker compose up -d --build
```

### Check Service Status
```bash
docker compose ps
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     EC2 Instance                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐    ┌───────────────────────────────┐  │
│  │   Kafka      │◄──►│        Agent Requests          │  │
│  │  (KRaft)     │    │        Agent Responses         │  │
│  └──────┬───────┘    └───────────────────────────────┘  │
│         │                                                │
│         ▼                                                │
│  ┌──────────────┐         ┌──────────────────────────┐  │
│  │  API Server  │◄───────►│     MongoDB Atlas        │  │
│  │  (Port 3456) │         │     (Cloud)              │  │
│  └──────────────┘         └──────────────────────────┘  │
│         │                                                │
│         ▼                                                │
│  ┌──────────────┐                                        │
│  │ Kafka Worker │                                        │
│  │  (Consumer)  │                                        │
│  └──────────────┘                                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Container Details

| Container | Port | Purpose |
|-----------|------|---------|
| openanalyst-kafka | 9092 | Kafka broker (KRaft mode) |
| openanalyst-api | 3456 | Main API server |
| openanalyst-kafka-worker | - | Processes queue messages |

---

## Troubleshooting

### Kafka Not Starting
```bash
# Check Kafka logs
docker compose logs kafka

# Restart Kafka
docker compose restart kafka
```

### API Connection Issues
```bash
# Check if API is running
docker compose ps api

# Check API logs
docker compose logs api
```

### MongoDB Connection Failed
- Verify your IP is whitelisted in MongoDB Atlas Network Access
- Check connection string in `.env.production`

### Port Already in Use
```bash
# Check what's using port 3456
sudo lsof -i :3456

# Stop any existing services
sudo systemctl stop openanalyst-api || true
pm2 delete all || true
```

---

## Stopping Self-Hosted Kafka (if previously installed)

If you previously installed Kafka directly on EC2:

```bash
# Stop Kafka service
sudo systemctl stop kafka
sudo systemctl disable kafka

# Remove Kafka files (optional)
sudo rm -rf /opt/kafka
sudo rm -rf /var/lib/kafka-logs
sudo rm /etc/systemd/system/kafka.service
sudo systemctl daemon-reload
```

---

## AWS Security Group

Ensure these ports are open:
- `22` - SSH
- `3456` - API
- `80/443` - HTTP/HTTPS (if using reverse proxy)

---

## Production Checklist

- [ ] MongoDB Atlas IP whitelist configured
- [ ] Environment variables set in `.env.production`
- [ ] Strong JWT_SECRET generated
- [ ] CORS origins configured for your frontend
- [ ] Rate limiting configured appropriately
- [ ] Logs accessible (`docker compose logs`)
- [ ] Health endpoint responding
