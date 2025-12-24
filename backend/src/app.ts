import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import { config } from 'dotenv';

import routes from './routes';
import { initWorkspacesDir } from './services/workspace.service';
import logger from './utils/logger';
import { connectMongoDB, disconnectMongoDB, isMongoConnected } from './config/mongodb';
import kafkaProducer from './services/kafka-producer.service';
import kafkaConsumer from './services/kafka-consumer.service';
import responseHandler from './services/response-handler.service';
import { isKafkaConfigured } from './config/kafka';
import { wsService } from './services/websocket.service';

// Load environment variables
config();

const app = express();
const PORT = process.env.PORT || 3456;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',') || []
    : '*',
  credentials: true,
}));

// Compression
app.use(compression());

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
}));

// DEBUG: Log ALL incoming requests (before any processing)
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[INCOMING] ${req.method} ${req.path} from ${req.ip || req.socket.remoteAddress}`);
  next();
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
});
app.use('/api/', limiter);

// Health check endpoint (no auth required)
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const mongoConnected = isMongoConnected();
    const kafkaConfigured = isKafkaConfigured();
    const kafkaProducerConnected = kafkaProducer.isConnected();
    const kafkaConsumerRunning = kafkaConsumer.isRunning();
    const wsClientCount = wsService.getClientCount();

    const status = mongoConnected ? 'ok' : 'degraded';

    res.status(mongoConnected ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      service: 'openanalyst-api',
      environment: NODE_ENV,
      database: {
        type: 'mongodb',
        connected: mongoConnected,
      },
      kafka: {
        configured: kafkaConfigured,
        producer: kafkaProducerConnected ? 'connected' : 'disconnected',
        consumer: kafkaConsumerRunning ? 'running' : 'stopped',
      },
      websocket: {
        enabled: true,
        path: '/ws',
        connectedClients: wsClientCount,
      },
      features: {
        resumeConversation: true,
        offlineDelivery: true,
        messageQueue: kafkaConfigured,
        taskProgress: true,
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      service: 'openanalyst-api',
      environment: NODE_ENV,
      error: (error as Error).message,
    });
  }
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'OpenAnalyst API - Claude Code on AWS',
    version: '2.0.0',
    documentation: '/api',
    endpoints: {
      health: 'GET /health',
      auth: {
        token: 'POST /api/auth/token',
        verify: 'POST /api/auth/verify',
      },
      agent: {
        run: 'POST /api/agent/run (SSE streaming)',
        runSync: 'POST /api/agent/run-sync (JSON)',
        continue: 'POST /api/agent/continue (SSE streaming)',
        resume: 'POST /api/agent/resume/:conversationId (Resume conversation)',
        resumable: 'GET /api/agent/resumable (List resumable conversations)',
        sdkRun: 'POST /api/agent/sdk/run (SSE streaming)',
        sdkRunSync: 'POST /api/agent/sdk/run-sync (JSON)',
        conversations: 'GET /api/agent/conversations',
        messages: 'GET /api/agent/conversations/:id/messages',
      },
      pendingResponses: {
        list: 'GET /api/pending-responses',
        deliver: 'GET /api/pending-responses/deliver',
        status: 'GET /api/pending-responses/:correlationId',
        subscribe: 'GET /api/pending-responses/subscribe (SSE)',
        retry: 'POST /api/pending-responses/:correlationId/retry',
      },
    },
    features: {
      conversationResume: 'Resume previous conversations with full context',
      offlineDelivery: 'Retrieve responses when you reconnect',
      messageQueue: 'High-load handling with Kafka',
    },
  });
});

// Mount API routes
app.use('/api', routes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: NODE_ENV === 'production' ? 'An internal server error occurred' : err.message,
    },
  });
});

// Initialize and start server
const startServer = async () => {
  try {
    // Initialize workspaces directory
    await initWorkspacesDir();
    logger.info('Workspaces directory initialized');

    // Connect to MongoDB
    await connectMongoDB();
    logger.info('MongoDB connection established');

    // Initialize Kafka services if configured
    if (isKafkaConfigured()) {
      try {
        await kafkaProducer.connect();
        logger.info('Kafka producer connected');

        await kafkaConsumer.start();
        logger.info('Kafka consumer started');

        await responseHandler.start();
        logger.info('Response handler started');
      } catch (kafkaError) {
        logger.warn('Kafka services failed to start (optional)', { error: (kafkaError as Error).message });
        console.warn('Kafka services not available - running without message queue');
      }
    } else {
      logger.info('Kafka not configured - running without message queue');
    }

    // Determine Protocol (HTTP vs HTTPS)
    let server: http.Server | https.Server;
    let protocol = 'http';

    const sslKeyPath = process.env.SSL_KEY_PATH;
    const sslCertPath = process.env.SSL_CERT_PATH;

    console.log('--- SSL CONFIGURATION CHECK ---');
    console.log(`SSL_KEY_PATH: ${sslKeyPath}`);
    console.log(`SSL_CERT_PATH: ${sslCertPath}`);

    if (sslKeyPath && sslCertPath) {
      if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
        // START HTTPS SERVER
        console.log('✅ SSL Files found using fs.existsSync()');
        const httpsOptions = {
          key: fs.readFileSync(sslKeyPath),
          cert: fs.readFileSync(sslCertPath),
        };
        server = https.createServer(httpsOptions, app);
        protocol = 'https';
        logger.info('Starting server in HTTPS/WSS mode');
      } else {
        console.error('❌ SSL Files specified but NOT FOUND on disk!');
        console.error(`Check path: ${sslKeyPath}`);
        console.error(`Check path: ${sslCertPath}`);
        if (process.env.NODE_ENV === 'production') {
          throw new Error('SSL Configuration Failed: Files missing');
        }
        // Fallback for local dev only
        server = http.createServer(app);
      }
    } else {
      console.log('ℹ️ No SSL configuration found in env');
      // START HTTP SERVER
      server = http.createServer(app);
      logger.info('Starting server in HTTP/WS mode');
    }

    // Start Server
    server.listen(parseInt(PORT as string, 10), HOST, () => {
      logger.info(`OpenAnalyst API running on ${protocol}://${HOST}:${PORT}`);
      logger.info(`Environment: ${NODE_ENV}`);
      console.log(`\nOpenAnalyst API running on ${protocol}://${HOST}:${PORT}`);
      console.log(`   Environment: ${NODE_ENV}`);
      console.log(`   Database: MongoDB`);
      console.log(`   Message Queue: ${isKafkaConfigured() ? 'Kafka' : 'Not configured'}`);
      console.log(`   Health check: ${protocol}://${HOST}:${PORT}/health`);
      console.log(`   API docs: ${protocol}://${HOST}:${PORT}/`);
      console.log(`   WebSocket: ${protocol === 'https' ? 'wss' : 'ws'}://${HOST}:${PORT}/ws\n`);
    });

    // Initialize WebSocket server on the HTTP/HTTPS server
    wsService.initialize(server);
    logger.info('WebSocket server initialized on /ws path');
  } catch (error) {
    logger.error('Failed to start server', { error: (error as Error).message });
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  console.log(`\n${signal} received. Shutting down gracefully...`);

  try {
    // Shutdown WebSocket server
    wsService.shutdown();
    logger.info('WebSocket server stopped');

    // Stop Kafka services
    if (isKafkaConfigured()) {
      await responseHandler.stop();
      await kafkaConsumer.stop();
      await kafkaProducer.disconnect();
      logger.info('Kafka services stopped');
    }

    // Disconnect MongoDB
    await disconnectMongoDB();
    logger.info('MongoDB connections closed');
    console.log('All connections closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: (error as Error).message });
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  console.error('Unhandled rejection:', reason);
});

// Start the server
startServer();

export default app;
