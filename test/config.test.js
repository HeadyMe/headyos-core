'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { loadConfig, getConfigSchema } = require('../src/config');

describe('Config', () => {
  it('loads defaults with empty env', () => {
    const config = loadConfig({});
    assert.equal(config.PORT, 8080);
    assert.equal(config.NODE_ENV, 'production');
    assert.equal(config.LOG_LEVEL, 'info');
    assert.equal(config.MAX_CONCURRENCY, 10);
    assert.equal(config.MEMORY_ADAPTER, 'in-memory');
    assert.deepEqual(config.CORS_ORIGINS, '');
  });

  it('parses env overrides', () => {
    const config = loadConfig({ PORT: '3000', NODE_ENV: 'test', LOG_LEVEL: 'debug', CORS_ORIGINS: 'https://a.com,https://b.com' });
    assert.equal(config.PORT, 3000);
    assert.equal(config.NODE_ENV, 'test');
    assert.equal(config.LOG_LEVEL, 'debug');
    assert.deepEqual(config.CORS_ORIGINS, ['https://a.com', 'https://b.com']);
  });

  it('rejects invalid PORT', () => {
    assert.throws(() => loadConfig({ PORT: 'abc' }), /must be a number/);
  });

  it('rejects invalid NODE_ENV', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'invalid' }), /must be one of/);
  });

  it('rejects PORT out of range', () => {
    assert.throws(() => loadConfig({ PORT: '99999' }), /must be <= 65535/);
  });

  it('returns frozen config', () => {
    const config = loadConfig({});
    assert.throws(() => { config.PORT = 9999; }, TypeError);
  });

  it('exposes schema', () => {
    const schema = getConfigSchema();
    assert.ok(schema.PORT);
    assert.ok(schema.NODE_ENV);
  });
});
