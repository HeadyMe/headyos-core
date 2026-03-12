'use strict';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

class Logger {
  constructor({ level = 'info', context = {} } = {}) {
    this.level = level;
    this.context = context;
  }

  child(extra) {
    return new Logger({ level: this.level, context: { ...this.context, ...extra } });
  }

  _write(level, msg, data = {}) {
    if (LEVELS[level] < LEVELS[this.level]) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...this.context,
      ...data,
    };
    const out = level === 'error' ? process.stderr : process.stdout;
    out.write(JSON.stringify(entry) + '\n');
  }

  debug(msg, data) { this._write('debug', msg, data); }
  info(msg, data)  { this._write('info', msg, data); }
  warn(msg, data)  { this._write('warn', msg, data); }
  error(msg, data) { this._write('error', msg, data); }
}

module.exports = { Logger, LEVELS };
