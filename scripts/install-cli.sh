#!/bin/bash

# =============================================
# OpenAnalyst CLI - Linux/Mac Installation Script
# =============================================

set -e

echo ""
echo "=========================================="
echo "   OpenAnalyst CLI - Installation"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if Node.js is installed
echo -e "${YELLOW}Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}  Node.js is not installed!${NC}"
    echo ""
    echo -e "${YELLOW}Please install Node.js from: https://nodejs.org${NC}"
    echo -e "${YELLOW}(Requires Node.js 18 or higher)${NC}"
    echo ""
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}  Node.js $NODE_VERSION detected${NC}"

# Check Node version
VERSION_NUM=$(echo $NODE_VERSION | sed 's/v\([0-9]*\).*/\1/')
if [ "$VERSION_NUM" -lt 18 ]; then
    echo -e "${RED}  Node.js version 18+ required (found $NODE_VERSION)${NC}"
    echo -e "${YELLOW}  Please upgrade Node.js: https://nodejs.org${NC}"
    exit 1
fi

# Check npm
echo -e "${YELLOW}Checking npm...${NC}"
if ! command -v npm &> /dev/null; then
    echo -e "${RED}  npm is not installed!${NC}"
    exit 1
fi

NPM_VERSION=$(npm --version)
echo -e "${GREEN}  npm $NPM_VERSION detected${NC}"

echo ""

# Create temp directory
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Download and install
echo -e "${YELLOW}Downloading OpenAnalyst CLI...${NC}"
if command -v git &> /dev/null; then
    git clone --depth 1 https://github.com/DeepakChander/Claude-Code.git .
else
    curl -sL https://github.com/DeepakChander/Claude-Code/archive/refs/heads/main.tar.gz | tar xz
    mv Claude-Code-main/* .
fi
echo -e "${GREEN}  Download complete${NC}"

echo ""

# Install CLI
echo -e "${YELLOW}Installing OpenAnalyst CLI...${NC}"
cd cli
npm install --silent
npm run build --silent
npm link --force 2>/dev/null || sudo npm link --force

echo -e "${GREEN}  Installation successful!${NC}"

# Cleanup
cd ~
rm -rf "$TEMP_DIR"

echo ""

# Verify installation
echo -e "${YELLOW}Verifying installation...${NC}"
if command -v openanalyst &> /dev/null; then
    VERSION=$(openanalyst --version)
    echo -e "${GREEN}  OpenAnalyst CLI $VERSION installed${NC}"
else
    echo -e "${YELLOW}  Warning: 'openanalyst' command not found in PATH${NC}"
    echo -e "${YELLOW}  You may need to restart your terminal${NC}"
fi

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}   Installation Complete!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo -e "${CYAN}Next Steps:${NC}"
echo ""
echo "  1. Configure API URL:"
echo "     openanalyst config set-url http://your-api-server:3456"
echo ""
echo "  2. Login:"
echo "     openanalyst auth login"
echo ""
echo "  3. Start using:"
echo "     openanalyst run \"Hello, Claude!\""
echo "     openanalyst i  # Interactive mode"
echo ""
echo -e "${YELLOW}For help: openanalyst --help${NC}"
echo ""
