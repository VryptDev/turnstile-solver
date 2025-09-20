const { Command } = require('commander');

function loadConfig() {
  const program = new Command();

  program
    .option('--headless <value>', 'Run the browser in headless mode', 'true')
    .option('--useragent <value>', 'Specify a custom User-Agent string')
    .option('--debug <value>', 'Enable debug mode', 'false')
    .option('--browser-type <value>', 'Browser type (chromium, firefox, webkit)', 'chromium')
    .option('--thread <value>', 'Number of browser threads', '1')
    .option('--proxy <value>', 'Enable proxy support', 'false')
    .option('--host <value>', 'API host', '127.0.0.1')
    .option('--port <value>', 'API port', '5000');

  program.parse();
  const opts = program.opts();

  return {
    headless: opts.headless === 'true',
    useragent: opts.useragent,
    debug: opts.debug === 'true',
    browserType: opts.browserType,
    thread: parseInt(opts.thread),
    proxy: opts.proxy === 'true',
    host: opts.host,
    port: parseInt(opts.port)
  };
}

module.exports = loadConfig;
