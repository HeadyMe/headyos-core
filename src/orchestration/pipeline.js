'use strict';

class OrchestrationPipeline {
  constructor({ coordinator, router, pool, logger, metrics } = {}) {
    this.coordinator = coordinator;
    this.router = router;
    this.pool = pool;
    this.logger = logger;
    this.metrics = metrics;
  }

  async executePlan(plan, { correlationId } = {}) {
    const { Task } = require('../execution/task');
    const results = [];
    const startTime = Date.now();

    for (const step of plan.steps) {
      this.logger?.info('Pipeline step', { step: step.name, correlationId });

      if (step.parallel && Array.isArray(step.tasks)) {
        const batchItems = step.tasks.map(t => {
          const task = new Task({ type: t.type, payload: t.payload, correlationId, required: t.required ?? step.required ?? true });
          return { id: task.id, task, fn: () => this._executeTask(task) };
        });
        const batchResults = await Promise.allSettled(
          batchItems.map(({ task, fn }) => this.coordinator.submit(task.id, fn))
        );
        const stepResults = batchResults.map((r, i) => r.status === 'fulfilled' ? r.value : batchItems[i].task.fail(r.reason?.message));
        results.push({ step: step.name, results: stepResults });

        const failed = stepResults.filter(t => t.state !== 'COMPLETED');
        if (failed.length && step.required !== false) {
          this.metrics?.observe('pipeline.duration_ms', Date.now() - startTime);
          return { success: false, results, failedStep: step.name };
        }
      } else {
        const task = new Task({ type: step.type, payload: step.payload, correlationId, required: step.required ?? true });
        const result = await this.coordinator.submit(task.id, () => this._executeTask(task));
        results.push({ step: step.name, result });

        if (result.state !== 'COMPLETED' && step.required !== false) {
          this.metrics?.observe('pipeline.duration_ms', Date.now() - startTime);
          return { success: false, results, failedStep: step.name };
        }
      }
    }

    this.metrics?.observe('pipeline.duration_ms', Date.now() - startTime);
    return { success: true, results };
  }

  async _executeTask(task) {
    const { handler } = this.router.resolve(task.type);
    const node = this.pool.acquire(task.type);
    if (!node) {
      const { OperationalError } = require('../observability/errors');
      throw new OperationalError('NODE_UNAVAILABLE', { taskType: task.type });
    }
    return node.execute(task, handler);
  }
}

module.exports = { OrchestrationPipeline };
