# OpenAnalyst API - Localhost User Guide

Quick guide for running OpenAnalyst API on your local machine.

---

## Prerequisites

- Node.js 18+
- PostgreSQL database (or Supabase)
- OpenRouter API key (get from https://openrouter.ai)

---

## Installation

### 1. Clone/Download the Project

```bash
cd openanalyst-api
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Configure Environment

Edit `backend/.env`:

```env
# OpenRouter Configuration
ANTHROPIC_BASE_URL=https://openrouter.ai/api
ANTHROPIC_AUTH_TOKEN=sk-or-v1-YOUR_OPENROUTER_KEY
ANTHROPIC_API_KEY=

# Server (use 127.0.0.1 for Windows)
PORT=3456
HOST=127.0.0.1
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/openanalyst

# Security
JWT_SECRET=your-secret-key-here
```

### 4. Initialize Database

```bash
# Using psql
psql $DATABASE_URL -f ../database/init.sql

# Or using the Node script
node -e "
const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(fs.readFileSync('../database/init.sql', 'utf8'))
  .then(() => console.log('Done'))
  .finally(() => pool.end());
"
```

### 5. Start the Server

```bash
npm run dev
```

You should see:
```
🚀 OpenAnalyst API running on http://127.0.0.1:3456
   Environment: development
   Health check: http://127.0.0.1:3456/health
```

---

## Using the API (cURL)

### Health Check

```bash
curl http://localhost:3456/health
```

### Get a Token

```bash
curl -X POST http://localhost:3456/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "550e8400-e29b-41d4-a716-446655440000", "email": "you@example.com"}'
```

Save the token from the response.

### Run Claude Code

```bash
# Replace YOUR_TOKEN with the actual token
curl -X POST http://localhost:3456/api/agent/run-sync \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Create a hello world Express server"}'
```

### Continue Conversation

```bash
curl -X POST http://localhost:3456/api/agent/continue \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Now add error handling"}'
```

---

## Using the CLI

### Install the CLI

```bash
cd cli
npm install
npm run build
npm link
```

Now `openanalyst` and `oa` commands are available globally.

### Configure for Localhost

```bash
# Set the API URL
openanalyst config set-url http://localhost:3456

# Verify configuration
openanalyst config show
```

### Login

```bash
# Interactive login
openanalyst auth login

# Or with flags
openanalyst auth login -u 550e8400-e29b-41d4-a716-446655440000 -e you@example.com
```

### Check Connection

```bash
openanalyst health
openanalyst auth status
```

### Run Prompts

```bash
# Single prompt
openanalyst run "List all TypeScript files in this project"

# With specific project
openanalyst run "Create an API endpoint" -p my-api-project

# Sync mode (wait for full response)
openanalyst run "Quick question" -s

# Continue conversation
openanalyst continue "Now add tests for that"
```

### Interactive Mode

```bash
openanalyst i

# Or with a project
openanalyst i -p my-project
```

In interactive mode:
- Type prompts and press Enter
- Type `/continue` or `/c` to continue the conversation
- Type `/project <name>` to switch projects
- Type `/exit` or `/q` to quit

### View Conversations

```bash
openanalyst conversations
openanalyst conversations -l 20
```

---

## Using Postman

### 1. Import Collection

1. Open Postman
2. Click **Import**
3. Select `OpenAnalyst.postman_collection.json`

### 2. Configure Variables

1. Click on the collection
2. Go to **Variables** tab
3. Set `baseUrl` to `http://localhost:3456`
4. Save

### 3. Get Token

1. Open **Authentication > Generate Token**
2. Click **Send**
3. Token is automatically saved

### 4. Test Endpoints

All other requests will use the token automatically.

---

## Troubleshooting

### Server won't start

```bash
# Check if port is in use
netstat -ano | findstr :3456

# Kill process if needed
taskkill /PID <PID> /F
```

### Database connection failed

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### "0.0.0.0 not working" on Windows

Change `HOST=0.0.0.0` to `HOST=127.0.0.1` in `.env`

### Token expired

```bash
openanalyst auth login
```

---

## API Endpoints Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | No | Health check |
| `/api/auth/token` | POST | No | Generate token |
| `/api/agent/run` | POST | Yes | Run (streaming) |
| `/api/agent/run-sync` | POST | Yes | Run (JSON) |
| `/api/agent/continue` | POST | Yes | Continue conversation |
| `/api/agent/conversations` | GET | Yes | List conversations |

---

## Example Session

```bash
# Terminal 1: Start server
cd backend && npm run dev

# Terminal 2: Use CLI
openanalyst config set-url http://localhost:3456
openanalyst auth login -u 550e8400-e29b-41d4-a716-446655440000
openanalyst health
openanalyst run "What files are in this directory?"
openanalyst continue "Create a README for this project"
openanalyst conversations
```
