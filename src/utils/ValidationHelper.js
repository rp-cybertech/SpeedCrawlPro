/**
 * SpeedCrawl Pro v14.0 - Validation Helper (COMPLETE VERSION)
 * Input sanitization and configuration validation
 */

const validator = require('validator');

class ValidationHelper {
  static validateConfig(config) {
    const errors = [];
    const warnings = [];

    try {
      // Validate URL
      if (!config.url) {
        errors.push('URL is required');
      } else if (!this.isValidURL(config.url)) {
        errors.push('Invalid URL format');
      }

      // Validate numeric ranges
      if (config.maxDepth) {
        const depth = parseInt(config.maxDepth);
        if (isNaN(depth) || depth < 1 || depth > 10) {
          errors.push('Max depth must be between 1 and 10');
        }
      }

      if (config.maxPages) {
        const pages = parseInt(config.maxPages);
        if (isNaN(pages) || pages < 1 || pages > 10000) {
          errors.push('Max pages must be between 1 and 10000');
        }
      }

      if (config.timeout) {
        const timeout = parseInt(config.timeout);
        if (isNaN(timeout) || timeout < 1000 || timeout > 300000) {
          warnings.push('Timeout should be between 1000ms and 300000ms');
        }
      }

      // Validate proxy URL if provided
      if (config.proxy && !this.isValidURL(config.proxy)) {
        errors.push('Invalid proxy URL format');
      }

      // Validate output formats
      if (config.formats) {
        const validFormats = ['json', 'har', 'http', 'jsonl'];
        const formats = Array.isArray(config.formats) ? config.formats : config.formats.split(',');
        const invalidFormats = formats.filter(f => !validFormats.includes(f.trim().toLowerCase()));
        if (invalidFormats.length > 0) {
          errors.push(`Invalid output formats: ${invalidFormats.join(', ')}`);
        }
      }

      // Validate CAPTCHA configuration
      if (config.captchaService) {
        const validServices = ['2captcha', 'anticaptcha'];
        if (!validServices.includes(config.captchaService.toLowerCase())) {
          errors.push(`Invalid CAPTCHA service. Must be one of: ${validServices.join(', ')}`);
        }
        if (config.captchaService && !config.captchaKey) {
          warnings.push('CAPTCHA service specified but no API key provided');
        }
      }

      // Validate viewport
      if (config.viewport) {
        if (!config.viewport.width || !config.viewport.height) {
          errors.push('Viewport must have both width and height');
        } else if (config.viewport.width < 320 || config.viewport.height < 240) {
          warnings.push('Very small viewport may cause issues');
        }
      }

      // Validate file paths
      if (config.inputData && typeof config.inputData === 'string') {
        if (!this.isValidFilePath(config.inputData)) {
          errors.push('Invalid input file path');
        }
      }

      return {
        isValid: errors.length === 0,
        errors: errors,
        warnings: warnings
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${error.message}`],
        warnings: []
      };
    }
  }

  static isValidURL(url) {
    try {
      const urlObj = new URL(url);
      return ['http:', 'https:'].includes(urlObj.protocol);
    } catch {
      return false;
    }
  }

  static isValidFilePath(filePath) {
    try {
      // Basic path validation
      return typeof filePath === 'string' && filePath.length > 0 && filePath.length < 260;
    } catch {
      return false;
    }
  }

  static sanitizeInput(input, type = 'string') {
    if (input === null || input === undefined) {
      return null;
    }

    switch (type) {
      case 'string':
        return String(input).trim();
      
      case 'url':
        const sanitized = String(input).trim();
        if (!this.isValidURL(sanitized)) {
          throw new Error('Invalid URL');
        }
        return sanitized;
      
      case 'number':
        const num = parseInt(input);
        if (isNaN(num)) {
          throw new Error('Invalid number');
        }
        return num;
      
      case 'boolean':
        if (typeof input === 'boolean') return input;
        if (typeof input === 'string') {
          return ['true', '1', 'yes', 'on'].includes(input.toLowerCase());
        }
        return Boolean(input);
      
      case 'array':
        if (Array.isArray(input)) return input;
        if (typeof input === 'string') {
          return input.split(',').map(s => s.trim()).filter(s => s.length > 0);
        }
        return [input];
      
      default:
        return input;
    }
  }

  static validateFormData(formData) {
    const errors = [];

    if (!formData || typeof formData !== 'object') {
      return { isValid: false, errors: ['Form data must be an object'] };
    }

    // Check for dangerous inputs
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /data:text\/html/i
    ];

    Object.entries(formData).forEach(([key, value]) => {
      if (typeof value === 'string') {
        dangerousPatterns.forEach(pattern => {
          if (pattern.test(value)) {
            errors.push(`Potentially dangerous content in field "${key}"`);
          }
        });
      }
    });

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  static validateHeaders(headers) {
    const errors = [];

    if (!headers || typeof headers !== 'object') {
      return { isValid: false, errors: ['Headers must be an object'] };
    }

    Object.entries(headers).forEach(([key, value]) => {
      // Check header name format
      if (!/^[a-zA-Z0-9\-_]+$/.test(key)) {
        errors.push(`Invalid header name: "${key}"`);
      }

      // Check for dangerous values
      if (typeof value === 'string' && value.includes('\n')) {
        errors.push(`Header "${key}" contains newline characters`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  static escapeHTML(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  static escapeShell(command) {
    // Simple shell escaping for security
    return command.replace(/[;&|`$(){}[\]\\]/g, '\\$&');
  }

  static isValidEmail(email) {
    try {
      return validator.isEmail(email);
    } catch {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
  }

  static isValidDomain(domain) {
    try {
      return validator.isFQDN(domain);
    } catch {
      return /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/.test(domain);
    }
  }

  static isValidIP(ip) {
    try {
      return validator.isIP(ip);
    } catch {
      return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip);
    }
  }

  static sanitizeFilename(filename) {
    // Remove dangerous characters from filename
    return filename
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\.\./g, '')
      .trim();
  }

  static validateJSONInput(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      return { isValid: true, data: parsed };
    } catch (error) {
      return { 
        isValid: false, 
        error: `Invalid JSON: ${error.message}`,
        data: null 
      };
    }
  }

  static checkForSQLInjection(input) {
    const sqlPatterns = [
      /[';]|--|\\'/i,
      /\s+(or|and)\s+/i,
      /union\s+select/i,
      /drop\s+table/i,
      /insert\s+into/i,
      /delete\s+from/i,
      /update\s+.*\s+set/i
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
  }

  static checkForXSS(input) {
    const xssPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /on\w+\s*=/i,
      /<iframe/i,
      /<object/i,
      /<embed/i
    ];

    return xssPatterns.some(pattern => pattern.test(input));
  }

  static rateLimit(identifier, maxRequests = 100, windowMs = 60000) {
    if (!this.rateLimitStore) {
      this.rateLimitStore = new Map();
    }

    const now = Date.now();
    const key = String(identifier);
    const record = this.rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count++;
    }

    this.rateLimitStore.set(key, record);

    return {
      allowed: record.count <= maxRequests,
      remaining: Math.max(0, maxRequests - record.count),
      resetTime: record.resetTime
    };
  }
}

module.exports = { ValidationHelper };
