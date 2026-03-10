'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { createTaskEnvelope, TaskStatus, transitionTask } = require('../src/execution/task');
const { LiquidNode, NodeState } = require('../src/execution/node');
const { NodePool } = require('../src/execution/pool');

describe('Task Envelope', () => {
  it('creates a valid envelope', () => {
    const task = createTaskEnvelope({ type: 'test', payload: { data: 1 } });
    assert.ok(task.id);
    assert.equal(task.type, 'test');
    assert.equal(task.status, TaskStatus.PENDING);
    assert.ok(task.correlationId);
  });

  it('rejects missing type', () => {
    assert.throws(() => createTaskEnvelope({ payload: {} }), /type is required/);
  });

  it('rejects missing payload', () => {
    assert.throws(() => createTaskEnvelope({ type: 'test' }), /payload is required/);
  });

  it('transitions correctly', () => {
    const task = createTaskEnvelope({ type: 'test', payload: {} });
    const running = transitionTask(task, TaskStatus.RUNNING);
    assert.equal(running.status, TaskStatus.RUNNING);
    const completed = transitionTask(running, TaskStatus.COMPLETED, { result: 'ok' });
    assert.equal(completed.status, TaskStatus.COMPLETED);
    assert.equal(completed.result, 'ok');
  });

  it('rejects invalid transitions', () => {
    const task = createTaskEnvelope({ type: 'test', payload: {} });
    assert.throws(() => transitionTask(task, TaskStatus.COMPLETED), /Invalid task transition/);
  });
});

describe('LiquidNode', () => {
  it('executes a task successfully', async () => {
    const node = new LiquidNode({ capabilities: ['compute'] });
    const task = createTaskEnvelope({ type: 'test', payload: { x: 1 }, capabilities: ['compute'] });
    const result = await node.execute(task, async (payload) => ({ doubled: payload.x * 2 }));
    assert.equal(result.status, TaskStatus.COMPLETED);
    assert.deepEqual(result.result, { doubled: 2 });
    assert.equal(node.state, NodeState.IDLE);
    assert.equal(node.tasksProcessed, 1);
  });

  it('handles task failure', async () => {
    const node = new LiquidNode({ capabilities: [] });
    const task = createTaskEnvelope({ type: 'test', payload: {} });
    const result = await node.execute(task, async () => { throw new Error('boom'); });
    assert.equal(result.status, TaskStatus.FAILED);
    assert.equal(result.error, 'boom');
  });

  it('handles task timeout', async () => {
    const node = new LiquidNode({ capabilities: [], timeoutMs: 50 });
    const task = createTaskEnvelope({ type: 'test', payload: {}, timeoutMs: 50 });
    const result = await node.execute(task, async (_, { signal }) => {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 5000);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); });
      });
    });
    assert.equal(result.status, TaskStatus.TIMED_OUT);
  });

  it('checks capability matching', () => {
    const node = new LiquidNode({ capabilities: ['a', 'b'] });
    assert.ok(node.canHandle(['a']));
    assert.ok(node.canHandle(['a', 'b']));
    assert.ok(!node.canHandle(['c']));
  });
});

describe('NodePool', () => {
  it('spawns and acquires nodes', () => {
    const pool = new NodePool({ poolSize: 3 });
    pool.start();
    const node = pool.acquire(['compute']);
    assert.ok(node);
    assert.equal(pool.status().active, 1);
  });

  it('enforces pool size limit', () => {
    const pool = new NodePool({ poolSize: 1, idleTtlMs: 999999 });
    pool.start();
    const node = pool.acquire();
    // Mark it busy to prevent reaping
    node.state = NodeState.BUSY;
    assert.throws(() => pool.acquire(), /pool at capacity/i);
  });

  it('shuts down gracefully', async () => {
    const pool = new NodePool({ poolSize: 3 });
    pool.start();
    pool.acquire();
    pool.acquire();
    await pool.shutdown(1000);
    assert.equal(pool.status().active, 0);
  });
});
