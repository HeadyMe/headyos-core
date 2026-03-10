'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { InMemoryAdapter, createMemoryAdapter } = require('../src/memory');

describe('InMemoryAdapter', () => {
  it('stores and retrieves values', async () => {
    const mem = new InMemoryAdapter();
    await mem.set('key1', { data: 'hello' });
    const val = await mem.get('key1');
    assert.deepEqual(val, { data: 'hello' });
  });

  it('returns null for missing keys', async () => {
    const mem = new InMemoryAdapter();
    assert.equal(await mem.get('missing'), null);
  });

  it('deletes keys', async () => {
    const mem = new InMemoryAdapter();
    await mem.set('k', 'v');
    assert.ok(await mem.has('k'));
    await mem.delete('k');
    assert.ok(!(await mem.has('k')));
  });

  it('supports TTL expiry', async () => {
    const mem = new InMemoryAdapter();
    await mem.set('temp', 'val', 50);
    assert.equal(await mem.get('temp'), 'val');
    await new Promise(r => setTimeout(r, 100));
    assert.equal(await mem.get('temp'), null);
  });

  it('lists keys with pattern', async () => {
    const mem = new InMemoryAdapter();
    await mem.set('user:1', 'a');
    await mem.set('user:2', 'b');
    await mem.set('session:1', 'c');
    const userKeys = await mem.keys('user:*');
    assert.equal(userKeys.length, 2);
    assert.ok(userKeys.includes('user:1'));
    assert.ok(userKeys.includes('user:2'));
  });

  it('clears all data', async () => {
    const mem = new InMemoryAdapter();
    await mem.set('a', 1);
    await mem.set('b', 2);
    await mem.clear();
    assert.equal(mem.size(), 0);
  });
});

describe('createMemoryAdapter', () => {
  it('creates in-memory adapter', () => {
    const adapter = createMemoryAdapter('in-memory');
    assert.ok(adapter instanceof InMemoryAdapter);
  });

  it('throws for redis without package', () => {
    assert.throws(() => createMemoryAdapter('redis'), /Redis adapter/);
  });

  it('throws for unknown adapter', () => {
    assert.throws(() => createMemoryAdapter('unknown'), /Unknown memory adapter/);
  });
});
