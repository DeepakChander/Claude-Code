import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// Generate UUID
export const generateUUID = (): string => uuidv4();

// Generate random string for API keys
export const generateApiKey = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

// Hash string using SHA-256
export const hashString = (input: string): string => {
  return crypto.createHash('sha256').update(input).digest('hex');
};

// Calculate file hash
export const calculateFileHash = (content: string | Buffer): string => {
  return crypto.createHash('sha256').update(content).digest('hex');
};

// Truncate string with ellipsis
export const truncateString = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
};

// Parse JSON safely
export const safeJsonParse = <T>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
};

// Delay execution
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Retry with exponential backoff
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delayTime = baseDelay * Math.pow(2, attempt);
        await delay(delayTime);
      }
    }
  }

  throw lastError;
};

// Sanitize filename
export const sanitizeFilename = (filename: string): string => {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
};

// Get file extension
export const getFileExtension = (filename: string): string => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
};

// Detect programming language from extension
export const detectLanguage = (extension: string): string => {
  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    sql: 'sql',
    html: 'html',
    css: 'css',
    scss: 'scss',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    md: 'markdown',
    sh: 'shell',
    bash: 'shell',
  };

  return languageMap[extension.toLowerCase()] || 'text';
};

// Format bytes to human readable
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Calculate token estimate (rough approximation)
export const estimateTokens = (text: string): number => {
  // Rough estimate: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
};

// Calculate cost based on model and tokens
export const calculateCost = (
  model: string,
  inputTokens: number,
  outputTokens: number
): number => {
  // OpenRouter pricing (per million tokens)
  const pricing: Record<string, { input: number; output: number }> = {
    'anthropic/claude-sonnet-4.5': { input: 3.0, output: 15.0 },
    'anthropic/claude-opus-4.1': { input: 15.0, output: 75.0 },
    'anthropic/claude-haiku-4.5': { input: 0.25, output: 1.25 },
  };

  const modelPricing = pricing[model] || pricing['anthropic/claude-sonnet-4.5'];

  const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
  const outputCost = (outputTokens / 1_000_000) * modelPricing.output;

  return inputCost + outputCost;
};

// Clean and normalize path
export const normalizePath = (filePath: string): string => {
  return filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
};

// Check if path is within allowed directory
export const isPathWithinDirectory = (filePath: string, allowedDir: string): boolean => {
  const normalizedFile = normalizePath(filePath);
  const normalizedDir = normalizePath(allowedDir);
  return normalizedFile.startsWith(normalizedDir);
};

// Extract mentioned files from text
export const extractFilePaths = (text: string): string[] => {
  const filePatterns = [
    /`([^`]+\.[a-zA-Z0-9]+)`/g,
    /(?:^|\s)((?:\.\/|\.\.\/|\/)?[\w\-./]+\.[a-zA-Z0-9]+)(?:\s|$)/gm,
  ];

  const files = new Set<string>();

  for (const pattern of filePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      files.add(match[1]);
    }
  }

  return Array.from(files);
};

// Create a simple rate limiter
export const createRateLimiter = (maxRequests: number, windowMs: number) => {
  const requests = new Map<string, number[]>();

  return (key: string): boolean => {
    const now = Date.now();
    const windowStart = now - windowMs;

    const keyRequests = requests.get(key) || [];
    const recentRequests = keyRequests.filter(time => time > windowStart);

    if (recentRequests.length >= maxRequests) {
      return false;
    }

    recentRequests.push(now);
    requests.set(key, recentRequests);

    return true;
  };
};

// Merge objects deeply
export const deepMerge = <T extends Record<string, unknown>>(
  target: T,
  ...sources: Partial<T>[]
): T => {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return deepMerge(target, ...sources);
};

const isObject = (item: unknown): item is Record<string, unknown> => {
  return item !== null && typeof item === 'object' && !Array.isArray(item);
};

// Chunk array
export const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

// Debounce function
export const debounce = <T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};
