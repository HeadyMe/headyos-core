'use strict';

const express = require('express');
const { correlationId, securityHeaders, requestLogger, errorHandler, shutdownGuard } = require('./interface/middleware');
const { createRoutes } = require('./interface/routes');

function createApp(kernel) {
  const app = express();

  // Core middleware
  app.use(express.json({ limit: '1mb' }));
  app.use(correlationId);
  app.use(securityHeaders);
  app.use(requestLogger(kernel.logger));
  app.use(shutdownGuard(kernel));

  // API routes
  app.use(createRoutes(kernel));

  // Error handler (must be last)
  app.use(errorHandler(kernel.logger));

  return app;
}

module.exports = { createApp };
