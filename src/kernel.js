'use strict';

const { loadConfig } = require('./config');
const { createLogger, MetricsCollector } = require('./observability');
const { NodePool } = require('./execution');
const { CapabilityRouter, AsyncCoordinator } = require('./gateway');
const { OrchestrationPipeline, createPlan } = require('./orchestration');
const { createMemoryAdapter } = require('./memory');

const pkg = require('../package.json');

class Kernel {
  constructor(env = process.env) {
    this.config = loadConfig(env);
    this.version = pkg.version;
    this.startedAt = null;
    this._ready = false;

    this.logger = createLogger({ level: this.config.LOG_LEVEL, service: 'headyos-core' });
    this.metrics = new MetricsCollector();
    this.memory = createMemoryAdapter(this.config.MEMORY_ADAPTER);

    this.pool = new NodePool({
      poolSize: this.config.NODE_POOL_SIZE,
      idleTtlMs: this.config.NODE_IDLE_TTL_MS,
      logger: this.logger,
      metrics: this.metrics,
      taskTimeoutMs: this.config.TASK_TIMEOUT_MS,
    });

    this.router = new CapabilityRouter({ logger: this.logger, metrics: this.metrics });
    this.coordinator = new AsyncCoordinator({
      router: this.router,
      pool: this.pool,
      logger: this.logger,
      metrics: this.metrics,
      maxConcurrency: this.config.MAX_CONCURRENCY,
    });

    this.pipeline = new OrchestrationPipeline({
      coordinator: this.coordinator,
      logger: this.logger,
      metrics: this.metrics,
    });

    this._registerBuiltinHandlers();
  }

  boot() {
    this.pool.start();
    this.startedAt = Date.now();
    this._ready = true;
    this.logger.info('Kernel booted', { version: this.version, env: this.config.NODE_ENV });
  }

  async shutdown() {
    this._ready = false;
    this.logger.info('Kernel shutting down');
    await this.pool.shutdown(this.config.SHUTDOWN_TIMEOUT_MS);
    await this.memory.close();
    this.logger.info('Kernel shut down complete');
  }

  isReady() {
    return this._ready;
  }

  async submitTask(request) {
    return this.coordinator.submit(request);
  }

  async submitBatch(requests) {
    return this.coordinator.submitBatch(requests);
  }

  async executePipeline(planDef) {
    const plan = createPlan(planDef);
    return this.pipeline.execute(plan);
  }

  capabilities() {
    return this.router.listCapabilities();
  }

  metricsSnapshot() {
    return this.metrics.snapshot();
  }

  status() {
    return {
      service: 'headyos-core',
      version: this.version,
      env: this.config.NODE_ENV,
      uptime: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
      ready: this._ready,
      pool: this.pool.status(),
      coordinator: this.coordinator.status(),
      memory: { adapter: this.config.MEMORY_ADAPTER },
      timestamp: new Date().toISOString(),
    };
  }

  _registerBuiltinHandlers() {
    this.router.register('echo', {
      capabilities: [],
      handler: async (payload) => ({ echo: payload }),
      validate: (payload) => payload !== undefined || 'Payload required',
    });

    this.router.register('memory.get', {
      capabilities: [],
      handler: async (payload) => {
        const value = await this.memory.get(payload.key);
        return { key: payload.key, value };
      },
      validate: (payload) => (payload && payload.key) || 'key is required',
    });

    this.router.register('memory.set', {
      capabilities: [],
      handler: async (payload) => {
        await this.memory.set(payload.key, payload.value, payload.ttlMs);
        return { key: payload.key, stored: true };
      },
      validate: (payload) => (payload && payload.key && payload.value !== undefined) || 'key and value are required',
    });

    this.router.register('memory.delete', {
      capabilities: [],
      handler: async (payload) => {
        const deleted = await this.memory.delete(payload.key);
        return { key: payload.key, deleted };
      },
      validate: (payload) => (payload && payload.key) || 'key is required',
    });

    this.router.register('status', {
      capabilities: [],
      handler: async () => this.status(),
    });
  }
}

module.exports = { Kernel };
