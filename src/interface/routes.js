'use strict';

const express = require('express');
const { inputValidator } = require('./middleware');

function createRoutes({ kernel }) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'headyos-core',
      version: kernel.version,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/readiness', (req, res) => {
    const ready = kernel.isReady();
    res.status(ready ? 200 : 503).json({
      ready,
      service: 'headyos-core',
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/status', (req, res) => {
    res.json(kernel.status());
  });

  router.get('/capabilities', (req, res) => {
    res.json(kernel.capabilities());
  });

  router.get('/metrics', (req, res) => {
    res.json(kernel.metricsSnapshot());
  });

  router.get('/docs', (req, res) => {
    res.json({
      service: 'headyos-core',
      version: kernel.version,
      description: 'HeadyOS Core — Latent Operating System control plane',
      endpoints: [
        { method: 'GET', path: '/health', description: 'Health check' },
        { method: 'GET', path: '/readiness', description: 'Readiness probe' },
        { method: 'GET', path: '/status', description: 'System status with pool and coordinator info' },
        { method: 'GET', path: '/capabilities', description: 'Registered task capabilities' },
        { method: 'GET', path: '/metrics', description: 'Runtime metrics snapshot' },
        { method: 'GET', path: '/docs', description: 'API documentation' },
        { method: 'POST', path: '/tasks', description: 'Submit a task for execution' },
        { method: 'POST', path: '/tasks/batch', description: 'Submit a batch of tasks' },
        { method: 'POST', path: '/pipeline', description: 'Execute an orchestration pipeline' },
      ],
      configuration: {
        envVars: [
          'PORT', 'NODE_ENV', 'LOG_LEVEL', 'CORS_ORIGINS', 'MAX_CONCURRENCY',
          'TASK_TIMEOUT_MS', 'NODE_POOL_SIZE', 'NODE_IDLE_TTL_MS', 'MEMORY_ADAPTER',
          'METRICS_ENABLED', 'SHUTDOWN_TIMEOUT_MS',
        ],
      },
    });
  });

  router.post('/tasks',
    inputValidator({ type: { required: true, type: 'string', maxLength: 256 }, payload: { required: true, type: 'object' } }),
    async (req, res, next) => {
      try {
        const result = await kernel.submitTask({
          type: req.body.type,
          payload: req.body.payload,
          correlationId: req.correlationId,
          timeoutMs: req.body.timeoutMs,
        });
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post('/tasks/batch',
    inputValidator({ tasks: { required: true } }),
    async (req, res, next) => {
      try {
        if (!Array.isArray(req.body.tasks)) {
          return res.status(400).json({ error: 'VALIDATION_FAILED', messages: ['tasks must be an array'] });
        }
        const results = await kernel.submitBatch(
          req.body.tasks.map(t => ({ ...t, correlationId: req.correlationId }))
        );
        res.status(200).json({ results });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post('/pipeline',
    inputValidator({ name: { required: true, type: 'string' }, steps: { required: true } }),
    async (req, res, next) => {
      try {
        if (!Array.isArray(req.body.steps)) {
          return res.status(400).json({ error: 'VALIDATION_FAILED', messages: ['steps must be an array'] });
        }
        const result = await kernel.executePipeline({
          name: req.body.name,
          steps: req.body.steps,
          correlationId: req.correlationId,
        });
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { createRoutes };
