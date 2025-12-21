#!/bin/bash

# =============================================
# Docker Installation Script for Ubuntu EC2
# =============================================

set -e

echo "=========================================="
echo "Installing Docker on Ubuntu..."
echo "=========================================="

# Update system
sudo apt-get update

# Install prerequisites
sudo apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up the repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add current user to docker group (no sudo needed for docker commands)
sudo usermod -aG docker $USER

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Verify installation
echo ""
echo "=========================================="
echo "Docker Installation Complete!"
echo "=========================================="
docker --version
docker compose version

echo ""
echo "NOTE: You may need to log out and back in for group changes to take effect."
echo "Or run: newgrp docker"
echo ""
