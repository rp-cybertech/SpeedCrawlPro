#!/usr/bin/env node

/**
 * SpeedCrawl Pro v22.4 - COMPLETE CLI (security hardened)
 * - Fixed path traversal vulnerabilities
 * - Replaced process.exit with error throwing
 * - Converted sync to async operations
 * - Extracted constants
 * - Added dependency injection for testability
 * - Added input validation
 * - Removed code duplication
 */

const { Command, InvalidArgumentError } = require('commander');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');

// Core - Dependencies for injection
const CoreDeps = {
  CrawlEngine: require('../src/core/CrawlEngine').CrawlEngine,
  ConfigManager: require('../src/utils/ConfigManager').ConfigManager,
  Logger: require('../src/utils/Logger').Logger
};

/**
 * Application constants
 * @readonly
 */
const CONSTANTS = Object.freeze({
  DEFAULT_OUTPUT_DIR: './speedcrawl-output',
  DEFAULT_USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  DEFAULT_REQUEST_DELAY: 1000,
  DEFAULT_LIST_DELAY: 1000,
  DEFAULT_FORM_DELAY: 1000,
  DEFAULT_TIMEOUT: 30000,
  DOMAIN_SANITIZE_REGEX: /[^a-zA-Z0-9.-]/g,
  VALID_URL_SCHEMES: ['http:', 'https:'],
  MIN_DEPTH: 1,
  MAX_DEPTH: 100,
  MIN_PAGES: 1,
  MAX_PAGES: 50000,
  MIN_THREADS: 1,
  MAX_THREADS: 50,
  MIN_VERBOSE: 0,
  MAX_VERBOSE: 4
});

/**
 * Custom error class for CLI errors
 */
class CliError extends Error {
  constructor(message, code, exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

/**
 * Validates and sanitizes a file path to prevent directory traversal
 * @param {string} filePath - The path to validate
 * @returns {string} - Sanitized absolute path
 * @throws {CliError} - If path is invalid or unsafe
 */
function validateAndSanitizePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new CliError('Invalid file path', 'E_INVALID_PATH');
  }
  
  // Normalize path and resolve to absolute
  const normalized = path.normalize(filePath);
  const resolved = path.resolve(normalized);
  
  // Check for path traversal attempts (prevent ../../../etc/passwd)
  const relativeToCwd = path.relative(process.cwd(), resolved);
  if (relativeToCwd.startsWith('..') || relativeToCwd.includes('../')) {
    throw new CliError('Path traversal attempt detected', 'E_PATH_TRAVERSAL');
  }
  
  return resolved;
}

/**
 * Validates a URL for safety
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid
 * @throws {CliError} - If URL is invalid
 */
function validateUrl(url) {
  try {
    const urlObj = new URL(url);
    
    // Check scheme
    if (!CONSTANTS.VALID_URL_SCHEMES.includes(urlObj.protocol)) {
      throw new CliError(
        `Invalid URL scheme: ${urlObj.protocol}. Only http: and https: are allowed`,
        'E_INVALID_SCHEME'
      );
    }
    
    // Check for localhost/private IPs in production
    const hostname = urlObj.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
      // Log warning but allow in development
      console.warn('Warning: Local/private IP address detected');
    }
    
    return true;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`Invalid URL format: ${url}`, 'E_INVALID_URL');
  }
}

/**
 * Validates a proxy URL format
 * @param {string} proxyUrl - Proxy URL to validate
 * @returns {boolean} - True if valid
 * @throws {CliError} - If proxy URL is invalid
 */
function validateProxyUrl(proxyUrl) {
  if (!proxyUrl) return true;
  
  try {
    const url = new URL(proxyUrl);
    if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(url.protocol)) {
      throw new CliError(
        `Invalid proxy protocol: ${url.protocol}`,
        'E_INVALID_PROXY'
      );
    }
    return true;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`Invalid proxy URL: ${proxyUrl}`, 'E_INVALID_PROXY');
  }
}

/**
 * Parses and validates an integer option
 * @param {string} name - The name of the option
 * @param {number} min - The minimum allowed value
 * @param {number} max - The maximum allowed value
 * @returns {function(string, any): number} - Parser function
 */
function parseIntOption(name, min, max) {
  return (value, previous) => {
    const parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) {
      throw new InvalidArgumentError(`Invalid ${name}: not a number.`);
    }
    if (parsedValue < min || parsedValue > max) {
      throw new InvalidArgumentError(`Invalid ${name}: must be between ${min} and ${max}.`);
    }
    return parsedValue;
  };
}

