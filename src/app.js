'use strict';

const express = require('express');
const { Kernel } = require('./kernel');
const { correlationMiddleware, securityHeaders, corsMiddleware, requestLogger, errorHandler } = require('./interface');
const { createRoutes } = require('./interface/routes');

function createApp(env) {
  const kernel = new Kernel(env);
  kernel.boot();

  const app = express();

  app.use(securityHeaders());
  app.use(correlationMiddleware());
  app.use(corsMiddleware(kernel.config.CORS_ORIGINS));
  app.use(requestLogger(kernel.logger));
  app.use(express.json({ limit: '1mb' }));
  app.use('/', createRoutes({ kernel }));
  app.use(errorHandler(kernel.logger));

  return { app, kernel };
}

module.exports = { createApp };
