'use strict';

const { OperationalError } = require('../observability/errors');

class AsyncCoordinator {
  constructor({ maxConcurrency = 10, logger, metrics } = {}) {
    this.maxConcurrency = maxConcurrency;
    this.active = new Map();
    this.logger = logger;
    this.metrics = metrics;
  }

  canAccept() { return this.active.size < this.maxConcurrency; }

  async submit(taskId, fn) {
    if (!this.canAccept()) {
      throw new OperationalError('COORDINATOR_FULL', { active: this.active.size, max: this.maxConcurrency });
    }
    const promise = fn();
    this.active.set(taskId, promise);
    this.metrics?.gauge('coordinator.active_tasks', this.active.size);
    try {
      return await promise;
    } finally {
      this.active.delete(taskId);
      this.metrics?.gauge('coordinator.active_tasks', this.active.size);
    }
  }

  async submitBatch(tasks) {
    const results = await Promise.allSettled(
      tasks.map(({ id, fn }) => this.submit(id, fn))
    );
    return results.map((r, i) => ({
      taskId: tasks[i].id,
      status: r.status,
      value: r.status === 'fulfilled' ? r.value : undefined,
      error: r.status === 'rejected' ? r.reason?.message : undefined,
    }));
  }

  async drain() {
    await Promise.allSettled([...this.active.values()]);
  }

  status() {
    return { active: this.active.size, max: this.maxConcurrency };
  }
}

module.exports = { AsyncCoordinator };
