/**
 * SpeedCrawl Pro v20.0 - Secret Detector (NO MASKING)
 * Shows FULL API keys, tokens, passwords without masking
 */

const EventEmitter = require('events');

class SecretDetector extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.secrets = new Set();
    this.scannedContent = new Set();
    
    // Detection patterns - HIGH ACCURACY
    this.patterns = [
      // API Keys (expanded patterns)
      { name: 'API_KEY', regex: /(?:api[_-]?key|apikey|api[_-]?secret)[\s]*[=:]\s*['"]?([a-zA-Z0-9_\-]{20,})/gi, group: 1 },
      { name: 'API_KEY', regex: /['"]([a-zA-Z0-9_\-]{32,})['"](?:\s*,\s*['"]api[_-]?key['"])/gi, group: 1 },
      
      // AWS Keys
      { name: 'AWS_ACCESS_KEY', regex: /(AKIA[0-9A-Z]{16})/g, group: 1 },
      { name: 'AWS_SECRET_KEY', regex: /(?:aws[_-]?secret[_-]?access[_-]?key|aws[_-]?secret)[\s]*[=:]\s*['"]?([a-zA-Z0-9/+=]{40})/gi, group: 1 },
      
      // Google API Keys
      { name: 'GOOGLE_API_KEY', regex: /AIza[0-9A-Za-z_\-]{35}/g, group: 0 },
      
      // Firebase
      { name: 'FIREBASE_API_KEY', regex: /(?:firebase[_-]?api[_-]?key)[\s]*[=:]\s*['"]?([a-zA-Z0-9_\-]{20,})/gi, group: 1 },
      
      // JWT Tokens
      { name: 'JWT_TOKEN', regex: /eyJ[a-zA-Z0-9_\-]+\.eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+/g, group: 0 },
      
      // Bearer Tokens
      { name: 'BEARER_TOKEN', regex: /(?:bearer|token)[\s]*[=:]\s*['"]?([a-zA-Z0-9_\-\.]{20,})/gi, group: 1 },
      
      // Authorization Headers
      { name: 'AUTH_HEADER', regex: /authorization[\s]*[=:]\s*['"]?([a-zA-Z0-9_\-\s]+)/gi, group: 1 },
      
      // Private Keys
      { name: 'PRIVATE_KEY', regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, group: 0 },
      
      // OAuth Tokens
      { name: 'OAUTH_TOKEN', regex: /(?:oauth[_-]?token|access[_-]?token)[\s]*[=:]\s*['"]?([a-zA-Z0-9_\-]{20,})/gi, group: 1 },
      
      // Client Secrets
      { name: 'CLIENT_SECRET', regex: /(?:client[_-]?secret)[\s]*[=:]\s*['"]?([a-zA-Z0-9_\-]{20,})/gi, group: 1 },
      
      // Stripe Keys
      { name: 'STRIPE_KEY', regex: /(sk_live_[0-9a-zA-Z]{24,}|pk_live_[0-9a-zA-Z]{24,})/g, group: 1 },
      
      // Passwords (in config/source)
      { name: 'PASSWORD', regex: /(?:password|passwd|pwd)[\s]*[=:]\s*['"]([^'"]{6,})['"]/gi, group: 1 },
      
      // Database URLs
      { name: 'DB_CONNECTION', regex: /(?:mongodb|mysql|postgresql|redis):\/\/[^\s'"]+/gi, group: 0 },
      
      // Slack Tokens
      { name: 'SLACK_TOKEN', regex: /xox[baprs]-[0-9a-zA-Z\-]{10,}/g, group: 0 },
      
      // GitHub Tokens
      { name: 'GITHUB_TOKEN', regex: /ghp_[0-9a-zA-Z]{36}/g, group: 0 },
      
      // Twilio
      { name: 'TWILIO_KEY', regex: /SK[0-9a-fA-F]{32}/g, group: 0 },
      
      // Generic Secrets
      { name: 'SECRET', regex: /(?:secret|token|key)[\s]*[=:]\s*['"]?([a-zA-Z0-9_\-]{32,})/gi, group: 1 },
      
      // Session IDs
      { name: 'SESSION_ID', regex: /(?:session[_-]?id|sessionid)[\s]*[=:]\s*['"]?([a-zA-Z0-9_\-]{20,})/gi, group: 1 }
    ];
  }

  async scanContent(content, source = 'unknown') {
    if (!content || typeof content !== 'string') return;
    
    // Avoid scanning same content twice
    const contentHash = this.hashContent(content.substring(0, 1000));
    if (this.scannedContent.has(contentHash)) {
      return;
    }
    this.scannedContent.add(contentHash);

    for (const pattern of this.patterns) {
      try {
        pattern.regex.lastIndex = 0;
        let match;
        
        while ((match = pattern.regex.exec(content)) !== null) {
          const secretValue = match[pattern.group || 0];
          
          if (this.isValidSecret(secretValue)) {
            const secret = {
              type: pattern.name,
              value: secretValue,  // ✅ FIX: NO MASKING - Show full value
              source: source,
              position: match.index
            };
            
            const secretKey = `${secret.type}:${secret.value}:${secret.source}`;
            if (!this.secrets.has(secretKey)) {
              this.secrets.add(secretKey);
              this.emit('secret-found', secret);
            }
          }
        }
      } catch (error) {
        this.logger.debug(`Pattern error for ${pattern.name}: ${error.message}`);
      }
    }
  }

  isValidSecret(value) {
    if (!value || typeof value !== 'string') return false;
    if (value.length < 8) return false;
    
    // Filter out common false positives
    const falsePositives = [
      /^(true|false|null|undefined)$/i,
      /^(yes|no)$/i,
      /^[0-9]+$/,  // Pure numbers
      /^(http|https|ftp):\/\//i,  // URLs
      /^\/[a-z0-9\-_\/]+$/i,  // Paths
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,  // UUIDs (usually not secrets)
      /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i,
      /^(test|demo|example|sample|placeholder)/i,
      // React/JSX false positives
      /createElement|React|Component|default/i,
      // Common JavaScript patterns
      /^(?:function|const|let|var|return|import|export|class)/i,
      // Error messages
      /missing|error|undefined|null/i,
      // Very short values
      /^(.{1,7})$/,
      // Common placeholder text
      /^(?:query|search|name|email|password|user|admin|test)$/i,
      // React props and attributes
      /\.default\.[a-zA-Z]|\.createElement\(|\.[a-zA-Z]\?\.default/i
    ];
    
    for (const fp of falsePositives) {
      if (fp.test(value)) {
        return false;
      }
    }
    
    return true;
  }

  hashContent(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  getAllSecrets() {
    const secretsArray = [];
    this.secrets.forEach(secretKey => {
      const [type, value, source] = secretKey.split(':');
      secretsArray.push({ type, value, source });
    });
    return secretsArray;
  }

  cleanup() {
    this.secrets.clear();
    this.scannedContent.clear();
  }
}

module.exports = { SecretDetector };
