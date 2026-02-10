// src/output/JSONLWriter.js - COMPLETE WITH URL VALIDATION v2.2
const fs = require('fs');
const path = require('path');

class JSONLWriter {
  constructor(outputDir, logger, customFilePath = null, append = false, originDomain = null, sameOrigin = false, includeSubdomains = false) {
    this.outputDir = outputDir;
    this.logger = logger;
    this.stream = null;
    this.filepath = customFilePath || path.join(outputDir, 'requests.jsonl');
    this.append = append;
    this.originDomain = originDomain;
    this.sameOrigin = sameOrigin;
    this.includeSubdomains = includeSubdomains;

    this.lineCount = 0;
    this.skippedCount = 0;
    this.externalDomainCount = 0;
    
    this.logger.debug(`🔧 JSONLWriter constructor - append=${this.append}, filepath=${this.filepath}`);
    this._init();
  }

  _init() {
    try {
      // Ensure append mode is properly respected - use 'a' flag for append, 'w' for overwrite
      const flags = this.append === true ? 'a' : 'w';
      this.stream = fs.createWriteStream(this.filepath, { flags });
      if (this.append) {
        this.logger.debug(`✅ JSONL: ${this.filepath} (append mode, flags='${flags}')`);
      } else {
        this.logger.debug(`✅ JSONL: ${this.filepath} (write mode, flags='${flags}')`);
      }
      if (this.sameOrigin) {
        this.logger.debug(`🔒 Same-origin filtering: ${this.originDomain}`);
      }
    } catch (e) {
      this.logger.error(`JSONL init failed: ${e.message}`);
    }
  }

  _isSameOrigin(url) {
    if (!url) return true;
    if (!this.sameOrigin || !this.originDomain) return true;
    
    try {
      const urlObj = new URL(url);
      const targetDomain = urlObj.hostname;
      
      if (this.includeSubdomains) {
        return targetDomain === this.originDomain ||
               targetDomain.endsWith('.' + this.originDomain) ||
               this.originDomain.endsWith('.' + targetDomain);
      }
      
      return targetDomain === this.originDomain;
    } catch {
      return true;
    }
  }

