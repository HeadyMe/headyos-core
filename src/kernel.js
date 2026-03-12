'use strict';

const { loadConfig } = require('./config');
const { Logger } = require('./observability/logger');
const { MetricsCollector } = require('./observability/metrics');
const { NodePool } = require('./execution/pool');
const { CapabilityRouter } = require('./gateway/router');
const { AsyncCoordinator } = require('./gateway/coordinator');
const { OrchestrationPipeline } = require('./orchestration/pipeline');
const { InMemoryAdapter } = require('./memory/adapter');
const { ServiceRegistry } = require('./discovery/registry');
const { RemoteWorkerClient } = require('./discovery/remote-worker');

class Kernel {
  constructor(envOverrides) {
    this.config = loadConfig(envOverrides);
    this.logger = new Logger({ level: this.config.LOG_LEVEL, context: { nodeId: this.config.NODE_ID, role: this.config.NODE_ROLE } });
    this.metrics = new MetricsCollector({ enabled: this.config.METRICS_ENABLED });
    this.ready = false;
    this.shuttingDown = false;
    this.bootedAt = null;

    // Core subsystems
    this.pool = new NodePool({
      poolSize: this.config.NODE_POOL_SIZE,
      idleTtlMs: this.config.NODE_IDLE_TTL_MS,
      timeoutMs: this.config.TASK_TIMEOUT_MS,
      logger: this.logger, metrics: this.metrics,
    });

    this.router = new CapabilityRouter({ logger: this.logger, metrics: this.metrics });
    this.coordinator = new AsyncCoordinator({ maxConcurrency: this.config.MAX_CONCURRENCY, logger: this.logger, metrics: this.metrics });
    this.pipeline = new OrchestrationPipeline({ coordinator: this.coordinator, router: this.router, pool: this.pool, logger: this.logger, metrics: this.metrics });
    this.memory = new InMemoryAdapter();

    // Discovery & remote workers
    this.registry = new ServiceRegistry({ logger: this.logger, metrics: this.metrics, config: this.config });
    this.remoteWorker = new RemoteWorkerClient({ logger: this.logger, metrics: this.metrics, timeoutMs: this.config.TASK_TIMEOUT_MS });
  }

  async boot() {
    this.logger.info('Kernel booting', { nodeId: this.config.NODE_ID, role: this.config.NODE_ROLE, tags: this.config.NODE_TAGS });

    // Start node pool
    this.pool.start();

    // Register built-in handlers
    this._registerBuiltins();

    // Configure discovery
    if (this.config.DISCOVERY_ENABLED) {
      // Register any statically-configured remote workers
      for (const url of this.config.REMOTE_WORKER_URLS) {
        this.registry.register(`remote-${url}`, { url, role: 'worker' });
      }
      // Start health probing
      this.registry.startProbing(this.config.HEALTH_CHECK_INTERVAL_MS);
      // Start heartbeat if registry URL is configured
      if (this.config.DISCOVERY_REGISTRY_URL) {
        this.registry.startHeartbeat(
          { nodeId: this.config.NODE_ID, role: this.config.NODE_ROLE, tags: this.config.NODE_TAGS, capabilities: [...this.router.listCapabilities()] },
          this.config.DISCOVERY_REGISTRY_URL,
          this.config.DISCOVERY_INTERVAL_MS,
        );
      }
    }

    this.ready = true;
    this.bootedAt = Date.now();
    this.logger.info('Kernel ready', { uptime: 0 });
  }

  _registerBuiltins() {
    const self = this;

    this.router.register('echo', async (payload) => payload, { capabilities: ['echo'] });

    this.router.register('memory.get', async (payload) => {
      return { value: await self.memory.get(payload.key) };
    }, { validator: (p) => p?.key ? true : { valid: false, error: 'key required' }, capabilities: ['memory'] });

    this.router.register('memory.set', async (payload) => {
      await self.memory.set(payload.key, payload.value, { ttl: payload.ttl });
      return { ok: true };
    }, { validator: (p) => p?.key ? true : { valid: false, error: 'key required' }, capabilities: ['memory'] });

    this.router.register('memory.delete', async (payload) => {
      return { deleted: await self.memory.delete(payload.key) };
    }, { validator: (p) => p?.key ? true : { valid: false, error: 'key required' }, capabilities: ['memory'] });

    this.router.register('status', async () => self.status(), { capabilities: ['status'] });
  }

  async executeTask(type, payload, { correlationId } = {}) {
    if (this.shuttingDown) {
      const { OperationalError } = require('./observability/errors');
      throw new OperationalError('SHUTDOWN_IN_PROGRESS');
    }

    const { Task } = require('./execution/task');
    const { handler } = this.router.resolve(type);
    const validation = this.router.validate(type, payload);
    if (!validation.valid) {
      const { OperationalError } = require('./observability/errors');
      throw new OperationalError('TASK_INVALID', { error: validation.error });
    }

    const task = new Task({ type, payload, correlationId });

    // Try local execution first
    const node = this.pool.acquire(type);
    if (node) {
      return this.coordinator.submit(task.id, () => node.execute(task, handler));
    }

    // Fallback to remote worker if discovery is enabled
    if (this.config.DISCOVERY_ENABLED) {
      const peers = this.registry.resolve({ capability: type });
      if (peers.length) {
        const peer = peers[Math.floor(Math.random() * peers.length)];
        this.logger.info('Dispatching to remote worker', { taskType: type, peerId: peer.id });
        const result = await this.remoteWorker.dispatch(peer.url, task);
        return result;
      }
    }

    const { OperationalError } = require('./observability/errors');
    throw new OperationalError('NODE_UNAVAILABLE', { taskType: type });
  }

  async executePipeline(plan, { correlationId } = {}) {
    if (this.shuttingDown) {
      const { OperationalError } = require('./observability/errors');
      throw new OperationalError('SHUTDOWN_IN_PROGRESS');
    }
    return this.pipeline.executePlan(plan, { correlationId });
  }

  async shutdown() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.ready = false;
    this.logger.info('Kernel shutdown initiated');

    const timeout = setTimeout(() => {
      this.logger.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, this.config.SHUTDOWN_TIMEOUT_MS);
    timeout.unref();

    try {
      await Promise.allSettled([
        this.coordinator.drain(),
        this.pool.shutdown(),
        this.registry.shutdown(),
        this.memory.shutdown(),
      ]);
      this.logger.info('Kernel shutdown complete');
    } catch (err) {
      this.logger.error('Shutdown error', { error: err.message });
    } finally {
      clearTimeout(timeout);
    }
  }

  status() {
    return {
      nodeId: this.config.NODE_ID,
      role: this.config.NODE_ROLE,
      tags: this.config.NODE_TAGS,
      ready: this.ready,
      uptime: this.bootedAt ? Date.now() - this.bootedAt : 0,
      pool: this.pool.status(),
      coordinator: this.coordinator.status(),
      discovery: this.registry.status(),
      capabilities: this.router.listCapabilities(),
    };
  }
}

module.exports = { Kernel };
