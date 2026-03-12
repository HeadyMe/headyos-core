'use strict';

const SCHEMA = {
  PORT:               { type: 'number',  default: 8080,     min: 1, max: 65535 },
  NODE_ENV:           { type: 'string',  default: 'production', allowed: ['production', 'staging', 'development', 'test'] },
  LOG_LEVEL:          { type: 'string',  default: 'info',   allowed: ['debug', 'info', 'warn', 'error'] },
  CORS_ORIGINS:       { type: 'csv',     default: [] },
  MAX_CONCURRENCY:    { type: 'number',  default: 10,       min: 1, max: 1000 },
  TASK_TIMEOUT_MS:    { type: 'number',  default: 30000,    min: 1000, max: 600000 },
  NODE_POOL_SIZE:     { type: 'number',  default: 5,        min: 1, max: 100 },
  NODE_IDLE_TTL_MS:   { type: 'number',  default: 60000,    min: 5000, max: 3600000 },
  MEMORY_ADAPTER:     { type: 'string',  default: 'in-memory', allowed: ['in-memory', 'redis', 'postgres'] },
  METRICS_ENABLED:    { type: 'boolean', default: true },
  SHUTDOWN_TIMEOUT_MS:{ type: 'number',  default: 10000,    min: 1000, max: 60000 },
  NODE_ROLE:          { type: 'string',  default: 'worker', allowed: ['worker', 'coordinator', 'gateway', 'hybrid'] },
  NODE_ID:            { type: 'string',  default: '' },
  NODE_TAGS:          { type: 'csv',     default: [] },
  DISCOVERY_ENABLED:  { type: 'boolean', default: false },
  DISCOVERY_INTERVAL_MS: { type: 'number', default: 15000, min: 5000, max: 300000 },
  DISCOVERY_REGISTRY_URL: { type: 'string', default: '' },
  REMOTE_WORKER_URLS: { type: 'csv',     default: [] },
  HEALTH_CHECK_INTERVAL_MS: { type: 'number', default: 10000, min: 1000, max: 60000 },
};

function parseValue(key, raw, spec) {
  if (raw === undefined || raw === '') return spec.default;
  switch (spec.type) {
    case 'number': {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new Error(`Config ${key}: expected number, got "${raw}"`);
      if (spec.min !== undefined && n < spec.min) throw new Error(`Config ${key}: ${n} below min ${spec.min}`);
      if (spec.max !== undefined && n > spec.max) throw new Error(`Config ${key}: ${n} above max ${spec.max}`);
      return n;
    }
    case 'boolean':
      return raw === 'true' || raw === '1';
    case 'csv':
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    case 'string':
      if (spec.allowed && !spec.allowed.includes(raw)) {
        throw new Error(`Config ${key}: "${raw}" not in [${spec.allowed.join(', ')}]`);
      }
      return raw;
    default:
      return raw;
  }
}

function loadConfig(env = process.env) {
  const config = {};
  for (const [key, spec] of Object.entries(SCHEMA)) {
    config[key] = parseValue(key, env[key], spec);
  }
  // Generate NODE_ID if not provided
  if (!config.NODE_ID) {
    config.NODE_ID = `${config.NODE_ROLE}-${process.pid}-${Date.now().toString(36)}`;
  }
  return Object.freeze(config);
}

module.exports = { loadConfig, SCHEMA };
