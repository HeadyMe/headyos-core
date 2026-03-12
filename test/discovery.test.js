'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ServiceRegistry } = require('../src/discovery/registry');

describe('ServiceRegistry', () => {
  it('registers and resolves peers', () => {
    const reg = new ServiceRegistry({});
    reg.register('node-1', { url: 'http://localhost:9001', role: 'worker', capabilities: ['ml'] });
    reg.register('node-2', { url: 'http://localhost:9002', role: 'coordinator', capabilities: ['status'] });
    const all = reg.resolve();
    assert.equal(all.length, 2);
  });

  it('filters by role', () => {
    const reg = new ServiceRegistry({});
    reg.register('n1', { url: 'http://a', role: 'worker', capabilities: ['ml'] });
    reg.register('n2', { url: 'http://b', role: 'coordinator', capabilities: ['status'] });
    const workers = reg.resolve({ role: 'worker' });
    assert.equal(workers.length, 1);
    assert.equal(workers[0].id, 'n1');
  });

  it('filters by capability', () => {
    const reg = new ServiceRegistry({});
    reg.register('n1', { url: 'http://a', role: 'worker', capabilities: ['ml', 'inference'] });
    reg.register('n2', { url: 'http://b', role: 'worker', capabilities: ['echo'] });
    const ml = reg.resolve({ capability: 'ml' });
    assert.equal(ml.length, 1);
    assert.equal(ml[0].id, 'n1');
  });

  it('deregisters peers', () => {
    const reg = new ServiceRegistry({});
    reg.register('n1', { url: 'http://a', role: 'worker' });
    reg.deregister('n1');
    assert.equal(reg.resolve().length, 0);
  });

  it('excludes unhealthy peers', () => {
    const reg = new ServiceRegistry({});
    reg.register('n1', { url: 'http://a', role: 'worker' });
    reg.peers.get('n1').healthy = false;
    assert.equal(reg.resolve().length, 0);
  });

  it('reports status', () => {
    const reg = new ServiceRegistry({});
    reg.register('n1', { url: 'http://a', role: 'worker' });
    reg.register('n2', { url: 'http://b', role: 'coordinator' });
    const s = reg.status();
    assert.equal(s.totalPeers, 2);
    assert.equal(s.healthyPeers, 2);
    assert.equal(s.byRole.worker, 1);
    assert.equal(s.byRole.coordinator, 1);
  });

  it('shuts down cleanly', async () => {
    const reg = new ServiceRegistry({});
    reg.register('n1', { url: 'http://a', role: 'worker' });
    await reg.shutdown();
    assert.equal(reg.peers.size, 0);
  });
});
