# OpenAnalyst CLI - Installation & Usage Guide

A command-line interface for interacting with Claude AI via the OpenAnalyst API.

---

## Table of Contents

1. [Quick Installation](#quick-installation)
2. [Manual Installation](#manual-installation)
3. [Initial Setup](#initial-setup)
4. [Basic Usage](#basic-usage)
5. [Interactive Mode](#interactive-mode)
6. [All Commands Reference](#all-commands-reference)
7. [Configuration](#configuration)
8. [Examples](#examples)
9. [Troubleshooting](#troubleshooting)

---

## Quick Installation

### Windows (PowerShell)

Run this command in PowerShell (as Administrator recommended):

```powershell
irm https://raw.githubusercontent.com/DeepakChander/Claude-Code/main/scripts/install-cli.ps1 | iex
```

### Linux / macOS (Bash)

Run this command in your terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/DeepakChander/Claude-Code/main/scripts/install-cli.sh | bash
```

---

## Manual Installation

If the one-liner doesn't work, install manually:

### Prerequisites

- **Node.js 18+** - [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** (optional)

### Steps

1. **Clone the repository:**
```bash
git clone https://github.com/DeepakChander/Claude-Code.git
cd Claude-Code/cli
```

2. **Install dependencies:**
```bash
npm install
```

3. **Build the CLI:**
```bash
npm run build
```

4. **Link globally:**
```bash
npm link
```

5. **Verify installation:**
```bash
openanalyst --version
```

---

## Initial Setup

After installation, configure the CLI to connect to your API server.

### Step 1: Set API URL

```bash
openanalyst config set-url http://16.171.8.128:3456
```

### Step 2: Authenticate

**Option A: Interactive Login**
```bash
openanalyst auth login
```
You'll be prompted to enter a User ID (UUID format).

**Option B: Set Token Directly**

First, get a token from the API:
```bash
curl -X POST http://16.171.8.128:3456/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "your-user-id"}'
```

Then set it:
```bash
openanalyst auth set-token YOUR_TOKEN_HERE
```

### Step 3: Verify Setup

```bash
openanalyst health
```

Expected output:
```
API is healthy
  Database: connected
  Environment: production
```

---

## Basic Usage

### Run a Single Prompt

```bash
openanalyst run "Create a Python function to calculate fibonacci numbers"
```

**With options:**
```bash
# Use SDK mode (required for remote API)
openanalyst run "Hello Claude" --sdk

# Wait for complete response (no streaming)
openanalyst run "What is 2+2?" --sdk --sync

# Specify a project
openanalyst run "Create index.html" --project my-website --sdk

# Use a specific model
openanalyst run "Write a poem" --model anthropic/claude-opus-4 --sdk
```

### Continue a Conversation

```bash
openanalyst continue "Now add error handling to that function" --sdk
```

### Check Your Conversations

```bash
openanalyst conversations
```

---

## Interactive Mode

The most powerful way to use OpenAnalyst - like a coding copilot in your terminal.

### Start Interactive Mode

```bash
openanalyst i
```
or
```bash
openanalyst interactive
```

### Interactive Mode Features

Once in interactive mode, you can:

- **Type any prompt** and press Enter to send to Claude
- **Use slash commands** for configuration and control
- **See real-time streaming** of Claude's responses
- **Watch tool execution** as Claude creates/edits files

### Interactive Session Example

```
╭─────────────────────────────────────────╮
│       OpenAnalyst Interactive Mode      │
╰─────────────────────────────────────────╯

Type /help for commands, or enter prompts to run Claude.

  Project: default
  Mode: SDK (OpenRouter)
  Model: default

> Create a file named calculator.py with add, subtract, multiply, divide functions

[Tool: Write]
I've created calculator.py with the four basic arithmetic functions...

> Now add a main function that demonstrates each operation

[Tool: Edit]
I've added a main function that demonstrates all operations...

> /cost

╭─────────────────────────────────────────╮
│          Token Usage & Cost            │
╰─────────────────────────────────────────╯

  Session Usage:
    Input tokens:  2,500
    Output tokens: 500
    Total tokens:  3,000
    Messages:      2

  Cost:
    Total cost:    $0.0105

> /exit
Goodbye!
```

---

## All Commands Reference

### Global Options

| Option | Description |
|--------|-------------|
| `--version`, `-V` | Show CLI version |
| `--help`, `-h` | Show help |

---

### Configuration Commands

#### `openanalyst config set-url <url>`
Set the API server URL.
```bash
openanalyst config set-url http://16.171.8.128:3456
```

#### `openanalyst config show`
Display current configuration.
```bash
openanalyst config show
```
Output:
```
Configuration:
  API URL: http://16.171.8.128:3456
  Token: (set)
  User ID: user-123
  Project: default
```

#### `openanalyst config set-project <project>`
Set default project ID.
```bash
openanalyst config set-project my-project
```

#### `openanalyst config clear`
Clear all configuration (with confirmation).
```bash
openanalyst config clear
```

---

### Authentication Commands

#### `openanalyst auth login`
Interactive login with User ID prompt.
```bash
openanalyst auth login
```

Options:
- `-u, --user-id <id>` - Provide User ID directly
- `-e, --email <email>` - Provide email

#### `openanalyst auth set-token <token>`
Set authentication token directly.
```bash
openanalyst auth set-token eyJhbGciOiJIUzI1NiIs...
```

#### `openanalyst auth status`
Check if authenticated and token validity.
```bash
openanalyst auth status
```

#### `openanalyst auth logout`
Clear authentication token.
```bash
openanalyst auth logout
```

---

### Agent Commands

#### `openanalyst run <prompt>`
Run Claude with a prompt.

Options:
| Option | Description |
|--------|-------------|
| `-p, --project <id>` | Project ID |
| `-m, --model <model>` | Model to use |
| `-s, --sync` | Wait for complete response |
| `--sdk` | Use SDK mode (recommended) |
| `-t, --tools <tools>` | Comma-separated allowed tools |

```bash
# Basic usage
openanalyst run "Hello Claude" --sdk

# With all options
openanalyst run "Create a REST API" \
  --project my-api \
  --model anthropic/claude-sonnet-4.5 \
  --sdk \
  --sync
```

#### `openanalyst continue <prompt>`
Continue previous conversation.
```bash
openanalyst continue "Add tests for that code" --sdk
```

#### `openanalyst interactive` / `openanalyst i`
Start interactive mode (see [Interactive Mode](#interactive-mode)).

Options:
| Option | Description |
|--------|-------------|
| `-p, --project <id>` | Starting project |
| `-m, --model <model>` | Starting model |

---

### Other Commands

#### `openanalyst conversations`
List your conversations.
```bash
openanalyst conversations --limit 20
```

#### `openanalyst health`
Check API health status.
```bash
openanalyst health
```

---

## Interactive Mode Commands

When in interactive mode, these slash commands are available:

### Session Control

| Command | Description |
|---------|-------------|
| `/help`, `/h` | Show all commands |
| `/continue`, `/c` | Continue previous conversation |
| `/clear` | Clear screen |
| `/compact` | Summarize conversation to save context |
| `/exit`, `/quit`, `/q` | Exit interactive mode |

### Configuration

| Command | Description |
|---------|-------------|
| `/config` | View current configuration |
| `/config set <key> <value>` | Set config value |
| `/model` | Select model (arrow keys) |
| `/model <name>` | Set model directly |
| `/project <name>` | Switch project |
| `/sdk` | Toggle SDK/CLI mode |

### Tools & Permissions

| Command | Description |
|---------|-------------|
| `/tools` | List current tools |
| `/tools <list>` | Set allowed tools (comma-separated) |
| `/tools reset` | Reset to all tools |
| `/permissions` | View/select permission mode (arrow keys) |
| `/permissions <mode>` | Set mode: default, plan, acceptEdits, bypass |

### Monitoring

| Command | Description |
|---------|-------------|
| `/status` | Show full session status |
| `/cost` | Show token usage and cost |
| `/doctor` | Run diagnostic checks |
| `/history` | Show recent messages |

### Advanced

| Command | Description |
|---------|-------------|
| `/agents` | List configured subagents |
| `/agents add <name> <desc>` | Add a custom agent |
| `/mcp` | List MCP servers |
| `/mcp add <name> <cmd>` | Add MCP server |
| `/hooks` | View automation hooks |

---

## Configuration

### Config File Location

The CLI stores configuration in:
- **Windows:** `%APPDATA%\openanalyst-nodejs\Config\config.json`
- **Linux/macOS:** `~/.config/openanalyst-nodejs/config.json`

### Config Values

| Key | Description | Example |
|-----|-------------|---------|
| `apiUrl` | API server URL | `http://16.171.8.128:3456` |
| `token` | JWT authentication token | `eyJhbG...` |
| `userId` | Your user ID | `user-123` |
| `project` | Default project ID | `my-project` |

---

## Examples

### Create a Simple Python Project

```bash
# Start interactive mode
openanalyst i --project python-calc

# In interactive:
> Create a calculator module with add, subtract, multiply, divide functions
> Add type hints and docstrings
> Create a test file with pytest tests
> Run the tests

# Exit
> /exit
```

### Quick One-Off Tasks

```bash
# Generate boilerplate
openanalyst run "Create a basic Express.js server with /health endpoint" --sdk --sync --project express-api

# Get code explanations
openanalyst run "Explain what this regex does: ^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d]{8,}$" --sdk --sync

# Debug help
openanalyst run "Why might this Python code raise a TypeError: sorted(None)" --sdk --sync
```

### Working with Files

```bash
# In interactive mode
openanalyst i

> Read package.json and list all dependencies
> Update the version to 2.0.0
> Add a new script called "deploy" that runs "npm run build && npm publish"
> Show me the final package.json
```

### Using Different Models

```bash
# Use Opus for complex tasks
openanalyst run "Design a microservices architecture for an e-commerce platform" \
  --model anthropic/claude-opus-4 --sdk --sync

# Use Haiku for quick tasks (cheaper)
openanalyst run "What's the syntax for a Python list comprehension?" \
  --model anthropic/claude-haiku-4.5 --sdk --sync
```

---

## Troubleshooting

### "API URL not configured"

```bash
openanalyst config set-url http://16.171.8.128:3456
```

### "Not authenticated"

```bash
openanalyst auth login
# or
openanalyst auth set-token YOUR_TOKEN
```

### "ECONNREFUSED" Error

The API server is not reachable. Check:
1. Server is running: `curl http://16.171.8.128:3456/health`
2. Firewall allows port 3456
3. Correct URL is configured

### "Unauthorized" / 401 Error

Your token may be expired or invalid:
```bash
openanalyst auth status
# If expired, re-login:
openanalyst auth login
```

### "command not found: openanalyst"

The CLI isn't in your PATH. Try:
```bash
# Re-run npm link
cd ~/.openanalyst-cli/cli  # or %LOCALAPPDATA%\openanalyst-cli\cli on Windows
npm link --force

# Or run directly
node ~/.openanalyst-cli/cli/dist/index.js --version
```

### Streaming Not Working

Some proxies/networks block SSE. Use sync mode:
```bash
openanalyst run "Your prompt" --sdk --sync
```

### Permission Denied (npm link)

Run with elevated privileges:
```bash
# Linux/macOS
sudo npm link --force

# Windows (run PowerShell as Administrator)
npm link --force
```

---

## Uninstallation

### Remove the CLI

```bash
npm unlink -g openanalyst
```

### Remove installation directory

**Linux/macOS:**
```bash
rm -rf ~/.openanalyst-cli
```

**Windows:**
```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\openanalyst-cli"
```

### Clear config

```bash
openanalyst config clear
```

---

## Need Help?

- **API Documentation:** See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- **GitHub Issues:** [github.com/DeepakChander/Claude-Code/issues](https://github.com/DeepakChander/Claude-Code/issues)
- **In CLI:** Run `openanalyst --help` or `/help` in interactive mode
