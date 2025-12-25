# OpenAnalyst Production Bug Report

**QA Testing Date:** December 24, 2025
**Tester:** Claude AI QA System
**Environment:** AWS EC2 Production

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 4 |
| High | 5 |
| Medium | 4 |
| Low | 2 |
| **Total** | **15** |

---

## Critical Bugs (Must Fix Before Production)

### BUG-001: Domain api.openanalyst.com Not Working
**Severity:** Critical
**Status:** Open
**Endpoint:** https://api.openanalyst.com

**Description:**
The domain `api.openanalyst.com` resolves to IP `16.171.8.128` but connection is refused/timeout on both HTTP and HTTPS.

**Steps to Reproduce:**
```bash
curl https://api.openanalyst.com/health
# Result: Connection timeout (HTTP 000)
```

**Expected:** API should respond with health check.
**Actual:** Connection timeout.

**Root Cause:** Domain points to different server (16.171.8.128) than deployed Brain server (13.49.125.60).

**Fix Required:**
1. Update DNS A record for `api.openanalyst.com` to point to `13.49.125.60`
2. OR configure the server at 16.171.8.128 with the Brain API

---

### BUG-002: WebSocket JWT Verification Failing
**Severity:** Critical
**Status:** Open
**Component:** WebSocket Hub (13.49.125.60:8002)

**Description:**
WebSocket connections fail with "invalid signature" error because JWT_SECRET is missing from WebSocket Hub configuration.

**Log Evidence:**
```
warn: JWT verification failed {"error":"invalid signature"}
warn: Connection attempt with invalid token
```

**Root Cause:** WebSocket Hub `.env` file missing `JWT_SECRET`.

**Current Config:**
```ini
PORT=8002
NODE_ENV=production
REDIS_URL=redis://13.60.42.124:6379
# Missing: JWT_SECRET
```

**Fix Required:**
```ini
JWT_SECRET=BjPbxeGt/6iYXWgr6N6AC3ZE2C2B4KD3yRENZ/g2ENj6YNLm2JNNrivOnyFMfeJZwqtUlN/OzezG3fK1HLqZ+A==
```

---

### BUG-003: OpenRouter Not Configured
**Severity:** Critical
**Status:** Open
**Component:** Brain API

**Description:**
Agent health endpoint shows OpenRouter is not configured, which means AI agent functionality is disabled.

**Evidence:**
```json
{
  "openrouter": "unknown",
  "configured": false,
  "mode": "sdk"
}
```

**Fix Required:**
Add to Brain `.env`:
```ini
OPENROUTER_API_KEY=<your_openrouter_api_key>
# OR
ANTHROPIC_API_KEY=<your_anthropic_api_key>
```

---

### BUG-004: Search Routes Not Mounted
**Severity:** Critical
**Status:** Open
**Endpoint:** /api/search, /api/search/research

**Description:**
Search endpoints return 404 because `search.routes.ts` exists but is not imported in `routes/index.ts`.

**File:** `services/brain/src/routes/index.ts`

**Current:**
```typescript
import authRoutes from './auth.routes';
import agentRoutes from './agent.routes';
import pendingResponseRoutes from './pending-response.routes';
import skillsRoutes from './skills.routes';
// Missing: searchRoutes
```

**Fix Required:**
```typescript
import searchRoutes from './search.routes';
// ...
router.use('/search', searchRoutes);
```

---

## High Severity Bugs

### BUG-005: Missing User Registration/Login Endpoints
**Severity:** High
**Status:** Open
**Endpoint:** /api/auth/register, /api/auth/login

**Description:**
Auth routes only have `/token` and `/verify` endpoints. Standard `/register` and `/login` are missing.

**Current Routes:**
- POST /api/auth/token (requires API key)
- POST /api/auth/verify

**Missing Routes:**
- POST /api/auth/register
- POST /api/auth/login

**Impact:** Users cannot self-register or login. All authentication requires master API key.

**Fix Required:** Implement user registration and login in `auth.controller.ts`.

---

### BUG-006: Agent Run Endpoint Missing Required Field Documentation
**Severity:** High
**Status:** Open
**Endpoint:** POST /api/agent/run-sync

