'use strict';

const express = require('express');

function createRoutes(kernel) {
  const router = express.Router();

  // Health & readiness
  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'HeadyOS', nodeId: kernel.config.NODE_ID, role: kernel.config.NODE_ROLE, uptime: kernel.bootedAt ? Date.now() - kernel.bootedAt : 0, ts: new Date().toISOString() });
  });

  router.get('/readiness', (_req, res) => {
    if (kernel.ready) {
      res.json({ ready: true, nodeId: kernel.config.NODE_ID });
    } else {
      res.status(503).json({ ready: false, nodeId: kernel.config.NODE_ID });
    }
  });

  // Status & introspection
  router.get('/status', (_req, res) => res.json(kernel.status()));
  router.get('/capabilities', (_req, res) => res.json(kernel.router.listCapabilities()));
  router.get('/metrics', (_req, res) => res.json(kernel.metrics.snapshot()));

  // Discovery — peer registration endpoint (other nodes announce to us)
  router.post('/register', (req, res) => {
    const { nodeId, url, role, tags, capabilities } = req.body;
    if (!nodeId || !url) return res.status(400).json({ error: 'nodeId and url required' });
    kernel.registry.register(nodeId, { url, role, tags, capabilities });
    res.json({ ok: true });
  });

  router.get('/peers', (req, res) => {
    const { role, capability } = req.query;
    res.json(kernel.registry.resolve({ role, capability }));
  });

  router.delete('/peers/:nodeId', (req, res) => {
    kernel.registry.deregister(req.params.nodeId);
    res.json({ ok: true });
  });

  // Task execution
  router.post('/tasks', async (req, res, next) => {
    try {
      const { type, payload, correlationId } = req.body;
      if (!type) return res.status(400).json({ error: 'TASK_INVALID', message: 'type is required' });
      const result = await kernel.executeTask(type, payload, { correlationId: correlationId || req.correlationId });
      res.json(result);
    } catch (err) { next(err); }
  });

  // Batch execution
  router.post('/tasks/batch', async (req, res, next) => {
    try {
      const { tasks } = req.body;
      if (!Array.isArray(tasks)) return res.status(400).json({ error: 'TASK_INVALID', message: 'tasks array required' });
      const results = await Promise.allSettled(
        tasks.map(t => kernel.executeTask(t.type, t.payload, { correlationId: t.correlationId || req.correlationId }))
      );
      res.json(results.map((r, i) => ({
        taskType: tasks[i].type,
        status: r.status,
        value: r.status === 'fulfilled' ? r.value : undefined,
        error: r.status === 'rejected' ? (r.reason?.toJSON?.() || { message: r.reason?.message }) : undefined,
      })));
    } catch (err) { next(err); }
  });

  // Pipeline execution
  router.post('/pipeline', async (req, res, next) => {
    try {
      const { plan } = req.body;
      if (!plan?.steps) return res.status(400).json({ error: 'TASK_INVALID', message: 'plan with steps required' });
      const result = await kernel.executePipeline(plan, { correlationId: req.correlationId });
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { createRoutes };
