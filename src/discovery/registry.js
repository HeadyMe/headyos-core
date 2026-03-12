'use strict';

const http = require('http');
const https = require('https');

/**
 * ServiceRegistry — tracks known peer nodes and their health.
 * Supports both push-based registration and pull-based health probes.
 */
class ServiceRegistry {
  constructor({ logger, metrics, config } = {}) {
    this.logger = logger;
    this.metrics = metrics;
    this.config = config;
    this.peers = new Map();       // nodeId -> { url, role, tags, capabilities, lastSeen, healthy }
    this._probeInterval = null;
    this._heartbeatInterval = null;
  }

  /** Register a peer node (push-based or from external registry). */
  register(nodeId, { url, role = 'worker', tags = [], capabilities = [] }) {
    this.peers.set(nodeId, {
      url, role, tags, capabilities,
      lastSeen: Date.now(),
      healthy: true,
      registeredAt: Date.now(),
    });
    this.metrics?.incr('discovery.peers_registered');
    this.logger?.info('Peer registered', { nodeId, url, role });
  }

  /** Deregister a peer. */
  deregister(nodeId) {
    if (this.peers.delete(nodeId)) {
      this.logger?.info('Peer deregistered', { nodeId });
    }
  }

  /** Get healthy peers, optionally filtered by role or capability. */
  resolve({ role, capability } = {}) {
    const results = [];
    for (const [id, peer] of this.peers) {
      if (!peer.healthy) continue;
      if (role && peer.role !== role) continue;
      if (capability && !peer.capabilities.includes(capability)) continue;
      results.push({ id, ...peer });
    }
    return results;
  }

  /** Start background health probing of all registered peers. */
  startProbing(intervalMs) {
    this._probeInterval = setInterval(() => this._probeAll(), intervalMs);
    this._probeInterval.unref();
    this.logger?.info('Discovery probing started', { intervalMs });
  }

  /** Start heartbeat announcements to an external registry URL. */
  startHeartbeat(selfInfo, registryUrl, intervalMs) {
    if (!registryUrl) return;
    this._heartbeatInterval = setInterval(() => {
      this._announce(selfInfo, registryUrl).catch(err => {
        this.logger?.warn('Heartbeat failed', { registryUrl, error: err.message });
      });
    }, intervalMs);
    this._heartbeatInterval.unref();
    // Immediate first heartbeat
    this._announce(selfInfo, registryUrl).catch(() => {});
    this.logger?.info('Heartbeat started', { registryUrl, intervalMs });
  }

  async _probeAll() {
    for (const [id, peer] of this.peers) {
      try {
        const healthy = await this._healthCheck(peer.url);
        peer.healthy = healthy;
        if (healthy) peer.lastSeen = Date.now();
        else this.logger?.warn('Peer unhealthy', { nodeId: id, url: peer.url });
      } catch {
        peer.healthy = false;
        this.logger?.warn('Peer probe failed', { nodeId: id });
      }
    }
    this.metrics?.gauge('discovery.healthy_peers', this.resolve().length);
  }

  async _healthCheck(baseUrl) {
    return new Promise((resolve) => {
      const url = new URL('/health', baseUrl);
      const client = url.protocol === 'https:' ? https : http;
      const req = client.get(url, { timeout: 5000 }, (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  }

  async _announce(selfInfo, registryUrl) {
    const body = JSON.stringify(selfInfo);
    const url = new URL('/register', registryUrl);
    const client = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = client.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 5000,
      }, (res) => { res.resume(); resolve(); });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body);
      req.end();
    });
  }

  async shutdown() {
    if (this._probeInterval) clearInterval(this._probeInterval);
    if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);
    this.peers.clear();
    this.logger?.info('ServiceRegistry shut down');
  }

  status() {
    const byRole = {};
    for (const peer of this.peers.values()) {
      byRole[peer.role] = (byRole[peer.role] || 0) + 1;
    }
    return {
      totalPeers: this.peers.size,
      healthyPeers: this.resolve().length,
      byRole,
    };
  }
}

module.exports = { ServiceRegistry };
