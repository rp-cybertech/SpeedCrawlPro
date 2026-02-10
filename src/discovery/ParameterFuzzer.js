// src/discovery/ParameterFuzzer.js - ELITE v3.0 - Intelligent fuzzing
class ParameterFuzzer {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.paramPatterns = new Map(); // param -> {values, types, frequency}
    this.endpointPatterns = new Map(); // endpoint -> common params
    
    // Advanced payloads categorized by type
    this.payloads = {
      // Numeric fuzzing
      numeric: ['0', '1', '100', '999', '9999', '-1', '2147483647', '-2147483648'],
      
      // Boolean fuzzing
      boolean: ['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'],
      
      // String fuzzing
      string: ['test', 'admin', 'user', 'guest', ''],
      
      // ID fuzzing
      id: ['1', '100', '999', 'me', 'self', 'current', 'abc123'],
      
      // Data discovery patterns
      data: ['test', 'data', 'info', 'config', 'settings', 'options', 'params'],
      
      // File and directory discovery
      file: ['test', 'example', 'config', 'backup', 'data', 'upload', 'download', 'image', 'file'],
      
      // Path traversal for data discovery
      path: ['../', '../..', '../../..', './', '/backup/', '/data/', '/config/', '/logs/', '/temp/'],
      
      // Format discovery
      format: ['json', 'xml', 'csv', 'html', 'text', 'raw'],
      
      // Common data parameters
      param: ['data', 'info', 'config', 'settings', 'options', 'params', 'fields', 'attributes'],
      
      // Database and storage discovery
      storage: ['db', 'database', 'storage', 'cache', 'session', 'state'],
      
      // API endpoint discovery
      endpoint: ['graphql', 'rest', 'soap', 'rpc', 'api', 'service'],
      
      // Debug and development discovery
      debug: ['debug', 'test', 'dev', 'local', 'verbose', 'trace'],
      
      // Authentication and session discovery
      auth: ['test', 'demo', 'sample', 'example', 'key', 'token', 'session'],
      
      // File discovery
      files: ['readme', 'license', 'changelog', 'docs', 'docs.php', 'info.php', 'test.php'],
      
      // Configuration discovery  
      config: ['config.php', 'settings.php', 'options.php', 'conf', '.env', 'config.json'],
      
      // Backup and temporary discovery
      backup: ['backup', 'bak', 'old', 'tmp', 'temp', 'cache']
    };

