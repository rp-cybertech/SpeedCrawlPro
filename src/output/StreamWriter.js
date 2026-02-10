// src/output/StreamWriter.js
const fs = require('fs');
const path = require('path');
const { HTTPFormatter } = require('./HTTPFormatter');

class StreamWriter {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.outputDir = this.config.get('outputDir') || this.config.get('output') || './speedcrawl-output';
    this.formats = this.config.get('formats') || [];
    this.httpFormatter = new HTTPFormatter(config, logger);
    this.ensureDirectories();
    this.streamFile = path.join(this.outputDir, 'requests-stream.jsonl');
    this.eventJsonlFile = this.config.get('customJsonlFile') || null; // Use custom file path if provided
    this.customHarFile = this.config.get('customHarFile') || null;
    this.customJsonFile = this.config.get('customJsonFile') || null;
    this.customHttpFile = this.config.get('customHttpFile') || null;
    this.seq = 1;
  }

  ensureDirectories() {
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });

    if (this.formats.includes('jsonl') && !this.customJsonlFile) {
      const d = path.join(this.outputDir, 'jsonl');
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    }
    if (this.formats.includes('har') && !this.customHarFile) {
      const d = path.join(this.outputDir, 'har');
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    }
    if (this.formats.includes('http') && !this.customHttpFile) {
      const d = path.join(this.outputDir, 'http-requests');
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    }
  }

  appendRequest(request) {
    try {
      fs.appendFileSync(this.streamFile, JSON.stringify(request) + '\n', 'utf8');
    } catch (e) {
      this.logger?.debug?.(`Append request error: ${e.message}`);
    }
  }

  appendScanLine(entry) {
    if (!this.formats.includes('jsonl')) return;
    try {
      if (!this.eventJsonlFile) {
        // Use consistent filename when in append mode to avoid creating multiple files
        const appendMode = this.config.get('appendOutput') || false;
        if (appendMode) {
          this.eventJsonlFile = path.join(this.outputDir, 'jsonl', 'requests.jsonl');
        } else {
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          this.eventJsonlFile = path.join(this.outputDir, 'jsonl', `network_${ts}.jsonl`);
        }
      }
      fs.appendFileSync(this.eventJsonlFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch (e) {
      this.logger?.debug?.(`JSONL append error: ${e.message}`);
    }
  }

  async writeJSONL(data) {
    if (!this.formats.includes('jsonl')) return null;
    const entries = Array.isArray(data?.entries) ? data.entries
                  : Array.isArray(data?.requests) ? data.requests
                  : Array.isArray(data?.pages) ? data.pages
                  : [];
    const filePath = data.customJsonlFile || this.customJsonlFile || path.join(this.outputDir, 'jsonl', 'requests.jsonl');
    const append = data.append ?? this.config.get('appendOutput') ?? false;
    return this.httpFormatter.writeJSONLFile(entries, filePath, append);
  }

  async writeHAR({ requests, customHarFile }) {
    if (!this.formats.includes('har')) return null;
    const filePath = customHarFile || this.customHarFile || path.join(this.outputDir, 'har', 'requests.har');
    const append = this.config.get('appendOutput') || false;
    return this.httpFormatter.writeHARFile(requests || [], filePath, append);
  }

  async writeHTTP({ requests, customHttpFile }) {
    if (!this.formats.includes('http')) return null;
    const filePath = customHttpFile || this.customHttpFile || path.join(this.outputDir, 'http-requests', 'requests.http');
    const append = this.config.get('appendOutput') || false;
    return this.httpFormatter.writeHTTPFile({ requests: requests || [] }, filePath, append);
  }

  async writeHTTPRawSingle(requestRecord) {
    try {
      const raw = this.httpFormatter.formatHTTPRequest(requestRecord);
      const file = path.join(this.outputDir, 'http.raw');
      fs.writeFileSync(file, raw, 'utf8');
      this.logger?.success?.(`http.raw written: ${file}`);
      return file;
    } catch (e) {
      this.logger?.error?.(`http.raw write error: ${e.message}`);
      return null;
    }
  }

  cleanup() {}
}

module.exports = { StreamWriter };
