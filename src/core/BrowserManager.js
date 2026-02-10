/**
 * SpeedCrawl Pro v22.0 - Browser Manager (Headful-safe + Stealth)
 * - Honors --headful by launching Chromium with headless: false
 * - Enables devtools in headful mode for visual confirmation
 * - FIXED: deviceScaleFactor removed when viewport is null (headful mode)
 * - Preserves all existing features (proxy, userAgent, stealth, CSP bypass)
 */

const { EventEmitter } = require('events');
const { chromium } = require('playwright');

class BrowserManager extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.browser = null;
    this.isInitialized = false;
    
    // Simple UA pool (preserved idea, minimal)
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    ];
  }

  async initialize() {
    if (this.isInitialized) return { browser: this.browser };
    await this.launchStealthBrowser();
    this.isInitialized = true;
    this.logger.success('✅ STEALTH browser launched');
    return { browser: this.browser };
  }

  async launchStealthBrowser() {
    const wantHeadlessRaw = this.config.get('headless');
    const headless = typeof wantHeadlessRaw === 'boolean' ? wantHeadlessRaw : true;
    
    // Stealth-friendly launch args
    const args = [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-default-browser-check',
      '--no-first-run',
      '--no-sandbox',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=IsolateOrigins,site-per-process,Translate,MediaRouter',
      '--mute-audio',
      '--metrics-recording-only',
      '--password-store=basic',
      '--use-mock-keychain'
    ];
    
    // Make headful obvious (and not minimized) if requested
    if (!headless) {
      args.push('--start-maximized');
    }

    // Proxy support (kept as-is)
    const proxyString = this.config.get('proxy');
    const proxy = proxyString ? this.parseProxy(proxyString) : null;
    
    const launchOptions = {
      headless,
      args,
      devtools: !headless,
      chromiumSandbox: false,
      timeout: 30000,
      ...(proxy ? { proxy } : {})
    };
    
    this.browser = await chromium.launch(launchOptions);
    this.logger.debug(`🚀 Advanced stealth browser launched (headless=${headless})`);
  }

  parseProxy(p) {
    try {
      // Supports http://user:pass@host:port and socks5://...
      const u = new URL(p);
      const server = `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`;
      const username = u.username || undefined;
      const password = u.password || undefined;
      return { server, username, password };
    } catch {
      // Fallback: host:port
      if (/^\w+:\/\//.test(p)) return { server: p };
      return { server: `http://${p}` };
    }
  }

  async getBrowser() {
    if (!this.browser) await this.initialize();
    return this.browser;
  }

  // FIXED: Utility to create a context with stealth hardening
  async newStealthContext(overrides = {}) {
    if (!this.browser) await this.initialize();
    const userAgent = this.config.get('userAgent') || this.pickUserAgent();
    const headless = !!this.config.get('headless');
    
    // Base context options (common to both modes)
    const contextOptions = {
      ignoreHTTPSErrors: !!this.config.get('noSSLCheck'),
      bypassCSP: true,
      userAgent,
      hasTouch: false,
      isMobile: false,
      javaScriptEnabled: true
    };
    
    // CRITICAL FIX: Playwright does not allow deviceScaleFactor with viewport: null
    // - Headless: use default viewport + deviceScaleFactor
    // - Headful: use viewport: null (no deviceScaleFactor)
    if (headless) {
      contextOptions.deviceScaleFactor = 1;
    } else {
      contextOptions.viewport = null;
    }
    
    // Apply any overrides last
    Object.assign(contextOptions, overrides);
    
    const context = await this.browser.newContext(contextOptions);
    
    // Stealth scripts
    await this.applyStealth(context);
    
    // Runtime request capture for EndpointAnalyzer
    try {
      await context.addInitScript(() => {
        try {
          window.__speedcrawl_requests = window.__speedcrawl_requests || [];
          const pushReq = (url, method, headers = {}, body = null) => {
            try { 
              window.__speedcrawl_requests.push({ 
                url: String(url), 
                method: String(method || 'GET').toUpperCase(), 
                headers, 
                body, 
                timestamp: Date.now() 
              }); 
            } catch {}
          };
          
          // fetch hook
          const origFetch = window.fetch;
          window.fetch = function(input, init = {}) {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            const method = (init && init.method) || 'GET';
            pushReq(url, method, init.headers || {}, init.body || null);
            return origFetch.apply(this, arguments);
          };
          
          // XHR hook
          const origOpen = XMLHttpRequest.prototype.open;
          const origSend = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.open = function(method, url) {
            this.__sc_method = method;
            this.__sc_url = url;
            return origOpen.apply(this, arguments);
          };
          XMLHttpRequest.prototype.send = function(body) {
            pushReq(this.__sc_url || '', this.__sc_method || 'GET', {}, body || null);
            return origSend.apply(this, arguments);
          };
        } catch {}
      });
    } catch {}
    
    // UA-CH hints to avoid "HeadlessChrome" in some stacks
    try {
      await context.addInitScript(() => {
        try {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
          const orig = navigator.userAgentData;
          if (orig && orig.brands) {
            const brands = orig.brands.filter(b => !/Headless/i.test(b.brand));
            Object.defineProperty(navigator, 'userAgentData', { get: () => ({ ...orig, brands }) });
          }
        } catch {}
      });
    } catch {}
    
    // Accept-Language header for consistency
    try {
      await context.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    } catch {}
    
    return context;
  }

  pickUserAgent() {
    try {
      const idx = Math.floor(Math.random() * this.userAgents.length);
      return this.userAgents[idx];
    } catch {
      return this.userAgents[0];
    }
  }

  async applyStealth(context) {
    // Common anti-bot patches
    await context.addInitScript(() => {
      try {
        // navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        
        // window.chrome
        if (!window.chrome) {
          Object.defineProperty(window, 'chrome', { value: { runtime: {} } });
        }

        // Permissions
        const originalQuery = window.navigator.permissions?.query;
        if (originalQuery) {
          window.navigator.permissions.query = (parameters) =>
            parameters.name === 'notifications'
              ? Promise.resolve({ state: Notification.permission })
              : originalQuery(parameters);
        }

        // Plugins and languages
        Object.defineProperty(navigator, 'plugins', {
          get: () => [{ name: 'Chrome PDF Plugin' }, { name: 'Chrome PDF Viewer' }, { name: 'Native Client' }]
        });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        
        // WebGL vendor/renderer spoof
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(param) {
          const UNMASKED_VENDOR_WEBGL = 0x9245;
          const UNMASKED_RENDERER_WEBGL = 0x9246;
          if (param === UNMASKED_VENDOR_WEBGL) return 'Google Inc.';
          if (param === UNMASKED_RENDERER_WEBGL) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0)';
          return getParameter.apply(this, [param]);
        };
      } catch {}
    });
  }

  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
      }
    } catch {}
    this.browser = null;
    this.isInitialized = false;
  }
}

module.exports = { BrowserManager };