    // Common parameter names by category
    this.commonParams = {
      pagination: ['page', 'limit', 'offset', 'size', 'perPage', 'skip', 'take'],
      sorting: ['sort', 'order', 'orderBy', 'sortBy', 'direction'],
      filtering: ['filter', 'q', 'search', 'query', 'keyword', 'term'],
      id: ['id', 'userId', 'productId', 'orderId', 'itemId', 'postId'],
      selection: ['select', 'fields', 'include', 'expand', 'embed'],
      format: ['format', 'type', 'output', 'contentType'],
      category: ['category', 'tag', 'type', 'class', 'group'],
      date: ['date', 'from', 'to', 'start', 'end', 'before', 'after'],
      auth: ['token', 'key', 'apiKey', 'accessToken', 'session']
    };
  }

  async fuzzEndpoints(urls) {
    if (!Array.isArray(urls) || urls.length === 0) {
      return [];
    }

    const fuzzed = new Set();
    
    // Phase 1: Learn patterns
    this.learnPatterns(urls);
    
    // Phase 2: Generate variations
    const variations = this.generateVariations(urls);
    
    this.logger.info(`🎯 Generated ${variations.length} smart fuzzing variations`);
    
    return Array.from(new Set([...urls, ...variations])).slice(0, 5000);
  }

  learnPatterns(urls) {
    urls.forEach(url => {
      try {
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        
        urlObj.searchParams.forEach((value, key) => {
          // Track parameter patterns
          if (!this.paramPatterns.has(key)) {
            this.paramPatterns.set(key, {
              values: new Set(),
              type: this.detectType(value),
              frequency: 0,
              endpoints: new Set()
            });
          }
          
          const pattern = this.paramPatterns.get(key);
          pattern.values.add(value);
          pattern.frequency++;
          pattern.endpoints.add(path);
        });

        // Track endpoint patterns
        if (urlObj.search) {
          if (!this.endpointPatterns.has(path)) {
            this.endpointPatterns.set(path, new Set());
          }
          urlObj.searchParams.forEach((_, key) => {
            this.endpointPatterns.get(path).add(key);
          });
        }
      } catch {}
    });
  }

  detectType(value) {
    if (/^\d+$/.test(value)) return 'numeric';
    if (/^(true|false|yes|no|0|1)$/i.test(value)) return 'boolean';
    if (/^[a-f0-9]{8,}$/i.test(value)) return 'hash';
    if (/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) return 'email';
    if (/^https?:\/\//.test(value)) return 'url';
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    if (/^[A-Z0-9]{8,}$/.test(value)) return 'id';
    return 'string';
  }

  generateVariations(urls) {
    const variations = [];

    urls.forEach(url => {
      try {
        const urlObj = new URL(url);
        const base = urlObj.origin + urlObj.pathname;

        // 1. Fuzz existing parameters
        urlObj.searchParams.forEach((value, key) => {
          const type = this.detectType(value);
          const payloads = this.payloads[type] || this.payloads.string;
          
          payloads.forEach(payload => {
            const u = new URL(url);
            u.searchParams.set(key, payload);
            variations.push(u.href);
          });

          // IDOR testing: increment/decrement IDs
          if (type === 'numeric' || type === 'id') {
            const num = parseInt(value, 10);
            if (!isNaN(num)) {
              [num - 1, num + 1, num * 2, 1, 100].forEach(n => {
                const u = new URL(url);
                u.searchParams.set(key, n.toString());
                variations.push(u.href);
              });
            }
          }
        });

        // 2. Add missing common parameters
        Object.entries(this.commonParams).forEach(([category, params]) => {
          params.forEach(param => {
            if (!urlObj.searchParams.has(param)) {
              const testValues = this.getTestValues(category);
              testValues.forEach(value => {
                variations.push(`${base}?${param}=${encodeURIComponent(value)}`);
              });
            }
          });
        });

        // 3. Parameter permutations from learned patterns
        this.paramPatterns.forEach((pattern, paramName) => {
          if (!urlObj.searchParams.has(paramName) && pattern.frequency > 2) {
            Array.from(pattern.values).slice(0, 3).forEach(value => {
              variations.push(`${base}?${paramName}=${encodeURIComponent(value)}`);
            });
          }
        });

        // 4. Endpoint-specific parameters
        const path = urlObj.pathname;
        this.endpointPatterns.forEach((params, endpointPath) => {
          if (endpointPath === path) {
            params.forEach(param => {
              if (!urlObj.searchParams.has(param)) {
                variations.push(`${base}?${param}=test`);
              }
            });
          }
        });
        
        // 5. Path manipulation and directory traversal (Katana-style)
        const pathSegments = path.split('/').filter(Boolean);
        const pathTraversal = ['..', '../..', '%2e%2e', '%2e%2e%2e', '%2f'];
        const commonDirs = ['admin', 'api', 'test', 'upload', 'files', 'config', 'backup', 'tmp', 'temp', 'var', 'etc', 'usr', 'home'];
        
        // Generate directory traversal variations
        pathTraversal.forEach(trav => {
          const traversedPath = pathSegments.map(seg => seg === '..' ? trav : seg).join('/');
          if (traversedPath && traversedPath.length > 0) {
            variations.push(`${base}/${traversedPath}`);
            commonDirs.forEach(dir => {
              variations.push(`${base}/${traversedPath}${dir}`);
              variations.push(`${base}/${traversedPath}${dir}/`);
            });
          }
        });
        
        // 6. File extension and parameter combinations (like Katana's file detection)
        const fileExtensions = ['php', 'html', 'htm', 'txt', 'json', 'xml', 'sql', 'log', 'conf', 'ini', 'bak', 'backup'];
        commonDirs.forEach(dir => {
          fileExtensions.forEach(ext => {
            variations.push(`${base}/${dir}.${ext}`);
            variations.push(`${base}/${dir}/index.${ext}`);
          });
        });

      } catch {}
    });

    return variations;
  }

    getTestValues(category) {
    const defaults = {
      pagination: ['1', '10', '100', '999', '9999', '0', '-1'],
      sorting: ['asc', 'desc', 'name', 'date', 'price', 'rating'],
      filtering: ['test', 'admin', '*', 'null', 'true', 'false'],
      id: ['1', '100', '999', '9999', '0', '-1', 'me', 'self', 'current'],
      selection: ['*', 'all', 'id,name', 'field1,field2', 'id,name,email,phone'],
      format: ['json', 'xml', 'csv', 'html', 'text', 'pdf', 'xmlrpc'],
      category: ['all', 'active', '1', '2', '3', 'premium', 'featured'],
      date: ['2024-01-01', 'today', 'now', 'yesterday', 'tomorrow', 'last_30_days'],
      auth: ['test-token', 'admin-key', 'secret', 'key', 'api_key', 'token', 'auth'],
      
      // File and path related (Katana-style)
      file: ['test', 'example', 'config', 'backup', 'data', 'upload', 'download', 'image', 'file'],
      path: ['/', '/admin/', '/api/', '/test/', '/upload/', '/download/', '/backup/', '/temp/', '/var/', '/etc/', '/home/'],
      
      // Common web app parameters
      action: ['view', 'edit', 'delete', 'create', 'update', 'login', 'logout', 'register', 'search', 'filter'],
      controller: ['user', 'admin', 'auth', 'api', 'file', 'home', 'dashboard'],
      type: ['user', 'admin', 'test', 'demo', 'guest', 'api'],
      lang: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar'],
      
      // Security testing (enhanced)
      sqli: ["'", "' OR '1'='1", "' AND '1'='0", "admin'--", "' UNION SELECT", "'; DROP TABLE", "' OR 'x'='x", "' OR 1=1--", "' OR 1=1#"],
      xss: ["'", '"', '<', '>', '<script>', 'javascript:', 'onerror=', 'onload=', 'onclick=', 'onmouseover='],
      path: ['../', '../..', '../../..', '/etc/passwd', 'C:\\Windows\\win.ini', '/proc/self/', '/.env'],
      cmd: ['|', '&&', ';', '`', '$(', '${', '||', '%00', '%0a', '|| echo', '> /dev/null']
    };
    return defaults[category] || ['test'];
  }

  getLearnedPatterns() {
    const summary = {
      totalParams: this.paramPatterns.size,
      totalEndpoints: this.endpointPatterns.size,
      topParams: []
    };

    const sorted = Array.from(this.paramPatterns.entries())
      .sort((a, b) => b[1].frequency - a[1].frequency)
      .slice(0, 10);

    sorted.forEach(([name, data]) => {
      summary.topParams.push({
        name,
        frequency: data.frequency,
        type: data.type,
        uniqueValues: data.values.size,
        endpoints: data.endpoints.size
      });
    });

    return summary;
  }
}

module.exports = { ParameterFuzzer };
