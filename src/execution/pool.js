'use strict';

const { LiquidNode, NodeState } = require('./node');
const { OperationalError, ErrorCodes } = require('../observability/errors');

class NodePool {
  constructor({ poolSize = 5, idleTtlMs = 60000, defaultCapabilities = [], logger, metrics, taskTimeoutMs = 30000 }) {
    this._poolSize = poolSize;
    this._idleTtlMs = idleTtlMs;
    this._defaultCapabilities = defaultCapabilities;
    this._logger = logger;
    this._metrics = metrics;
    this._taskTimeoutMs = taskTimeoutMs;
    this._nodes = new Map();
    this._reapInterval = null;
  }

  start() {
    this._reapInterval = setInterval(() => this._reapIdle(), this._idleTtlMs);
    if (this._reapInterval.unref) this._reapInterval.unref();
    if (this._logger) this._logger.info('Node pool started', { poolSize: this._poolSize });
  }

  spawn(capabilities) {
    if (this._nodes.size >= this._poolSize) {
      this._reapIdle();
      if (this._nodes.size >= this._poolSize) {
        throw new OperationalError('Node pool at capacity', ErrorCodes.NODE_SPAWN_FAILED, { poolSize: this._poolSize, active: this._nodes.size });
      }
    }
    const node = new LiquidNode({
      capabilities: capabilities || this._defaultCapabilities,
      logger: this._logger,
      metrics: this._metrics,
      timeoutMs: this._taskTimeoutMs,
    });
    this._nodes.set(node.id, node);
    if (this._metrics) this._metrics.gauge('pool.node_count', this._nodes.size);
    if (this._logger) this._logger.debug('Node spawned', { nodeId: node.id, capabilities: [...node.capabilities] });
    return node;
  }

  acquire(requiredCapabilities = []) {
    for (const node of this._nodes.values()) {
      if (node.canHandle(requiredCapabilities)) return node;
    }
    return this.spawn(requiredCapabilities.length > 0 ? requiredCapabilities : undefined);
  }

  release(nodeId) {
    const node = this._nodes.get(nodeId);
    if (node && node.state === NodeState.DRAINING) {
      node.retire();
      this._nodes.delete(nodeId);
      if (this._metrics) this._metrics.gauge('pool.node_count', this._nodes.size);
    }
  }

  async shutdown(timeoutMs = 10000) {
    if (this._reapInterval) clearInterval(this._reapInterval);
    const deadline = Date.now() + timeoutMs;
    const draining = [];

    for (const node of this._nodes.values()) {
      if (!node.drain()) draining.push(node);
    }

    while (draining.length > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
      for (let i = draining.length - 1; i >= 0; i--) {
        if (draining[i].state !== NodeState.BUSY) {
          draining[i].retire();
          draining.splice(i, 1);
        }
      }
    }

    for (const node of draining) {
      node.retire();
      if (this._logger) this._logger.warn('Node force-retired during shutdown', { nodeId: node.id });
    }

    this._nodes.clear();
    if (this._logger) this._logger.info('Node pool shut down');
  }

  status() {
    const nodes = [];
    for (const node of this._nodes.values()) nodes.push(node.status());
    return {
      capacity: this._poolSize,
      active: this._nodes.size,
      idle: nodes.filter(n => n.state === NodeState.IDLE).length,
      busy: nodes.filter(n => n.state === NodeState.BUSY).length,
      nodes,
    };
  }

  _reapIdle() {
    const now = Date.now();
    for (const [id, node] of this._nodes) {
      if (node.state === NodeState.IDLE && (now - node.lastActiveAt) > this._idleTtlMs) {
        node.retire();
        this._nodes.delete(id);
        if (this._logger) this._logger.debug('Idle node reaped', { nodeId: id });
      }
    }
    if (this._metrics) this._metrics.gauge('pool.node_count', this._nodes.size);
  }
}

module.exports = { NodePool };