/**
 * Validates and loads URLs from a list file or single URL
 * @param {Object} options - CLI options
 * @param {Object} logger - Logger instance
 * @returns {Promise<string[]>} - Array of validated URLs
 * @throws {CliError} - If validation fails
 */
async function validateAndLoadUrls(options, logger) {
  let urls = [];
  
  if (options.list) {
    try {
      const filePath = options.list === true ? 0 : validateAndSanitizePath(options.list);
      const listContent = await fs.readFile(filePath, 'utf8');
      
      urls = listContent.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(url => {
          try {
            validateUrl(url);
            return url;
          } catch {
            logger.warn(`Skipping invalid URL: ${url}`);
            return null;
          }
        })
        .filter(Boolean);
      
      if (urls.length === 0) {
        throw new CliError('No valid URLs found in list file', 'E_NO_VALID_URLS');
      }
      
      logger.info(`Loaded ${urls.length} URLs from list`);
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError(`Failed to load list file: ${error.message}`, 'E_LIST_LOAD_FAILED');
    }
  } else {
    if (!options.url) {
      throw new CliError('URL is required (use -u or -l)', 'E_URL_REQUIRED');
    }
    
    try {
      validateUrl(options.url);
      urls = [options.url];
    } catch (error) {
      throw new CliError(`Invalid URL: ${error.message}`, 'E_INVALID_URL');
    }
  }
  
  return urls;
}

/**
 * Checks Faker availability
 * @param {Object} logger - Logger instance
 * @returns {boolean} - True if Faker is available
 */
function checkFakerAvailability(logger) {
  try {
    require('@faker-js/faker');
    logger.info('Faker detected - realistic data generation enabled');
    return true;
  } catch {
    logger.warn('Faker not installed - using basic data generation');
    return false;
  }
}

/**
 * Loads input data from JSON file
 * @param {string} inputFile - Path to input file
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object|null>} - Parsed input data or null
 * @throws {CliError} - If loading fails
 */
async function loadInputData(inputFile, logger) {
  if (!inputFile) return null;
  
  try {
    const inputPath = validateAndSanitizePath(inputFile);
    
    // Check if file is readable (async)
    await fs.access(inputPath, fs.constants.R_OK);
    
    const rawData = await fs.readFile(inputPath, 'utf8');
    const inputData = JSON.parse(rawData);
    
    logger.info(`Loaded input data from: ${inputFile}`);
    logger.debug(`Fields: ${Object.keys(inputData).join(', ')}`);
    
    return inputData;
  } catch (error) {
    if (error instanceof CliError) throw error;
    if (error.code === 'ENOENT') {
      logger.warn(`Input file not found: ${inputFile}`);
      return null;
    }
    if (error instanceof SyntaxError) {
      throw new CliError(`Invalid JSON in input file: ${error.message}`, 'E_INVALID_JSON');
    }
    throw new CliError(`Failed to load input file: ${error.message}`, 'E_INPUT_LOAD_FAILED');
  }
}

/**
 * Extracts domain from URL and sanitizes it for filesystem use
 * @param {string} url - URL to extract domain from
 * @returns {string} - Sanitized domain name
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(CONSTANTS.DOMAIN_SANITIZE_REGEX, '-');
  } catch {
    return 'unknown-domain';
  }
}

/**
 * Creates output directory with error handling
 * @param {Object} options - CLI options
 * @param {string} url - Target URL (for domain-based naming)
 * @param {Object} logger - Logger instance
 * @returns {Promise<string>} - Output directory path
 * @throws {CliError} - If creation fails
 */
async function createOutputDirectory(options, url, logger) {
  let outputDir = options.output;
  
  // Use domain-based naming if using default output and single URL mode
  if (outputDir === CONSTANTS.DEFAULT_OUTPUT_DIR && !options.list) {
    const domain = extractDomain(url);
    outputDir = path.join(CONSTANTS.DEFAULT_OUTPUT_DIR, domain);
  }
  
  // Ensure output directory exists
  try {
    await fs.mkdir(outputDir, { recursive: true });
    return outputDir;
  } catch (error) {
    throw new CliError(
      `Failed to create output directory: ${error.message}`,
      'E_OUTPUT_DIR_FAILED'
    );
  }
}

/**
 * Builds configuration object from CLI options
 * @param {Object} options - CLI options
 * @param {string} outputDir - Output directory
 * @param {Object} inputData - Input data
 * @param {boolean} fakerAvailable - Whether Faker is available
 * @returns {Object} - Config object for ConfigManager
 */
