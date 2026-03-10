# HeadyOS Core

Latent operating system control plane with capability-based routing, liquid node execution, and async orchestration.

## Architecture

```
Interface (HTTP API)
    |
Gateway (CapabilityRouter + AsyncCoordinator)
    |
Execution (LiquidNode pool with spawn/route/retire lifecycle)
    |
Memory (pluggable adapters: in-memory, redis, postgres)
    |
Observability (structured JSON logging, correlation IDs, metrics)
```

## Quick Start

```bash
npm install
npm start        # Starts on PORT 8080 (configurable)
npm test         # Runs all tests
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/readiness` | Readiness probe |
| GET | `/status` | System status with pool and coordinator info |
| GET | `/capabilities` | Registered task handler capabilities |
| GET | `/metrics` | Runtime metrics snapshot |
| GET | `/docs` | API documentation |
| POST | `/tasks` | Submit a single task |
| POST | `/tasks/batch` | Submit a batch of tasks (parallel execution) |
| POST | `/pipeline` | Execute an orchestration pipeline |

## Configuration

All configuration is via environment variables with validated defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP listen port |
| `NODE_ENV` | `production` | Environment |
| `LOG_LEVEL` | `info` | Logging level (debug/info/warn/error) |
| `CORS_ORIGINS` | `` | Comma-separated allowed origins |
| `MAX_CONCURRENCY` | `10` | Max concurrent tasks |
| `TASK_TIMEOUT_MS` | `30000` | Default task timeout |
| `NODE_POOL_SIZE` | `5` | Liquid node pool capacity |
| `NODE_IDLE_TTL_MS` | `60000` | Idle node reap threshold |
| `MEMORY_ADAPTER` | `in-memory` | State adapter (in-memory/redis/postgres) |
| `METRICS_ENABLED` | `false` | Enable metrics collection |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Graceful shutdown timeout |

## Task Submission

```bash
curl -X POST https://headyos.com/tasks \
  -H "Content-Type: application/json" \
  -d '{"type":"echo","payload":{"message":"hello"}}'
```

## Docker

```bash
docker build -t headyos-core .
docker run -p 8080:8080 headyos-core
```

## License

MIT - Heady Systems LLC
