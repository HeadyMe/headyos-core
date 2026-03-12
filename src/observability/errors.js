'use strict';

const ERROR_CODES = {
  CONFIG_INVALID:       { status: 500, message: 'Invalid configuration' },
  TASK_INVALID:         { status: 400, message: 'Invalid task payload' },
  TASK_TIMEOUT:         { status: 504, message: 'Task execution timed out' },
  NODE_UNAVAILABLE:     { status: 503, message: 'No execution node available' },
  CAPABILITY_NOT_FOUND: { status: 404, message: 'No handler for requested capability' },
  POOL_EXHAUSTED:       { status: 503, message: 'Node pool exhausted' },
  COORDINATOR_FULL:     { status: 429, message: 'Max concurrency reached' },
  PIPELINE_FAILED:      { status: 500, message: 'Pipeline execution failed' },
  MEMORY_ERROR:         { status: 500, message: 'Memory operation failed' },
  SHUTDOWN_IN_PROGRESS: { status: 503, message: 'Service is shutting down' },
  DISCOVERY_ERROR:      { status: 502, message: 'Service discovery failed' },
  REMOTE_WORKER_ERROR:  { status: 502, message: 'Remote worker communication failed' },
};

class OperationalError extends Error {
  constructor(code, context = {}) {
    const template = ERROR_CODES[code] || { status: 500, message: code };
    super(template.message);
    this.name = 'OperationalError';
    this.code = code;
    this.statusCode = template.status;
    this.context = context;
    this.operational = true;
  }

  toJSON() {
    return { error: this.code, message: this.message, context: this.context };
  }
}

module.exports = { OperationalError, ERROR_CODES };
