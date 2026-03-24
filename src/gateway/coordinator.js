'use strict';

const { OperationalError, ErrorCodes } = require('../observability/errors');
const { generateCorrelationId } = require('../observability/logger');
const { TaskStatus } = require('../execution/task');

class AsyncCoordinator {
  constructor({ router, pool, logger, metrics, maxConcurrency = 10 }) {
    this._router = router;
    this._pool = pool;
    this._logger = logger;
    this._metrics = metrics;
    this._maxConcurrency = maxConcurrency;
    this._activeTasks = new Map();
    this._taskHistory = [];
    this._historyLimit = 1000;
  }

  async submit(request) {
    const correlationId = request.correlationId || generateCorrelationId();
    const { task, handler } = this._router.route({ ...request, correlationId });

    if (this._activeTasks.size >= this._maxConcurrency) {
      throw new OperationalError('Max concurrency reached', ErrorCodes.TASK_FAILED, {
        active: this._activeTasks.size,
        max: this._maxConcurrency,
      });
    }

    this._activeTasks.set(task.id, { task, startedAt: Date.now() });
    if (this._metrics) this._metrics.gauge('coordinator.active_tasks', this._activeTasks.size);

    try {
      const node = this._pool.acquire(task.capabilities);
      const completedTask = await node.execute(task, handler);
      this._recordCompletion(completedTask);
      return completedTask;
    } catch (err) {
      const failedResult = { id: task.id, status: TaskStatus.FAILED, error: err.message, correlationId };
      this._recordCompletion(failedResult);
      throw err;
    }
  }

  async submitBatch(requests) {
    const independentGroups = this._partitionByDependency(requests);
    const results = [];

    for (const group of independentGroups) {
      const groupResults = await Promise.allSettled(
        group.map(req => this.submit(req))
      );
      results.push(...groupResults.map((r, i) => ({
        request: group[i],
        status: r.status,
        value: r.status === 'fulfilled' ? r.value : undefined,
        error: r.status === 'rejected' ? r.reason.message : undefined,
      })));
    }

    return results;
  }

  _partitionByDependency(requests) {
    const withDeps = requests.filter(r => r.dependsOn && r.dependsOn.length > 0);
    const noDeps = requests.filter(r => !r.dependsOn || r.dependsOn.length === 0);
    const groups = [noDeps];
    if (withDeps.length > 0) groups.push(withDeps);
    return groups.filter(g => g.length > 0);
  }

  _recordCompletion(task) {
    this._activeTasks.delete(task.id);
    if (this._metrics) this._metrics.gauge('coordinator.active_tasks', this._activeTasks.size);
    this._taskHistory.push({ id: task.id, status: task.status, completedAt: Date.now() });
    if (this._taskHistory.length > this._historyLimit) {
      this._taskHistory = this._taskHistory.slice(-this._historyLimit);
    }
  }

  status() {
    return {
      activeTasks: this._activeTasks.size,
      maxConcurrency: this._maxConcurrency,
      totalCompleted: this._taskHistory.length,
      recentHistory: this._taskHistory.slice(-10),
    };
  }
}

module.exports = { AsyncCoordinator };
