'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { LiquidNode, NODE_STATES } = require('../src/execution/node');
const { Task, TASK_STATES } = require('../src/execution/task');
const { NodePool } = require('../src/execution/pool');

describe('Task', () => {
  it('creates with PENDING state', () => {
    const t = new Task({ type: 'test' });
    assert.equal(t.state, TASK_STATES.PENDING);
    assert.ok(t.id);
    assert.ok(t.correlationId);
  });

  it('transitions through states', () => {
    const t = new Task({ type: 'test' });
    t.start();
    assert.equal(t.state, TASK_STATES.RUNNING);
    t.complete({ ok: true });
    assert.equal(t.state, TASK_STATES.COMPLETED);
    assert.deepEqual(t.result, { ok: true });
    assert.ok(t.duration >= 0);
  });

  it('handles failure', () => {
    const t = new Task({ type: 'test' });
    t.start();
    t.fail('boom');
    assert.equal(t.state, TASK_STATES.FAILED);
    assert.equal(t.error, 'boom');
  });

  it('requires type', () => {
    assert.throws(() => new Task({}), /requires a type/);
  });
});

describe('LiquidNode', () => {
  it('starts IDLE', () => {
    const node = new LiquidNode({ capabilities: ['echo'] });
    assert.equal(node.state, NODE_STATES.IDLE);
  });

  it('executes a task successfully', async () => {
    const node = new LiquidNode({ capabilities: ['echo'], timeoutMs: 5000 });
    const task = new Task({ type: 'echo' });
    const handler = async (payload) => ({ echoed: payload });
    const result = await node.execute(task, handler);
    assert.equal(result.state, TASK_STATES.COMPLETED);
    assert.equal(node.state, NODE_STATES.IDLE);
    assert.equal(node.tasksCompleted, 1);
  });

  it('handles task failure', async () => {
    const node = new LiquidNode({ capabilities: ['fail'], timeoutMs: 5000 });
    const task = new Task({ type: 'fail' });
    const handler = async () => { throw new Error('broke'); };
    const result = await node.execute(task, handler);
    assert.equal(result.state, TASK_STATES.FAILED);
    assert.equal(node.tasksFailed, 1);
    assert.equal(node.state, NODE_STATES.IDLE);
  });

  it('times out slow tasks', async () => {
    const node = new LiquidNode({ capabilities: ['slow'], timeoutMs: 50 });
    const task = new Task({ type: 'slow' });
    const handler = () => new Promise(resolve => setTimeout(resolve, 500));
    const result = await node.execute(task, handler);
    assert.equal(result.state, TASK_STATES.TIMED_OUT);
  });

  it('refuses execution when not IDLE', async () => {
    const node = new LiquidNode({ capabilities: ['test'] });
    node.drain();
    node.retire();
    await assert.rejects(() => node.execute(new Task({ type: 'test' }), async () => {}), /RETIRED/);
  });

  it('canHandle checks capabilities', () => {
    const node = new LiquidNode({ capabilities: ['ml'] });
    assert.ok(node.canHandle('ml'));
    assert.ok(!node.canHandle('other'));
  });

  it('wildcard capability handles anything', () => {
    const node = new LiquidNode({ capabilities: ['*'] });
    assert.ok(node.canHandle('anything'));
  });

  it('drain retires idle node immediately', () => {
    const node = new LiquidNode({ capabilities: ['test'] });
    node.drain();
    assert.equal(node.state, NODE_STATES.RETIRED);
  });
});

describe('NodePool', () => {
  it('spawns nodes up to max size', () => {
    const pool = new NodePool({ poolSize: 2 });
    pool.spawn(['a']);
    pool.spawn(['b']);
    assert.throws(() => pool.spawn(['c']), /pool exhausted/i);
  });

  it('acquires a node for a task type', () => {
    const pool = new NodePool({ poolSize: 3 });
    pool.spawn(['echo', '*']);
    const node = pool.acquire('echo');
    assert.ok(node);
  });

  it('auto-spawns when acquiring', () => {
    const pool = new NodePool({ poolSize: 3 });
    const node = pool.acquire('echo');
    assert.ok(node);
    assert.equal(pool.nodes.size, 1);
  });

  it('shuts down gracefully', async () => {
    const pool = new NodePool({ poolSize: 3 });
    pool.start();
    pool.spawn(['test']);
    await pool.shutdown();
    assert.equal(pool.nodes.size, 0);
  });

  it('reports status', () => {
    const pool = new NodePool({ poolSize: 5 });
    pool.spawn(['test']);
    const s = pool.status();
    assert.equal(s.total, 1);
    assert.equal(s.max, 5);
  });
});
