'use strict';

const { OperationalError, ErrorCodes } = require('../observability/errors');

class MemoryAdapter {
  async get(key) { throw new Error('Not implemented'); }
  async set(key, value, ttlMs) { throw new Error('Not implemented'); }
  async delete(key) { throw new Error('Not implemented'); }
  async has(key) { throw new Error('Not implemented'); }
  async clear() { throw new Error('Not implemented'); }
  async keys(pattern) { throw new Error('Not implemented'); }
  async close() {}
}

class InMemoryAdapter extends MemoryAdapter {
  constructor() {
    super();
    this._store = new Map();
    this._timers = new Map();
  }

  async get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._store.delete(key);
      this._clearTimer(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, ttlMs) {
    this._clearTimer(key);
    const entry = { value, createdAt: Date.now(), expiresAt: ttlMs ? Date.now() + ttlMs : null };
    this._store.set(key, entry);
    if (ttlMs) {
      const timer = setTimeout(() => {
        this._store.delete(key);
        this._timers.delete(key);
      }, ttlMs);
      if (timer.unref) timer.unref();
      this._timers.set(key, timer);
    }
  }

  async delete(key) {
    this._clearTimer(key);
    return this._store.delete(key);
  }

  async has(key) {
    const val = await this.get(key);
    return val !== null;
  }

  async clear() {
    for (const timer of this._timers.values()) clearTimeout(timer);
    this._timers.clear();
    this._store.clear();
  }

  async keys(pattern) {
    const allKeys = [...this._store.keys()];
    if (!pattern) return allKeys;
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return allKeys.filter(k => regex.test(k));
  }

  async close() {
    await this.clear();
  }

  size() {
    return this._store.size;
  }

  _clearTimer(key) {
    const timer = this._timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this._timers.delete(key);
    }
  }
}

function createMemoryAdapter(type = 'in-memory') {
  switch (type) {
    case 'in-memory':
      return new InMemoryAdapter();
    case 'redis':
      throw new OperationalError(
        'Redis adapter requires @heady/memory-redis package',
        ErrorCodes.MEMORY_ADAPTER_ERROR,
        { adapter: 'redis', hint: 'Install @heady/memory-redis and set MEMORY_ADAPTER=redis' }
      );
    case 'postgres':
      throw new OperationalError(
        'Postgres adapter requires @heady/memory-postgres package',
        ErrorCodes.MEMORY_ADAPTER_ERROR,
        { adapter: 'postgres', hint: 'Install @heady/memory-postgres and set MEMORY_ADAPTER=postgres' }
      );
    default:
      throw new OperationalError(`Unknown memory adapter: ${type}`, ErrorCodes.MEMORY_ADAPTER_ERROR, { adapter: type });
  }
}

module.exports = { MemoryAdapter, InMemoryAdapter, createMemoryAdapter };
