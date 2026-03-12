'use strict';

const crypto = require('crypto');

const NODE_STATES = { IDLE: 'IDLE', BUSY: 'BUSY', DRAINING: 'DRAINING', RETIRED: 'RETIRED' };

class LiquidNode {
  constructor({ capabilities = [], logger, metrics, timeoutMs = 30000 } = {}) {
    this.id = crypto.randomUUID();
    this.capabilities = new Set(capabilities);
    this.state = NODE_STATES.IDLE;
    this.logger = logger;
    this.metrics = metrics;
    this.timeoutMs = timeoutMs;
    this.currentTask = null;
    this.tasksCompleted = 0;
    this.tasksFailed = 0;
    this.createdAt = Date.now();
    this.lastActiveAt = Date.now();
  }

  get idleTime() { return Date.now() - this.lastActiveAt; }

  canHandle(taskType) {
    return this.state === NODE_STATES.IDLE && (this.capabilities.has(taskType) || this.capabilities.has('*'));
  }

  async execute(task, handler) {
    if (this.state !== NODE_STATES.IDLE) {
      throw new Error(`Node ${this.id} is ${this.state}, cannot execute`);
    }
    this.state = NODE_STATES.BUSY;
    this.currentTask = task;
    task.start();

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);

    try {
      const result = await Promise.race([
        handler(task.payload, { signal: ac.signal, correlationId: task.correlationId, nodeId: this.id }),
        new Promise((_, reject) => {
          ac.signal.addEventListener('abort', () => reject(new Error('TIMEOUT')), { once: true });
        }),
      ]);
      task.complete(result);
      this.tasksCompleted++;
      this.metrics?.incr('node.tasks_completed');
      this.metrics?.observe('node.task_duration_ms', task.duration);
    } catch (err) {
      if (err.message === 'TIMEOUT') {
        task.timeout();
        this.metrics?.incr('node.tasks_timed_out');
      } else {
        task.fail(err.message);
        this.tasksFailed++;
        this.metrics?.incr('node.tasks_failed');
      }
      this.logger?.warn('Task execution failed', { taskId: task.id, error: err.message, nodeId: this.id });
    } finally {
      clearTimeout(timer);
      this.currentTask = null;
      this.lastActiveAt = Date.now();
      if (this.state === NODE_STATES.BUSY) this.state = NODE_STATES.IDLE;
    }
    return task;
  }

  drain() {
    if (this.state === NODE_STATES.RETIRED) return;
    this.state = this.currentTask ? NODE_STATES.DRAINING : NODE_STATES.RETIRED;
  }

  retire() { this.state = NODE_STATES.RETIRED; }

  toJSON() {
    return {
      id: this.id, state: this.state,
      capabilities: [...this.capabilities],
      tasksCompleted: this.tasksCompleted, tasksFailed: this.tasksFailed,
      idleTime: this.idleTime, createdAt: this.createdAt,
    };
  }
}

module.exports = { LiquidNode, NODE_STATES };
