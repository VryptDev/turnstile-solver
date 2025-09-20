const CustomLogger = require('./logger');
const loadConfig = require('./config');
const TurnstileAPIServer = require('./server');

const config = loadConfig();
const browserTypes = ['chromium', 'firefox', 'webkit'];

if (!browserTypes.includes(config.browserType)) {
  CustomLogger.error(`Unknown browser type: ${config.browserType}`);
  process.exit(1);
}

if (config.headless && !config.useragent && config.browserType !== 'webkit') {
  CustomLogger.error('You must specify a User-Agent when using headless mode');
  process.exit(1);
}

const server = new TurnstileAPIServer(config);

process.on('SIGINT', async () => {
  CustomLogger.info('SIGINT received, shutting down...');
  await server.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  CustomLogger.info('SIGTERM received, shutting down...');
  await server.cleanup();
  process.exit(0);
});

server.start(config.host, config.port);