  // ✅ Validate URL is complete and valid
  _isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.trim().length === 0) return false;
    if (url.startsWith('/') && !url.startsWith('//')) return false;
    if (url.startsWith('?') || url.startsWith('#')) return false;
    
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }

  writeRequest(req) {
    if (!this.stream) return;
    try {
      if (!this._isValidUrl(req.url)) {
        this.skippedCount++;
        return;
      }

      if (!this._isSameOrigin(req.url)) {
        this.externalDomainCount++;
        return;
      }

      const entry = {
        timestamp: this._getTimestamp(),
        request: {
          method: req.method || 'GET',
          endpoint: req.url,
          raw: this._formatRawRequest(req),
          ...(req.postData && req.postData.trim() && { body: req.postData }),
          tag: req.tag || this._getTagFromResourceType(req.resourceType),
          attribute: req.attribute || 'request',
          source: req.source || req.url
        },
        response: {
          status_code: 0,
          headers: {},
          body: '',
          content_length: 0
        }
      };

      this.stream.write(JSON.stringify(entry) + '\n');
      this.lineCount++;
    } catch (e) {
      this.logger.debug(`JSONL request write: ${e.message}`);
    }
  }

  writeCompleteTransaction(req, resp, forms = []) {
    if (!this.stream) return;
    try {
      const url = req.url || '';
      if (!this._isValidUrl(url)) {
        this.skippedCount++;
        return;
      }

      if (!this._isSameOrigin(url)) {
        this.externalDomainCount++;
        return;
      }

      const entry = {
        timestamp: this._getTimestamp(),
        request: {
          method: req.method || 'GET',
          endpoint: url,
          raw: this._formatRawRequest(req),
          ...(req.postData && req.postData.trim() && { body: req.postData }),
          tag: req.tag || 'document',
          attribute: req.attribute || 'request',
          source: req.source || url
        },
        response: {
          status_code: resp.status || 0,
          headers: resp.headers || {},
          body: (resp.body || '').substring(0, 500000),
          content_length: resp.contentLength || 0,
          raw: this._formatRawResponse(resp),
          ...(forms && forms.length > 0 && { forms })
        }
      };

      this.stream.write(JSON.stringify(entry) + '\n');
      this.lineCount++;
    } catch (e) {
      this.logger.debug(`JSONL transaction write: ${e.message}`);
    }
  }

  writeEndpointWithVariations(endpoint, variations = []) {
    if (!this.stream) return;
    try {
      if (!this._isValidUrl(endpoint)) {
        this.skippedCount++;
        return;
      }

      if (!this._isSameOrigin(endpoint)) {
        this.externalDomainCount++;
        return;
      }

      const validVariations = variations.filter(v => this._isValidUrl(v) && this._isSameOrigin(v));
      
      const baseEntry = {
        timestamp: this._getTimestamp(),
        request: {
          method: 'GET',
          endpoint: endpoint,
          raw: this._formatRawRequest({ 
            method: 'GET', 
            url: endpoint, 
            headers: {} 
          }),
          tag: 'endpoint',
          attribute: 'parametrized',
          source: endpoint
        },
        response: {
          status_code: 0,
          headers: {},
          body: '',
          content_length: 0,
          variations: validVariations
        }
      };

      this.stream.write(JSON.stringify(baseEntry) + '\n');
      this.lineCount++;

      validVariations.forEach(variation => {
        const entry = {
          timestamp: this._getTimestamp(),
          request: {
            method: 'GET',
            endpoint: variation,
            raw: this._formatRawRequest({ 
              method: 'GET', 
              url: variation, 
              headers: {} 
            }),
            tag: 'endpoint-variation',
            attribute: 'fuzzed',
            source: endpoint
          },
          response: {
            status_code: 0,
            headers: {},
            body: '',
            content_length: 0
          }
        };

        this.stream.write(JSON.stringify(entry) + '\n');
        this.lineCount++;
      });
    } catch (e) {
      this.logger.debug(`JSONL variation write: ${e.message}`);
    }
  }

  _formatRawRequest(req) {
    try {
      if (!this._isValidUrl(req.url)) {
        return '';
      }

      const urlObj = new URL(req.url);
      const pathname = urlObj.pathname + urlObj.search;
      
      let raw = `${req.method || 'GET'} ${pathname} HTTP/1.1\r\n`;
      raw += `Host: ${urlObj.hostname}\r\n`;
      
      if (req.headers && typeof req.headers === 'object') {
        const processedHeaders = new Set();
        
        Object.entries(req.headers).forEach(([key, value]) => {
          const headerName = this._formatHeaderName(key);
          const lowerName = headerName.toLowerCase();
          
          if (lowerName !== 'host' && !processedHeaders.has(lowerName)) {
            raw += `${headerName}: ${value}\r\n`;
            processedHeaders.add(lowerName);
          }
        });
      }
      
      if (req.postData && req.postData.trim()) {
        const contentLen = Buffer.byteLength(req.postData);
        raw += `Content-Length: ${contentLen}\r\n`;
        
        const hasContentType = req.headers && Object.keys(req.headers).some(k => 
          k.toLowerCase() === 'content-type'
        );
        
        if (!hasContentType) {
          raw += `Content-Type: application/x-www-form-urlencoded\r\n`;
        }
      }
      
      raw += `Connection: keep-alive\r\n`;
      raw += `\r\n`;
      
      if (req.postData && req.postData.trim()) {
        raw += req.postData;
      }
      
      return raw;
    } catch (e) {
      return '';
    }
  }

  _formatRawResponse(resp) {
    try {
      const statusText = this._getStatusText(resp.status);
      let raw = `HTTP/1.1 ${resp.status} ${statusText}\r\n`;
      
      if (resp.headers && typeof resp.headers === 'object') {
        const processedHeaders = new Set();
        
        Object.entries(resp.headers).forEach(([key, value]) => {
          const headerName = this._formatHeaderName(key);
          const lowerName = headerName.toLowerCase();
          
          if (!processedHeaders.has(lowerName)) {
            raw += `${headerName}: ${value}\r\n`;
            processedHeaders.add(lowerName);
          }
        });
      }
      
      raw += `\r\n`;
      
      if (resp.body && resp.body.trim()) {
        const bodyPreview = resp.body.substring(0, 50000);
        raw += bodyPreview;
        
        if (resp.body.length > 50000) {
          raw += `\n...[TRUNCATED - ${resp.body.length - 50000} bytes omitted]`;
        }
      }
      
      return raw;
    } catch (e) {
      return '';
    }
  }

  _formatHeaderName(key) {
    if (!key) return '';
    return key
      .split('-')
      .map(word => {
        if (!word) return '';
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join('-');
  }

  _getStatusText(status) {
    const statusMap = {
      100: 'Continue', 101: 'Switching Protocols',
      200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 206: 'Partial Content',
      300: 'Multiple Choices', 301: 'Moved Permanently', 302: 'Found', 303: 'See Other',
      304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
      400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden',
      404: 'Not Found', 405: 'Method Not Allowed', 406: 'Not Acceptable', 408: 'Request Timeout',
      409: 'Conflict', 410: 'Gone', 413: 'Payload Too Large', 414: 'URI Too Long',
      415: 'Unsupported Media Type', 429: 'Too Many Requests',
      500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway',
      503: 'Service Unavailable', 504: 'Gateway Timeout'
    };
    return statusMap[status] || 'Unknown';
  }

  _getTagFromResourceType(resourceType) {
    const tagMap = {
      'document': 'html', 'stylesheet': 'link', 'image': 'img', 'media': 'video',
      'font': 'font', 'script': 'script', 'xhr': 'xhr', 'fetch': 'fetch',
      'websocket': 'ws', 'form': 'form'
    };
    return tagMap[resourceType] || resourceType || 'document';
  }

  _getTimestamp() {
    return new Date().toISOString();
  }

  async close() {
    if (this.stream) {
      return new Promise((resolve, reject) => {
        this.stream.end(() => {
          const stats = `${this.lineCount} lines written`;
          if (this.skippedCount > 0) {
            this.logger.info(`✅ JSONL: ${this.filepath} (${stats}, ${this.skippedCount} invalid skipped)`);
          } else if (this.externalDomainCount > 0) {
            this.logger.info(`✅ JSONL: ${this.filepath} (${stats}, ${this.externalDomainCount} external domains skipped)`);
          } else {
            this.logger.info(`✅ JSONL: ${this.filepath} (${stats})`);
          }
          resolve();
        });
        
        this.stream.on('error', reject);
        setTimeout(resolve, 5000);
      });
    }
  }

  getStats() {
    return {
      file: this.filepath,
      lines: this.lineCount,
      skipped: this.skippedCount,
      externalDomains: this.externalDomainCount
    };
  }
}

module.exports = { JSONLWriter };
