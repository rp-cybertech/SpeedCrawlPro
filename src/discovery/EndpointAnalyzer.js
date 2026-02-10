/**
 * SpeedCrawl Pro - EndpointAnalyzer v3.0 FIXED
 * ✅ Exports analyzeEndpoints method
 */

const EventEmitter = require('events');

class EndpointAnalyzer extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.discoveredEndpoints = new Set();
  }

  /**
   * ✅ MAIN METHOD - Called by CrawlEngine
   */
  async analyzeEndpoints(page, options = {}) {
    try {
      this.logger.info('🎯 Analyzing API endpoints...');

      const results = {
        endpoints: [],
        methods: new Set()
      };

      // Get captured network requests
      const requests = await page.evaluate(() => {
        return window.__speedcrawl_requests || [];
      });

      // Extract API endpoints
      requests.forEach(req => {
        try {
          const url = new URL(req.url);
          const path = url.pathname;

          if (path.includes('/api/') || 
              path.includes('/v1/') || 
              req.method !== 'GET') {
            
            this.discoveredEndpoints.add(path);
            results.endpoints.push({
              endpoint: path,
              method: req.method,
              url: req.url
            });
            results.methods.add(req.method);
          }
        } catch (e) {}
      });

      // Also check window object
      const windowEndpoints = await page.evaluate(() => {
        const endpoints = [];
        try {
          const search = (obj, depth = 0) => {
            if (depth > 2) return;
            for (let key in obj) {
              try {
                if (typeof obj[key] === 'string' && obj[key].includes('/api/')) {
                  endpoints.push(obj[key]);
                }
              } catch (e) {}
            }
          };
          search(window);
        } catch (e) {}
        return endpoints;
      });

      windowEndpoints.forEach(ep => {
        this.discoveredEndpoints.add(ep);
        results.endpoints.push({ endpoint: ep, source: 'window' });
      });

      this.logger.success(`✅ Found ${results.endpoints.length} API endpoints`);
      return results;

    } catch (error) {
      this.logger.debug(`Endpoint analysis error: ${error.message}`);
      return { endpoints: [] };
    }
  }
}

module.exports = { EndpointAnalyzer };
