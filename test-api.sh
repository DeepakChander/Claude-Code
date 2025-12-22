#!/bin/bash
echo "=== Testing OpenAnalyst API ==="
echo ""

# Generate token
echo "1. Generating auth token..."
RESULT=$(curl -s -X POST 'http://localhost:3456/api/auth/token' \
  -H 'Content-Type: application/json' \
  -d '{"userId":"test-cli-user","email":"test@example.com"}')
echo "Auth response: $RESULT"

TOKEN=$(echo $RESULT | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("data",{}).get("token",""))')
echo "Token: ${TOKEN:0:50}..."
echo ""

if [ -z "$TOKEN" ]; then
  echo "Failed to get token!"
  exit 1
fi

# Test chat endpoint
echo "2. Testing /api/agent/sdk/chat endpoint..."
CHAT_RESULT=$(curl -s -X POST 'http://localhost:3456/api/agent/sdk/chat' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"prompt":"Say hello","projectId":"default"}' \
  --max-time 30)

echo "Chat response (first 500 chars):"
echo "$CHAT_RESULT" | head -c 500
echo ""
echo ""
echo "=== Test Complete ==="