**Description:**
Endpoint returns 500 error with "projectId: Path `projectId` is required" but this field is not documented.

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "AGENT_ERROR",
    "message": "Conversation validation failed: projectId: Path `projectId` is required."
  }
}
```

**Fix Required:**
1. Update API documentation to include `projectId` as required field
2. OR make `projectId` optional with a default value

---

### BUG-007: Windmill Workspace Has No Scripts
**Severity:** High
**Status:** Open
**Component:** Windmill (13.60.42.124:8000)

**Description:**
The `openanalyst` workspace was created but has no scripts deployed.

**Evidence:**
```bash
curl http://13.60.42.124:8000/api/w/openanalyst/scripts/list
# Result: []
```

**Fix Required:** Deploy required scripts to Windmill workspace.

---

### BUG-008: Skills List Empty via Agent Endpoint
**Severity:** High
**Status:** Open
**Endpoint:** GET /api/agent/skills

**Description:**
Agent skills endpoint returns empty array while `/api/skills` returns 4 skills.

**Evidence:**
```json
// GET /api/agent/skills
{"success": true, "data": {"skills": [], "agnoAvailable": true}}

// GET /api/skills
{"success": true, "skills": [...4 skills...], "count": 4}
```

**Fix Required:** Sync skill loading between agent controller and skills service.

---

### BUG-009: Environment Variables Not Loading (0 injected)
**Severity:** High
**Status:** Open
**Component:** Brain API

**Description:**
Logs show "injecting env (0) from .env" suggesting environment variables are not loading properly.

**Log Evidence:**
```
[dotenv@17.2.3] injecting env (0) from .env
```

**Root Cause:** Possible dotenv version issue or file encoding problem.

**Fix Required:**
1. Verify `.env` file encoding is UTF-8
2. Check dotenv package version compatibility
3. Restart PM2 after fixing

---

## Medium Severity Bugs

### BUG-010: Duplicate Mongoose Schema Indexes
**Severity:** Medium
**Status:** Open
**Component:** Brain API

**Description:**
Multiple mongoose warnings about duplicate schema indexes.

**Warnings:**
```
[MONGOOSE] Warning: Duplicate schema index on {"name":1}
[MONGOOSE] Warning: Duplicate schema index on {"email":1}
[MONGOOSE] Warning: Duplicate schema index on {"username":1}
[MONGOOSE] Warning: Duplicate schema index on {"sessionId":1}
[MONGOOSE] Warning: Duplicate schema index on {"correlationId":1}
[MONGOOSE] Warning: Duplicate schema index on {"expiresAt":1}
```

**Fix Required:** Review mongoose models and remove duplicate index definitions.

---

### BUG-011: Kafka Not Configured
**Severity:** Medium
**Status:** Open
**Component:** Brain API

**Description:**
Health check shows Kafka is not configured but might be expected for message queuing.

**Evidence:**
```json
{
  "kafka": {
    "configured": false,
    "producer": "disconnected",
    "consumer": "stopped"
  }
}
```

**Fix Required:** Either configure Kafka or update health check to not report it.

---

### BUG-012: API Response Time Slow
**Severity:** Medium
**Status:** Open
**Component:** All APIs

**Description:**
Response times averaging 400-500ms for health checks which should be under 100ms.

**Evidence:**
| Endpoint | Response Time |
|----------|---------------|
| Brain Health | 472ms |
| WebSocket Health | 423ms |
| Agno Health | 397ms |
| Windmill Version | 442ms |

**Fix Required:**
1. Add caching for health endpoints
2. Optimize database connection pooling
3. Consider CDN or edge caching

---

### BUG-013: Frontend Port 3000 Not Initially Open
**Severity:** Medium
**Status:** Resolved
**Component:** AWS Security Group

**Description:**
Frontend was not accessible externally until port 3000 was manually opened.

**Status:** User fixed by opening port in AWS Security Group.

---

## Low Severity Bugs

### BUG-014: Inconsistent Error Response Format
**Severity:** Low
**Status:** Open
**Component:** All APIs

**Description:**
Error responses have inconsistent format across services.

**Examples:**
```json
// Brain
{"success": false, "error": {"code": "NOT_FOUND", "message": "..."}}

// Agno
{"detail": "Not Found"}

