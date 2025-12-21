#!/bin/bash

# =============================================
# OpenAnalyst API - Production Deployment Script
# =============================================

set -e

echo "=========================================="
echo "OpenAnalyst API - Production Deployment"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Install Docker first: https://docs.docker.com/engine/install/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed.${NC}"
    exit 1
fi

# Check if .env.production exists
if [ ! -f "backend/.env.production" ]; then
    echo -e "${YELLOW}Warning: backend/.env.production not found.${NC}"
    echo "Creating from template..."
    cp backend/.env.production.example backend/.env.production
    echo -e "${YELLOW}Please edit backend/.env.production with your credentials before running again.${NC}"
    exit 1
fi

# Pull latest code (if git is available)
if command -v git &> /dev/null; then
    echo -e "${GREEN}Pulling latest code...${NC}"
    git pull origin master || true
fi

# Stop existing containers
echo -e "${GREEN}Stopping existing containers...${NC}"
docker compose down || true

# Remove old images (optional, uncomment if needed)
# echo -e "${GREEN}Removing old images...${NC}"
# docker compose down --rmi local || true

# Build and start containers
echo -e "${GREEN}Building and starting containers...${NC}"
docker compose up -d --build

# Wait for services to be healthy
echo -e "${GREEN}Waiting for services to start...${NC}"
sleep 15

# Check service status
echo ""
echo "=========================================="
echo "Service Status:"
echo "=========================================="
docker compose ps

# Check health endpoint
echo ""
echo "=========================================="
echo "Health Check:"
echo "=========================================="
sleep 5
curl -s http://localhost:3456/health | jq . || curl -s http://localhost:3456/health

echo ""
echo -e "${GREEN}=========================================="
echo "Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "API URL: http://localhost:3456"
echo "Health: http://localhost:3456/health"
echo ""
echo "Useful commands:"
echo "  View logs:        docker compose logs -f"
echo "  View API logs:    docker compose logs -f api"
echo "  View Kafka logs:  docker compose logs -f kafka"
echo "  Stop all:         docker compose down"
echo "  Restart:          docker compose restart"
echo ""
