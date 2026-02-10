/**
 * SpeedCrawl Pro v16.0 - Logger (FIXED)
 * ✅ FIXED: Added support for enableDebug option
 * ✅ FIXED: Proper verbose level handling
 * Centralized logging with verbosity levels and formatting
 */

const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

class Logger {
  constructor(options = {}) {
    // Parse level properly (can be string or number)
    if (typeof options.level === 'string') {
      this.level = parseInt(options.level);
    } else {
      this.level = options.level || 1;
    }

    // Support enableDebug flag (overrides level)
    if (options.enableDebug === true) {
      this.level = 3; // Force debug level
    }

    this.outputDir = options.outputDir || process.cwd();
    this.enableFile = options.enableFile !== false;
    this.enableColors = options.enableColors !== false;
    this.debugEnabled = options.enableDebug || this.level >= 3;

    this.setupFileLogging();
    this.setupConsole();
  }

  setupFileLogging() {
    if (!this.enableFile) {
      return;
    }

    try {
      // Ensure output directory exists
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      this.errorLogPath = path.join(this.outputDir, 'speedcrawl-error.log');
      this.combinedLogPath = path.join(this.outputDir, 'speedcrawl-combined.log');

      // Create log files if they don't exist
      if (!fs.existsSync(this.errorLogPath)) {
        fs.writeFileSync(this.errorLogPath, '');
      }
      if (!fs.existsSync(this.combinedLogPath)) {
        fs.writeFileSync(this.combinedLogPath, '');
      }
    } catch (error) {
      // If file logging fails, disable it
      this.enableFile = false;
      console.warn('File logging disabled due to error:', error.message);
    }
  }

  setupConsole() {
    this.levelMap = {
      0: 'error',
      1: 'warn',
      2: 'info',
      3: 'debug'
    };
  }

  shouldLog(level) {
    const levels = { error: 0, warn: 1, info: 2, debug: 3, success: 2 };
    return levels[level] <= this.level;
  }

  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString().substr(11, 8);
    const prefix = `[${timestamp}]`;
    const fullMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;

    if (!this.enableColors) {
      return `${prefix} ${level.toUpperCase()} ${fullMessage}`;
    }

    switch (level) {
      case 'error':
        return `${chalk.gray(prefix)} ${chalk.red('ERROR')} ${fullMessage}`;
      case 'warn':
        return `${chalk.gray(prefix)} ${chalk.yellow('WARN')} ${fullMessage}`;
      case 'info':
        return `${chalk.gray(prefix)} ${chalk.blue('INFO')} ${fullMessage}`;
      case 'debug':
        return `${chalk.gray(prefix)} ${chalk.gray('DEBUG')} ${chalk.gray(fullMessage)}`;
      case 'success':
        return `${chalk.gray(prefix)} ${chalk.green('SUCCESS')} ${fullMessage}`;
      default:
        return `${chalk.gray(prefix)} ${fullMessage}`;
    }
  }

  // Built-in file logging
  writeToFile(level, message, ...args) {
    if (!this.enableFile) {
      return;
    }

    try {
      const timestamp = new Date().toISOString();
      const fullMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;

      // Create log entry (JSON format)
      const logEntry = {
        timestamp,
        level,
        message: fullMessage,
        args: args.length > 0 ? args : undefined
      };

      const logLine = JSON.stringify(logEntry) + '\n';

      // Write to combined log
      fs.appendFileSync(this.combinedLogPath, logLine);

      // Write errors to separate error log
      if (level === 'error') {
        fs.appendFileSync(this.errorLogPath, logLine);
      }
    } catch (error) {
      // Don't spam console if file logging fails
      if (this.enableFile) {
        console.warn('File logging failed:', error.message);
        this.enableFile = false; // Disable to prevent further errors
      }
    }
  }

  log(level, message, ...args) {
    if (this.shouldLog(level)) {
      console.log(this.formatMessage(level, message, ...args));
    }

    // Write to file (except 'success' which isn't a standard log level)
    if (this.enableFile && level !== 'success') {
      this.writeToFile(level, message, ...args);
    }
  }

  error(message, ...args) {
    this.log('error', message, ...args);
  }

  warn(message, ...args) {
    this.log('warn', message, ...args);
  }

  info(message, ...args) {
    this.log('info', message, ...args);
  }

  debug(message, ...args) {
    // Always respect debug flag
    if (this.debugEnabled || this.level >= 3) {
      this.log('debug', message, ...args);
    }
  }

  success(message, ...args) {
    this.log('success', message, ...args);
  }

  // Additional utility methods
  setLevel(level) {
    if (typeof level === 'string') {
      this.level = parseInt(level);
    } else {
      this.level = level;
    }
    this.debugEnabled = this.level >= 3;
  }

  getLevel() {
    return this.level;
  }

  enableDebugMode() {
    this.debugEnabled = true;
    this.level = 3;
  }

  disableDebugMode() {
    this.debugEnabled = false;
    if (this.level >= 3) {
      this.level = 2;
    }
  }

  isDebugEnabled() {
    return this.debugEnabled;
  }

  isFileLoggingEnabled() {
    return this.enableFile;
  }

  getLogPaths() {
    return {
      error: this.errorLogPath,
      combined: this.combinedLogPath
    };
  }

  // Clean up old logs (optional maintenance)
  rotateLogs(maxSizeMB = 10) {
    if (!this.enableFile) {
      return;
    }

    const maxBytes = maxSizeMB * 1024 * 1024;

    try {
      [this.errorLogPath, this.combinedLogPath].forEach(logPath => {
        if (fs.existsSync(logPath)) {
          const stats = fs.statSync(logPath);
          if (stats.size > maxBytes) {
            // Backup old log
            const backupPath = logPath + '.old';
            if (fs.existsSync(backupPath)) {
              fs.unlinkSync(backupPath);
            }
            fs.renameSync(logPath, backupPath);
            fs.writeFileSync(logPath, '');
            this.info(`Rotated log file: ${path.basename(logPath)}`);
          }
        }
      });
    } catch (error) {
      this.warn('Log rotation failed:', error.message);
    }
  }
}

module.exports = { Logger };
