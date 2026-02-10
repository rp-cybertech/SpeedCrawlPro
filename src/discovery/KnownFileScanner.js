// src/discovery/KnownFileScanner.js - PRODUCTION COMPLETE (FAST & NON-BLOCKING)
const { EventEmitter } = require('events');

class KnownFileScanner extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.discovered = [];
    this.knownFiles = [
      '/robots.txt',
      '/sitemap.xml',
      '/sitemap_index.xml',
      '/.well-known/security.txt',
      '/security.txt',
      '/.env',
      '/.env.local',
      '/.env.production',
      '/.git/config',
      '/.git/HEAD',
      '/package.json',
      '/composer.json',
      '/config.json',
      '/app.json',
      '/swagger.json',
      '/openapi.json',
      '/api-docs',
      '/api/swagger.json',
      '/graphql',
      '/api/graphql',
      '/admin',
      '/administrator',
      '/wp-admin',
      '/phpmyadmin',
      '/api',
      '/api/v1',
      '/api/v2',
      '/health',
      '/status',
      '/version',
      '/metrics',
      '/actuator',
      '/backup.sql',
      '/backup.zip',
      '/db.sql',
      '/database.sql'
    ];
    this.timeout = 2000; // 2 seconds per file
  }

  async scan(page, baseUrl) {
    this.logger.info('🔍 Scanning for known files...');
    const found = [];
    const context = page.context();
    let scanned = 0;

    // Parallel scan with Promise.allSettled for non-blocking
    const scanTasks = this.knownFiles.map(async (file) => {
      try {
        const url = new URL(file, baseUrl).href;
        scanned++;
        
        // Use HEAD request for speed
        const response = await Promise.race([
          context.request.head(url, { 
            timeout: this.timeout,
            ignoreHTTPSErrors: true,
            failOnStatusCode: false
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('timeout')), this.timeout + 100)
          )
        ]);

        const status = response.status();
        
        if (status >= 200 && status < 400) {
          this.logger.success(`✅ ${file} (${status})`);
          const result = { url, file, status };
          found.push(result);
          this.discovered.push(result);
          this.emit('found', result);
          return result;
        }
      } catch (e) {
        // Silent fail
      }
      return null;
    });

    // Wait for all with global timeout
    try {
      await Promise.race([
        Promise.allSettled(scanTasks),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Global timeout')), 10000)
        )
      ]);
    } catch (e) {
      this.logger.debug(`⚠️ Known files scan timeout`);
    }

    if (found.length > 0) {
      this.logger.info(`📄 Found ${found.length}/${this.knownFiles.length} known files`);
    } else {
      this.logger.debug(`📄 No known files found`);
    }

    return found;
  }

  getDiscovered() {
    return this.discovered;
  }
}

module.exports = { KnownFileScanner };
