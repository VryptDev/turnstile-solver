module.exports = function setupRoutes(serverInstance) {
  const app = serverInstance.app;

  app.get('/', serverInstance.indexHandler.bind(serverInstance));
  app.get('/turnstile', serverInstance.processTurnstile.bind(serverInstance));
  app.get('/result', serverInstance.getResult.bind(serverInstance));
};
