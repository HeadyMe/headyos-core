'use strict';

class MetricsCollector {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
  }

  incr(name, n = 1) {
    if (!this.enabled) return;
    this.counters.set(name, (this.counters.get(name) || 0) + n);
  }

  gauge(name, value) {
    if (!this.enabled) return;
    this.gauges.set(name, value);
  }

  observe(name, value) {
    if (!this.enabled) return;
    if (!this.histograms.has(name)) this.histograms.set(name, []);
    this.histograms.get(name).push(value);
  }

  _percentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  snapshot() {
    const hists = {};
    for (const [name, values] of this.histograms) {
      hists[name] = {
        count: values.length,
        p50: this._percentile(values, 50),
        p95: this._percentile(values, 95),
        p99: this._percentile(values, 99),
      };
    }
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: hists,
    };
  }

  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

module.exports = { MetricsCollector };
