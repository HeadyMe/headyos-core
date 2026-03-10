'use strict';

class MetricsCollector {
  constructor() {
    this._counters = new Map();
    this._gauges = new Map();
    this._histograms = new Map();
  }

  increment(name, value = 1, tags = {}) {
    const key = this._key(name, tags);
    this._counters.set(key, (this._counters.get(key) || 0) + value);
  }

  gauge(name, value, tags = {}) {
    const key = this._key(name, tags);
    this._gauges.set(key, value);
  }

  histogram(name, value, tags = {}) {
    const key = this._key(name, tags);
    if (!this._histograms.has(key)) this._histograms.set(key, []);
    this._histograms.get(key).push(value);
  }

  snapshot() {
    return {
      counters: Object.fromEntries(this._counters),
      gauges: Object.fromEntries(this._gauges),
      histograms: Object.fromEntries(
        Array.from(this._histograms.entries()).map(([k, vals]) => {
          const sorted = [...vals].sort((a, b) => a - b);
          return [k, {
            count: sorted.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)],
          }];
        })
      ),
    };
  }

  reset() {
    this._counters.clear();
    this._gauges.clear();
    this._histograms.clear();
  }

  _key(name, tags) {
    const tagStr = Object.entries(tags).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join(',');
    return tagStr ? `${name}{${tagStr}}` : name;
  }
}

module.exports = { MetricsCollector };
