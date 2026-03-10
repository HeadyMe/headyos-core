'use strict';

const crypto = require('crypto');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function createLogger(opts = {}) {
  const minLevel = LEVELS[opts.level || 'info'] || 0;
  const service = opts.service || 'headyos-core';
  const stream = opts.stream || process.stdout;

  function write(level, message, meta = {}) {
    if (LEVELS[level] < minLevel) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
      ...meta,
    };
    if (meta.correlationId) entry.correlationId = meta.correlationId;
    stream.write(JSON.stringify(entry) + '\n');
  }

  return {
    debug: (msg, meta) => write('debug', msg, meta),
    info: (msg, meta) => write('info', msg, meta),
    warn: (msg, meta) => write('warn', msg, meta),
    error: (msg, meta) => write('error', msg, meta),
    child(extra) {
      return createLogger({ ...opts, _extraMeta: { ...opts._extraMeta, ...extra } });
    },
  };
}

function generateCorrelationId() {
  return crypto.randomUUID();
}

module.exports = { createLogger, generateCorrelationId, LEVELS };
