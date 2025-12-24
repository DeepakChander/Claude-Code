# Phase 0: Environment Setup & Infrastructure

## Objective
Set up local development environment with all services running in Docker.

## Prerequisites Checklist
- [ ] Docker & Docker Compose installed
- [ ] Node.js 20+ installed
- [ ] Python 3.11+ installed
- [ ] PostgreSQL client tools
- [ ] Git configured

## Tasks

### 0.1 Create Docker Compose Configuration
Create `docker-compose.yml` in project root with:
- PostgreSQL 15 (port 5432)
- Redis (port 6379)
- Windmill (port 8000)
- WebSocket Hub (port 8002)

```yaml
# See /docs/specs/docker-compose-spec.md for complete specification
```

### 0.2 Environment Configuration
Create `.env` file from `.env.example` with:
- Database credentials
- API keys (mock for local)
- Service URLs
- JWT secrets

### 0.3 Initialize Database
```bash
# Create database
docker-compose exec postgres psql -U postgres -c "CREATE DATABASE openanalyst;"

# Run migrations (after creating migration files)
npm run db:migrate
```

### 0.4 Verify Services
Each service should respond:
```bash
# PostgreSQL
psql -h localhost -U postgres -d openanalyst -c "SELECT 1;"

# Windmill
curl http://localhost:8000/api/version

# Redis
redis-cli ping
```

## Checkpoint
Before proceeding to Phase 1:
- [ ] All Docker containers running
- [ ] Database accessible
- [ ] Windmill UI accessible at http://localhost:8000
- [ ] Environment variables configured

## Troubleshooting
If services fail to start:
1. Check Docker logs: `docker-compose logs [service]`
2. Verify port availability: `lsof -i :[port]`
3. Check disk space: `df -h`

## Files to Create
1. `docker-compose.yml`
2. `.env.example`
3. `.env` (gitignored)
4. `scripts/init-db.sh`
5. `scripts/health-check.sh`

## Next Phase
Proceed to [Phase 1: Core Services](./PHASE-1-core-services.md)
