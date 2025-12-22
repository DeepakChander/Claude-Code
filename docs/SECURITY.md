# Security Implementation Documentation

## Overview

This document describes the security measures implemented in the OpenAnalyst API to protect against unauthorized access, code execution attacks, and data breaches.

---

## Critical Security Fixes Implemented

### 1. Token Generation Protection

**File:** `backend/src/controllers/auth.controller.ts`

**Problem:** Previously, anyone could call `/api/auth/token` with any `userId` and receive a valid JWT token. This allowed impersonation attacks.

**Solution:**
- In production (`NODE_ENV=production`), token generation now requires a `MASTER_API_KEY`
- Without the correct API key, requests receive a 401 Unauthorized response

**How it works:**
```typescript
// Request without API key (REJECTED in production)
POST /api/auth/token
{
  "userId": "user123"
}
// Response: 401 - "Valid API key required for token generation"

// Request with valid API key (ACCEPTED)
POST /api/auth/token
{
  "userId": "user123",
  "apiKey": "your-master-api-key"
}
// Response: 200 - { token: "eyJ..." }
```

**Configuration Required:**
```bash
# In .env file on EC2
MASTER_API_KEY=your-secure-random-key-here
```

---

### 2. JWT Secret Enforcement

**Files:**
- `backend/src/controllers/auth.controller.ts`
- `backend/src/middleware/auth.middleware.ts`

**Problem:** JWT_SECRET could fall back to default value `'default-secret-change-me'`, allowing attackers to forge tokens.

**Solution:**
- Server throws fatal error if JWT_SECRET is not properly set in production
- Warning logged in development mode

**How it works:**
```typescript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'default-secret-change-me') {
  console.error('FATAL: JWT_SECRET must be set to a secure value');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET must be set in production');
  }
}
```

**Configuration Required:**
```bash
# Generate a secure secret
openssl rand -base64 32

# In .env file on EC2
JWT_SECRET=your-generated-secret-here
NODE_ENV=production
```

---

### 3. Tool Permission Restrictions

**File:** `backend/src/config/agent-sdk.ts`

**Problem:** `permissionMode: 'bypassPermissions'` auto-approved ALL tool executions, including:
- `Bash` - Execute shell commands (RCE vulnerability)
- `Write` - Create/overwrite files
- `Edit` - Modify files

**Solution:**
- Changed `permissionMode` from `'bypassPermissions'` to `'default'`
- Default allowed tools now only include safe read-only tools
- Dangerous tools require explicit permission

**Tool Categories:**

| Category | Tools | Auto-Approved |
|----------|-------|---------------|
| `safe` | Read, Glob, Grep, WebSearch, WebFetch | ✅ Yes |
| `dangerous` | Write, Edit, Bash | ❌ No |

**How it works:**
```typescript
// Before (DANGEROUS)
defaultQueryOptions: {
  allowedTools: ['Read', 'Write', 'Edit', 'Bash', ...],
  permissionMode: 'bypassPermissions',  // Auto-approve everything!
}

// After (SECURE)
defaultQueryOptions: {
  allowedTools: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
  permissionMode: 'default',  // Require explicit permission
}
```

**To Enable Dangerous Tools:** (Only when necessary)
```typescript
// In your API call, explicitly grant permissions
{
  allowedTools: ['Read', 'Write', 'Bash'],
  permissionMode: 'acceptEdits'  // Still requires confirmation
}
```

---

### 4. Command Blocklist

**File:** `backend/src/config/agent-sdk.ts`

Expanded blocklist prevents dangerous system commands:

| Category | Blocked Commands |
|----------|------------------|
| File Destruction | `rm -rf /`, `rm -rf ~`, `del /f /s /q`, `format c:` |
| Disk Operations | `dd if=/dev/zero`, `mkfs`, `fdisk` |
| Privilege Escalation | `sudo su`, `sudo -i`, `chmod 777` |
| Reverse Shells | `bash -i >& /dev/tcp`, `python -c "import socket` |
| Credential Theft | `cat /etc/shadow`, `cat ~/.ssh/id_rsa` |
| Environment Exfiltration | `printenv`, `env | curl` |

