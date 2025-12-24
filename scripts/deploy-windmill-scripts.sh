#!/bin/bash

# OpenAnalyst Windmill Scripts Deployment
# Deploys all scripts to Windmill workspace

set -e

echo "========================================"
echo "OpenAnalyst Windmill Script Deployment"
echo "========================================"

# Configuration
WINDMILL_URL="${WINDMILL_URL:-http://localhost:8000}"
WINDMILL_TOKEN="${WINDMILL_TOKEN:-}"
WINDMILL_WORKSPACE="${WINDMILL_WORKSPACE:-openanalyst}"
SCRIPTS_DIR="$(dirname "$0")/../windmill-scripts"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check dependencies
if ! command -v curl &> /dev/null; then
    echo -e "${RED}curl is required but not installed${NC}"
    exit 1
fi

if [ -z "$WINDMILL_TOKEN" ]; then
    echo -e "${YELLOW}Warning: WINDMILL_TOKEN not set. Attempting to get token from Windmill UI...${NC}"
    echo "Please set WINDMILL_TOKEN environment variable or get it from:"
    echo "  ${WINDMILL_URL}/user/settings/tokens"

    # Check if we can access Windmill
    if curl -s "${WINDMILL_URL}/api/version" > /dev/null 2>&1; then
        echo -e "${GREEN}Windmill is accessible at ${WINDMILL_URL}${NC}"
        echo ""
        echo "To create a token:"
        echo "1. Go to ${WINDMILL_URL}/user/settings/tokens"
        echo "2. Create a new token with admin permissions"
        echo "3. Set it as WINDMILL_TOKEN environment variable"
        echo ""
        echo "Then re-run this script with:"
        echo "  WINDMILL_TOKEN=your-token ./scripts/deploy-windmill-scripts.sh"
    else
        echo -e "${RED}Cannot reach Windmill at ${WINDMILL_URL}${NC}"
        echo "Make sure Windmill is running (docker-compose up -d windmill_server)"
    fi
    exit 1
fi

echo ""
echo "Configuration:"
echo "  Windmill URL: ${WINDMILL_URL}"
echo "  Workspace: ${WINDMILL_WORKSPACE}"
echo "  Scripts Dir: ${SCRIPTS_DIR}"
echo ""

# Check Windmill availability
echo "Checking Windmill connection..."
if ! curl -s "${WINDMILL_URL}/api/version" > /dev/null 2>&1; then
    echo -e "${RED}Cannot connect to Windmill at ${WINDMILL_URL}${NC}"
    exit 1
fi
echo -e "${GREEN}Windmill is accessible${NC}"

# Create workspace if it doesn't exist
echo ""
echo "Checking workspace..."
WORKSPACE_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${WINDMILL_TOKEN}" \
    "${WINDMILL_URL}/api/w/${WINDMILL_WORKSPACE}/users/whoami")

if [ "$WORKSPACE_EXISTS" = "404" ]; then
    echo "Creating workspace: ${WINDMILL_WORKSPACE}"
    curl -s -X POST "${WINDMILL_URL}/api/workspaces/create" \
        -H "Authorization: Bearer ${WINDMILL_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"id\": \"${WINDMILL_WORKSPACE}\", \"name\": \"OpenAnalyst\"}" > /dev/null
    echo -e "${GREEN}Workspace created${NC}"
else
    echo -e "${GREEN}Workspace exists${NC}"
fi

# Deploy scripts
echo ""
echo "Deploying scripts..."
echo "----------------------------------------"

deploy_script() {
    local file_path=$1
    local relative_path=${file_path#$SCRIPTS_DIR/}
    local script_path=$(echo "$relative_path" | sed 's/\.ts$//')

    echo -n "Deploying $script_path... "

    # Read script content
    local content=$(cat "$file_path")

    # Create or update script via API
    local response=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "${WINDMILL_URL}/api/w/${WINDMILL_WORKSPACE}/scripts/create" \
        -H "Authorization: Bearer ${WINDMILL_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{
            \"path\": \"${script_path}\",
            \"content\": $(echo "$content" | jq -Rs .),
            \"language\": \"deno\",
            \"summary\": \"OpenAnalyst script\",
            \"description\": \"Deployed via deployment script\"
        }")

    if [ "$response" = "200" ] || [ "$response" = "201" ]; then
        echo -e "${GREEN}OK${NC}"
        return 0
    elif [ "$response" = "409" ]; then
        # Script exists, try to update
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST "${WINDMILL_URL}/api/w/${WINDMILL_WORKSPACE}/scripts/update/p/${script_path}" \
            -H "Authorization: Bearer ${WINDMILL_TOKEN}" \
            -H "Content-Type: application/json" \
            -d "{
                \"content\": $(echo "$content" | jq -Rs .),
                \"language\": \"deno\",
                \"summary\": \"OpenAnalyst script\",
                \"description\": \"Updated via deployment script\"
            }")

        if [ "$response" = "200" ]; then
            echo -e "${YELLOW}Updated${NC}"
            return 0
        fi
    fi

    echo -e "${RED}Failed (HTTP $response)${NC}"
    return 1
}

# Find and deploy all TypeScript files
FAILED=0
DEPLOYED=0

for script in $(find "$SCRIPTS_DIR" -name "*.ts" -type f); do
    if deploy_script "$script"; then
        DEPLOYED=$((DEPLOYED+1))
    else
        FAILED=$((FAILED+1))
    fi
done

echo "----------------------------------------"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}Successfully deployed ${DEPLOYED} scripts!${NC}"
    exit 0
else
    echo -e "${YELLOW}Deployed ${DEPLOYED} scripts, ${FAILED} failed${NC}"
    exit 1
fi
