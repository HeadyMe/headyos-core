'use strict';

const { OperationalError, ErrorCodes } = require('../observability/errors');
const { generateCorrelationId } = require('../observability/logger');

class OrchestrationPipeline {
  constructor({ coordinator, logger, metrics }) {
    this._coordinator = coordinator;
    this._logger = logger;
    this._metrics = metrics;
  }

  async execute(plan) {
    const correlationId = plan.correlationId || generateCorrelationId();
    const startTime = Date.now();

    if (this._logger) this._logger.info('Pipeline execution started', { correlationId, steps: plan.steps.length });

    const results = [];

    for (const step of plan.steps) {
      const stepStart = Date.now();

      if (step.parallel && Array.isArray(step.tasks)) {
        const batchResults = await this._coordinator.submitBatch(
          step.tasks.map(t => ({ ...t, correlationId }))
        );
        results.push({
          step: step.name,
          type: 'parallel',
          results: batchResults,
          durationMs: Date.now() - stepStart,
        });

        const failures = batchResults.filter(r => r.status === 'rejected');
        if (failures.length > 0 && step.required !== false) {
          throw new OperationalError(
            `Pipeline step "${step.name}" failed: ${failures.length} task(s) failed`,
            ErrorCodes.ORCHESTRATION_FAILED,
            { step: step.name, failures: failures.map(f => f.error), correlationId }
          );
        }
      } else {
        try {
          const taskResult = await this._coordinator.submit({ ...step.task, correlationId });
          results.push({
            step: step.name,
            type: 'sequential',
            result: taskResult,
            durationMs: Date.now() - stepStart,
          });
        } catch (err) {
          if (step.required !== false) throw err;
          results.push({
            step: step.name,
            type: 'sequential',
            error: err.message,
            durationMs: Date.now() - stepStart,
          });
        }
      }
    }

    const report = {
      correlationId,
      status: 'completed',
      steps: results,
      totalDurationMs: Date.now() - startTime,
    };

    if (this._logger) this._logger.info('Pipeline execution completed', { correlationId, durationMs: report.totalDurationMs });
    if (this._metrics) this._metrics.histogram('pipeline.duration_ms', report.totalDurationMs);

    return report;
  }
}

function createPlan({ name, steps, correlationId }) {
  if (!name) throw new OperationalError('Plan name is required', ErrorCodes.ORCHESTRATION_FAILED);
  if (!steps || steps.length === 0) throw new OperationalError('Plan must have at least one step', ErrorCodes.ORCHESTRATION_FAILED);
  return { name, steps, correlationId: correlationId || generateCorrelationId() };
}

module.exports = { OrchestrationPipeline, createPlan };
