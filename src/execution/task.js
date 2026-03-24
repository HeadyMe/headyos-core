'use strict';

const crypto = require('crypto');
const { OperationalError, ErrorCodes } = require('../observability/errors');

const TaskStatus = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMED_OUT: 'timed_out',
  CANCELLED: 'cancelled',
});

function createTaskEnvelope({ type, payload, capabilities = [], correlationId, timeoutMs }) {
  if (!type || typeof type !== 'string') {
    throw new OperationalError('Task type is required', ErrorCodes.TASK_INVALID, { type });
  }
  if (!payload) {
    throw new OperationalError('Task payload is required', ErrorCodes.TASK_INVALID, { type });
  }
  return Object.freeze({
    id: crypto.randomUUID(),
    type,
    payload,
    capabilities,
    correlationId: correlationId || crypto.randomUUID(),
    status: TaskStatus.PENDING,
    createdAt: Date.now(),
    timeoutMs: timeoutMs || 30000,
    result: null,
    error: null,
  });
}

function transitionTask(task, newStatus, data = {}) {
  const allowed = {
    [TaskStatus.PENDING]: [TaskStatus.RUNNING, TaskStatus.CANCELLED],
    [TaskStatus.RUNNING]: [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.TIMED_OUT, TaskStatus.CANCELLED],
  };
  const valid = allowed[task.status];
  if (!valid || !valid.includes(newStatus)) {
    throw new OperationalError(
      `Invalid task transition: ${task.status} -> ${newStatus}`,
      ErrorCodes.TASK_INVALID,
      { taskId: task.id, from: task.status, to: newStatus }
    );
  }
  return Object.freeze({
    ...task,
    status: newStatus,
    result: data.result || task.result,
    error: data.error || task.error,
    completedAt: [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.TIMED_OUT, TaskStatus.CANCELLED].includes(newStatus)
      ? Date.now() : undefined,
  });
}

module.exports = { TaskStatus, createTaskEnvelope, transitionTask };
