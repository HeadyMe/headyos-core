'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { InMemoryAdapter } = require('../src/memory/adapter');

describe('InMemoryAdapter', () => {
  it('set and get', async () => {
    const mem = new InMemoryAdapter();
    await mem.set('k1', 'v1');
    assert.equal(await mem.get('k1'), 'v1');
  });

  it('returns null for missing key', async () => {
    const mem = new InMemoryAdapter();
    assert.equal(await mem.get('nope'), null);
  });

  it('delete returns true/false', async () => {
    const mem = new InMemoryAdapter();
    await mem.set('k1', 'v1');
    assert.equal(await mem.delete('k1'), true);
    assert.equal(await mem.delete('k1'), false);
  });

  it('has checks existence', async () => {
    const mem = new InMemoryAdapter();
    assert.equal(await mem.has('k1'), false);
    await mem.set('k1', 'v1');
    assert.equal(await mem.has('k1'), true);
  });

  it('TTL expires entries', async () => {
    const mem = new InMemoryAdapter();
    await mem.set('k1', 'v1', { ttl: 50 });
    assert.equal(await mem.get('k1'), 'v1');
    await new Promise(r => setTimeout(r, 60));
    assert.equal(await mem.get('k1'), null);
  });

  it('keys with wildcard pattern', async () => {
    const mem = new InMemoryAdapter();
    await mem.set('user:1', 'a');
    await mem.set('user:2', 'b');
    await mem.set('order:1', 'c');
    const keys = await mem.keys('user:*');
    assert.deepEqual(keys.sort(), ['user:1', 'user:2']);
  });

  it('clear removes all entries', async () => {
    const mem = new InMemoryAdapter();
    await mem.set('k1', 'v1');
    await mem.set('k2', 'v2');
    await mem.clear();
    assert.deepEqual(await mem.keys(), []);
  });
});
