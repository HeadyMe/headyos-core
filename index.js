'use strict';

const { Kernel } = require('./src/kernel');
const { createApp } = require('./src/app');

async function main() {
  const kernel = new Kernel();
  const app = createApp(kernel);
  const port = kernel.config.PORT;

  await kernel.boot();

  const server = app.listen(port, () => {
    kernel.logger.info(`HeadyOS listening on port ${port}`, {
      nodeId: kernel.config.NODE_ID, role: kernel.config.NODE_ROLE, env: kernel.config.NODE_ENV,
    });
  });

  const shutdown = async (signal) => {
    kernel.logger.info(`Received ${signal}, shutting down`);
    server.close();
    await kernel.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    kernel.logger.error('Unhandled rejection', { error: err?.message, stack: err?.stack });
  });
  process.on('uncaughtException', (err) => {
    kernel.logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    shutdown('uncaughtException');
  });
}

main().catch((err) => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});
