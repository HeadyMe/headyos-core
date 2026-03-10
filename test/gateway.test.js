'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { CapabilityRouter } = require('../src/gateway/router');
const { AsyncCoordinator } = require('../src/gateway/coordinator');
const { NodePool } = require('../src/execution/pool');
const { TaskStatus } = require('../src/execution/task');

describe('CapabilityRouter', () => {
  it('registers and resolves handlers', () => {
    const router = new CapabilityRouter({});
    router.register('echo', { capabilities: [], handler: async (p) => p });
    const reg = router.resolve('echo');
    assert.ok(reg.handler);
  });

  it('throws on unknown task type', () => {
    const router = new CapabilityRouter({});
    assert.throws(() => router.resolve('unknown'), /No handler/);
  });

  it('validates payload', () => {
    const router = new CapabilityRouter({});
    router.register('strict', {
      capabilities: [],
      handler: async () => {},
      validate: (p) => (p && p.name) || 'name is required',
    });
    assert.throws(() => router.route({ type: 'strict', payload: {} }), /name is required/);
  });

  it('routes valid task', () => {
    const router = new CapabilityRouter({});
    router.register('echo', { capabilities: [], handler: async (p) => p });
    const { task, handler } = router.route({ type: 'echo', payload: { msg: 'hi' } });
    assert.equal(task.type, 'echo');
    assert.ok(handler);
  });

  it('lists capabilities', () => {
    const router = new CapabilityRouter({});
    router.register('a', { capabilities: ['x'], handler: async () => {} });
    router.register('b', { capabilities: ['y', 'z'], handler: async () => {} });
    const caps = router.listCapabilities();
    assert.deepEqual(caps.a.capabilities, ['x']);
    assert.deepEqual(caps.b.capabilities, ['y', 'z']);
  });
});

describe('AsyncCoordinator', () => {
  it('submits and completes a task', async () => {
    const router = new CapabilityRouter({});
    router.register('echo', { capabilities: [], handler: async (payload) => ({ echo: payload }) });
    const pool = new NodePool({ poolSize: 5 });
    pool.start();
    const coord = new AsyncCoordinator({ router, pool, maxConcurrency: 10 });
    const result = await coord.submit({ type: 'echo', payload: { msg: 'hello' } });
    assert.equal(result.status, TaskStatus.COMPLETED);
    assert.deepEqual(result.result, { echo: { msg: 'hello' } });
    await pool.shutdown();
  });

  it('submits a batch of tasks', async () => {
    const router = new CapabilityRouter({});
    router.register('double', { capabilities: [], handler: async (p) => ({ val: p.n * 2 }) });
    const pool = new NodePool({ poolSize: 10 });
    pool.start();
    const coord = new AsyncCoordinator({ router, pool, maxConcurrency: 10 });
    const results = await coord.submitBatch([
      { type: 'double', payload: { n: 1 } },
      { type: 'double', payload: { n: 2 } },
      { type: 'double', payload: { n: 3 } },
    ]);
    const values = results.filter(r => r.status === 'fulfilled').map(r => r.value.result.val);
    assert.deepEqual(values.sort(), [2, 4, 6]);
    await pool.shutdown();
  });
});
