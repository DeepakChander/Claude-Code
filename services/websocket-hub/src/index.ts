import { config } from 'dotenv';
config();

import { WebSocketServer } from 'ws';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedSocket, MessageType } from './types';
import { verifyToken, extractTokenFromUrl } from './services/auth.service';
import { connectionManager } from './services/connection-manager';
import { messageRouter } from './services/message-router';
import { initRedis, closeRedis } from './services/redis.service';
import logger from './utils/logger';

const PORT = parseInt(process.env.PORT || '8002', 10);
const HOST = process.env.HOST || '0.0.0.0';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

// SSL Configuration
const sslKeyPath = process.env.SSL_KEY_PATH;
const sslCertPath = process.env.SSL_CERT_PATH;

// Health check handler
const healthHandler = (req: any, res: any) => {
  if (req.url === '/health') {
    const stats = connectionManager.getStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'healthy',
        service: 'websocket-hub',
        timestamp: new Date().toISOString(),
        connections: stats,
      })
    );
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
};

// Determine protocol and create server
let server: ReturnType<typeof createHttpServer> | ReturnType<typeof createHttpsServer>;
let protocol = 'ws';

console.log('--- WebSocket Hub SSL CHECK ---');
console.log(`SSL_KEY_PATH: ${sslKeyPath}`);
console.log(`SSL_CERT_PATH: ${sslCertPath}`);

if (sslKeyPath && sslCertPath && fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
  console.log('✅ SSL Files found - starting HTTPS/WSS server');
  const httpsOptions = {
    key: fs.readFileSync(sslKeyPath),
    cert: fs.readFileSync(sslCertPath),
  };
  server = createHttpsServer(httpsOptions, healthHandler);
  protocol = 'wss';
} else {
  console.log('ℹ️ No SSL configuration - starting HTTP/WS server');
  server = createHttpServer(healthHandler);
}

// Create WebSocket server
const wss = new WebSocketServer({
  server,
  path: '/ws',
});

// Handle new connections
wss.on('connection', (ws, req) => {
  const socket = ws as AuthenticatedSocket;

  // Extract and verify token
  const token = extractTokenFromUrl(req.url);
  if (!token) {
    logger.warn('Connection attempt without token');
    ws.close(4001, 'Authentication required');
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    logger.warn('Connection attempt with invalid token');
    ws.close(4002, 'Invalid token');
    return;
  }

  // Initialize authenticated socket
  socket.userId = decoded.userId;
  socket.sessionId = uuidv4();
  socket.isAlive = true;
  socket.connectedAt = Date.now();

  // Add to connection manager
  connectionManager.addConnection(socket);

  // Send connected message
  const connectedMessage = connectionManager.createMessage(
    MessageType.CONNECTED,
    socket.userId,
    socket.sessionId,
    {
      message: 'Connected to OpenAnalyst',
      sessionId: socket.sessionId,
    }
  );
  connectionManager.sendToSocket(socket, connectedMessage);

  logger.info('Client connected', {
    userId: socket.userId,
    sessionId: socket.sessionId,
    ip: req.socket.remoteAddress,
  });

  // Handle incoming messages
  socket.on('message', async (data) => {
    try {
      const rawMessage = data.toString();
      await messageRouter.routeClientMessage(socket, rawMessage);
    } catch (error) {
      logger.error('Error processing message', {
        error: (error as Error).message,
        userId: socket.userId,
      });
    }
  });

  // Handle pong (heartbeat response)
  socket.on('pong', () => {
    socket.isAlive = true;
  });

  // Handle close
  socket.on('close', (code, reason) => {
    connectionManager.removeConnection(socket);
    logger.info('Client disconnected', {
      userId: socket.userId,
      sessionId: socket.sessionId,
      code,
      reason: reason.toString(),
    });
  });

  // Handle errors
  socket.on('error', (error) => {
    logger.error('Socket error', {
      error: error.message,
      userId: socket.userId,
      sessionId: socket.sessionId,
    });
  });
});

// Heartbeat interval to detect dead connections
const heartbeatInterval = setInterval(() => {
  connectionManager.cleanupDeadConnections();
}, HEARTBEAT_INTERVAL);

// Startup function
async function start(): Promise<void> {
  try {
    // Initialize Redis
    await initRedis();
    logger.info('Redis initialized');

    // Start HTTP/HTTPS WebSocket server
    const httpProtocol = protocol === 'wss' ? 'https' : 'http';
    server.listen(PORT, HOST, () => {
      logger.info(`WebSocket Hub running on ${protocol}://${HOST}:${PORT}/ws`);
      logger.info(`Health check: ${httpProtocol}://${HOST}:${PORT}/health`);
      console.log(`\nWebSocket Hub started (${protocol.toUpperCase()} mode)`);
      console.log(`   WebSocket: ${protocol}://${HOST}:${PORT}/ws`);
      console.log(`   Health: ${httpProtocol}://${HOST}:${PORT}/health\n`);
    });
  } catch (error) {
    logger.error('Failed to start WebSocket Hub', { error: (error as Error).message });
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down...`);

  clearInterval(heartbeatInterval);

  // Close all connections
  wss.clients.forEach((client) => {
    client.close(1001, 'Server shutting down');
  });

  // Close Redis
  await closeRedis();

  // Close HTTP server
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start the server
start();
