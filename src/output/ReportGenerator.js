/**
 * SpeedCrawl Pro v14.0 - Enhanced Report Generator (FIXED FILE OUTPUT)
 * Single nuclei file + separate HTTP folder for SQLMap
 */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class ReportGenerator extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.outputDir = this.config.get('outputDir', './speedcrawl-output');
  }

  async generateEnhancedReports(results) {
    try {
      this.logger.info('📊 Generating enhanced reports...');
      
      // Ensure output directory exists
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
      
      // Create HTTP requests folder for SQLMap
      const httpDir = path.join(this.outputDir, 'http-requests');
      if (!fs.existsSync(httpDir)) {
        fs.mkdirSync(httpDir, { recursive: true });
      }
      
      const formats = this.config.get('formats', ['json', 'jsonl']);
      
      // Generate main results JSON
      if (formats.includes('json')) {
        await this.generateJSON(results);
      }
      
      // Generate SINGLE nuclei-compatible JSONL (FIXED)
      if (formats.includes('jsonl')) {
        await this.generateNucleiJSONL(results);
      }
      
      // Generate HTTP raw files for SQLMap (FIXED)
      if (formats.includes('http') || this.config.get('nucleiCompatible')) {
        await this.generateHTTPFiles(results, httpDir);
      }
      
      // Generate HAR if requested
      if (formats.includes('har')) {
        await this.generateHAR(results);
      }
      
      this.logger.success('✅ Enhanced reports generated successfully');
      
    } catch (error) {
      this.logger.error('Report generation failed:', error);
      throw error;
    }
  }

  async generateJSON(results) {
    const jsonPath = path.join(this.outputDir, 'speedcrawl-results.json');
    
    const report = {
      metadata: {
        version: '14.0.0',
        timestamp: new Date().toISOString(),
        target: results.pages[0]?.url || 'unknown',
        duration: results.duration,
        generated_by: 'SpeedCrawl Pro'
      },
      summary: {
        pages_processed: results.pages.length,
        forms_processed: results.forms,
        spa_forms_processed: results.spaForms,
        endpoints_found: results.endpoints,
        secrets_found: results.secrets,
        requests_captured: results.requests,
        chunks_analyzed: results.chunksAnalyzed
      },
      pages: results.pages,
      requests: results.requests || [],
      endpoints: results.endpoints || [],
      secrets: results.secrets || [],
      errors: results.errors || []
    };
    
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    this.logger.info(`📋 JSON report: ${jsonPath}`);
  }

  async generateNucleiJSONL(results) {
    const nucleiPath = path.join(this.outputDir, 'nuclei-targets.jsonl');
    
    try {
      const nucleiEntries = [];
      
      // Process requests into Nuclei format
      for (const request of results.requests || []) {
        try {
          const nucleiEntry = {
            url: request.url,
            method: request.method || 'GET',
            headers: request.headers || {},
            data: request.postData || null,
            timestamp: request.timestamp,
            status: request.response?.status || 0
          };
          
          nucleiEntries.push(JSON.stringify(nucleiEntry));
        } catch (error) {
          this.logger.debug(`Skipping malformed request: ${error.message}`);
        }
      }
      
      // Add discovered endpoints as targets
      for (const endpoint of results.endpoints || []) {
        try {
          const targetUrl = this.resolveEndpointUrl(endpoint, results.pages[0]?.url);
          if (targetUrl) {
            nucleiEntries.push(JSON.stringify({
              url: targetUrl,
              method: 'GET',
              source: 'endpoint_discovery',
              timestamp: Date.now()
            }));
          }
        } catch (error) {
          this.logger.debug(`Skipping invalid endpoint: ${endpoint}`);
        }
      }
      
      // Write single nuclei file
      fs.writeFileSync(nucleiPath, nucleiEntries.join('\n') + '\n');
      
      this.logger.info(`🎯 Nuclei targets: ${nucleiPath} (${nucleiEntries.length} entries)`);
      this.logger.info(`💡 Usage: nuclei -l ${nucleiPath} -im jsonl -t ~/nuclei-templates/`);
      
    } catch (error) {
      this.logger.error('Nuclei JSONL generation failed:', error);
    }
  }

  async generateHTTPFiles(results, httpDir) {
    try {
      let fileCount = 0;
      
      for (const [index, request] of (results.requests || []).entries()) {
        try {
          // Skip GET requests without parameters
          if (request.method === 'GET' && !request.url.includes('?')) {
            continue;
          }
          
          const httpContent = this.formatHTTPRequest(request);
          if (httpContent) {
            const fileName = `request-${index + 1}.http`;
            const filePath = path.join(httpDir, fileName);
            
            fs.writeFileSync(filePath, httpContent);
            fileCount++;
          }
          
        } catch (error) {
          this.logger.debug(`Error generating HTTP file ${index}: ${error.message}`);
        }
      }
      
      this.logger.info(`🌐 HTTP files: ${httpDir}/ (${fileCount} files)`);
      this.logger.info(`💡 Usage: sqlmap -r ${httpDir}/request-1.http --batch --risk=2`);
      
    } catch (error) {
      this.logger.error('HTTP files generation failed:', error);
    }
  }

  formatHTTPRequest(request) {
    try {
      const url = new URL(request.url);
      let httpRequest = '';
      
      // Request line
      httpRequest += `${request.method || 'GET'} ${url.pathname}${url.search} HTTP/1.1\n`;
      httpRequest += `Host: ${url.host}\n`;
      
      // Headers
      const headers = request.headers || {};
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() !== 'host') {
          httpRequest += `${key}: ${value}\n`;
        }
      }
      
      // Add common headers if missing
      if (!headers['User-Agent'] && !headers['user-agent']) {
        httpRequest += 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\n';
      }
      
      if (!headers['Accept'] && !headers['accept']) {
        httpRequest += 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\n';
      }
      
      // Body for POST requests
      if (request.postData && (request.method === 'POST' || request.method === 'PUT')) {
        httpRequest += '\n' + request.postData;
      }
      
      httpRequest += '\n\n';
      
      return httpRequest;
      
    } catch (error) {
      this.logger.debug(`HTTP format error: ${error.message}`);
      return null;
    }
  }

  async generateHAR(results) {
    const harPath = path.join(this.outputDir, 'speedcrawl-requests.har');
    
    const har = {
      log: {
        version: '1.2',
        creator: {
          name: 'SpeedCrawl Pro',
          version: '14.0.0'
        },
        entries: (results.requests || []).map(request => ({
          startedDateTime: new Date(request.timestamp || Date.now()).toISOString(),
          time: request.duration || 0,
          request: {
            method: request.method || 'GET',
            url: request.url,
            headers: Object.entries(request.headers || {}).map(([name, value]) => ({ name, value })),
            postData: request.postData ? {
              mimeType: 'application/x-www-form-urlencoded',
              text: request.postData
            } : undefined
          },
          response: {
            status: request.response?.status || 0,
            statusText: request.response?.statusText || '',
            headers: [],
            content: {
              size: 0,
              mimeType: 'text/html'
            }
          }
        }))
      }
    };
    
    fs.writeFileSync(harPath, JSON.stringify(har, null, 2));
    this.logger.info(`📋 HAR file: ${harPath}`);
  }

  resolveEndpointUrl(endpoint, baseUrl) {
    try {
      if (endpoint.startsWith('http')) {
        return endpoint;
      }
      
      if (endpoint.startsWith('/')) {
        const base = new URL(baseUrl);
        return `${base.protocol}//${base.host}${endpoint}`;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }
}

module.exports = { ReportGenerator };
