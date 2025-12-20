import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { config } from 'dotenv';

config();

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FILE_PATH = process.env.LOG_FILE_PATH || '../logs';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Custom log format
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }

    if (stack) {
      log += `\n${stack}`;
    }

    return log;
  })
);

// Console format with colors
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} ${level}: ${message}`;

    if (Object.keys(meta).length > 0 && NODE_ENV === 'development') {
      log += ` ${JSON.stringify(meta, null, 2)}`;
    }

    return log;
  })
);

// File transport with daily rotation
const fileRotateTransport = new DailyRotateFile({
  filename: path.join(LOG_FILE_PATH, 'application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '14d',
  maxSize: '20m',
  format: customFormat,
});

// Error file transport
const errorFileTransport = new DailyRotateFile({
  filename: path.join(LOG_FILE_PATH, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '30d',
  maxSize: '20m',
  level: 'error',
  format: customFormat,
});

// Create logger instance
const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: customFormat,
  defaultMeta: { service: 'claude-agent-api' },
  transports: [
    fileRotateTransport,
    errorFileTransport,
  ],
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(LOG_FILE_PATH, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(LOG_FILE_PATH, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
    }),
  ],
});

// Add console transport in development
if (NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// Helper functions for structured logging
export const logRequest = (
  method: string,
  path: string,
  userId?: string,
  meta?: Record<string, unknown>
) => {
  logger.info(`${method} ${path}`, { userId, ...meta });
};

export const logResponse = (
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  userId?: string
) => {
  const level = statusCode >= 400 ? 'warn' : 'info';
  logger[level](`${method} ${path} ${statusCode} ${duration}ms`, { userId, statusCode, duration });
};

export const logError = (
  error: Error,
  context?: string,
  meta?: Record<string, unknown>
) => {
  logger.error(`${context ? `[${context}] ` : ''}${error.message}`, {
    stack: error.stack,
    ...meta,
  });
};

export const logAgentQuery = (
  conversationId: string,
  prompt: string,
  userId: string
) => {
  logger.info('Agent query started', {
    conversationId,
    promptLength: prompt.length,
    userId,
  });
};

export const logToolExecution = (
  toolName: string,
  conversationId: string,
  status: string,
  duration?: number
) => {
  logger.info(`Tool execution: ${toolName}`, {
    conversationId,
    status,
    duration,
  });
};

export const logMemoryOperation = (
  operation: string,
  memoryType: string,
  userId: string,
  key?: string
) => {
  logger.debug(`Memory ${operation}`, {
    memoryType,
    userId,
    key,
  });
};

export default logger;
