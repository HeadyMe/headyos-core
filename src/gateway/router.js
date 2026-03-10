'use strict';

const { OperationalError, ErrorCodes } = require('../observability/errors');
const { createTaskEnvelope } = require('../execution/task');

class CapabilityRouter {
  constructor({ logger, metrics }) {
    this._handlers = new Map();
    this._logger = logger;
    this._metrics = metrics;
  }

  register(taskType, { capabilities = [], handler, validate }) {
    if (this._handlers.has(taskType)) {
      throw new OperationalError(`Handler already registered for type: ${taskType}`, ErrorCodes.ROUTING_FAILED);
    }
    if (typeof handler !== 'function') {
      throw new OperationalError(`Handler must be a function for type: ${taskType}`, ErrorCodes.ROUTING_FAILED);
    }
    this._handlers.set(taskType, { capabilities, handler, validate: validate || null });
    if (this._logger) this._logger.info('Handler registered', { taskType, capabilities });
  }

  unregister(taskType) {
    this._handlers.delete(taskType);
  }

  resolve(taskType) {
    const registration = this._handlers.get(taskType);
    if (!registration) {
      throw new OperationalError(`No handler for task type: ${taskType}`, ErrorCodes.CAPABILITY_NOT_FOUND, { taskType });
    }
    return registration;
  }

  route(request) {
    const { type, payload, correlationId, timeoutMs } = request;
    const registration = this.resolve(type);

    if (registration.validate) {
      const validationResult = registration.validate(payload);
      if (validationResult !== true && validationResult !== undefined) {
        throw new OperationalError(
          `Validation failed for task type: ${type}: ${validationResult}`,
          ErrorCodes.VALIDATION_FAILED,
          { taskType: type, validationResult }
        );
      }
    }

    const task = createTaskEnvelope({
      type,
      payload,
      capabilities: registration.capabilities,
      correlationId,
      timeoutMs,
    });

    if (this._metrics) this._metrics.increment('router.tasks_routed', 1, { type });

    return { task, handler: registration.handler };
  }

  listCapabilities() {
    const result = {};
    for (const [type, reg] of this._handlers) {
      result[type] = { capabilities: reg.capabilities, hasValidation: !!reg.validate };
    }
    return result;
  }
}

module.exports = { CapabilityRouter };
