'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { CapabilityRouter } = require('../src/gateway/router');
const { AsyncCoordinator } = require('../src/gateway/coordinator');

describe('CapabilityRouter', () => {
  it('registers and resolves handlers', () => {
    const router = new CapabilityRouter();
    router.register('echo', async (p) => p, { capabilities: ['echo'] });
    const { handler } = router.resolve('echo');
    assert.ok(handler);
  });

  it('throws on unknown task type', () => {
    const router = new CapabilityRouter();
    assert.throws(() => router.resolve('nope'), /No handler for requested capability/i);
  });

  it('validates input', () => {
    const router = new CapabilityRouter();
    router.register('test', async () => {}, { validator: (p) => p?.key ? true : { valid: false, error: 'key required' } });
    assert.deepEqual(router.validate('test', { key: 'x' }), { valid: true });
    assert.deepEqual(router.validate('test', {}), { valid: false, error: 'key required' });
  });

  it('skips validation if no validator', () => {
    const router = new CapabilityRouter();
    router.register('test', async () => {});
    assert.deepEqual(router.validate('test', {}), { valid: true });
  });

  it('lists capabilities', () => {
    const router = new CapabilityRouter();
    router.register('a', async () => {}, { capabilities: ['x'] });
    router.register('b', async () => {}, { capabilities: ['y'] });
    const caps = router.listCapabilities();
    assert.deepEqual(caps, { a: ['x'], b: ['y'] });
  });
});

describe('AsyncCoordinator', () => {
  it('submits and returns result', async () => {
    const coord = new AsyncCoordinator({ maxConcurrency: 2 });
    const result = await coord.submit('t1', async () => 42);
    assert.equal(result, 42);
  });

  it('rejects when full', async () => {
    const coord = new AsyncCoordinator({ maxConcurrency: 1 });
    const slow = coord.submit('t1', () => new Promise(r => setTimeout(() => r(1), 100)));
    await assert.rejects(() => coord.submit('t2', async () => 2), /concurrency reached/i);
    await slow;
  });

  it('tracks active count', async () => {
    const coord = new AsyncCoordinator({ maxConcurrency: 5 });
    assert.equal(coord.status().active, 0);
    const p = coord.submit('t1', () => new Promise(r => setTimeout(() => r(1), 50)));
    assert.equal(coord.status().active, 1);
    await p;
    assert.equal(coord.status().active, 0);
  });

  it('submits batch', async () => {
    const coord = new AsyncCoordinator({ maxConcurrency: 5 });
    const results = await coord.submitBatch([
      { id: 'a', fn: async () => 1 },
      { id: 'b', fn: async () => 2 },
    ]);
    assert.equal(results.length, 2);
    assert.equal(results[0].value, 1);
    assert.equal(results[1].value, 2);
  });

  it('drains active tasks', async () => {
    const coord = new AsyncCoordinator({ maxConcurrency: 5 });
    coord.submit('t1', () => new Promise(r => setTimeout(() => r(1), 50)));
    await coord.drain();
    assert.equal(coord.status().active, 0);
  });
});
