#!/bin/bash

# Start OpenAnalyst locally with Docker Compose

set -e

echo "========================================"
echo "Starting OpenAnalyst Services"
echo "========================================"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Check for .env file
if [ ! -f .env ]; then
    echo "Warning: .env file not found. Creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "Created .env file. Please update it with your configuration."
    else
        echo "Error: No .env.example found. Please create a .env file."
        exit 1
    fi
fi

# Build and start services
echo "Building and starting services..."
docker compose up -d --build

echo ""
echo "Waiting for services to be ready..."
sleep 10

# Run health checks
./scripts/health-check.sh

echo ""
echo "========================================"
echo "OpenAnalyst is running!"
echo "========================================"
echo ""
echo "Service URLs:"
echo "  Frontend:       http://localhost:3000"
echo "  Brain API:      http://localhost:3456"
echo "  WebSocket Hub:  ws://localhost:8002/ws"
echo "  Agno API:       http://localhost:8001"
echo "  Windmill:       http://localhost:8000"
echo ""
echo "To view logs: docker compose logs -f [service]"
echo "To stop: docker compose down"