---

## Environment Variables Required

```bash
# Required in production
NODE_ENV=production
JWT_SECRET=<random-64-char-string>
MASTER_API_KEY=<random-32-char-string>

# Generate these values
JWT_SECRET=$(openssl rand -base64 64)
MASTER_API_KEY=$(openssl rand -hex 32)
```

---

## API Authentication Flow

### Token Generation (for your application only)

```bash
# Only your backend should call this with the master key
curl -X POST https://api.yourapp.com/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "apiKey": "your-master-api-key"
  }'
```

### Using the Token (for all protected endpoints)

```bash
curl -X POST https://api.yourapp.com/api/agent/sdk/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{
    "prompt": "Hello",
    "workspacePath": "/tmp/workspace"
  }'
```

---

## Architecture After Security Fixes

```
┌──────────────────────────────────────────────────────────────┐
│                     Your Application                          │
│  (Has MASTER_API_KEY, generates tokens for your users)       │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                 OpenAnalyst API (EC2)                        │
│  - JWT validation on all /api/agent/* endpoints              │
│  - MASTER_API_KEY required for token generation              │
│  - Safe tools only by default                                │
│  - Command blocklist prevents RCE                            │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│              OpenRouter (DeepSeek/Claude API)                │
│  - AI model inference                                        │
│  - Reasoning/thinking support                                │
└──────────────────────────────────────────────────────────────┘
```

---

## What's Still Recommended (Future Work)

| Priority | Security Measure | Status |
|----------|------------------|--------|
| HIGH | Restrict AWS Security Group (port 3456 → localhost only) | Pending |
| HIGH | Add Nginx as reverse proxy with HTTPS | Pending |
| MEDIUM | Per-user rate limiting with Redis | Pending |
| MEDIUM | Audit logging for all requests | Pending |
| LOW | Full API key management system | Pending |

---

## Testing the Security Fixes

### Test 1: Token Generation Without API Key (Should Fail in Production)

```bash
curl -X POST http://54.221.126.129:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "hacker"}'

# Expected response (in production):
# 401 - {"error":{"code":"UNAUTHORIZED","message":"Valid API key required..."}}
```

### Test 2: Token Generation With API Key (Should Work)

```bash
curl -X POST http://54.221.126.129:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "apiKey": "your-master-api-key"}'

# Expected response:
# 200 - {"success":true,"data":{"token":"eyJ..."}}
```

### Test 3: Protected Endpoint Without Token (Should Fail)

```bash
curl -X POST http://54.221.126.129:3000/api/agent/sdk/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "hello"}'

# Expected response:
# 401 - {"error":{"code":"UNAUTHORIZED","message":"No token provided"}}
```

---

## CLI Configuration

For the CLI to work, you need to set the `MASTER_API_KEY` environment variable:

```bash
# Option 1: Export before running CLI
export MASTER_API_KEY=your-master-api-key
openanalyst i

# Option 2: Add to CLI .env file
# Edit: C:\Users\hp\AppData\Roaming\openanalyst-sessions-nodejs\.env
MASTER_API_KEY=your-master-api-key
```

Or update the CLI to use a hardcoded API key for your own use (not recommended for public distribution).

---

## Summary

| Vulnerability | Before | After |
|---------------|--------|-------|
| Token generation | Anyone could get tokens | Requires MASTER_API_KEY |
| JWT secret | Could use default value | Throws fatal error in production |
| Tool permissions | Auto-approved ALL tools | Only safe read-only tools by default |
| Dangerous commands | 5 blocked | 40+ blocked |

The API is now significantly more secure, but for full production readiness, you should also implement:
1. Nginx reverse proxy with HTTPS
2. AWS Security Group restrictions
3. Per-user rate limiting
