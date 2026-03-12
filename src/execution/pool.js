'use strict';

const { LiquidNode, NODE_STATES } = require('./node');
const { OperationalError } = require('../observability/errors');

class NodePool {
  constructor({ poolSize = 5, idleTtlMs = 60000, timeoutMs = 30000, logger, metrics } = {}) {
    this.maxSize = poolSize;
    this.idleTtlMs = idleTtlMs;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this.metrics = metrics;
    this.nodes = new Map();
    this._reapInterval = null;
  }

  start() {
    this._reapInterval = setInterval(() => this._reapIdle(), this.idleTtlMs);
    this._reapInterval.unref();
    this.logger?.info('NodePool started', { maxSize: this.maxSize, idleTtlMs: this.idleTtlMs });
  }

  spawn(capabilities = ['*']) {
    if (this.nodes.size >= this.maxSize) {
      throw new OperationalError('POOL_EXHAUSTED', { current: this.nodes.size, max: this.maxSize });
    }
    const node = new LiquidNode({
      capabilities, logger: this.logger, metrics: this.metrics, timeoutMs: this.timeoutMs,
    });
    this.nodes.set(node.id, node);
    this.metrics?.gauge('pool.node_count', this.nodes.size);
    this.logger?.debug('Node spawned', { nodeId: node.id, capabilities });
    return node;
  }

  acquire(taskType) {
    for (const node of this.nodes.values()) {
      if (node.canHandle(taskType)) return node;
    }
    // Auto-spawn if room
    if (this.nodes.size < this.maxSize) {
      return this.spawn([taskType, '*']);
    }
    return null;
  }

  _reapIdle() {
    for (const [id, node] of this.nodes) {
      if (node.state === NODE_STATES.IDLE && node.idleTime > this.idleTtlMs) {
        node.retire();
        this.nodes.delete(id);
        this.logger?.debug('Node reaped', { nodeId: id, idleTime: node.idleTime });
      }
      if (node.state === NODE_STATES.RETIRED) {
        this.nodes.delete(id);
      }
    }
    this.metrics?.gauge('pool.node_count', this.nodes.size);
  }

  async shutdown() {
    if (this._reapInterval) clearInterval(this._reapInterval);
    const drainPromises = [];
    for (const node of this.nodes.values()) {
      node.drain();
      if (node.state === NODE_STATES.DRAINING) {
        drainPromises.push(new Promise(resolve => {
          const check = setInterval(() => {
            if (!node.currentTask) { node.retire(); clearInterval(check); resolve(); }
          }, 100);
          setTimeout(() => { clearInterval(check); node.retire(); resolve(); }, 5000);
        }));
      }
    }
    await Promise.all(drainPromises);
    this.nodes.clear();
    this.logger?.info('NodePool shut down');
  }

  status() {
    const states = {};
    for (const node of this.nodes.values()) {
      states[node.state] = (states[node.state] || 0) + 1;
    }
    return { total: this.nodes.size, max: this.maxSize, states };
  }
}

module.exports = { NodePool };
