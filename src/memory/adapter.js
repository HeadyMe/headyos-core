'use strict';

class InMemoryAdapter {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
  }

  async get(key) {
    if (this._expired(key)) { this.store.delete(key); this.ttls.delete(key); return null; }
    return this.store.get(key) ?? null;
  }

  async set(key, value, { ttl } = {}) {
    this.store.set(key, value);
    if (ttl) this.ttls.set(key, Date.now() + ttl);
    else this.ttls.delete(key);
  }

  async delete(key) {
    const had = this.store.has(key);
    this.store.delete(key);
    this.ttls.delete(key);
    return had;
  }

  async has(key) {
    if (this._expired(key)) { this.store.delete(key); this.ttls.delete(key); return false; }
    return this.store.has(key);
  }

  async keys(pattern = '*') {
    this._cleanExpired();
    if (pattern === '*') return [...this.store.keys()];
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return [...this.store.keys()].filter(k => regex.test(k));
  }

  async clear() {
    this.store.clear();
    this.ttls.clear();
  }

  async shutdown() { await this.clear(); }

  _expired(key) {
    const exp = this.ttls.get(key);
    return exp && Date.now() > exp;
  }

  _cleanExpired() {
    for (const [key, exp] of this.ttls) {
      if (Date.now() > exp) { this.store.delete(key); this.ttls.delete(key); }
    }
  }
}

module.exports = { InMemoryAdapter };
