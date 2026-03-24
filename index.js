'use strict';

const { createApp } = require('./src/app');

const { app, kernel } = createApp();

const server = app.listen(kernel.config.PORT, () => {
  kernel.logger.info('HeadyOS Core listening', { port: kernel.config.PORT, env: kernel.config.NODE_ENV });
});

function gracefulShutdown(signal) {
  kernel.logger.info('Shutdown signal received', { signal });
  server.close(async () => {
    await kernel.shutdown();
    process.exit(0);
  });
  setTimeout(() => {
    kernel.logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, kernel.config.SHUTDOWN_TIMEOUT_MS);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
