#!/bin/bash
echo "=== Testing via PUBLIC IP ==="

# Generate token via public IP
echo "1. Getting token via public IP..."
RESULT=$(curl -s -X POST "http://16.171.8.128:3456/api/auth/token" \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-public-ip"}')
echo "Auth response: $RESULT"

TOKEN=$(echo $RESULT | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("data",{}).get("token",""))')
echo "Token: ${TOKEN:0:50}..."

if [ -z "$TOKEN" ]; then
  echo "Failed to get token via public IP!"
  exit 1
fi

# Test chat via public IP
echo ""
echo "2. Testing /api/agent/sdk/chat via PUBLIC IP..."
CHAT_RESULT=$(curl -s -X POST "http://16.171.8.128:3456/api/agent/sdk/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"prompt":"Say hello","projectId":"default"}' \
  --max-time 30)

echo "Chat response (first 200 chars):"
echo "$CHAT_RESULT" | head -c 200
echo ""
echo ""
echo "=== Test Complete ==="
