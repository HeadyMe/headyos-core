'use strict';

const crypto = require('crypto');

const TASK_STATES = { PENDING: 'PENDING', RUNNING: 'RUNNING', COMPLETED: 'COMPLETED', FAILED: 'FAILED', TIMED_OUT: 'TIMED_OUT' };

class Task {
  constructor({ type, payload = {}, correlationId, required = true }) {
    if (!type) throw new Error('Task requires a type');
    this.id = crypto.randomUUID();
    this.type = type;
    this.payload = payload;
    this.correlationId = correlationId || crypto.randomUUID();
    this.required = required;
    this.state = TASK_STATES.PENDING;
    this.result = null;
    this.error = null;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
  }

  start()   { this.state = TASK_STATES.RUNNING; this.startedAt = Date.now(); return this; }
  complete(result) { this.state = TASK_STATES.COMPLETED; this.result = result; this.completedAt = Date.now(); return this; }
  fail(error)      { this.state = TASK_STATES.FAILED; this.error = error; this.completedAt = Date.now(); return this; }
  timeout()        { this.state = TASK_STATES.TIMED_OUT; this.error = 'Execution timed out'; this.completedAt = Date.now(); return this; }

  get duration() { return (this.completedAt || Date.now()) - (this.startedAt || this.createdAt); }

  toJSON() {
    return {
      id: this.id, type: this.type, state: this.state,
      correlationId: this.correlationId, result: this.result,
      error: this.error, duration: this.duration,
    };
  }
}

module.exports = { Task, TASK_STATES };
