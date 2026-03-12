'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');

describe('Config', () => {
  it('loads defaults when no env vars set', () => {
    const c = loadConfig({ NODE_ENV: 'test' });
    assert.equal(c.PORT, 8080);
    assert.equal(c.NODE_ENV, 'test');
    assert.equal(c.LOG_LEVEL, 'info');
    assert.equal(c.MAX_CONCURRENCY, 10);
    assert.equal(c.NODE_POOL_SIZE, 5);
    assert.equal(c.NODE_ROLE, 'worker');
    assert.equal(c.METRICS_ENABLED, true);
    assert.deepEqual(c.CORS_ORIGINS, []);
    assert.deepEqual(c.NODE_TAGS, []);
    assert.deepEqual(c.REMOTE_WORKER_URLS, []);
  });

  it('parses number env vars', () => {
    const c = loadConfig({ NODE_ENV: 'test', PORT: '3000', MAX_CONCURRENCY: '50' });
    assert.equal(c.PORT, 3000);
    assert.equal(c.MAX_CONCURRENCY, 50);
  });

  it('rejects invalid numbers', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'test', PORT: 'abc' }), /expected number/);
  });

  it('rejects numbers out of range', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'test', PORT: '0' }), /below min/);
    assert.throws(() => loadConfig({ NODE_ENV: 'test', PORT: '99999' }), /above max/);
  });

  it('parses boolean env vars', () => {
    assert.equal(loadConfig({ NODE_ENV: 'test', METRICS_ENABLED: 'true' }).METRICS_ENABLED, true);
    assert.equal(loadConfig({ NODE_ENV: 'test', METRICS_ENABLED: 'false' }).METRICS_ENABLED, false);
    assert.equal(loadConfig({ NODE_ENV: 'test', METRICS_ENABLED: '1' }).METRICS_ENABLED, true);
  });

  it('parses CSV env vars', () => {
    const c = loadConfig({ NODE_ENV: 'test', NODE_TAGS: 'gpu, inference, fast' });
    assert.deepEqual(c.NODE_TAGS, ['gpu', 'inference', 'fast']);
  });

  it('rejects invalid string enum', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'invalid' }), /not in/);
    assert.throws(() => loadConfig({ NODE_ENV: 'test', NODE_ROLE: 'king' }), /not in/);
  });

  it('generates NODE_ID when not provided', () => {
    const c = loadConfig({ NODE_ENV: 'test' });
    assert.ok(c.NODE_ID.startsWith('worker-'));
  });

  it('preserves provided NODE_ID', () => {
    const c = loadConfig({ NODE_ENV: 'test', NODE_ID: 'custom-123' });
    assert.equal(c.NODE_ID, 'custom-123');
  });

  it('config is frozen', () => {
    const c = loadConfig({ NODE_ENV: 'test' });
    assert.throws(() => { c.PORT = 1234; }, TypeError);
  });
});
