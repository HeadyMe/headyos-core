'use strict';

const { OperationalError } = require('../observability/errors');

class CapabilityRouter {
  constructor({ logger, metrics } = {}) {
    this.handlers = new Map();
    this.validators = new Map();
    this.logger = logger;
    this.metrics = metrics;
  }

  register(taskType, handler, { validator, capabilities = [] } = {}) {
    this.handlers.set(taskType, { handler, capabilities });
    if (validator) this.validators.set(taskType, validator);
    this.logger?.info('Handler registered', { taskType, capabilities });
  }

  resolve(taskType) {
    const entry = this.handlers.get(taskType);
    if (!entry) throw new OperationalError('CAPABILITY_NOT_FOUND', { taskType });
    this.metrics?.incr('router.tasks_routed');
    return entry;
  }

  validate(taskType, payload) {
    const validator = this.validators.get(taskType);
    if (!validator) return { valid: true };
    const result = validator(payload);
    if (result !== true && result?.valid !== true) {
      return { valid: false, error: result?.error || result || 'Validation failed' };
    }
    return { valid: true };
  }

  listCapabilities() {
    const caps = {};
    for (const [type, { capabilities }] of this.handlers) {
      caps[type] = capabilities;
    }
    return caps;
  }
}

module.exports = { CapabilityRouter };
