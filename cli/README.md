# OpenAnalyst CLI

A powerful command-line interface for running Claude Code from anywhere. Connect to your OpenAnalyst API backend and interact with Claude AI directly from your terminal.

## Installation

### npm (Recommended)

```bash
npm install -g @openanalyst/cli
```

### From Source

```bash
git clone https://github.com/DeepakChander/Claude-Code
cd Claude-Code/cli
npm install
npm run build
npm link
```

### One-liner (Windows PowerShell)

```powershell
irm https://raw.githubusercontent.com/DeepakChander/Claude-Code/main/scripts/install-cli.ps1 | iex
```

### One-liner (Linux/Mac)

```bash
curl -fsSL https://raw.githubusercontent.com/DeepakChander/Claude-Code/main/scripts/install-cli.sh | bash
```

## Quick Start

```bash
# 1. Set your API URL
openanalyst config set-url http://your-api-server:3456

# 2. Login (get authentication token)
openanalyst auth login

# 3. Verify connection
openanalyst health

# 4. Run your first prompt
openanalyst run "Hello, what can you do?"

# 5. Start interactive mode
openanalyst i
```

## Commands

### Configuration

```bash
# Set API endpoint
openanalyst config set-url <url>

# Show current configuration
openanalyst config show

# Set default project
openanalyst config set-project <project-id>

# Clear all configuration
openanalyst config clear
```

### Authentication

```bash
# Login and get token
openanalyst auth login

# Check authentication status
openanalyst auth status

# Logout (clear token)
openanalyst auth logout
```

### Running Prompts

```bash
# Run a prompt
openanalyst run "your prompt here"

# Run with specific model
openanalyst run "prompt" --model anthropic/claude-sonnet-4

# Run in sync mode (wait for complete response)
openanalyst run "prompt" --sync

# Use SDK mode (via OpenRouter API)
openanalyst run "prompt" --sdk

# Specify allowed tools
openanalyst run "prompt" --tools Read,Write,Bash
```

### Continue Conversation

```bash
# Continue previous conversation
openanalyst continue "follow-up question"

# Continue in sync mode
openanalyst continue "question" --sync
```

### View Conversations

```bash
# List your conversations
openanalyst conversations

# List with custom limit
openanalyst conversations --limit 20
```

### Health Check

```bash
# Check API health
openanalyst health
```

### Interactive Mode

```bash
# Start interactive REPL
openanalyst interactive
# or
openanalyst i
# or
oa i
```

## Interactive Mode Commands

Once in interactive mode, use these commands:

### Session Control
- `/help`, `/h` - Show all commands
- `/continue`, `/c` - Continue previous conversation
- `/clear` - Clear screen
- `/compact` - Summarize conversation
- `/exit`, `/quit`, `/q` - Exit interactive mode

### Configuration
- `/config` - View current configuration
- `/config set <key> <value>` - Set configuration
- `/model <name>` - Switch AI model
- `/project <name>` - Switch project
- `/sdk` - Toggle SDK/CLI mode

### Tools & Permissions
- `/tools` - List available tools
- `/tools <list>` - Set allowed tools (comma-separated)
- `/tools reset` - Reset to all tools
- `/permissions` - View permission mode
- `/permissions <mode>` - Set mode: default, plan, acceptEdits, bypass

### Advanced
- `/agents` - List configured subagents
- `/agents add <name> <description>` - Add subagent
- `/mcp` - List MCP servers
- `/mcp add <name> <command>` - Add MCP server
- `/hooks` - View automation hooks

### Monitoring
- `/status` - Show session status
- `/cost` - Show token usage and cost
- `/doctor` - Run diagnostic checks
- `/history` - Show recent messages

## Examples

### Basic Usage

```bash
# Ask a question
openanalyst run "Explain how async/await works in JavaScript"

# Analyze code
openanalyst run "Read package.json and explain the dependencies"

# Interactive session
oa i
> What files are in this directory?
> /continue
> Explain the main entry point
> /exit
```

### Project-based Work

```bash
# Set a project for context
openanalyst config set-project my-webapp

# Work within that project
openanalyst run "List all React components"
openanalyst continue "Which one handles authentication?"
```

### Using Different Models

```bash
# Use Claude Opus (most capable)
openanalyst run "Complex analysis task" --model anthropic/claude-opus-4

# Use Claude Haiku (fastest)
openanalyst run "Quick question" --model anthropic/claude-haiku-4
```

## Configuration

Configuration is stored locally using the `conf` package. View your config location:

```bash
openanalyst config show
```

### Available Settings

| Setting | Description |
|---------|-------------|
| `apiUrl` | OpenAnalyst API endpoint |
| `token` | JWT authentication token |
| `userId` | Your user ID |
| `project` | Default project ID |

## Troubleshooting

### API Connection Issues

```bash
# Check API health
openanalyst health

# Run diagnostics
openanalyst i
> /doctor
```

### Authentication Problems

```bash
# Check auth status
openanalyst auth status

# Re-login
openanalyst auth logout
openanalyst auth login
```

### Command Not Found

Make sure npm global bin is in your PATH:

```bash
# Find npm global bin location
npm config get prefix

# Add to PATH (Linux/Mac)
export PATH="$(npm config get prefix)/bin:$PATH"

# Add to PATH (Windows PowerShell)
$env:Path += ";$(npm config get prefix)"
```

## Requirements

- Node.js >= 18.0.0
- npm >= 8.0.0

## License

MIT

## Contributing

Issues and PRs welcome at [GitHub](https://github.com/DeepakChander/Claude-Code)
