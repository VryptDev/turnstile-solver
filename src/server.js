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
</head>
<body>
<!-- cf turnstile -->
</body>
</html>
`;

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  async initializeBrowserPool() {
    for (let i = 0; i < this.threadCount; i++) {
      let browser;
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
      if (this.debug) CustomLogger.success(`Browser ${i + 1} ready`);
    }
  }

  async getAvailableBrowser() {
    while (true) {
      const b = this.browserPool.find(x => !this.busyBrowsers.has(x.id));
      if (b) {
        this.busyBrowsers.add(b.id);
        return b;
      }
      await new Promise(r => setTimeout(r, 100));
    }
  }

  releaseBrowser(id) {
    this.busyBrowsers.delete(id);
  }

  async solveTurnstile(
    taskId,
    url,
    sitekey,
    action = null,
    cdata = null,
    cf_selector = "div.cf-turnstile"
  ) {
    const browserInstance = await this.getAvailableBrowser();
    const startTime = Date.now();
    let proxy = null;

    try {
      if (this.proxySupport) {
        const proxyFile = path.join(__dirname, '../../proxies.txt');
        if (fs.existsSync(proxyFile)) {
          const proxies = fs.readFileSync(proxyFile, 'utf8')
            .split('\n').map(l => l.trim()).filter(Boolean);
          proxy = proxies[Math.floor(Math.random() * proxies.length)];
        }
      }

      const contextOptions = {};
      if (proxy) {
        const p = proxy.split(':');
        contextOptions.proxy = {
          server: p.length === 2 ? `http://${proxy}` : `${p[0]}://${p[1]}:${p[2]}`
        };
        if (p.length === 5) {
          contextOptions.proxy.username = p[3];
          contextOptions.proxy.password = p[4];
        }
      }

      const context = await browserInstance.browser.newContext(contextOptions);
      const page = await context.newPage();

      let turnstileDiv = `<div class="cf-turnstile" data-sitekey="${sitekey}"`;
      if (action) turnstileDiv += ` data-action="${action}"`;
      if (cdata) turnstileDiv += ` data-cdata="${cdata}"`;
      turnstileDiv += `></div>`;

      const html = TurnstileAPIServer.HTML_TEMPLATE
        .replace("<!-- cf turnstile -->", turnstileDiv);

      const targetUrl = url.endsWith('/') ? url : url + '/';

      await page.route(targetUrl, route => {
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: html
        });
      });

      await page.goto(targetUrl);
      await page.waitForSelector(cf_selector, { timeout: 5000 });
      await page.locator(cf_selector).evaluate(el => el.style.width = '70px');

      let solved = false;

      for (let i = 0; i < 10; i++) {
        try {
          const token = await page.inputValue(
            "[name=cf-turnstile-response]",
            { timeout: 2000 }
          );

          if (!token) {
            await page.locator(cf_selector).click({ timeout: 1000 });
            await new Promise(r => setTimeout(r, 500));
          } else {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);
            this.results[taskId] = {
              value: token,
              elapsed_time: Number(elapsed)
            };
            saveResults(this.results);
            solved = true;
            break;
          }
        } catch {}
      }

      if (!solved) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);
        this.results[taskId] = {
          value: "CAPTCHA_FAIL",
          elapsed_time: Number(elapsed)
        };
      }

      await context.close();
    } catch (e) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);
      this.results[taskId] = {
        value: "CAPTCHA_FAIL",
        elapsed_time: Number(elapsed)
      };
      if (this.debug) CustomLogger.error(e.message);
    } finally {
      this.releaseBrowser(browserInstance.id);
    }
  }

  async indexHandler(req, res) {
    const filePath = path.join(process.cwd(), "src", "views", "index.html");
    const html = fs.readFileSync(filePath, "utf-8");
    res.send(html);
  }

  async processTurnstile(req, res) {
    const { url, sitekey, action, cdata, cf_selector } = req.query;

    if (!url || !sitekey) {
      return res.status(400).json({
        status: "error",
        error: "url dan sitekey wajib"
      });
    }

    const taskId = uuidv4();
    this.results[taskId] = "CAPTCHA_NOT_READY";

    this.solveTurnstile(
      taskId,
      url,
      sitekey,
      action,
      cdata,
      cf_selector || "div.cf-turnstile"
    ).catch(() => {});

    return res.status(202).json({ task_id: taskId });
  }

  async getResult(req, res) {
    const id = req.query.id;
    if (!id || !(id in this.results)) {
      return res.status(400).json({ error: "Invalid task id" });
    }
    return res.json(this.results[id]);
  }

  async start(host, port) {
    await this.initializeBrowserPool();
    this.app.listen(port, host, () => {
      CustomLogger.success(`Server running http://${host}:${port}`);
    });
  }

  async cleanup() {
    for (const b of this.browserPool) {
      await b.browser.close().catch(() => {});
    }
  }
}

module.exports = TurnstileAPIServer;
