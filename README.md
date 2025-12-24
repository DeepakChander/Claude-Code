# OpenAnalyst - AI Coding Assistant

OpenAnalyst is an advanced AI coding assistant designed to act as a powerful backend for IDE integrations and remote coding workflows. It combines a robust Node.js/Express backend with a CLI tool, offering real-time streaming, agentic capabilities (file operations, terminal execution), and seamless integration with OpenRouter for access to top-tier LLMs like Claude 3.5 Sonnet and GPT-4o.

## 🚀 Key Features

*   **Agentic Capabilities**: The AI can write files, execute bash commands, and manage projects autonomously with user approval.
*   **Real-time Streaming**: Full Server-Sent Events (SSE) and WebSocket support for real-time chat and tool execution feedback.
*   **Multi-Model Support**: Integrated with OpenRouter to support Claude 3.5 Sonnet, Claude 3 Opus, GPT-4o, and Gemini.
*   **Secure Authentication**: JWT-based authentication for secure access.
*   **Scalable Architecture**: Built with Node.js, Express, MongoDB, and Kafka (optional) for scalability.
*   **Deployment Ready**: Comes with detailed AWS EC2 deployment guides and scripts.

## 📂 Project Structure

*   **`backend/`**: The core API server.
    *   REST API for auth and session management.
    *   WebSocket handling for real-time communication.
    *   Agent logic implementation.
*   **`cli/`**: A command-line interface to interaction with the OpenAnalyst API from your terminal.
*   **`docs/`** & **Root Deployment Docs**:
    *   `API_DOCUMENTATION.md`: Detailed API reference.
    *   `AWS_SETUP.md`: Step-by-step guide for deploying to AWS EC2.
    *   `FRONTEND_REQUIREMENTS.md`: Contract for building frontend integrations.

## 🛠️ Getting Started

### Prerequisites

*   Node.js (v18+)
*   MongoDB (v5+)
*   OpenRouter API Key (Get it from [openrouter.ai](https://openrouter.ai))

### Backend Setup

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment:**
    Copy `.env.example` to `.env` and fill in your details:
    ```bash
    cp .env.example .env
    ```
    *   Set `anthropic_auth_token` to your OpenRouter API Key.
    *   Set `DATABASE_URL` for MongoDB/PostgreSQL.

4.  **Run the server:**
    ```bash
    npm run dev
    ```
    The server typically runs on `http://localhost:3456`.

### CLI Setup

1.  **Navigate to the CLI directory:**
    ```bash
    cd cli
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Build and Run:**
    ```bash
    npm run build
    npm start
    ```

## 📖 Documentation

*   **API Reference**: Check [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for endpoints and message formats.
*   **Deployment**: Follow [AWS_SETUP.md](./AWS_SETUP.md) for production deployment on Ubuntu EC2.
*   **Frontend Development**: Implementation details are in [FRONTEND_REQUIREMENTS.md](./FRONTEND_REQUIREMENTS.md).

## 🤝 Contributing

Contributions are welcome! Please ensure you follow the code style and run tests before submitting a Pull Request.

## 📄 License

This project is licensed under the MIT License.
