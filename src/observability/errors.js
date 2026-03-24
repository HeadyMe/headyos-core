'use strict';

class OperationalError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', context = {}) {
    super(message);
    this.name = 'OperationalError';
    this.code = code;
    this.context = context;
    this.operational = true;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
    };
  }
}

const ErrorCodes = Object.freeze({
  CONFIG_MISSING: 'CONFIG_MISSING',
  CONFIG_INVALID: 'CONFIG_INVALID',
  CONFIG_VALIDATION_FAILED: 'CONFIG_VALIDATION_FAILED',
  TASK_TIMEOUT: 'TASK_TIMEOUT',
  TASK_FAILED: 'TASK_FAILED',
  TASK_INVALID: 'TASK_INVALID',
  NODE_UNAVAILABLE: 'NODE_UNAVAILABLE',
  NODE_SPAWN_FAILED: 'NODE_SPAWN_FAILED',
  CAPABILITY_NOT_FOUND: 'CAPABILITY_NOT_FOUND',
  ROUTING_FAILED: 'ROUTING_FAILED',
  MEMORY_ADAPTER_ERROR: 'MEMORY_ADAPTER_ERROR',
  ORCHESTRATION_FAILED: 'ORCHESTRATION_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  SHUTDOWN_TIMEOUT: 'SHUTDOWN_TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

module.exports = { OperationalError, ErrorCodes };
