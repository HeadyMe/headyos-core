'use strict';

const http = require('http');
const https = require('https');

/**
 * RemoteWorkerClient — dispatches tasks to remote LiquidNode peers over HTTP.
 * Used when the local pool is full or a specific capability is only available remotely.
 */
class RemoteWorkerClient {
  constructor({ logger, metrics, timeoutMs = 30000 } = {}) {
    this.logger = logger;
    this.metrics = metrics;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Dispatch a task to a remote peer.
   * @param {string} peerUrl - base URL of the remote node
   * @param {object} task - serialized task object
   * @returns {Promise<object>} - the result from the remote execution
   */
  async dispatch(peerUrl, task) {
    const body = JSON.stringify({ type: task.type, payload: task.payload, correlationId: task.correlationId });
    const url = new URL('/tasks', peerUrl);
    const client = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const req = client.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: this.timeoutMs,
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              this.metrics?.incr('remote_worker.dispatched');
              resolve(parsed);
            } else {
              this.metrics?.incr('remote_worker.errors');
              reject(new Error(parsed.error || `Remote returned ${res.statusCode}`));
            }
          } catch {
            reject(new Error('Invalid JSON from remote worker'));
          }
        });
      });
      req.on('error', (err) => {
        this.metrics?.incr('remote_worker.errors');
        reject(err);
      });
      req.on('timeout', () => {
        req.destroy();
        this.metrics?.incr('remote_worker.timeouts');
        reject(new Error('Remote worker timeout'));
      });
      req.write(body);
      req.end();
    });
  }
}

module.exports = { RemoteWorkerClient };
