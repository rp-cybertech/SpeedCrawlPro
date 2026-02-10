/**
 * SpeedCrawl Pro v14 - NetworkCapture (COMPLETE & WORKING)
 */

class NetworkCapture {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.requests = new Map();
    this.responses = new Map();
    this.requestCounter = 0;
  }

  async setupContext(context) {
    try {
      context.on('request', req => this.captureRequest(req));
      context.on('response', resp => this.captureResponse(resp));
      this.logger.debug('📡 NetworkCapture: Monitoring enabled');
    } catch (error) {
      this.logger.debug(`NetworkCapture setup error: ${error.message}`);
    }
  }

  async setupPage(page) {
    // Optional page-level hooks
  }

  captureRequest(request) {
    try {
      const url = request.url();
      const method = request.method();
      
      // Skip assets
      const blocked = this.config.get('blockedExtensions', []);
      if (blocked.some(ext => url.toLowerCase().endsWith(`.${ext}`))) {
        return;
      }

      const id = ++this.requestCounter;
      const postData = request.postData();

      this.requests.set(id, {
        id,
        url,
        method,
        headers: request.headers(),
        postData: postData || '',
        timestamp: Date.now()
      });

      // Log important requests
      if (method === 'POST' && postData) {
        this.logger.debug(`📤 POST ${url}`);
        this.logger.debug(`   ${postData.slice(0, 150)}`);
      }
    } catch (err) {
      this.logger.debug(`Request capture error: ${err.message}`);
    }
  }

  captureResponse(response) {
    try {
      const req = response.request();
      const url = req.url();
      const method = req.method();
      const status = response.status();

      const matchingReq = Array.from(this.requests.values()).find(r => r.url === url && r.method === method);
      
      if (matchingReq) {
        this.responses.set(matchingReq.id, {
          status,
          headers: response.headers(),
          timestamp: Date.now()
        });

        if (status >= 400) {
          this.logger.debug(`📥 ${method} ${url} → ${status}`);
        }
      }
    } catch {}
  }

  getRequestsWithResponses() {
    const results = [];
    for (const [id, req] of this.requests) {
      const resp = this.responses.get(id);
      results.push({ ...req, response: resp || null });
    }
    return results;
  }

  exportCaptured() {
    return {
      requests: this.requests,
      responses: this.responses,
      websockets: []
    };
  }
}

module.exports = { NetworkCapture };
