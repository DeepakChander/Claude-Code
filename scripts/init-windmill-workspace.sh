#!/bin/bash

# OpenAnalyst Windmill Workspace Initialization
# Sets up the workspace with required folders and configurations

set -e

echo "========================================"
echo "OpenAnalyst Windmill Workspace Setup"
echo "========================================"

# Configuration
WINDMILL_URL="${WINDMILL_URL:-http://localhost:8000}"
WINDMILL_TOKEN="${WINDMILL_TOKEN:-}"
WINDMILL_WORKSPACE="${WINDMILL_WORKSPACE:-openanalyst}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -z "$WINDMILL_TOKEN" ]; then
    echo -e "${RED}WINDMILL_TOKEN is required${NC}"
    echo ""
    echo "To get a token:"
    echo "1. Go to ${WINDMILL_URL}/user/settings/tokens"
    echo "2. Create a new token with admin permissions"
    echo "3. Run: WINDMILL_TOKEN=your-token ./scripts/init-windmill-workspace.sh"
    exit 1
fi

echo ""
echo "Configuration:"
echo "  Windmill URL: ${WINDMILL_URL}"
echo "  Workspace: ${WINDMILL_WORKSPACE}"
echo ""

# Wait for Windmill to be ready
echo "Waiting for Windmill..."
for i in {1..30}; do
    if curl -s "${WINDMILL_URL}/api/version" > /dev/null 2>&1; then
        echo -e "${GREEN}Windmill is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}Windmill did not become ready in time${NC}"
        exit 1
    fi
    echo "  Waiting... ($i/30)"
    sleep 2
done

# Create workspace
echo ""
echo "Creating workspace: ${WINDMILL_WORKSPACE}"
RESULT=$(curl -s -w "%{http_code}" -o /tmp/ws_response.txt \
    -X POST "${WINDMILL_URL}/api/workspaces/create" \
    -H "Authorization: Bearer ${WINDMILL_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"id\": \"${WINDMILL_WORKSPACE}\", \"name\": \"OpenAnalyst\"}")

if [ "$RESULT" = "200" ] || [ "$RESULT" = "201" ]; then
    echo -e "${GREEN}Workspace created${NC}"
elif [ "$RESULT" = "409" ]; then
    echo -e "${YELLOW}Workspace already exists${NC}"
else
    echo -e "${RED}Failed to create workspace (HTTP $RESULT)${NC}"
    cat /tmp/ws_response.txt 2>/dev/null
fi

# Create folders
echo ""
echo "Creating folder structure..."

create_folder() {
    local path=$1
    local name=$2

    curl -s -o /dev/null \
        -X POST "${WINDMILL_URL}/api/w/${WINDMILL_WORKSPACE}/folders/create" \
        -H "Authorization: Bearer ${WINDMILL_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"${path}\", \"owners\": [], \"extra_perms\": {}}" || true

    echo "  Created folder: ${path}"
}

create_folder "openanalyst" "OpenAnalyst Root"
create_folder "openanalyst/core" "Core Scripts"
create_folder "openanalyst/social" "Social Media Scripts"
create_folder "openanalyst/analytics" "Analytics Scripts"
create_folder "openanalyst/workflow" "Workflow Scripts"

echo ""
echo -e "${GREEN}Workspace initialization complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Deploy scripts: ./scripts/deploy-windmill-scripts.sh"
echo "2. Configure variables in Windmill UI"
echo "3. Start the full stack: docker-compose up -d"
echo ""
echo "Access Windmill at: ${WINDMILL_URL}"
