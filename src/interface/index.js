'use strict';

const { correlationMiddleware, securityHeaders, corsMiddleware, requestLogger, errorHandler, inputValidator } = require('./middleware');
const { createRoutes } = require('./routes');

module.exports = { correlationMiddleware, securityHeaders, corsMiddleware, requestLogger, errorHandler, inputValidator, createRoutes };
