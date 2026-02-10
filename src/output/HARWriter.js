// src/output/HARWriter.js - HAR Format Writer v1.0 (Dalfox compatible)
const fs = require('fs');
const path = require('path');

class HARWriter {
  constructor(outputDir, logger, customFilePath = null, append = false) {
    this.outputDir = outputDir;
    this.logger = logger;
    this.filepath = customFilePath || path.join(outputDir, 'crawl.har');
    this.append = append;
    this.entries = [];
    this.pendingRequests = new Map();
    this.logger.debug(`✅ HAR: ${this.filepath} (append=${this.append})`);
  }

  addEntry(req, resp = {}) {
    try {
      if (!req.url) return;

      const urlObj = new URL(req.url);
      const startedDateTime = new Date().toISOString();

      const reqHeaders = [];
      if (req.headers && typeof req.headers === 'object') {
        Object.entries(req.headers).forEach(([k, v]) => {
          reqHeaders.push({ name: k, value: v });
        });
      }

      const respHeaders = [];
      if (resp.headers && typeof resp.headers === 'object') {
        Object.entries(resp.headers).forEach(([k, v]) => {
          respHeaders.push({ name: k, value: v });
        });
      }

      const queryString = [];
      urlObj.searchParams.forEach((value, name) => {
        queryString.push({ name, value });
      });

      let postData = null;
      if (req.postData && req.postData.trim()) {
        postData = {
          mimeType: 'application/x-www-form-urlencoded',
          text: req.postData,
          params: this._parsePostData(req.postData)
        };
      }

      const entry = {
        startedDateTime: startedDateTime,
        time: resp.time || '0m',
        request: {
          method: req.method || 'GET',
          url: req.url,
          httpVersion: 'HTTP/1.1',
          headers: reqHeaders,
          queryString: queryString,
          ...(postData && { postData })
        },
        response: {
          status: resp.status || 0,
          statusText: this._getStatusText(resp.status),
          httpVersion: 'HTTP/1.1',
          headers: respHeaders,
          cookies: [],
          content: {
            size: (resp.body || '').length,
            mimeType: resp.contentType || 'text/html',
            text: (resp.body || '').substring(0, 50000)
          },
          redirectURL: ''
        },
        cache: {},
        timings: {
          blocked: -1,
          dns: -1,
          connect: -1,
          send: -1,
          wait: -1,
          receive: -1,
          ssl: -1
        }
      };

      this.entries.push(entry);
    } catch (e) {
      this.logger.debug(`HAR entry error: ${e.message}`);
    }
  }

  _parsePostData(postData) {
    try {
      const params = [];
      const pairs = postData.split('&');
      pairs.forEach(pair => {
        const [name, value] = pair.split('=');
        params.push({
          name: decodeURIComponent(name || ''),
          value: decodeURIComponent(value || '')
        });
      });
      return params;
    } catch (e) {
      return [];
    }
  }

  _getStatusText(status) {
    const map = {
      200: 'OK', 201: 'Created', 204: 'No Content',
      301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
      400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
      500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable'
    };
    return map[status] || 'Unknown';
  }

  async close() {
    try {
      let harData = {
        log: {
          version: '1.2',
          creator: {
            name: 'SpeedCrawl',
            version: '3.0.0'
          },
          entries: []
        }
      };

      // If in append mode, load existing HAR entries
      if (this.append && fs.existsSync(this.filepath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(this.filepath, 'utf8'));
          if (existing.log && Array.isArray(existing.log.entries)) {
            harData.log.entries = existing.log.entries;
            this.logger.debug(`📖 Loaded ${harData.log.entries.length} existing HAR entries for append`);
          }
        } catch (e) {
          this.logger.debug(`HAR append mode: could not read existing file, creating new`);
        }
      }

      // Add new entries
      harData.log.entries.push(...this.entries);

      fs.writeFileSync(this.filepath, JSON.stringify(harData, null, 2));
      
      if (this.append) {
        this.logger.info(`✅ HAR: ${this.filepath} (${harData.log.entries.length} total entries, ${this.entries.length} new)`);
      } else {
        this.logger.info(`✅ HAR: ${this.filepath} (${this.entries.length} entries)`);
      }
    } catch (e) {
      this.logger.error(`HAR close error: ${e.message}`);
    }
  }
}

module.exports = { HARWriter };
