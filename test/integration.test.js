'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { Kernel } = require('../src/kernel');
const { createApp } = require('../src/app');

function request(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://localhost:${server.address().port}`);
    const options = { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('Integration', () => {
  let kernel, app, server;

  before(async () => {
    kernel = new Kernel({ NODE_ENV: 'test', PORT: '19876', LOG_LEVEL: 'error' });
    app = createApp(kernel);
    await kernel.boot();
    server = app.listen(0);
    await new Promise(r => server.on('listening', r));
  });

  after(async () => {
    server.close();
    await kernel.shutdown();
  });

  it('GET /health returns ok', async () => {
    const res = await request(server, 'GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.service, 'HeadyOS');
    assert.ok(res.body.nodeId);
    assert.ok(res.body.role);
  });

  it('GET /readiness returns ready', async () => {
    const res = await request(server, 'GET', '/readiness');
    assert.equal(res.status, 200);
    assert.equal(res.body.ready, true);
  });

  it('GET /status returns system status', async () => {
    const res = await request(server, 'GET', '/status');
    assert.equal(res.status, 200);
    assert.ok(res.body.pool);
    assert.ok(res.body.coordinator);
    assert.ok(res.body.discovery);
    assert.ok(res.body.capabilities);
  });

  it('GET /capabilities lists registered handlers', async () => {
    const res = await request(server, 'GET', '/capabilities');
    assert.equal(res.status, 200);
    assert.ok(res.body.echo);
    assert.ok(res.body['memory.get']);
  });

  it('GET /metrics returns metrics snapshot', async () => {
    const res = await request(server, 'GET', '/metrics');
    assert.equal(res.status, 200);
    assert.ok('counters' in res.body);
    assert.ok('gauges' in res.body);
  });

  it('POST /tasks executes echo task', async () => {
    const res = await request(server, 'POST', '/tasks', { type: 'echo', payload: { hello: 'world' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.state, 'COMPLETED');
    assert.deepEqual(res.body.result, { hello: 'world' });
  });

  it('POST /tasks rejects missing type', async () => {
    const res = await request(server, 'POST', '/tasks', { payload: {} });
    assert.equal(res.status, 400);
  });

  it('POST /tasks returns error for unknown type', async () => {
    const res = await request(server, 'POST', '/tasks', { type: 'nonexistent', payload: {} });
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'CAPABILITY_NOT_FOUND');
  });

  it('POST /tasks memory.set and memory.get', async () => {
    await request(server, 'POST', '/tasks', { type: 'memory.set', payload: { key: 'test-key', value: 'test-value' } });
    const res = await request(server, 'POST', '/tasks', { type: 'memory.get', payload: { key: 'test-key' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.result.value, 'test-value');
  });

  it('POST /tasks/batch executes multiple tasks', async () => {
    const res = await request(server, 'POST', '/tasks/batch', {
      tasks: [
        { type: 'echo', payload: { n: 1 } },
        { type: 'echo', payload: { n: 2 } },
      ],
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
  });

  it('POST /pipeline executes a plan', async () => {
    const res = await request(server, 'POST', '/pipeline', {
      plan: {
        steps: [
          { name: 'step1', type: 'echo', payload: { x: 1 } },
          { name: 'step2', type: 'echo', payload: { x: 2 } },
        ],
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.results.length, 2);
  });

  it('sets security headers', async () => {
    const res = await request(server, 'GET', '/health');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.ok(res.headers['x-correlation-id']);
  });

  it('POST /register adds a peer', async () => {
    const res = await request(server, 'POST', '/register', { nodeId: 'test-peer', url: 'http://localhost:9999', role: 'worker' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });
});
