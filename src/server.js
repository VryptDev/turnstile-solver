const express = require('express');
const { chromium, firefox, webkit } = require('playwright');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs-extra');

const CustomLogger = require('./logger');
const { loadResults, saveResults } = require('./utils/fileStore');
const setupRoutes = require('./routes');

class TurnstileAPIServer {
  constructor(options) {
    this.app = express();
    this.debug = options.debug || false;
    this.results = loadResults();
    this.browserType = options.browserType || 'chromium';
    this.headless = options.headless !== false;
    this.useragent = options.useragent;
    this.threadCount = options.thread || 1;
    this.proxySupport = options.proxy || false;
    this.browserPool = [];
    this.busyBrowsers = new Set();
    this.browserArgs = [];

    if (this.useragent) this.browserArgs.push(`--user-agent=${this.useragent}`);

    this.setupMiddleware();
    setupRoutes(this);
  }

  static HTML_TEMPLATE = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Turnstile Solver</title>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async></script>
        <script>
            async function fetchIP() {
                try {
                    const response = await fetch('https://api64.ipify.org?format=json');
                    const data = await response.json();
                    document.getElementById('ip-display').innerText = \`Your IP: \${data.ip}\`;
                } catch (error) {
                    console.error('Error fetching IP:', error);
                    document.getElementById('ip-display').innerText = 'Failed to fetch IP';
                }
            }
            window.onload = fetchIP;
        </script>
    </head>
    <body>
        <!-- cf turnstile -->
        <p id="ip-display">Fetching your IP...</p>
    </body>
    </html>
  `;

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  async initializeBrowserPool() {
    CustomLogger.info("Starting browser initialization");
    try {
      let browser;
      for (let i = 0; i < this.threadCount; i++) {
        switch (this.browserType) {
          case 'chromium':
            browser = await chromium.launch({ headless: this.headless, args: this.browserArgs });
            break;
          case 'firefox':
            browser = await firefox.launch({ headless: this.headless, args: this.browserArgs });
            break;
          case 'webkit':
            browser = await webkit.launch({ headless: this.headless, args: this.browserArgs });
            break;
          default:
            throw new Error(`Unsupported browser type: ${this.browserType}`);
        }

        this.browserPool.push({ id: i + 1, browser });
        if (this.debug) CustomLogger.success(`Browser ${i + 1} initialized successfully`);
      }
      CustomLogger.success(`Browser pool initialized with ${this.browserPool.length} browsers`);
    } catch (error) {
      CustomLogger.error(`Failed to initialize browser: ${error.message}`);
      throw error;
    }
  }

  async getAvailableBrowser() {
    while (true) {
      const availableBrowser = this.browserPool.find(b => !this.busyBrowsers.has(b.id));
      if (availableBrowser) {
        this.busyBrowsers.add(availableBrowser.id);
        return availableBrowser;
      }
      await new Promise(r => setTimeout(r, 100));
    }
  }

  releaseBrowser(browserId) {
    this.busyBrowsers.delete(browserId);
  }

  async solveTurnstile(taskId, url, sitekey, action = null, cdata = null) {
    let proxy = null;
    const browserInstance = await this.getAvailableBrowser();
    const startTime = Date.now();

    try {
      if (this.proxySupport) {
        const proxyFilePath = path.join(__dirname, '../../proxies.txt');
        if (fs.existsSync(proxyFilePath)) {
          const proxies = fs.readFileSync(proxyFilePath, 'utf8')
            .split('\n').map(l => l.trim()).filter(Boolean);
          proxy = proxies[Math.floor(Math.random() * proxies.length)];
        }
      }

      const contextOptions = {};
      if (proxy) {
        const parts = proxy.split(':');
        if (parts.length >= 2) {
          contextOptions.proxy = {
            server: parts.length === 2 ? `http://${proxy}` : `${parts[0]}://${parts[1]}:${parts[2]}`
          };
          if (parts.length === 5) {
            contextOptions.proxy.username = parts[3];
            contextOptions.proxy.password = parts[4];
          }
        }
      }

      const context = await browserInstance.browser.newContext(contextOptions);
      const page = await context.newPage();

      const urlWithSlash = url.endsWith('/') ? url : url + '/';
      let turnstileDiv = `<div class="cf-turnstile" style="background: white;" data-sitekey="${sitekey}"`;
      if (action) turnstileDiv += ` data-action="${action}"`;
      if (cdata) turnstileDiv += ` data-cdata="${cdata}"`;
      turnstileDiv += '></div>';

      const pageData = TurnstileAPIServer.HTML_TEMPLATE.replace("<!-- cf turnstile -->", turnstileDiv);

      await page.route(urlWithSlash, route => {
        route.fulfill({ body: pageData, status: 200, contentType: 'text/html' });
      });

      await page.goto(urlWithSlash);
      await page.locator("div.cf-turnstile").evaluate(el => el.style.width = '70px');

      let solved = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const turnstileResponse = await page.inputValue("[name=cf-turnstile-response]", { timeout: 2000 });
          if (!turnstileResponse) {
            await page.locator("div.cf-turnstile").click({ timeout: 1000 });
            await new Promise(r => setTimeout(r, 500));
          } else {
            const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(3);
            CustomLogger.success(`Browser ${browserInstance.id}: Solved in ${elapsedTime}s`);
            this.results[taskId] = { value: turnstileResponse, elapsed_time: parseFloat(elapsedTime) };
            saveResults(this.results);
            solved = true;
            break;
          }
        } catch { /* retry */ }
      }

      if (!solved) {
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(3);
        this.results[taskId] = { value: "CAPTCHA_FAIL", elapsed_time: parseFloat(elapsedTime) };
        if (this.debug) CustomLogger.error(`Browser ${browserInstance.id}: Failed in ${elapsedTime}s`);
      }

      await context.close();
    } catch (error) {
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(3);
      this.results[taskId] = { value: "CAPTCHA_FAIL", elapsed_time: parseFloat(elapsedTime) };
      if (this.debug) CustomLogger.error(`Browser ${browserInstance.id}: Error: ${error.message}`);
    } finally {
      this.releaseBrowser(browserInstance.id);
    }
  }

