# Turnstile API Server - Node.js Express Version

A complete Node.js Express.js implementation of the Turnstile Solver API using Playwright for browser automation.

## Features

- **Express.js Framework**: Fast, unopinionated web framework for Node.js
- **Playwright Integration**: Cross-browser automation with Chromium, Firefox, and WebKit
- **Multi-threading Support**: Configurable browser pool for concurrent processing
- **Proxy Support**: Built-in proxy rotation capability
- **Custom Logging**: Colored console logging with timestamps
- **Graceful Shutdown**: Proper cleanup of browser instances
- **REST API**: Simple GET endpoints for solving and retrieving results
- **Result Persistence**: Automatic saving/loading of results to/from JSON file

## Installation

1. **Clone or download the project files**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Install Playwright browsers:**
   ```bash
   npx playwright install
   ```

## Usage

### Basic Usage
```bash
npm start
```

### Development Mode (with auto-restart)
```bash
npm run dev
```

### Command Line Options

```bash
node server.js [options]

Options:
  --headless <value>      Run browser in headless mode (default: "true")
  --useragent <value>     Custom User-Agent string
  --debug <value>         Enable debug mode (default: "false")  
  --browser-type <value>  Browser type: chromium, firefox, webkit (default: "chromium")
  --thread <value>        Number of browser threads (default: "1")
  --proxy <value>         Enable proxy support (default: "false")
  --host <value>          Server host (default: "127.0.0.1")
  --port <value>          Server port (default: "5000")
```

### Examples

**Basic server with debug mode:**
```bash
node server.js --debug true --thread 3
```

**Headless mode with custom user agent:**
```bash
node server.js --headless true --useragent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
```

**With proxy support and multiple threads:**
```bash
node server.js --proxy true --thread 5 --browser-type firefox
```

## API Endpoints

### 1. Solve Turnstile Challenge
**GET** `/turnstile`

**Parameters:**
- `url` (required): The URL where Turnstile is to be validated
- `sitekey` (required): The site key for Turnstile
- `action` (optional): Turnstile action parameter
- `cdata` (optional): Custom data parameter

**Example:**
```
GET /turnstile?url=https://example.com&sitekey=your-site-key
```

**Response:**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 2. Get Result
**GET** `/result`

**Parameters:**
- `id` (required): Task ID returned from `/turnstile` endpoint

**Example:**
```
GET /result?id=550e8400-e29b-41d4-a716-446655440000
```

**Success Response:**
```json
{
  "value": "turnstile-response-token",
  "elapsed_time": 2.531
}
```

**Failure Response:**
```json
{
  "value": "CAPTCHA_FAIL",
  "elapsed_time": 10.0
}
```

### 3. API Documentation
**GET** `/`

Returns an HTML page with API documentation.

## Configuration Files

### Proxy Support
Create a `proxies.txt` file in the project root with one proxy per line:

```
http://proxy1:port
http://username:password@proxy2:port
socks5://proxy3:port
https://user:pass@proxy4:port
```

### Results Storage
Results are automatically saved to `results.json` and persist between server restarts.

## Browser Support

- **Chromium** (default): Most compatible, recommended
- **Firefox**: Good alternative with different fingerprint
- **WebKit**: Safari engine, lighter resource usage

## Error Handling

The server includes comprehensive error handling:
- Invalid parameters return 400 status
- Failed captcha solving returns 422 status  
- Server errors return 500 status
- Graceful shutdown on SIGINT/SIGTERM

## Logging

Color-coded logging with timestamps:
- **DEBUG** (Magenta): Detailed operation info
- **INFO** (Blue): General information
- **SUCCESS** (Green): Successful operations  
- **WARNING** (Yellow): Warning messages
- **ERROR** (Red): Error messages

## Performance Notes

- **Multi-threading**: Use `--thread` option to run multiple browsers concurrently
- **Headless Mode**: Reduces resource usage but requires custom user agent
- **Proxy Rotation**: Helps avoid rate limiting when enabled
- **Browser Pool**: Browsers are reused to improve performance

## Differences from Python Version

1. **Framework**: Uses Express.js instead of Quart
2. **Browser Automation**: Uses Playwright Node.js instead of Python
3. **Async Handling**: Uses Node.js async/await patterns
4. **Process Management**: Uses Node.js process signals for cleanup
5. **Configuration**: Uses Commander.js for CLI argument parsing

## License

MIT License - see original project for attribution details.

## Contributing

This is a direct port of the Python version. Please refer to the original repository for contribution guidelines.
