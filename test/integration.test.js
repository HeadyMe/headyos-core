'use strict';

const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const http = require('node:http');
const { createApp } = require('../src/app');

let app, kernel, server;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: server.address().port,
      path,
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch {
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

describe('HTTP Integration', () => {
  before(async () => {
    const result = createApp({
      PORT: '9876',
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
    });
    app = result.app;
    kernel = result.kernel;
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await kernel.shutdown();
  });

  it('GET /health returns healthy', async () => {
    const res = await request('/health');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'healthy');
    assert.equal(res.body.service, 'headyos-core');
    assert.ok(res.body.uptime !== undefined);
  });

  it('GET /readiness returns ready', async () => {
    const res = await request('/readiness');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ready, true);
  });

  it('GET /status returns system status', async () => {
    const res = await request('/status');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.pool);
    assert.ok(res.body.coordinator);
    assert.equal(res.body.service, 'headyos-core');
  });

  it('GET /capabilities returns registered handlers', async () => {
    const res = await request('/capabilities');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.echo);
    assert.ok(res.body['memory.get']);
  });

  it('GET /docs returns API documentation', async () => {
    const res = await request('/docs');
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.endpoints));
    assert.ok(res.body.endpoints.length > 0);
  });

  it('GET /metrics returns metrics snapshot', async () => {
    const res = await request('/metrics');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.counters !== undefined);
  });

  it('POST /tasks executes echo task', async () => {
    const res = await request('/tasks', {
      method: 'POST',
      body: { type: 'echo', payload: { message: 'hello' } },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'completed');
    assert.deepEqual(res.body.result, { echo: { message: 'hello' } });
  });

  it('POST /tasks validates input', async () => {
    const res = await request('/tasks', {
      method: 'POST',
      body: { payload: { message: 'hello' } },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'VALIDATION_FAILED');
  });

  it('POST /tasks/batch processes multiple tasks', async () => {
    const res = await request('/tasks/batch', {
      method: 'POST',
      body: {
        tasks: [
          { type: 'echo', payload: { n: 1 } },
          { type: 'echo', payload: { n: 2 } },
        ],
      },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.results.length, 2);
  });

  it('security headers are present', async () => {
    const res = await request('/health');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.ok(res.headers['x-correlation-id']);
    assert.ok(res.headers['strict-transport-security']);
  });

  it('correlation ID is propagated', async () => {
    const res = await request('/health', { headers: { 'x-correlation-id': 'test-123' } });
    assert.equal(res.headers['x-correlation-id'], 'test-123');
  });
});
