const colors = require('colors');

colors.setTheme({
  debug: 'magenta',
  info: 'blue',
  success: 'green',
  warn: 'yellow',
  error: 'red'
});

class CustomLogger {
  static formatMessage(level, message) {
    const timestamp = new Date().toLocaleTimeString();
    return `[${timestamp}] [${level}] -> ${message}`;
  }

  static debug(msg) { console.log(this.formatMessage('DEBUG'.debug, msg)); }
  static info(msg) { console.log(this.formatMessage('INFO'.info, msg)); }
  static success(msg) { console.log(this.formatMessage('SUCCESS'.success, msg)); }
  static warn(msg) { console.log(this.formatMessage('WARNING'.warn, msg)); }
  static error(msg) { console.log(this.formatMessage('ERROR'.error, msg)); }
}

module.exports = CustomLogger;
