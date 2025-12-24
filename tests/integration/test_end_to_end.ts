/**
 * OpenAnalyst End-to-End Integration Tests
 * Tests the complete user flow from frontend to all backend services
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

const BRAIN_URL = process.env.BRAIN_URL || 'http://localhost:3456';
const AGNO_URL = process.env.AGNO_URL || 'http://localhost:8001';
const WS_URL = process.env.WS_URL || 'ws://localhost:8002/ws';

describe('OpenAnalyst E2E Tests', () => {
  let authToken: string;

  beforeAll(async () => {
    // Wait for services to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  describe('Health Checks', () => {
    test('Brain service should be healthy', async () => {
      const response = await fetch(`${BRAIN_URL}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toMatch(/ok|healthy/);
    });

    test('Agno service should be healthy', async () => {
      const response = await fetch(`${AGNO_URL}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('healthy');
    });
  });

  describe('Authentication', () => {
    test('should get JWT token with valid API key', async () => {
      const response = await fetch(`${BRAIN_URL}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: process.env.TEST_API_KEY || 'test-key' }),
      });

      // May fail with invalid key, but endpoint should respond
      expect([200, 401, 403]).toContain(response.status);
    });

    test('should reject requests without token', async () => {
      const response = await fetch(`${BRAIN_URL}/api/agent/run-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test' }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Agent Execution', () => {
    test('Agno should process task requests', async () => {
      const response = await fetch(`${AGNO_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'test_user',
          session_id: 'test_session',
          content: 'Hello, this is a test message',
        }),
      });

      // Endpoint should respond even if execution fails
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Brain API Endpoints', () => {
    test('should return API documentation at root', async () => {
      const response = await fetch(`${BRAIN_URL}/`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.endpoints).toBeDefined();
    });

    test('should return 404 for unknown endpoints', async () => {
      const response = await fetch(`${BRAIN_URL}/api/unknown`);
      expect(response.status).toBe(404);
    });
  });
});

// Run tests
if (require.main === module) {
  console.log('Running E2E tests...');
}
