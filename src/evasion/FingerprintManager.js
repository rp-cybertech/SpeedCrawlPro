/**
 * SpeedCrawl Pro v14.0 - Fingerprint Manager (COMPLETE FIXED VERSION)
 * Browser fingerprinting and form fingerprint generation
 */

const crypto = require('crypto');

class FingerprintManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    
    this.browserFingerprints = new Map();
    this.formFingerprints = new Map();
  }

  async initialize() {
    try {
      this.logger.debug('🔍 Initializing fingerprint manager...');
      this.logger.success('✅ Fingerprint manager initialized');
    } catch (error) {
      this.logger.error('❌ Fingerprint manager initialization failed:', error);
      throw error;
    }
  }

  // FIXED: Add missing generateFormFingerprint method
  async generateFormFingerprint(formStructure) {
    try {
      // Safely handle missing properties
      const action = formStructure?.action || 'no-action';
      const method = formStructure?.method || 'GET';
      const inputCount = formStructure?.inputs?.length || 0;
      const fieldCount = formStructure?.fieldCount || 0;
      
      // Create fingerprint components
      const fingerprintData = {
        action: action,
        method: method.toUpperCase(),
        inputCount: inputCount,
        fieldCount: fieldCount,
        hasFileUpload: formStructure?.hasFileUpload || false,
        hasPassword: formStructure?.hasPassword || false,
        hasHidden: formStructure?.hasHidden || false,
        inputTypes: this.getInputTypes(formStructure?.inputs || []),
        inputNames: this.getInputNames(formStructure?.inputs || [])
      };
      
      // Generate hash
      const fingerprintString = JSON.stringify(fingerprintData, Object.keys(fingerprintData).sort());
      const fingerprint = crypto.createHash('md5').update(fingerprintString).digest('hex');
      
      this.logger.debug(`Generated form fingerprint: ${fingerprint}`);
      return fingerprint;
      
    } catch (error) {
      this.logger.error('Form fingerprint generation failed:', error);
      // Return a fallback fingerprint
      const fallbackData = `form-${Date.now()}-${Math.random()}`;
      return crypto.createHash('md5').update(fallbackData).digest('hex');
    }
  }

  getInputTypes(inputs) {
    if (!Array.isArray(inputs)) return [];
    
    return inputs
      .map(input => input?.type || 'text')
      .filter((type, index, arr) => arr.indexOf(type) === index) // unique types
      .sort();
  }

  getInputNames(inputs) {
    if (!Array.isArray(inputs)) return [];
    
    return inputs
      .map(input => input?.name || input?.id || 'unnamed')
      .filter((name, index, arr) => arr.indexOf(name) === index) // unique names
      .sort();
  }

  generateBrowserFingerprint() {
    try {
      const fingerprint = {
        id: crypto.randomUUID(),
        userAgent: this.generateRealisticUserAgent(),
        viewport: this.getRandomViewport(),
        timezone: this.getRandomTimezone(),
        language: this.getRandomLanguage(),
        platform: this.getRandomPlatform(),
        cookieEnabled: true,
        doNotTrack: Math.random() > 0.5 ? '1' : null,
        hardwareConcurrency: Math.floor(Math.random() * 8) + 4,
        deviceMemory: [2, 4, 8, 16][Math.floor(Math.random() * 4)],
        colorDepth: [24, 32][Math.floor(Math.random() * 2)],
        pixelRatio: [1, 1.25, 1.5, 2][Math.floor(Math.random() * 4)]
      };

      this.logger.debug(`Generated browser fingerprint: ${fingerprint.id}`);
      return fingerprint;
      
    } catch (error) {
      this.logger.error('Browser fingerprint generation failed:', error);
      return {
        id: crypto.randomUUID(),
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        viewport: { width: 1920, height: 1080 }
      };
    }
  }

  generateRealisticUserAgent() {
    const chromeVersions = [
      '119.0.0.0', '118.0.0.0', '117.0.0.0', '116.0.0.0', '115.0.0.0'
    ];
    
    const windowsVersions = [
      'Windows NT 10.0; Win64; x64',
      'Windows NT 11.0; Win64; x64'
    ];
    
    const chromeVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
    const windowsVersion = windowsVersions[Math.floor(Math.random() * windowsVersions.length)];
    
    return `Mozilla/5.0 (${windowsVersion}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  }

  getRandomViewport() {
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1536, height: 864 },
      { width: 1440, height: 900 },
      { width: 1280, height: 720 }
    ];
    
    return viewports[Math.floor(Math.random() * viewports.length)];
  }

  getRandomTimezone() {
    const timezones = [
      'America/New_York',
      'America/Chicago', 
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Berlin',
      'Asia/Tokyo'
    ];
    
    return timezones[Math.floor(Math.random() * timezones.length)];
  }

  getRandomLanguage() {
    const languages = [
      'en-US',
      'en-GB', 
      'en-CA',
      'en-AU'
    ];
    
    return languages[Math.floor(Math.random() * languages.length)];
  }

  getRandomPlatform() {
    const platforms = [
      'Win32',
      'Win64',
      'MacIntel'
    ];
    
    return platforms[Math.floor(Math.random() * platforms.length)];
  }

  // Generate canvas fingerprint
  generateCanvasFingerprint() {
    const texts = [
      'BrowserLeaks,com <canvas> 1.0',
      'Canvas fingerprint test',
      'SpeedCrawl Pro test canvas'
    ];
    
    const text = texts[Math.floor(Math.random() * texts.length)];
    const hash = crypto.createHash('md5').update(text).digest('hex');
    
    return {
      text: text,
      hash: hash.substring(0, 16)
    };
  }

  // Generate WebGL fingerprint  
  generateWebGLFingerprint() {
    const renderers = [
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Intel(R) UHD Graphics 620'
    ];
    
    const vendors = [
      'Google Inc. (Intel)',
      'Google Inc. (NVIDIA)',
      'Intel Inc.'
    ];
    
    return {
      renderer: renderers[Math.floor(Math.random() * renderers.length)],
      vendor: vendors[Math.floor(Math.random() * vendors.length)]
    };
  }

  // Store and retrieve fingerprints
  storeBrowserFingerprint(id, fingerprint) {
    this.browserFingerprints.set(id, {
      ...fingerprint,
      createdAt: Date.now()
    });
  }

  getBrowserFingerprint(id) {
    return this.browserFingerprints.get(id);
  }

  storeFormFingerprint(id, fingerprint) {
    this.formFingerprints.set(id, {
      fingerprint: fingerprint,
      createdAt: Date.now()
    });
  }

  getFormFingerprint(id) {
    return this.formFingerprints.get(id);
  }

  // Clean up old fingerprints
  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [id, data] of this.browserFingerprints.entries()) {
      if (now - data.createdAt > maxAge) {
        this.browserFingerprints.delete(id);
      }
    }
    
    for (const [id, data] of this.formFingerprints.entries()) {
      if (now - data.createdAt > maxAge) {
        this.formFingerprints.delete(id);
      }
    }
    
    this.logger.debug('Fingerprint cleanup completed');
  }

  getStats() {
    return {
      browserFingerprints: this.browserFingerprints.size,
      formFingerprints: this.formFingerprints.size
    };
  }
}

module.exports = { FingerprintManager };
