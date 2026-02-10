// src/output/HTTPFormatter.js
const fs = require('fs');
const path = require('path');

class HTTPFormatter {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  formatHTTPRequest(requestData) {
    try {
      const method = requestData.method || 'GET';
      const url = new URL(requestData.url);
      const origHeaders = requestData.headers || {};
      const hasBody = requestData.postData != null && requestData.postData !== '';
      const bodyStr = hasBody
        ? (typeof requestData.postData === 'string' ? requestData.postData : JSON.stringify(requestData.postData))
        : '';
      const bodyLen = hasBody ? Buffer.byteLength(bodyStr, 'utf8') : 0;

      // Normalize headers: remove host/content-length; add Connection if missing
      const hdrs = {};
      for (const [k, v] of Object.entries(origHeaders)) {
        const lk = String(k).toLowerCase();
        if (lk === 'host' || lk === 'content-length') continue;
        hdrs[k] = v;
      }
      if (hasBody) {
        // Add content-type if looks like JSON and header missing
        const hasCT = Object.keys(hdrs).some(k => k.toLowerCase() === 'content-type');
        if (!hasCT && (bodyStr.trim().startsWith('{') || bodyStr.trim().startsWith('['))) {
          hdrs['Content-Type'] = 'application/json';
        }
        hdrs['Content-Length'] = String(bodyLen);
      }
      if (!Object.keys(hdrs).some(k => k.toLowerCase() === 'connection')) {
        hdrs['Connection'] = 'close';
      }

      let http = `${method} ${url.pathname}${url.search} HTTP/1.1\r\n`;
      http += `Host: ${url.host}\r\n`;
      for (const [k, v] of Object.entries(hdrs)) {
        http += `${k}: ${v}\r\n`;
      }
      http += `\r\n`;
      if (hasBody) http += bodyStr;
      return http;
    } catch (e) {
      this.logger?.debug?.(`req fmt error: ${e.message}`);
      return '';
    }
  }

  async writeJSONLFile(entries, filePath, append = false) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      
      const lines = entries.map(e => this._formatJSONLEntry(e)).filter(Boolean);
      const content = lines.join('\n') + '\n';
      
