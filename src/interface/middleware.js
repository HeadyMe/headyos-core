'use strict';

const crypto = require('crypto');

function correlationId(req, res, next) {
  req.correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
}

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

function requestLogger(logger) {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info('request', {
        method: req.method, url: req.originalUrl, status: res.statusCode,
        duration: Date.now() - start, correlationId: req.correlationId,
      });
    });
    next();
  };
}

function errorHandler(logger) {
  return (err, _req, res, _next) => {
    if (err.operational) {
      res.status(err.statusCode).json(err.toJSON());
    } else {
      logger.error('Unhandled error', { error: err.message, stack: err.stack });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
  };
}

function shutdownGuard(kernel) {
  return (req, res, next) => {
    if (kernel.shuttingDown) {
      return res.status(503).json({ error: 'SHUTDOWN_IN_PROGRESS', message: 'Service is shutting down' });
    }
    next();
  };
}

module.exports = { correlationId, securityHeaders, requestLogger, errorHandler, shutdownGuard };
