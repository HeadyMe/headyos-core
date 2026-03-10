'use strict';

const { generateCorrelationId } = require('../observability/logger');

function correlationMiddleware() {
  return (req, res, next) => {
    req.correlationId = req.headers['x-correlation-id'] || generateCorrelationId();
    res.setHeader('x-correlation-id', req.correlationId);
    next();
  };
}

function securityHeaders() {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.removeHeader('X-Powered-By');
    next();
  };
}

function corsMiddleware(allowedOrigins = []) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.length > 0) {
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-Id');
        res.setHeader('Access-Control-Max-Age', '86400');
      }
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    next();
  };
}

function requestLogger(logger) {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info('request', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        correlationId: req.correlationId,
      });
    });
    next();
  };
}

function errorHandler(logger) {
  return (err, req, res, _next) => {
    const statusCode = err.operational ? 400 : 500;
    const code = err.code || 'INTERNAL_ERROR';

    logger.error('Unhandled error', {
      error: err.message,
      code,
      stack: err.operational ? undefined : err.stack,
      correlationId: req.correlationId,
    });

    res.status(statusCode).json({
      error: code,
      message: err.operational ? err.message : 'Internal server error',
      correlationId: req.correlationId,
    });
  };
}

function inputValidator(schema) {
  return (req, res, next) => {
    if (!schema) return next();
    const errors = [];
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      if (value !== undefined && rules.type && typeof value !== rules.type) {
        errors.push(`${field} must be of type ${rules.type}`);
      }
      if (value !== undefined && rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
        errors.push(`${field} must be at most ${rules.maxLength} characters`);
      }
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: 'VALIDATION_FAILED', messages: errors, correlationId: req.correlationId });
    }
    next();
  };
}

module.exports = { correlationMiddleware, securityHeaders, corsMiddleware, requestLogger, errorHandler, inputValidator };