  async processTurnstile(req, res) {
    const { url, sitekey, action, cdata } = req.query;
    if (!url || !sitekey) {
      return res.status(400).json({ status: "error", error: "Both 'url' and 'sitekey' are required" });
    }
    const taskId = uuidv4();
    this.results[taskId] = "CAPTCHA_NOT_READY";
    this.solveTurnstile(taskId, url, sitekey, action, cdata).catch(err =>
      CustomLogger.error(`Background solve error: ${err.message}`)
    );
    return res.status(202).json({ task_id: taskId });
  }

  async getResult(req, res) {
    const taskId = req.query.id;
    if (!taskId || !(taskId in this.results)) {
      return res.status(400).json({ status: "error", error: "Invalid task ID" });
    }
    const result = this.results[taskId];
    let statusCode = (typeof result === 'object' && result.value === "CAPTCHA_FAIL") ? 422 : 200;
    return res.status(statusCode).json(result);
  }

  async indexHandler(req, res) {
    const filePath = path.join(process.cwd(), "src", "views", "index.html");
    const html = fs.readFileSync(filePath, "utf-8");
    res.send(html);
  }

  async start(host, port) {
    try {
      await this.initializeBrowserPool();
      this.app.listen(port, host, () => {
        CustomLogger.success(`Server running on http://${host}:${port}`);
      });
    } catch (error) {
      CustomLogger.error(`Failed to start server: ${error.message}`);
      process.exit(1);
    }
  }

  async cleanup() {
    CustomLogger.info("Shutting down browser pool...");
    for (const browserInstance of this.browserPool) {
      try { await browserInstance.browser.close(); }
      catch (err) { CustomLogger.error(`Error closing browser ${browserInstance.id}: ${err.message}`); }
    }
    CustomLogger.info("Browser pool shutdown complete");
  }
}

module.exports = TurnstileAPIServer;
