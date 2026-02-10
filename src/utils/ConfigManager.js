// src/utils/ConfigManager.js
/**
 * SpeedCrawl Pro v22.4 - ConfigManager (security hardened)
 * - Added input validation
 * - Extracted constants
 * - Improved error handling
 * - Fixed sslCheck logic
 */

/**
 * Default configuration constants
 * @readonly
 */
const DEFAULTS = Object.freeze({
  MAX_PAGES: 100,
  MAX_DEPTH: 3,
  TIMEOUT: 30000,
  FORM_DELAY: 1000,
  REQUEST_DELAY: 1000,
  LIST_DELAY: 1000,
  VERBOSE: 1,
  THREADS: 1,
  OUTPUT_DIR: './speedcrawl-output',
  FAKER_LOCALE: 'en',
  BLOCKED_EXTENSIONS: ['jpg', 'png', 'gif', 'css', 'woff', 'woff2', 'svg']
});

/**
 * Valid URL schemes for proxy
 * @readonly
 */
const VALID_PROXY_SCHEMES = Object.freeze([
  'http:', 'https:', 'socks4:', 'socks5:'
]);

/**
 * Configuration Manager class
 * Handles configuration normalization, validation, and storage
 */
class ConfigManager {
  /**
   * Creates a new ConfigManager instance
   * @param {Object} options - Configuration options
   * @throws {Error} - If required options are invalid
   */
  constructor(options = {}) {
    // Validate options object
    if (typeof options !== 'object' || options === null) {
      throw new Error('Options must be an object');
    }

    // Normalize incoming options
    const normalized = this._normalizeOptions(options);

    // Validate critical options
    this._validateOptions(normalized);

    // Build final config
    this.config = this._buildConfig(normalized);
  }

  /**
   * Normalizes option aliases and types
   * @private
   * @param {Object} options - Raw options
   * @returns {Object} - Normalized options
   */
  _normalizeOptions(options) {
    const normalized = { ...options };

    // Deep JS analysis alias (camelCase to PascalCase)
    if (normalized.deepJsAnalysis != null && normalized.deepJSAnalysis == null) {
      normalized.deepJSAnalysis = normalized.deepJsAnalysis;
    }

    // SSL check normalization
    // Commander's --ssl-check defaults to true, --no-ssl-check sets it to false
    // We store the inverse as noSSLCheck for CrawlEngine compatibility
    if (normalized.sslCheck === false) {
      normalized.noSSLCheck = true;
    } else if (normalized.noSSLCheck == null && normalized.sslCheck !== false) {
      normalized.noSSLCheck = false;
    }

    // Pages/Depth synonyms
    if (normalized.pages != null && normalized.maxPages == null) {
      normalized.maxPages = normalized.pages;
    }
    if (normalized.depth != null && normalized.maxDepth == null) {
      normalized.maxDepth = normalized.depth;
    }

    // Input data aliases
    if (normalized.inputData != null && normalized.customInputData == null) {
      normalized.customInputData = normalized.inputData;
    }
    if (normalized.input != null && normalized.customInputData == null) {
      normalized.customInputData = normalized.input;
    }

    return normalized;
  }

  /**
   * Validates critical configuration options
   * @private
   * @param {Object} normalized - Normalized options
   * @throws {Error} - If validation fails
   */
  _validateOptions(normalized) {
    // Validate URL if provided
    if (normalized.url != null) {
      try {
        new URL(normalized.url);
      } catch {
        throw new Error(`Invalid URL: ${normalized.url}`);
      }
    }

    // Validate numeric ranges
    if (normalized.maxPages != null) {
      const pages = Number(normalized.maxPages);
      if (Number.isNaN(pages) || pages < 1 || pages > 50000) {
        throw new Error(`maxPages must be between 1 and 50000, got: ${normalized.maxPages}`);
      }
    }

    if (normalized.maxDepth != null) {
      const depth = Number(normalized.maxDepth);
      if (Number.isNaN(depth) || depth < 1 || depth > 100) {
        throw new Error(`maxDepth must be between 1 and 100, got: ${normalized.maxDepth}`);
      }
    }

    if (normalized.timeout != null) {
      const timeout = Number(normalized.timeout);
      if (Number.isNaN(timeout) || timeout < 1000) {
        throw new Error(`timeout must be at least 1000ms, got: ${normalized.timeout}`);
      }
    }

    // Validate proxy URL
    if (normalized.proxy) {
      try {
        const proxyUrl = new URL(normalized.proxy);
        if (!VALID_PROXY_SCHEMES.includes(proxyUrl.protocol)) {
          throw new Error(
            `Invalid proxy protocol: ${proxyUrl.protocol}. Must be one of: ${VALID_PROXY_SCHEMES.join(', ')}`
          );
        }
      } catch (error) {
        if (error.message.includes('Invalid proxy protocol')) throw error;
        throw new Error(`Invalid proxy URL: ${normalized.proxy}`);
      }
    }
  }

