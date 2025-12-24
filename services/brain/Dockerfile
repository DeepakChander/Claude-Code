# =============================================
# OpenAnalyst API - Production Dockerfile
# =============================================

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
  adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
# Install curl for healthcheck
RUN apk add --no-cache curl && \
  npm ci --omit=dev && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create logs directory
RUN mkdir -p /app/logs && chown -R nodejs:nodejs /app/logs

# Create workspace directory
RUN mkdir -p /tmp/claude-agent-workspaces && chown -R nodejs:nodejs /tmp/claude-agent-workspaces

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3456

# Health check (Dockerfile default, overridden by docker-compose)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3456/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start application
CMD ["node", "dist/app.js"]
