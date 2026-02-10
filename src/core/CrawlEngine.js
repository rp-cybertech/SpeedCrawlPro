// src/core/CrawlEngine.js
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

const { BrowserManager } = require('./BrowserManager');
const { FormProcessor } = require('../forms/FormProcessor');
const { CAPTCHAHandler } = require('../evasion/CAPTCHAHandler');
const { ModernTechDetector } = require('../discovery/ModernTechDetector');
const { JSChunkAnalyzer } = require('../discovery/JSChunkAnalyzer');
const { EndpointAnalyzer } = require('../discovery/EndpointAnalyzer');
const { SecretDetector } = require('../security/SecretDetector');

const { StreamWriter } = require('../output/StreamWriter');
const { HTTPFormatter } = require('../output/HTTPFormatter');
const { NetworkCapture } = require('../network/NetworkCapture');
const { QueueManager } = require('./QueueManager');
const { ResultManager } = require('./ResultManager');
const { PageProcessor } = require('./PageProcessor');
const { StateManager } = require('../utils/StateManager');

class CrawlEngine extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;

    this.queueManager = new QueueManager(logger);
    this.resultManager = new ResultManager(logger);
    this.stateManager = new StateManager(config, logger);

    this.browserManager = null;
    this.formProcessor = new FormProcessor(config, logger);
    this.captchaHandler = new CAPTCHAHandler(config, logger);
    this.techDetector = new ModernTechDetector(config, logger);
    this.jsAnalyzer = new JSChunkAnalyzer(config, logger);
    this.endpointAnalyzer = new EndpointAnalyzer(config, logger);
    this.secretDetector = new SecretDetector(config, logger);

    this.streamWriter = new StreamWriter(config, logger);
    this.httpFormatter = new HTTPFormatter(config, logger);
    this.capture = null;

    this.pageProcessor = new PageProcessor(
      config, logger, this.formProcessor, this.captchaHandler,
      this.techDetector, this.jsAnalyzer, this.endpointAnalyzer,
      this.secretDetector, this.queueManager, this.resultManager, this.stateManager
    );



    this.results = {
      startTime: null,
      endTime: null,
      duration: 0,
      pages: [],
      forms: 0,
      fieldsProcessed: 0,

      technologies: [],
      endpoints: [],
      secrets: [],
      jsChunks: 0
    };
  }

  async initialize() {
    this.logger.info('Initializing engine...');
    if (!this.browserManager) {
      this.browserManager = new BrowserManager(this.config, this.logger);
      await this.browserManager.initialize();
    }
  }

  setupMonitor(context, origin) {
    this.capture = new NetworkCapture(this.config, this.logger, this.streamWriter, this.httpFormatter, this.resultManager, origin);
    this.capture.setupNetworkCapture(context);
  }

  async start() {
    this.results.startTime = Date.now();
    const startUrl = this.config.get('url');
    if (!startUrl) throw new Error('No URL provided');
    const origin = new URL(startUrl).origin;

    // Initialize state manager for auto-resume
    this.stateManager.init(startUrl);

    try {
      await this.initialize();
      
      // Try to restore state if auto-resume is enabled
      if (this.config.get('autoResume') && this.stateManager.loadState()) {
        this.stateManager.restoreVisited(this.queueManager);
        this.stateManager.restoreResults(this.resultManager);
        const restoredQueue = this.stateManager.restoreQueue(this.queueManager);
        if (restoredQueue.length > 0) {
          this.queueManager.queue = restoredQueue;
        }
      }
      
      const context = await this.browserManager.newStealthContext({
        ignoreHTTPSErrors: !!this.config.get('noSSLCheck'),
        bypassCSP: true
      });
      this.setupMonitor(context, origin);
      
      // Set up periodic state saving
      const saveInterval = setInterval(() => {
        if (this.config.get('autoResume')) {
          this.stateManager.saveState(this.queueManager, this.resultManager);
        }
      }, 10000); // Save every 10 seconds
      
      await this.crawlPages(context, startUrl);
      
      clearInterval(saveInterval);
      
      this.results.endTime = Date.now();
      this.results.duration = this.results.endTime - this.results.startTime;
      this.results.requests = this.resultManager.allRequests.slice(-200);
      this.results.requestCount = this.resultManager.allRequests.length;
      await this.generateOutputs();
      if (this.capture) await this.capture.flush();
      this.printSummary();
      
      // Mark as complete and clean up state file
      this.stateManager.markComplete(this.queueManager, this.resultManager);
      
      return this.results;
    } catch (error) {
      // Save state on error for resume
      if (this.config.get('autoResume')) {
        this.stateManager.saveState(this.queueManager, this.resultManager);
        this.logger.info('💾 Crawl state saved for auto-resume');
      }
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async crawl(url) {
    if (url && url !== this.config.get('url')) this.config.set('url', url);
    return this.start();
  }

  async crawlPages(context, startUrl) {
    await this.pageProcessor.crawlPages(context, startUrl);
  }

  async generateOutputs() {
    const outputDir = this.config.get('outputDir');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    let allRequests = this.resultManager.allRequests;

    const uniqueEndpoints = [...new Set(this.resultManager.allEndpoints)].filter(Boolean);
    fs.writeFileSync(path.join(outputDir, 'endpoints.txt'), uniqueEndpoints.join('\n') || 'No endpoints');

    const uniqueTech = [...new Set(this.resultManager.technologies)].filter(Boolean);
    fs.writeFileSync(path.join(outputDir, 'technologies.txt'), uniqueTech.join('\n') || 'None');

    fs.writeFileSync(path.join(outputDir, 'all-urls.txt'), Array.from(this.queueManager.visited).join('\n'));

    const secretsContent = (this.resultManager.allSecrets || []).length > 0
      ? this.resultManager.allSecrets.map(s => `[${s.type}] ${s.value}\n  Source: ${s.source}`).join('\n\n')
      : 'No secrets found';
    fs.writeFileSync(path.join(outputDir, 'secrets.txt'), secretsContent);

    const summary = {
      crawl: {
        startTime: new Date(this.results.startTime).toISOString(),
        endTime: new Date(this.results.endTime).toISOString(),
        duration: `${(this.results.duration / 1000).toFixed(2)}s`,
        pagesProcessed: this.resultManager.allPages.length,
        totalRequests: this.resultManager.allRequests.length
      },
      findings: {
        forms: this.resultManager.allForms.length,
        fieldsProcessed: this.resultManager.allForms.reduce((sum, f) => sum + (f.fieldsProcessed || 0), 0),
        secrets: (this.resultManager.allSecrets || []).length,
        endpoints: uniqueEndpoints.length,
        technologies: uniqueTech.length,
        jsChunks: this.resultManager.jsChunks
      }
    };
    fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));

    const md = [
      `# SpeedCrawl Summary`,
      ``,
      `- Pages: ${this.resultManager.allPages.length}`,
      `- Forms: ${this.resultManager.allForms.length}`,
      `- Fields: ${this.resultManager.allForms.reduce((sum, f) => sum + (f.fieldsProcessed || 0), 0)}`,
      `- Requests: ${allRequests.length}`,
      `- Endpoints: ${uniqueEndpoints.length}`,
      `- Secrets: ${(this.resultManager.allSecrets || []).length}`,
      `- JS Chunks: ${this.resultManager.jsChunks}`,
      `- Duration: ${(this.results.duration / 1000).toFixed(2)}s`
    ].join('\n');
    fs.writeFileSync(path.join(outputDir, 'summary.md'), md);

    const formats = this.config.get('formats') || [];
    const appendOutput = this.config.get('appendOutput') || false;
    
    if (formats.includes('jsonl')) {
      let jsonlFile = this.config.get('customJsonlFile');
      if (!jsonlFile) {
        const jsonlDir = path.join(outputDir, 'jsonl');
        if (!fs.existsSync(jsonlDir)) fs.mkdirSync(jsonlDir, { recursive: true });
        jsonlFile = path.join(jsonlDir, 'requests.jsonl');
      }
      await this.streamWriter.writeJSONL({ requests: allRequests, customJsonlFile: jsonlFile, append: appendOutput });
    }
    if (formats.includes('har')) {
      let harFile = this.config.get('customHarFile');
      if (!harFile) {
        const harDir = path.join(outputDir, 'har');
        if (!fs.existsSync(harDir)) fs.mkdirSync(harDir, { recursive: true });
        harFile = path.join(harDir, 'requests.har');
      }
      await this.streamWriter.writeHAR({ requests: allRequests, customHarFile: harFile });
    }
    if (formats.includes('http')) {
      let httpFile = this.config.get('customHttpFile');
      if (!httpFile) {
        const httpDir = path.join(outputDir, 'http-requests');
        if (!fs.existsSync(httpDir)) fs.mkdirSync(httpDir, { recursive: true });
        httpFile = path.join(httpDir, 'requests.http');
      }
      await this.streamWriter.writeHTTP({ requests: allRequests, customHttpFile: httpFile });
    }
  }

  printSummary() {
    this.logger.info('');
    this.logger.info('Summary ready.');
    this.logger.info(`Results: ${this.config.get('outputDir')}`);
  }



  async cleanup() {
    try {
      if (this.streamWriter?.cleanup) this.streamWriter.cleanup();
      if (this.browserManager) await this.browserManager.close();
    } catch {}
  }

  /**
   * Reset state for crawling next URL in list mode
   * Preserves browser and output file handles
   */
  resetForNextUrl() {
    // Reset queue
    this.queueManager.visited.clear();
    this.queueManager.queue = [];
    
    // Reset results
    this.resultManager.allPages = [];
    this.resultManager.allEndpoints = new Set();
    this.resultManager.allSecrets = [];
    this.resultManager.allRequests = [];
    this.resultManager.allForms = [];
    this.resultManager.technologies = [];
    this.resultManager.jsChunks = 0;
    
    // Reset capture
    if (this.capture) {
      this.capture.requests.clear();
      this.capture.responses.clear();
      this.capture.pairs = [];
      this.capture.requestCounter = 0;
    }
    
    // Reset results tracking
    this.results = {
      startTime: null,
      endTime: null,
      duration: 0,
      pages: [],
      forms: 0,
      fieldsProcessed: 0,
      technologies: [],
      endpoints: [],
      secrets: [],
      jsChunks: 0
    };
    
    this.logger.debug('🔄 Engine state reset for next URL');
  }
}

module.exports = { CrawlEngine };
