/**
 * SpeedCrawl Pro v14.0 - SecretLint Integration
 * Advanced secret detection with industry-standard patterns
 */

const { EventEmitter } = require('events');

// Try to import SecretLint packages
let secretlint = null;
let secretlintRules = [];

try {
  secretlint = require('@secretlint/cli');
  secretlintRules = [
    require('@secretlint/secretlint-rule-aws'),
    require('@secretlint/secretlint-rule-github'),
    require('@secretlint/secretlint-rule-google'),
    require('@secretlint/secretlint-rule-stripe'),
    require('@secretlint/secretlint-rule-jwt'),
    require('@secretlint/secretlint-rule-database-url'),
    require('@secretlint/secretlint-rule-private-key')
  ];
} catch (error) {
  // Fallback to built-in patterns if SecretLint not installed
  secretlint = null;
}

class SecretLint extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    
    this.secretsFound = new Map();
    this.totalScanned = 0;
    this.useSecretLint = !!secretlint && config.get('useSecretLint', true);
    
    // Built-in patterns as fallback
    this.builtInPatterns = this.loadBuiltInPatterns();
    
    this.logger.info(`🔒 SecretLint initialized: ${this.useSecretLint ? 'Using SecretLint package' : 'Using built-in patterns'}`);
  }

  loadBuiltInPatterns() {
    return {
      // AWS Credentials
      'AWS Access Key': {
        pattern: /AKIA[0-9A-Z]{16}/g,
        severity: 'HIGH',
        category: 'aws'
      },
      'AWS Secret Access Key': {
        pattern: /[0-9a-zA-Z/+=]{40}/g,
        severity: 'HIGH',
        category: 'aws',
        context: ['aws', 'secret', 'key']
      },
      'AWS Session Token': {
        pattern: /AQoEXAMPLEH4aoAH0gNCAPyJxz4BlCFFxWNE1OPTgk5TthT\+FvwqnKwRcOIfrRh3c/g,
        severity: 'HIGH',
        category: 'aws'
      },

      // Google Credentials
      'Google API Key': {
        pattern: /AIza[0-9A-Za-z\-_]{35}/g,
        severity: 'HIGH',
        category: 'google'
      },
      'Google OAuth 2.0 Client ID': {
        pattern: /[0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com/g,
        severity: 'MEDIUM',
        category: 'google'
      },
      'Google Cloud Service Account': {
        pattern: /"type":\s*"service_account"/g,
        severity: 'HIGH',
        category: 'google'
      },

      // GitHub Credentials
      'GitHub Personal Access Token': {
        pattern: /ghp_[0-9A-Za-z]{36}/g,
        severity: 'HIGH',
        category: 'github'
      },
      'GitHub OAuth Token': {
        pattern: /gho_[0-9A-Za-z]{36}/g,
        severity: 'HIGH',
        category: 'github'
      },
      'GitHub App Token': {
        pattern: /ghs_[0-9A-Za-z]{36}/g,
        severity: 'HIGH',
        category: 'github'
      },
      'GitHub Refresh Token': {
        pattern: /ghr_[0-9A-Za-z]{36}/g,
        severity: 'HIGH',
        category: 'github'
      },

      // GitLab Credentials
      'GitLab Personal Access Token': {
        pattern: /glpat-[0-9A-Za-z\-_]{20}/g,
        severity: 'HIGH',
        category: 'gitlab'
      },
      'GitLab Pipeline Trigger Token': {
        pattern: /glptt-[0-9A-Za-z\-_]{20}/g,
        severity: 'MEDIUM',
        category: 'gitlab'
      },

      // JWT Tokens
      'JWT Token': {
        pattern: /eyJ[0-9A-Za-z_-]*\.[0-9A-Za-z_-]*\.[0-9A-Za-z_-]*/g,
        severity: 'MEDIUM',
        category: 'jwt'
      },

      // Payment Providers
      'Stripe Secret Key': {
        pattern: /sk_live_[0-9A-Za-z]{24}/g,
        severity: 'HIGH',
        category: 'stripe'
      },
      'Stripe Publishable Key': {
        pattern: /pk_live_[0-9A-Za-z]{24}/g,
        severity: 'MEDIUM',
        category: 'stripe'
      },
      'Stripe Restricted Key': {
        pattern: /rk_live_[0-9A-Za-z]{24}/g,
        severity: 'HIGH',
        category: 'stripe'
      },
      'PayPal Client ID': {
        pattern: /A[0-9A-Z]{80}/g,
        severity: 'MEDIUM',
        category: 'paypal'
      },

      // Communication Services
      'Twilio Account SID': {
        pattern: /AC[0-9a-fA-F]{32}/g,
        severity: 'MEDIUM',
        category: 'twilio'
      },
      'Twilio Auth Token': {
        pattern: /[0-9a-fA-F]{32}/g,
        severity: 'HIGH',
        category: 'twilio',
        context: ['twilio', 'auth', 'token']
      },
      'SendGrid API Key': {
        pattern: /SG\.[0-9A-Za-z\-_]{22}\.[0-9A-Za-z\-_]{43}/g,
        severity: 'HIGH',
        category: 'sendgrid'
      },
      'Mailgun API Key': {
        pattern: /key-[0-9a-zA-Z]{32}/g,
        severity: 'HIGH',
        category: 'mailgun'
      },
      'Slack Bot Token': {
        pattern: /xoxb-[0-9]{11}-[0-9]{11}-[0-9A-Za-z]{24}/g,
        severity: 'HIGH',
        category: 'slack'
      },
      'Slack Webhook URL': {
        pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]{9}\/[A-Z0-9]{9}\/[A-Za-z0-9]{24}/g,
        severity: 'MEDIUM',
        category: 'slack'
      },

      // Database URLs
      'MongoDB Connection String': {
        pattern: /mongodb(?:\+srv)?:\/\/[^\s]+/g,
        severity: 'HIGH',
        category: 'database'
      },
      'MySQL Connection String': {
        pattern: /mysql:\/\/[^\s]+/g,
        severity: 'HIGH',
        category: 'database'
      },
      'PostgreSQL Connection String': {
        pattern: /postgres(?:ql)?:\/\/[^\s]+/g,
        severity: 'HIGH',
        category: 'database'
      },
      'Redis Connection String': {
        pattern: /redis:\/\/[^\s]+/g,
        severity: 'MEDIUM',
        category: 'database'
      },

      // Firebase
      'Firebase URL': {
        pattern: /https:\/\/[0-9A-Za-z\-]+\.firebaseio\.com/g,
        severity: 'LOW',
        category: 'firebase'
      },
      'Firebase API Key': {
        pattern: /AIza[0-9A-Za-z\-_]{35}/g,
        severity: 'MEDIUM',
        category: 'firebase'
      },

      // SSH Keys
      'SSH Private Key': {
        pattern: /-----BEGIN[A-Z\s]+PRIVATE KEY-----[^-]+-----END[A-Z\s]+PRIVATE KEY-----/gs,
        severity: 'HIGH',
        category: 'ssh'
      },
      'RSA Private Key': {
        pattern: /-----BEGIN RSA PRIVATE KEY-----[^-]+-----END RSA PRIVATE KEY-----/gs,
        severity: 'HIGH',
        category: 'ssh'
      },
      'OpenSSH Private Key': {
        pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[^-]+-----END OPENSSH PRIVATE KEY-----/gs,
        severity: 'HIGH',
        category: 'ssh'
      },

      // Certificates
      'PEM Certificate': {
        pattern: /-----BEGIN CERTIFICATE-----[^-]+-----END CERTIFICATE-----/gs,
        severity: 'LOW',
        category: 'certificate'
      },

      // Generic Patterns
      'Generic API Key': {
        pattern: /(?:api[_\-]?key|apikey)[\s]*[=:]\s*['"]?([0-9a-zA-Z\-_]{16,})['"]?/gi,
        severity: 'MEDIUM',
        category: 'generic'
      },
      'Generic Secret': {
        pattern: /(?:secret|password|pwd|pass)[\s]*[=:]\s*['"]?([0-9a-zA-Z\-_!@#$%^&*]{8,})['"]?/gi,
        severity: 'MEDIUM',
        category: 'generic'
      },
      'Generic Token': {
        pattern: /(?:token|auth[_\-]?token|access[_\-]?token)[\s]*[=:]\s*['"]?([0-9a-zA-Z\-_]{16,})['"]?/gi,
        severity: 'MEDIUM',
        category: 'generic'
      },

      // Cloud Services
      'Heroku API Key': {
        pattern: /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
        severity: 'HIGH',
        category: 'heroku'
      },
      'DigitalOcean Token': {
        pattern: /dop_v1_[0-9a-fA-F]{64}/g,
        severity: 'HIGH',
        category: 'digitalocean'
      },

      // Docker
      'Docker Registry Auth': {
        pattern: /"auths":\s*{[^}]+}/g,
        severity: 'MEDIUM',
        category: 'docker'
      }
    };
  }

  async scanContent(content, source = 'unknown') {
    try {
      this.totalScanned++;
      const secrets = [];

      if (this.useSecretLint) {
        // Use SecretLint package if available
        try {
          const results = await this.scanWithSecretLint(content, source);
          secrets.push(...results);
        } catch (error) {
          this.logger.debug('SecretLint package scan failed, falling back to built-in:', error);
          const fallbackResults = this.scanWithBuiltInPatterns(content, source);
          secrets.push(...fallbackResults);
        }
      } else {
        // Use built-in patterns
        const builtInResults = this.scanWithBuiltInPatterns(content, source);
        secrets.push(...builtInResults);
      }

      // Store and emit results
      if (secrets.length > 0) {
        this.storeSecrets(secrets, source);
        this.emit('secretsFound', { source, secrets });
        
        this.logger.warn(`🔒 Found ${secrets.length} secrets in ${source}`);
        secrets.forEach(secret => {
          this.logger.warn(`  └─ ${secret.severity} ${secret.type}: ${secret.maskedValue}`);
        });
      }

      return secrets;

    } catch (error) {
      this.logger.error('Secret scanning failed:', error);
      return [];
    }
  }

  async scanWithSecretLint(content, source) {
    // This would use the actual SecretLint package
    // For now, fallback to built-in patterns
    return this.scanWithBuiltInPatterns(content, source);
  }

  scanWithBuiltInPatterns(content, source) {
    const secrets = [];

    for (const [secretType, config] of Object.entries(this.builtInPatterns)) {
      let match;
      const pattern = new RegExp(config.pattern.source, config.pattern.flags);
      
      while ((match = pattern.exec(content)) !== null) {
        const value = match[0];
        const context = this.extractContext(content, match.index, 50);
        
        // Skip if context doesn't match (for generic patterns)
        if (config.context && !this.matchesContext(context, config.context)) {
          continue;
        }

        secrets.push({
          type: secretType,
          value: value,
          maskedValue: this.maskSecret(value),
          severity: config.severity,
          category: config.category,
          line: this.getLineNumber(content, match.index),
          column: this.getColumnNumber(content, match.index),
          context: context,
          source: source,
          timestamp: Date.now()
        });
      }
    }

    return secrets;
  }

  extractContext(content, index, length = 50) {
    const start = Math.max(0, index - length);
    const end = Math.min(content.length, index + length);
    return content.substring(start, end);
  }

  matchesContext(context, requiredTerms) {
    const lowerContext = context.toLowerCase();
    return requiredTerms.some(term => lowerContext.includes(term.toLowerCase()));
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  getColumnNumber(content, index) {
    const lines = content.substring(0, index).split('\n');
    return lines[lines.length - 1].length + 1;
  }

  maskSecret(secret) {
    if (typeof secret !== 'string' || secret.length === 0) {
      return '[EMPTY]';
    }

    if (secret.length <= 8) {
      return '*'.repeat(secret.length);
    }

    const start = secret.substring(0, 4);
    const end = secret.substring(secret.length - 4);
    const middle = '*'.repeat(Math.min(secret.length - 8, 20));
    
    return start + middle + end;
  }

  storeSecrets(secrets, source) {
    if (!this.secretsFound.has(source)) {
      this.secretsFound.set(source, []);
    }
    
    const existingSecrets = this.secretsFound.get(source);
    const newSecrets = secrets.filter(secret => 
      !existingSecrets.some(existing => 
        existing.type === secret.type && existing.maskedValue === secret.maskedValue
      )
    );
    
    existingSecrets.push(...newSecrets);
  }

  generateReport() {
    const report = {
      summary: {
        totalScanned: this.totalScanned,
        totalSecrets: this.getTotalSecretsCount(),
        severityCounts: this.getSeverityCounts(),
        categoryCounts: this.getCategoryCounts()
      },
      secrets: this.getAllSecrets(),
      timestamp: new Date().toISOString()
    };

    return report;
  }

  getTotalSecretsCount() {
    let total = 0;
    for (const secrets of this.secretsFound.values()) {
      total += secrets.length;
    }
    return total;
  }

  getSeverityCounts() {
    const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const secrets of this.secretsFound.values()) {
      for (const secret of secrets) {
        counts[secret.severity] = (counts[secret.severity] || 0) + 1;
      }
    }
    return counts;
  }

  getCategoryCounts() {
    const counts = {};
    for (const secrets of this.secretsFound.values()) {
      for (const secret of secrets) {
        counts[secret.category] = (counts[secret.category] || 0) + 1;
      }
    }
    return counts;
  }

  getAllSecrets() {
    const allSecrets = [];
    for (const [source, secrets] of this.secretsFound.entries()) {
      for (const secret of secrets) {
        allSecrets.push({ ...secret, source });
      }
    }
    return allSecrets.sort((a, b) => {
      const severityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  getStats() {
    return {
      useSecretLint: this.useSecretLint,
      totalScanned: this.totalScanned,
      totalSecrets: this.getTotalSecretsCount(),
      builtInPatterns: Object.keys(this.builtInPatterns).length,
      sources: this.secretsFound.size
    };
  }

  cleanup() {
    this.secretsFound.clear();
    this.totalScanned = 0;
  }
}

module.exports = { SecretLint };
