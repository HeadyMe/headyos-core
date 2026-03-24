'use strict';

const { OperationalError } = require('../observability/errors');

const SCHEMA = {
  PORT: { type: 'number', default: 8080, min: 1, max: 65535 },
  NODE_ENV: { type: 'string', default: 'production', allowed: ['production', 'staging', 'development', 'test'] },
  LOG_LEVEL: { type: 'string', default: 'info', allowed: ['debug', 'info', 'warn', 'error'] },
  CORS_ORIGINS: { type: 'csv', default: '' },
  MAX_CONCURRENCY: { type: 'number', default: 10, min: 1, max: 1000 },
  TASK_TIMEOUT_MS: { type: 'number', default: 30000, min: 1000, max: 600000 },
  NODE_POOL_SIZE: { type: 'number', default: 5, min: 1, max: 100 },
  NODE_IDLE_TTL_MS: { type: 'number', default: 60000, min: 5000, max: 3600000 },
  MEMORY_ADAPTER: { type: 'string', default: 'in-memory', allowed: ['in-memory', 'redis', 'postgres'] },
  METRICS_ENABLED: { type: 'boolean', default: false },
  SHUTDOWN_TIMEOUT_MS: { type: 'number', default: 10000, min: 1000, max: 60000 },
};

function parseValue(key, raw, spec) {
  if (raw === undefined || raw === '') {
    if (spec.default !== undefined) return spec.default;
    throw new OperationalError(`Missing required config: ${key}`, 'CONFIG_MISSING', { key });
  }
  switch (spec.type) {
    case 'number': {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new OperationalError(`Config ${key} must be a number`, 'CONFIG_INVALID', { key, raw });
      if (spec.min !== undefined && n < spec.min) throw new OperationalError(`Config ${key} must be >= ${spec.min}`, 'CONFIG_INVALID', { key, raw });
      if (spec.max !== undefined && n > spec.max) throw new OperationalError(`Config ${key} must be <= ${spec.max}`, 'CONFIG_INVALID', { key, raw });
      return n;
    }
    case 'boolean':
      return raw === 'true' || raw === '1';
    case 'csv':
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    case 'string':
      if (spec.allowed && !spec.allowed.includes(raw)) {
        throw new OperationalError(`Config ${key} must be one of: ${spec.allowed.join(', ')}`, 'CONFIG_INVALID', { key, raw });
      }
      return raw;
    default:
      return raw;
  }
}

function loadConfig(env = process.env) {
  const config = {};
  const errors = [];
  for (const [key, spec] of Object.entries(SCHEMA)) {
    try {
      config[key] = parseValue(key, env[key], spec);
    } catch (err) {
      errors.push(err.message);
    }
  }
  if (errors.length > 0) {
    throw new OperationalError(`Configuration validation failed:\n  ${errors.join('\n  ')}`, 'CONFIG_VALIDATION_FAILED', { errors });
  }
  return Object.freeze(config);
}

function getConfigSchema() {
  return { ...SCHEMA };
}

module.exports = { loadConfig, getConfigSchema, SCHEMA };
