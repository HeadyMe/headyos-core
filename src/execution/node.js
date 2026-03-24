'use strict';

const crypto = require('crypto');
const { OperationalError, ErrorCodes } = require('../observability/errors');
const { TaskStatus, transitionTask } = require('./task');

const NodeState = Object.freeze({
  IDLE: 'idle',
  BUSY: 'busy',
  DRAINING: 'draining',
  RETIRED: 'retired',
});

class LiquidNode {
  constructor({ capabilities = [], logger, metrics, timeoutMs = 30000 }) {
    this.id = crypto.randomUUID();
    this.capabilities = new Set(capabilities);
    this.state = NodeState.IDLE;
    this.createdAt = Date.now();
    this.lastActiveAt = Date.now();
    this.tasksProcessed = 0;
    this._logger = logger;
    this._metrics = metrics;
    this._timeoutMs = timeoutMs;
    this._currentTask = null;
    this._abortController = null;
  }

  canHandle(requiredCapabilities) {
    if (this.state !== NodeState.IDLE) return false;
    return requiredCapabilities.every(cap => this.capabilities.has(cap));
  }

  async execute(task, handler) {
    if (this.state !== NodeState.IDLE) {
      throw new OperationalError(`Node ${this.id} is not idle`, ErrorCodes.NODE_UNAVAILABLE, { nodeId: this.id, state: this.state });
    }

    this.state = NodeState.BUSY;
    this._currentTask = task;
    this._abortController = new AbortController();
    this.lastActiveAt = Date.now();

    let runningTask = transitionTask(task, TaskStatus.RUNNING);

    const timer = setTimeout(() => {
      this._abortController.abort();
    }, task.timeoutMs || this._timeoutMs);

    try {
      const result = await handler(task.payload, { signal: this._abortController.signal, nodeId: this.id });
      clearTimeout(timer);
      this.tasksProcessed++;
      this.state = NodeState.IDLE;
      this._currentTask = null;
      this.lastActiveAt = Date.now();

      if (this._metrics) {
        this._metrics.increment('node.tasks_completed', 1, { nodeId: this.id });
        this._metrics.histogram('node.task_duration_ms', Date.now() - runningTask.createdAt, { nodeId: this.id });
      }

      return transitionTask(runningTask, TaskStatus.COMPLETED, { result });
    } catch (err) {
      clearTimeout(timer);
      this._currentTask = null;
      this.lastActiveAt = Date.now();

      if (this.state !== NodeState.DRAINING) {
        this.state = NodeState.IDLE;
      }

      if (this._metrics) {
        this._metrics.increment('node.tasks_failed', 1, { nodeId: this.id });
      }

      const isTimeout = this._abortController.signal.aborted;
      const status = isTimeout ? TaskStatus.TIMED_OUT : TaskStatus.FAILED;
      const errorMsg = isTimeout ? `Task timed out after ${task.timeoutMs || this._timeoutMs}ms` : err.message;

      if (this._logger) {
        this._logger.error('Task execution failed', {
          nodeId: this.id,
          taskId: task.id,
          status,
          error: errorMsg,
        });
      }

      return transitionTask(runningTask, status, { error: errorMsg });
    }
  }

  drain() {
    if (this.state === NodeState.IDLE) {
      this.state = NodeState.RETIRED;
      return true;
    }
    if (this.state === NodeState.BUSY) {
      this.state = NodeState.DRAINING;
      return false;
    }
    return this.state === NodeState.RETIRED;
  }

  retire() {
    if (this._abortController && !this._abortController.signal.aborted) {
      this._abortController.abort();
    }
    this.state = NodeState.RETIRED;
  }

  status() {
    return {
      id: this.id,
      state: this.state,
      capabilities: [...this.capabilities],
      tasksProcessed: this.tasksProcessed,
      createdAt: this.createdAt,
      lastActiveAt: this.lastActiveAt,
      currentTask: this._currentTask ? this._currentTask.id : null,
    };
  }
}

module.exports = { LiquidNode, NodeState };