// Windmill
"Unauthorized"
```

**Fix Required:** Standardize error response format across all services.

---

### BUG-015: Missing Rate Limiting on Some Endpoints
**Severity:** Low
**Status:** Open
**Component:** Brain API

**Description:**
Rate limiting only configured on auth endpoints (5 req/15min). Other endpoints have no rate limiting.

**Fix Required:** Add rate limiting to all sensitive endpoints.

---

## Test Results Summary

### Endpoints Tested

| Category | Endpoint | Method | Status | Notes |
|----------|----------|--------|--------|-------|
| Health | /health | GET | PASS | All services healthy |
| Auth | /api/auth/token | POST | PASS | Works with API key |
| Auth | /api/auth/verify | POST | PASS | Token verification works |
| Auth | /api/auth/register | POST | FAIL | Endpoint doesn't exist |
| Auth | /api/auth/login | POST | FAIL | Endpoint doesn't exist |
| Agent | /api/agent/run-sync | POST | FAIL | Missing projectId |
| Agent | /api/agent/health | GET | PASS | Shows OpenRouter not configured |
| Agent | /api/agent/skills | GET | PASS | Returns empty array |
| Agent | /api/agent/conversations | GET | PASS | Works correctly |
| Skills | /api/skills | GET | PASS | Returns 4 skills |
| Skills | /api/skills/:name | GET | PASS | Skill details work |
| Search | /api/search | POST | FAIL | Route not mounted |
| Pending | /api/pending-responses | GET | PASS | Works correctly |
| WebSocket | ws://...8002/ws | WS | FAIL | JWT verification fails |
| Domain | api.openanalyst.com | ALL | FAIL | Connection refused |

### Security Tests

| Test | Result | Notes |
|------|--------|-------|
| Security Headers | PASS | All headers present |
| HTTPS (HSTS) | PASS | Strict-Transport-Security set |
| X-Frame-Options | PASS | SAMEORIGIN |
| Content-Security-Policy | PASS | Configured |
| SQL Injection | PASS | No vulnerability found |
| XSS Protection | PASS | Headers configured |
| CORS | NEEDS REVIEW | Check allowed origins |

---

## Fix Priority Order

### Immediate (Day 1)
1. **BUG-002:** Add JWT_SECRET to WebSocket Hub .env
2. **BUG-004:** Mount search routes in index.ts
3. **BUG-003:** Add OpenRouter/Anthropic API key

### Short-term (Week 1)
4. **BUG-001:** Update DNS for api.openanalyst.com
5. **BUG-005:** Implement user registration/login
6. **BUG-007:** Deploy Windmill scripts
7. **BUG-006:** Document or fix projectId requirement

### Medium-term (Week 2)
8. **BUG-008:** Fix agent skills endpoint
9. **BUG-009:** Fix environment variable loading
10. **BUG-010:** Remove duplicate mongoose indexes

### Long-term (Month 1)
11. **BUG-012:** Optimize response times
12. **BUG-014:** Standardize error responses
13. **BUG-015:** Add comprehensive rate limiting
14. **BUG-011:** Configure Kafka if needed

---

## Fix Commands

### Fix BUG-002: WebSocket JWT Secret
```bash
ssh -i "Brian-WSHub.pem" ubuntu@13.49.125.60
echo 'JWT_SECRET=BjPbxeGt/6iYXWgr6N6AC3ZE2C2B4KD3yRENZ/g2ENj6YNLm2JNNrivOnyFMfeJZwqtUlN/OzezG3fK1HLqZ+A==' >> ~/openanalyst/services/websocket-hub/.env
pm2 restart websocket-hub
```

### Fix BUG-003: OpenRouter API Key
```bash
ssh -i "Brian-WSHub.pem" ubuntu@13.49.125.60
echo 'OPENROUTER_API_KEY=<your_key_here>' >> ~/openanalyst/services/brain/.env
pm2 restart brain
```

### Fix BUG-004: Mount Search Routes
Edit `services/brain/src/routes/index.ts`:
```typescript
import searchRoutes from './search.routes';
// Add after other routes
router.use('/search', searchRoutes);
```
Then rebuild and restart.

---

## References

- [API Testing Best Practices 2025](https://www.browserstack.com/guide/api-endpoint-testing)
- [End-to-End API Testing Guide](https://zuplo.com/blog/2025/02/01/end-to-end-api-testing-guide)
- [API Testing Checklist](https://www.frugaltesting.com/blog/api-testing-checklist-and-best-practices-a-complete-guide)

---

*Report generated: December 24, 2025*
