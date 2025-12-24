#!/bin/bash

# OpenAnalyst Health Check Script
# Checks the health of all services

set -e

echo "========================================"
echo "OpenAnalyst Health Check"
echo "========================================"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_service() {
    local name=$1
    local url=$2
    local timeout=${3:-5}

    echo -n "Checking $name... "

    if curl -s --max-time $timeout "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        return 1
    fi
}

# Check each service
echo ""
echo "Service Health Checks:"
echo "----------------------------------------"

FAILED=0

check_service "Redis" "redis://localhost:6379" 2 || FAILED=$((FAILED+1))
check_service "Brain API" "http://localhost:3456/health" || FAILED=$((FAILED+1))
check_service "WebSocket Hub" "http://localhost:8002/health" || FAILED=$((FAILED+1))
check_service "Agno" "http://localhost:8001/health" || FAILED=$((FAILED+1))
check_service "Windmill" "http://localhost:8000/api/version" || FAILED=$((FAILED+1))
check_service "Frontend" "http://localhost:3000" || FAILED=$((FAILED+1))

echo ""
echo "----------------------------------------"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All services are healthy!${NC}"
    exit 0
else
    echo -e "${RED}$FAILED service(s) failed health check${NC}"
    exit 1
fi