  /**
   * Builds the final configuration object
   * @private
   * @param {Object} normalized - Normalized and validated options
   * @returns {Object} - Final configuration
   */
  _buildConfig(normalized) {
    // Calculate headless value
    const wantHeadless = typeof normalized.headless === 'boolean' 
      ? normalized.headless 
      : true;
    const headless = normalized.headful === true ? false : wantHeadless;

    return Object.freeze({
      // Core
      url: normalized.url || null,
      maxPages: Number(normalized.maxPages ?? DEFAULTS.MAX_PAGES),
      maxDepth: Number(normalized.maxDepth ?? DEFAULTS.MAX_DEPTH),
      timeout: Number(normalized.timeout ?? DEFAULTS.TIMEOUT),

      // Outputs
      outputDir: normalized.outputDir || normalized.output || DEFAULTS.OUTPUT_DIR,
      formats: this.parseFormats(normalized.formats),
      customJsonlFile: normalized.jsonl || null,
      customHarFile: normalized.harFile || null,
      customJsonFile: normalized.jsonFile || null,
      customHttpFile: normalized.httpFile || null,

      // List mode
      listFile: normalized.list || null,
      showUrls: !!normalized.showUrls,
      singleOutput: !!normalized.singleOutput,
      appendOutput: !!normalized.appendOutput,

      // Input data
      customInputData: normalized.customInputData ?? null,

      // Feature toggles
      submitForms: normalized.submitForms !== false,
      useFaker: normalized.useFaker !== false,
      deepJSAnalysis: !!normalized.deepJSAnalysis,
      extractSecrets: normalized.extractSecrets !== false,
      prioritizeForms: !!normalized.prioritizeForms,
      formDelay: Number(normalized.formDelay ?? DEFAULTS.FORM_DELAY),

      // Browser/session
      headless,
      noSSLCheck: !!normalized.noSSLCheck,
      sslCheck: normalized.sslCheck !== false,
      debug: !!normalized.debug,
      verbose: Number(normalized.verbose ?? DEFAULTS.VERBOSE),
      userAgent: normalized.userAgent || null,
      proxy: normalized.proxy || null,
      threads: Number(normalized.threads ?? DEFAULTS.THREADS),
      requestDelay: Number(normalized.requestDelay ?? DEFAULTS.REQUEST_DELAY),
      listDelay: Number(normalized.listDelay ?? DEFAULTS.LIST_DELAY),
      networkIdle: !!normalized.networkIdle,

      // Scope/evasion
      blockedExtensions: this.normalizeBlocked(normalized.blockedExtensions),
      jsExcludeExtensions: this.parseFormats(normalized.jsExcludeExtensions),
      sameOrigin: !!normalized.sameOrigin,
      includeSubdomains: normalized.includeSubdomains || false,
      evasionMode: !!normalized.evasionMode,
      autoResume: !!normalized.autoResume,

      // Faker options (v10)
      fakerLocale: normalized.fakerLocale || DEFAULTS.FAKER_LOCALE,
      fakerFallbackLocales: this.parseArrayOption(normalized.fakerFallbackLocales),
      fakerSeed: normalized.fakerSeed != null ? Number(normalized.fakerSeed) : null,
      fakerRefDate: normalized.fakerRefDate || null,
      fakerUnique: normalized.fakerUnique === true
    });
  }

  /**
   * Parses a comma-separated list into an array
   * @param {string|Array|null} formats - Formats string or array
   * @returns {Array} - Array of format strings
   */
  parseFormats(formats) {
    if (!formats) return ['json', 'jsonl'];
    if (Array.isArray(formats)) return formats;
    return String(formats).split(',').map(s => s.trim()).filter(Boolean);
  }

  /**
   * Parses an array option (string or array) into an array
   * @param {string|Array|null} value - Value to parse
   * @returns {Array} - Array of strings
   */
  parseArrayOption(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  /**
   * Normalizes blocked extensions list
   * @param {string|Array|null} value - Extensions to block
   * @returns {Array} - Array of extension strings
   */
  normalizeBlocked(value) {
    if (!value) return [...DEFAULTS.BLOCKED_EXTENSIONS];
    if (Array.isArray(value)) {
      return value.map(String).map(s => s.trim()).filter(Boolean);
    }
    return String(value).split(',').map(s => s.trim()).filter(Boolean);
  }

  /**
   * Gets a configuration value
   * @param {string} key - Configuration key
   * @param {*} fallback - Fallback value if key not found
   * @returns {*} - Configuration value or fallback
   */
  get(key, fallback) {
    return this.config[key] != null ? this.config[key] : fallback;
  }

  /**
   * Sets a configuration value
   * @param {string} key - Configuration key
   * @param {*} value - Value to set
   */
  set(key, value) {
    // Note: This modifies the config, bypassing validation
    // Use with caution
    this.config = { ...this.config, [key]: value };
  }

  /**
   * Gets the entire configuration object
   * @returns {Object} - Complete configuration (frozen)
   */
  getAll() {
    return this.config;
  }
}

module.exports = { ConfigManager, DEFAULTS, VALID_PROXY_SCHEMES };