      if (append && fs.existsSync(filePath)) {
        fs.appendFileSync(filePath, content, 'utf8');
        this.logger?.success?.(`JSONL appended: ${filePath} (+${lines.length} entries)`);
      } else {
        fs.writeFileSync(filePath, content, 'utf8');
        this.logger?.success?.(`JSONL written: ${filePath} (${lines.length} entries)`);
      }
      return filePath;
    } catch (e) {
      this.logger?.error?.(`JSONL write error: ${e.message}`);
      return null;
    }
  }

  _formatJSONLEntry(entry) {
    try {
      const timestamp = entry.timestamp || new Date().toISOString();
      const url = entry.url || entry.endpoint || '';

      const request = {
        method: entry.method || 'GET',
        endpoint: url
      };

      if (entry.tag) request.tag = entry.tag;
      if (entry.attribute) request.attribute = entry.attribute;
      if (entry.source) request.source = entry.source;

      if (entry.postData && entry.postData.trim()) {
        request.raw = this._formatRawRequestWithBody(entry);
      } else {
        request.raw = this._formatRawRequestFromEntry(entry);
      }

      const response = {
        status_code: entry.response?.status || 0,
        headers: entry.response?.headers || {},
        content_length: entry.response?.contentLength || 0
      };

      if (entry.response?.body) {
        response.raw = this._formatRawResponse(entry.response);
      } else {
        response.raw = `HTTP/1.1 ${entry.response?.status || 0} ${this._getStatusText(entry.response?.status)}\r\n\r\n`;
      }

      return JSON.stringify({ timestamp, request, response });
    } catch (e) {
      return null;
    }
  }

  _formatRawRequestFromEntry(entry) {
    try {
      if (!entry.url) return '';
      const url = new URL(entry.url);
      let raw = `${entry.method || 'GET'} ${url.pathname}${url.search} HTTP/1.1\r\n`;
      raw += `Host: ${url.host}\r\n`;
      
      const headers = entry.headers || {};
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() !== 'host') {
          raw += `${key}: ${value}\r\n`;
        }
      }
      
      raw += `\r\n`;
      return raw;
    } catch (e) {
      return '';
    }
  }

  _formatRawRequestWithBody(entry) {
    try {
      if (!entry.url) return '';
      const url = new URL(entry.url);
      let raw = `${entry.method || 'GET'} ${url.pathname}${url.search} HTTP/1.1\r\n`;
      raw += `Host: ${url.host}\r\n`;
      
      const headers = entry.headers || {};
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() !== 'host') {
          raw += `${key}: ${value}\r\n`;
        }
      }
      
      if (entry.postData) {
        const bodyStr = typeof entry.postData === 'string' ? entry.postData : JSON.stringify(entry.postData);
        raw += `Content-Length: ${Buffer.byteLength(bodyStr)}\r\n`;
        if (!headers['content-type'] && !headers['Content-Type']) {
          raw += `Content-Type: application/x-www-form-urlencoded\r\n`;
        }
      }
      
      raw += `\r\n`;
      if (entry.postData) {
        raw += typeof entry.postData === 'string' ? entry.postData : JSON.stringify(entry.postData);
      }
      return raw;
    } catch (e) {
      return '';
    }
  }

  _formatRawResponse(resp) {
    try {
      const status = resp.status || 0;
      const statusText = this._getStatusText(status);
      let raw = `HTTP/1.1 ${status} ${statusText}\r\n`;
      
      const headers = resp.headers || {};
      for (const [key, value] of Object.entries(headers)) {
        raw += `${key}: ${value}\r\n`;
      }
      
      raw += `\r\n`;
      
      if (resp.body) {
        const bodyPreview = typeof resp.body === 'string' ? resp.body : '';
        raw += bodyPreview;
      }
      
      return raw;
    } catch (e) {
      return '';
    }
  }

  _getStatusText(status) {
    const statusMap = {
      100: 'Continue', 101: 'Switching Protocols',
      200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 206: 'Partial Content',
      300: 'Multiple Choices', 301: 'Moved Permanently', 302: 'Found', 303: 'See Other',
      304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
      400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
      404: 'Not Found', 405: 'Method Not Allowed',
      500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable'
    };
    return statusMap[status] || 'Unknown';
  }

  async writeHARFile(requests, filePath, append = false) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      
      let log = {
        log: {
          version: '1.2',
          creator: { name: 'SpeedCrawl', version: '22.2' },
          entries: []
        }
      };
      
      // If appending and file exists, load existing entries
      if (append && fs.existsSync(filePath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          if (existing.log && Array.isArray(existing.log.entries)) {
            log.log.entries = existing.log.entries;
          }
        } catch (e) {
          this.logger?.debug?.(`HAR append: could not read existing file, creating new`);
        }
      }
      
      // Add new entries
      const newEntries = (requests || []).map(r => ({
        startedDateTime: new Date(r.timestamp || Date.now()).toISOString(),
        request: {
          method: r.method || 'GET',
          url: r.url,
          httpVersion: 'HTTP/1.1',
          headers: Object.entries(r.headers || {}).map(([name, value]) => ({ name, value })),
          queryString: [],
          headersSize: -1,
          bodySize: (r.postData && String(r.postData).length) || 0,
          postData: r.postData ? { mimeType: this._contentType(r.headers), text: String(r.postData) } : undefined
        },
        response: {
          status: (r.response && r.response.status) || 0,
          statusText: (r.response && r.response.statusText) || '',
          httpVersion: 'HTTP/1.1',
          headers: Object.entries((r.response && r.response.headers) || {}).map(([name, value]) => ({ name, value })),
          headersSize: -1,
          bodySize: ((r.response && r.response.body) && String(r.response.body).length) || -1
        },
        cache: {},
        timings: { send: 0, wait: 0, receive: 0 }
      }));
      
      log.log.entries.push(...newEntries);
      fs.writeFileSync(filePath, JSON.stringify(log, null, 2), 'utf8');
      
      if (append) {
        this.logger?.success?.(`HAR appended: ${filePath} (${log.log.entries.length} total entries, +${newEntries.length} new)`);
      } else {
        this.logger?.success?.(`HAR written: ${filePath} (${newEntries.length} entries)`);
      }
      return filePath;
    } catch (e) {
      this.logger?.error?.(`HAR write error: ${e.message}`);
      return null;
    }
  }

  async writeHTTPFile(data, filePath, append = false) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      
      let content = '';
      for (const req of data.requests || []) {
        content += this.formatHTTPRequest(req);
        content += '\n\n---\n\n';
      }
      
      if (append && fs.existsSync(filePath)) {
        fs.appendFileSync(filePath, content, 'utf8');
        this.logger?.success?.(`HTTP appended: ${filePath}`);
      } else {
        fs.writeFileSync(filePath, content, 'utf8');
        this.logger?.success?.(`HTTP written: ${filePath}`);
      }
      return filePath;
    } catch (e) {
      this.logger?.error?.(`HTTP write error: ${e.message}`);
      return null;
    }
  }

  _contentType(headers) {
    const h = headers || {};
    for (const k of Object.keys(h)) if (k.toLowerCase() === 'content-type') return h[k];
    return 'application/json';
  }
}

module.exports = { HTTPFormatter };