function buildConfig(options, outputDir, inputData, fakerAvailable) {
  return {
    // Core
    url: options.url,
    maxDepth: options.depth,
    maxPages: options.pages,
    outputDir: outputDir,
    timeout: options.timeout,
    debug: options.debug,

    // Outputs
    formats: options.formats.split(',').map(f => f.trim()).filter(Boolean),
    jsonl: options.jsonl,
    harFile: options.harFile,
    jsonFile: options.jsonFile,
    httpFile: options.httpFile,

    // List mode
    list: options.list,
    showUrls: options.showUrls,
    singleOutput: options.singleOutput,
    appendOutput: options.list && options.singleOutput,

    // Input data
    customInputData: inputData,

    // Request settings
    requestDelay: options.requestDelay,
    listDelay: options.listDelay,
    userAgent: options.userAgent || CONSTANTS.DEFAULT_USER_AGENT,

    // Crawling behavior
    sameOrigin: options.sameOrigin,
    includeSubdomains: options.includeSubdomains || false,
    blockedExtensions: options.blockedExtensions.split(',').map(e => e.trim()).filter(Boolean),
    jsExcludeExtensions: options.jsExcludeExtensions 
      ? options.jsExcludeExtensions.split(',').map(e => e.trim()).filter(Boolean) 
      : [],
    sslCheck: options.sslCheck,

    // Features
    submitForms: options.submitForms,
    useFaker: options.useFaker && fakerAvailable,
    prioritizeForms: options.prioritizeForms,
    formDelay: options.formDelay,
    deepJSAnalysis: options.deepJsAnalysis,
    extractSecrets: options.extractSecrets,

    // Browser
    headless: !options.headful,
    evasionMode: options.evasionMode,
    proxy: options.proxy,
    networkIdle: options.networkIdle,

    // Performance
    threads: options.threads,

    // Advanced
    autoResume: options.autoResume
  };
}

/**
 * Prints configuration summary
 * @param {Object} options - CLI options
 * @param {string[]} urls - URLs to crawl
 * @param {string} outputDir - Output directory
 * @param {Object} inputData - Input data
 * @param {boolean} fakerAvailable - Whether Faker is available
 * @param {Object} logger - Logger instance
 */
function printConfigSummary(options, urls, outputDir, inputData, fakerAvailable, logger) {
  logger.info('Configuration Summary:');
  
  if (options.list) {
    logger.info(`List Input: ${options.list === true ? 'stdin' : options.list} (${urls.length} URLs)`);
  } else {
    logger.info(`Target: ${options.url}`);
  }
  
  logger.info(`Scope: ${options.pages} pages, depth ${options.depth}`);
  logger.info(`Output: ${outputDir}`);
  logger.info(`Formats: ${options.formats}`);
  
  if (options.jsonl) logger.info(`  JSONL File: ${options.jsonl}`);
  if (options.harFile) logger.info(`  HAR File: ${options.harFile}`);
  if (options.jsonFile) logger.info(`  JSON File: ${options.jsonFile}`);
  if (options.httpFile) logger.info(`  HTTP File: ${options.httpFile}`);
  
  logger.info('Features:');
  logger.info(`  Form Submission: ${options.submitForms ? 'ENABLED' : 'disabled'}`);
  logger.info(`  Prioritize Forms: ${options.prioritizeForms ? 'YES' : 'NO'}`);
  logger.info(`  Faker Data: ${fakerAvailable && options.useFaker ? 'ENABLED' : 'disabled'}`);
  logger.info(`  JS Analysis: ${options.deepJsAnalysis ? 'ENABLED' : 'disabled'}`);
  logger.info(`  Secret Detection: ${options.extractSecrets ? 'ENABLED' : 'disabled'}`);
  
  if (inputData) {
    logger.info(`  Custom Input: LOADED (${Object.keys(inputData).length} fields)`);
  }
  if (options.proxy) {
    logger.info(`  Proxy: ${options.proxy}`);
  }
  if (options.includeSubdomains) {
    logger.info(`  Subdomains: ${options.includeSubdomains}`);
  }
  
  logger.info(`  Auto-Resume: ${options.autoResume ? 'ENABLED' : 'disabled'}`);
  logger.info(`  Network Idle Wait: ${options.networkIdle ? 'ENABLED' : 'disabled'}`);
  logger.info(`  SSL Check: ${options.sslCheck ? 'ENABLED' : 'disabled'}`);
  logger.info('');
}

