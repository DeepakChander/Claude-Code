# =============================================
# OpenAnalyst CLI - Windows Installation Script
# =============================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   OpenAnalyst CLI - Installation" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
Write-Host "Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "  Node.js $nodeVersion detected" -ForegroundColor Green
} catch {
    Write-Host "  Node.js is not installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Node.js from: https://nodejs.org" -ForegroundColor Yellow
    Write-Host "(Requires Node.js 18 or higher)" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Check Node version
$versionNum = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
if ($versionNum -lt 18) {
    Write-Host "  Node.js version 18+ required (found $nodeVersion)" -ForegroundColor Red
    Write-Host "  Please upgrade Node.js: https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# Check npm
Write-Host "Checking npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "  npm $npmVersion detected" -ForegroundColor Green
} catch {
    Write-Host "  npm is not installed!" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Create permanent installation directory
$installDir = Join-Path $env:LOCALAPPDATA "openanalyst-cli"
if (Test-Path $installDir) {
    Write-Host "Removing previous installation..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $installDir
}
New-Item -ItemType Directory -Path $installDir | Out-Null

Write-Host "Downloading OpenAnalyst CLI..." -ForegroundColor Yellow
try {
    # Clone or download the repository
    Set-Location $installDir
    git clone --depth 1 https://github.com/DeepakChander/Claude-Code.git .
    Write-Host "  Download complete" -ForegroundColor Green
} catch {
    Write-Host "  Git clone failed, trying alternative method..." -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri "https://github.com/DeepakChander/Claude-Code/archive/refs/heads/main.zip" -OutFile "cli.zip"
        Expand-Archive -Path "cli.zip" -DestinationPath "." -Force
        Move-Item -Path "Claude-Code-main\*" -Destination "." -Force
        Remove-Item -Path "Claude-Code-main" -Force -ErrorAction SilentlyContinue
        Remove-Item -Path "cli.zip" -Force -ErrorAction SilentlyContinue
        Write-Host "  Download complete" -ForegroundColor Green
    } catch {
        Write-Host "  Download failed!" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# Install CLI
Write-Host "Installing OpenAnalyst CLI..." -ForegroundColor Yellow
try {
    Set-Location (Join-Path $installDir "cli")
    npm install --silent
    npm run build --silent
    npm link --force
    Write-Host "  Installation successful!" -ForegroundColor Green
} catch {
    Write-Host "  Installation failed!" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
    Write-Host "  Try running PowerShell as Administrator" -ForegroundColor Yellow
    exit 1
}

# Return to user home
Set-Location $env:USERPROFILE

Write-Host ""

# Verify installation
Write-Host "Verifying installation..." -ForegroundColor Yellow
try {
    $version = openanalyst --version
    Write-Host "  OpenAnalyst CLI $version installed" -ForegroundColor Green
} catch {
    Write-Host "  Warning: 'openanalyst' command not found in PATH" -ForegroundColor Yellow
    Write-Host "  You may need to restart your terminal" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "   Installation Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Configure API URL:" -ForegroundColor White
Write-Host "     openanalyst config set-url http://your-api-server:3456" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Login:" -ForegroundColor White
Write-Host "     openanalyst auth login" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Start using:" -ForegroundColor White
Write-Host "     openanalyst run `"Hello, Claude!`"" -ForegroundColor Gray
Write-Host "     openanalyst i  # Interactive mode" -ForegroundColor Gray
Write-Host ""
Write-Host "For help: openanalyst --help" -ForegroundColor Yellow
Write-Host ""
