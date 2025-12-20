import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';

import routes from './routes';
import { initWorkspacesDir } from './services/workspace.service';
import logger from './utils/logger';
import { pool } from './config/database';

// Load environment variables
config();

const app = express();
const PORT = process.env.PORT || 3456;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for SSE compatibility
}));

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
    // Check database connection
    await pool.query('SELECT 1');

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      service: 'openanalyst-api',
      environment: NODE_ENV,
      database: 'connected',
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      service: 'openanalyst-api',
      environment: NODE_ENV,
      database: 'disconnected',
      error: (error as Error).message,
    });
  }
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'OpenAnalyst API - Claude Code on AWS',
    version: '1.0.0',
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
        sdkRun: 'POST /api/agent/sdk/run (SSE streaming)',
        sdkRunSync: 'POST /api/agent/sdk/run-sync (JSON)',
        conversations: 'GET /api/agent/conversations',
        messages: 'GET /api/agent/conversations/:id/messages',
      },
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
      message: NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    },
  });
});

// Initialize and start server
const startServer = async () => {
  try {
    // Initialize workspaces directory
    await initWorkspacesDir();
    logger.info('Workspaces directory initialized');

    // Test database connection
    await pool.query('SELECT 1');
    logger.info('Database connection established');

    // Start server
    app.listen(parseInt(PORT as string, 10), HOST, () => {
      logger.info(`OpenAnalyst API running on http://${HOST}:${PORT}`);
      logger.info(`Environment: ${NODE_ENV}`);
      console.log(`\n🚀 OpenAnalyst API running on http://${HOST}:${PORT}`);
      console.log(`   Environment: ${NODE_ENV}`);
      console.log(`   Health check: http://${HOST}:${PORT}/health`);
      console.log(`   API docs: http://${HOST}:${PORT}/\n`);
    });
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
    await pool.end();
    logger.info('Database connections closed');
    console.log('Database connections closed');
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