/**
 * Runs the crawl process
 * @param {string[]} urls - URLs to crawl
 * @param {Object} options - CLI options
 * @param {Object} config - ConfigManager instance
 * @param {Object} logger - Logger instance
 * @param {Object} deps - Dependencies (CrawlEngine)
 * @returns {Promise<Object>} - Crawl results
 */
async function runCrawl(urls, options, config, logger, deps = CoreDeps) {
  const crawler = new deps.CrawlEngine(config, logger);
  await crawler.initialize();

  const startTime = Date.now();
  logger.info('Starting intelligent crawl...');
  logger.info('');

  let allResults = [];
  
  if (options.list) {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      logger.info(`\n${i + 1}/${urls.length}: Crawling ${url}`);

      try {
        if (!options.singleOutput) {
          const domain = extractDomain(url);
          config.set('outputDir', path.join(CONSTANTS.DEFAULT_OUTPUT_DIR, domain));
        }
        
        await crawler.crawl(url);
        allResults = allResults.concat(crawler.resultManager.allPages || []);

        const delay = config.get('listDelay') || CONSTANTS.DEFAULT_LIST_DELAY;
        if (i < urls.length - 1 && delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        if (i < urls.length - 1) {
          crawler.resetForNextUrl();
        }
      } catch (error) {
        logger.error(`Failed to crawl ${url}: ${error.message}`);
        // Continue with next URL instead of failing completely
      }
    }
  } else {
    await crawler.crawl(options.url);
    allResults = crawler.resultManager.allPages || [];
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Print summary
  logger.info('');
  logger.info('==================================================');
  logger.info('CRAWL SUMMARY');
  logger.info('==================================================');
  logger.info(`Pages Crawled: ${allResults.length}`);
  if (options.list) logger.info(`URLs Processed: ${urls.length}`);
  logger.info(`HTTP Requests: ${crawler.resultManager.allRequests.length}`);
  logger.info(`Secrets Found: ${(crawler.resultManager.allSecrets || []).length}`);
  logger.info(`Technologies: ${crawler.resultManager.technologies.length}`);
  logger.info(`Duration: ${duration}s`);
  logger.info('==================================================');
  logger.info('');
  logger.info('Crawl completed successfully!');
  logger.info(`Results: ${config.get('outputDir')}`);
  logger.info('');

  return { success: true, pagesCrawled: allResults.length, duration };
}

/**
 * Main application entry point
 * @param {Object} deps - Dependencies for injection
 * @returns {Promise<number>} - Exit code
 */
async function main(deps = CoreDeps) {
  const program = new Command();

  // CLI Options definition
  program
    .name('speedcrawl')
    .description('SpeedCrawl Pro - Professional web security crawler')
    .version('22.4.0')
    .option('-u, --url <url>', 'Target URL to crawl')
    .option('-d, --depth <n>', `Maximum crawl depth (${CONSTANTS.MIN_DEPTH}-${CONSTANTS.MAX_DEPTH})`, 
      parseIntOption('depth', CONSTANTS.MIN_DEPTH, CONSTANTS.MAX_DEPTH), 5)
    .option('-p, --pages <n>', `Maximum pages to crawl (${CONSTANTS.MIN_PAGES}-${CONSTANTS.MAX_PAGES})`, 
      parseIntOption('pages', CONSTANTS.MIN_PAGES, CONSTANTS.MAX_PAGES), 100)
    .option('-o, --output <dir>', 'Output directory', CONSTANTS.DEFAULT_OUTPUT_DIR)
    .option('-v, --verbose <n>', `Verbosity level (${CONSTANTS.MIN_VERBOSE}-${CONSTANTS.MAX_VERBOSE})`, 
      parseIntOption('verbose', CONSTANTS.MIN_VERBOSE, CONSTANTS.MAX_VERBOSE), 1)
    .option('-i, --input <file>', 'JSON file with form input data')
    .option('--formats <list>', 'Output formats: json,jsonl,har,http', 'json')
    .option('-j, --jsonl <file>', 'Custom JSONL output file path')
    .option('--har-file <file>', 'Custom HAR output file path')
    .option('--json-file <file>', 'Custom JSON output file path')
    .option('--http-file <file>', 'Custom HTTP requests output file path')
    .option('-l, --list [file]', 'Read URLs from file or stdin (one per line) to crawl')
    .option('--show-urls', 'Display all found URLs after crawl', false)
    .option('--single-output', 'Save all results in single file when using list mode (no per-domain folders)', false)
    .option('--submit-forms', 'Submit forms automatically', false)
    .option('--use-faker', 'Use Faker for realistic data', true)
    .option('--form-delay <ms>', 'Delay before filling forms', String(CONSTANTS.DEFAULT_FORM_DELAY))
    .option('--no-submit-forms', 'Disable form submission')
    .option('--prioritize-forms', 'Prioritize crawling form pages', false)
    .option('--deep-js-analysis', 'Enable JavaScript AST parsing', false)
    .option('--extract-secrets', 'Scan for API keys and secrets', true)
    .option('--include-subdomains <pattern>', 'Include subdomain pattern (e.g., *.example.com)')
    .option('--js-exclude-extensions <list>', 'JS analyzer: skip file extensions')
    .option('--headful', 'Show browser window', false)
    .option('--user-agent <ua>', 'Custom User-Agent')
    .option('--proxy <url>', 'HTTP/HTTPS proxy URL')
    .option('--ssl-check', 'Verify SSL certificates', true)
    .option('--no-ssl-check', 'Ignore SSL certificate errors')
    .option('--request-delay <ms>', 'Delay between requests', String(CONSTANTS.DEFAULT_REQUEST_DELAY))
    .option('--list-delay <ms>', 'Delay between URLs in list mode', String(CONSTANTS.DEFAULT_LIST_DELAY))
    .option('--timeout <ms>', 'Page load timeout', String(CONSTANTS.DEFAULT_TIMEOUT))
    .option('--threads <n>', `Concurrent pages (${CONSTANTS.MIN_THREADS}-${CONSTANTS.MAX_THREADS})`, 
      parseIntOption('threads', CONSTANTS.MIN_THREADS, CONSTANTS.MAX_THREADS), 1)
    .option('--network-idle', 'Wait for network idle before extraction', false)
    .option('--blocked-extensions <list>', 'Skip file extensions', '')
    .option('--same-origin', 'Only crawl same origin', false)
    .option('--evasion-mode', 'Enable bot evasion techniques', false)
    .option('--auto-resume', 'Resume crawl from previous state', false)
    .option('--debug', 'Enable debug logging', false);

  program.parse();

  const options = program.opts();

  // Initialize logger
  const logger = new deps.Logger({
    level: options.verbose,
    enableColors: true,
    enableDebug: options.debug
  });

  try {
    // Validate proxy URL if provided
    validateProxyUrl(options.proxy);

    // Auto-enable formats based on file options
    const formats = new Set(options.formats.split(',').map(f => f.trim()).filter(Boolean));
    if (options.jsonl && !formats.has('jsonl')) {
      formats.add('jsonl');
    }
    if (options.harFile && !formats.has('har')) {
      formats.add('har');
    }
    if (options.httpFile && !formats.has('http')) {
      formats.add('http');
    }
    options.formats = Array.from(formats).join(',');

    // Validate and load URLs
    const urls = await validateAndLoadUrls(options, logger);
    
    // Check Faker availability
    const fakerAvailable = checkFakerAvailability(logger);
    
    // Load input data
    const inputData = await loadInputData(options.input, logger);
    
    // Create output directory
    const outputDir = await createOutputDirectory(options, urls[0], logger);
    
    // Build configuration
    const configObj = buildConfig(options, outputDir, inputData, fakerAvailable);
    const config = new deps.ConfigManager(configObj);
    
    // Print configuration summary
    printConfigSummary(options, urls, outputDir, inputData, fakerAvailable, logger);
    
    // Run crawl
    const result = await runCrawl(urls, options, config, logger, deps);
    
    return 0;
  } catch (error) {
    logger.error('');
    logger.error('==================================================');
    logger.error('CRAWL FAILED');
    logger.error('==================================================');
    logger.error(`Error: ${error.message}`);
    
    if (options.debug && error.stack) {
      logger.error('');
      logger.error('Stack trace:');
      logger.error(error.stack);
    }
    
    logger.error('==================================================');
    logger.error('');
    
    return error.exitCode || 1;
  }
}

// Run main if executed directly
if (require.main === module) {
  main()
    .then(exitCode => process.exit(exitCode))
    .catch(error => {
      console.error('Fatal error:', error.message);
      process.exit(1);
    });
}

// Export for testing
module.exports = { main, CliError, validateAndSanitizePath, validateUrl, extractDomain, buildConfig };
