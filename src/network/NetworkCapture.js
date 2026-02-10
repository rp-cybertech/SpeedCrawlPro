// src/network/NetworkCapture.js
class NetworkCapture {
constructor(config, logger, streamWriter, httpFormatter, resultManager, origin) { // Added resultManager
    this.config = config;
    this.logger = logger;
    this.streamWriter = streamWriter;
    this.httpFormatter = httpFormatter;
    this.resultManager = resultManager; // Added resultManager
    this.origin = origin;
    this.reqMap = new Map();
    this.pairs = [];
    this.formats = this.config.get('formats') || [];
    this.assetExt = new Set(['.js', '.css', '.map']);
    this.requests = new Map();
    this.responses = new Map();
    this.requestCounter = 0;
  }

setupNetworkCapture(context) {
    try {
      context.on('request', req => this.captureRequest(req));
      context.on('response', resp => this.captureResponse(resp));
      this.logger.debug('📡 NetworkCapture: Monitoring enabled');
    } catch (error) {
      this.logger.debug(`NetworkCapture setup error: ${error.message}`);
    }
  }

  attach(context) {
    // Logic for request/response capture is handled by setupNetworkCapture
    // This method is kept for potential future initialization tasks if needed.
  }

  captureRequest(request) {
    try {
      const url = request.url();
      if (this.config.get('sameOrigin')) {
        if (new URL(url).origin !== this.origin) {
          return;
        }
      }
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

      // Store in resultManager
      this.resultManager.addRequest({
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

  async flush() {
    try {
      // Choose best non-asset request for http.raw
      const candidates = this.pairs.filter(r => !this._isAsset(r.url));
      if (candidates.length > 0) {
        const best = candidates
          .map(r => ({ r, score: this._score(r) }))
          .sort((a, b) => b.score - a.score)[0].r;
        await this.streamWriter.writeHTTPRawSingle(best);
      }
      // Optional batch writer if requested
      if (this.formats.includes('http') && this.pairs.length > 0) {
        await this.streamWriter.writeHTTP({ requests: candidates });
      }
    } catch (e) {
      this.logger?.debug?.(`flush error: ${e.message}`);
    }
  }

  _isAsset(u) {
    try {
      const { pathname } = new URL(u);
      const dot = pathname.lastIndexOf('.');
      if (dot === -1) return false;
      const ext = pathname.slice(dot).toLowerCase();
      return this.assetExt.has(ext);
    } catch { return false; }
  }

  _score(r) {
    let s = 0;
    const url = new URL(r.url);
    const qcnt = Array.from(url.searchParams.keys()).length;
    const body = r.postData || '';
    const ct = this._contentType(r.headers);
    const isForm = /application\/x-www-form-urlencoded/i.test(ct) && /[=&]/.test(body);
    const isJSON = /application\/json/i.test(ct) && (body.trim().startsWith('{') || body.trim().startsWith('['));
    if (r.method === 'POST') s += 5;
    if (isForm) s += 5;
    if (isJSON) s += 4;
    if (qcnt > 0) s += Math.min(3, qcnt);
    return s;
  }

  _headersSnake(headers) {
    const out = {};
    for (const [k, v] of Object.entries(headers || {})) out[String(k).toLowerCase().replace(/-/g, '_')] = v;
    return out;
  }

  _contentType(headers) {
    for (const k of Object.keys(headers || {})) if (k.toLowerCase() === 'content-type') return headers[k];
    return '';
  }
}

module.exports = { NetworkCapture };
