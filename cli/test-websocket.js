#!/usr/bin/env node
const WebSocket = require('ws');

const API_URL = process.argv[2] || 'http://localhost:3456';
const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';

console.log(`Testing WebSocket connection to: ${WS_URL}`);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ Connected to WebSocket server');

  // Subscribe to a test session
  ws.send(JSON.stringify({ type: 'subscribe', sessionId: 'test-session-123' }));

  // Send ping
  setTimeout(() => {
    console.log('Sending ping...');
    ws.send(JSON.stringify({ type: 'ping' }));
  }, 1000);

  // Close after 5 seconds
  setTimeout(() => {
    console.log('Test complete. Closing connection.');
    ws.close();
    process.exit(0);
  }, 5000);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('📩 Received:', JSON.stringify(msg, null, 2));
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log(`Connection closed: ${code} - ${reason}`);
});
