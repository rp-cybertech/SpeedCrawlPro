/**
 * SpeedCrawl Pro - ReportGenerator (KATANA/HTTPX FORMAT)
 * Generates the EXACT format from paste.txt
 */

const fs = require('fs');
const path = require('path');

class ReportGenerator {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async generateEnhancedReports(results) {
    try {
      this.logger.info('📊 Generating enhanced reports...');
      
      const outputDir = this.config.get('outputDir', './speedcrawl-output');
      const formats = this.config.get('formats', ['json', 'jsonl']);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      if (formats.includes('json')) {
        await this.generateJSON(outputDir, results);
      }

      if (formats.includes('jsonl')) {
        await this.generateKatanaJSONL(outputDir, results);
      }

      if (formats.includes('http')) {
        await this.generateHTTPFiles(outputDir, results);
      }

      this.logger.info('✅ Reports generated successfully');
    } catch (error) {
      this.logger.error(`Report generation error: ${error.message}`);
    }
  }

  async generateJSON(outputDir, results) {
    try {
      const reportPath = path.join(outputDir, 'crawl-report.json');
      
      const report = {
        timestamp: new Date().toISOString(),
        summary: {
          pages: results.pages.length,
          forms: results.forms,
          fieldsProcessed: results.fieldsProcessed,
          requests: results.requests?.length || 0,
          technologies: results.technologies || [],
          duration: results.duration || 0
        },
        pages: results.pages,
        formData: results.formData || [],
        requests: results.requests || [],
        endpoints: results.endpoints || [],
        technologies: results.technologies || []
      };

      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      this.logger.info(`   📄 JSON: ${reportPath}`);
    } catch (error) {
      this.logger.error(`JSON generation error: ${error.message}`);
    }
  }

  async generateKatanaJSONL(outputDir, results) {
    try {
      const jsonlPath = path.join(outputDir, 'requests.jsonl');
      const lines = [];

      // KATANA/HTTPX FORMAT - exactly like paste.txt
      const requests = results.requests || [];
      const technologies = results.technologies || [];
      
      for (const req of requests) {
        if (!req.url || req.url.startsWith('data:') || req.url.startsWith('about:') || req.url.startsWith('chrome')) {
          continue;
        }

        try {
          const urlObj = new URL(req.url);
          
          // Build RAW request format
          const rawRequest = this.buildRawRequest(req, urlObj);
          
          // Build entry in Katana format
          const entry = {
            timestamp: new Date(req.timestamp).toISOString(),
            request: {
              method: req.method,
              endpoint: req.url,
              raw: rawRequest
            },
            response: {
              status_code: req.response?.status || 0,
              headers: req.response?.headers || {},
              technologies: technologies,
              raw: "" // Response body would go here (we don't capture it currently)
            }
          };

          lines.push(JSON.stringify(entry));
        } catch {}
      }

      if (lines.length > 0) {
        fs.writeFileSync(jsonlPath, lines.join('\n'));
        this.logger.info(`   📄 JSONL (Katana/httpx): ${jsonlPath} (${lines.length} requests)`);
      } else {
        this.logger.warn(`   ⚠️  No requests captured for JSONL output`);
      }
    } catch (error) {
      this.logger.error(`JSONL generation error: ${error.message}`);
    }
  }

  buildRawRequest(req, urlObj) {
    const lines = [];
    
    // Request line
    lines.push(`${req.method} ${urlObj.pathname}${urlObj.search} HTTP/1.1`);
    lines.push(`Host: ${urlObj.host}`);
    
    // Headers
    if (req.headers) {
      for (const [key, value] of Object.entries(req.headers)) {
        if (key.toLowerCase() !== 'host') {
          lines.push(`${key}: ${value}`);
        }
      }
    }
    
    // Empty line before body
    lines.push('');
    
    // Body (POST data)
    if (req.postData) {
      lines.push(req.postData);
    }
    
    return lines.join('\\r\\n');
  }

  async generateHTTPFiles(outputDir, results) {
    try {
      const httpDir = path.join(outputDir, 'http-requests');
      
      if (!fs.existsSync(httpDir)) {
        fs.mkdirSync(httpDir, { recursive: true });
      }

      const requests = results.requests || [];
      let fileCount = 0;

      for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        
        if (!req.url || req.url.startsWith('data:') || req.url.startsWith('about:')) {
          continue;
        }

        try {
          const httpContent = this.formatHTTPRequest(req);
          const fileName = `request-${String(i + 1).padStart(3, '0')}.txt`;
          const filePath = path.join(httpDir, fileName);

          fs.writeFileSync(filePath, httpContent);
          fileCount++;
        } catch {}
      }

      if (fileCount > 0) {
        this.logger.info(`   📄 HTTP files: ${httpDir}/ (${fileCount} files)`);
      }
    } catch (error) {
      this.logger.error(`HTTP file generation error: ${error.message}`);
    }
  }

  formatHTTPRequest(req) {
    try {
      const url = new URL(req.url);
      const lines = [];
      
      lines.push(`# ${req.method} ${req.url}`);
      lines.push(`# Captured: ${new Date(req.timestamp).toISOString()}`);
      lines.push('');
      lines.push(`${req.method} ${url.pathname}${url.search} HTTP/1.1`);
      lines.push(`Host: ${url.host}`);
      
      if (req.headers) {
        for (const [key, value] of Object.entries(req.headers)) {
          if (key.toLowerCase() !== 'host') {
            lines.push(`${key}: ${value}`);
          }
        }
      }

      lines.push('');

      if (req.postData) {
        lines.push(req.postData);
      }

      return lines.join('\n');
    } catch {
      return '';
    }
  }
}

module.exports = { ReportGenerator };
