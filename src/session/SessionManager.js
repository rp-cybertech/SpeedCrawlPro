/**
 * SpeedCrawl Pro v14.0 - Session Manager
 * Handles persistent cookie and session state management
 */

const fs = require('fs').promises;
const path = require('path');
const { existsSync } = require('fs');

class SessionManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    
    this.sessionFile = path.join(config.get('outputDir'), 'session-state.json');
    this.sessionData = {
      cookies: [],
      localStorage: {},
      sessionStorage: {},
      metadata: {
        createdAt: null,
        lastUpdated: null,
        domain: null,
        url: null,
        userAgent: null
      }
    };
  }

  async initialize() {
    try {
      this.logger.debug('🔐 Initializing session manager...');
      
      // Try to load existing session
      if (existsSync(this.sessionFile)) {
        await this.loadExistingSession();
      } else {
        this.logger.debug('No existing session found, will create new one');
      }
      
      this.logger.success('✅ Session manager initialized');

    } catch (error) {
      this.logger.error('Session manager initialization failed:', error);
      throw error;
    }
  }

  async loadExistingSession() {
    try {
      const sessionContent = await fs.readFile(this.sessionFile, 'utf8');
      const sessionData = JSON.parse(sessionContent);
      
      // Validate session data structure
      if (this.isValidSessionData(sessionData)) {
        this.sessionData = sessionData;
        this.logger.info(`📥 Loaded existing session from ${this.sessionFile}`);
        this.logger.debug(`Session created: ${sessionData.metadata.createdAt}`);
        this.logger.debug(`Cookies: ${sessionData.cookies.length}, LocalStorage: ${Object.keys(sessionData.localStorage).length}`);
      } else {
        this.logger.warn('Invalid session data format, creating new session');
        await this.createNewSession();
      }

    } catch (error) {
      this.logger.warn('Failed to load existing session, creating new one:', error.message);
      await this.createNewSession();
    }
  }

  isValidSessionData(data) {
    return data && 
           typeof data === 'object' &&
           Array.isArray(data.cookies) &&
           typeof data.localStorage === 'object' &&
           typeof data.sessionStorage === 'object' &&
           typeof data.metadata === 'object';
  }

  async createNewSession() {
    this.sessionData = {
      cookies: [],
      localStorage: {},
      sessionStorage: {},
      metadata: {
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        domain: null,
        url: this.config.get('url'),
        userAgent: null,
        version: '14.0.0'
      }
    };
    
    this.logger.debug('🆕 Created new session');
  }

  async loadSession(page) {
    try {
      if (!page) {
        this.logger.warn('No page provided to load session');
        return false;
      }

      this.logger.info('📥 Loading session state into browser...');
      
      // Load cookies
      if (this.sessionData.cookies.length > 0) {
        await this.loadCookies(page);
      }

      // Load localStorage
      if (Object.keys(this.sessionData.localStorage).length > 0) {
        await this.loadLocalStorage(page);
      }

      // Load sessionStorage
      if (Object.keys(this.sessionData.sessionStorage).length > 0) {
        await this.loadSessionStorage(page);
      }

      this.logger.success('✅ Session state loaded successfully');
      return true;

    } catch (error) {
      this.logger.error('Failed to load session:', error);
      return false;
    }
  }

  async loadCookies(page) {
    try {
      // Filter cookies by domain if we have one
      const currentUrl = page.url();
      let cookiesToLoad = this.sessionData.cookies;
      
      if (currentUrl) {
        const domain = new URL(currentUrl).hostname;
        cookiesToLoad = this.sessionData.cookies.filter(cookie => {
          return !cookie.domain || 
                 cookie.domain === domain || 
                 cookie.domain === `.${domain}` ||
                 domain.endsWith(cookie.domain.replace(/^\./, ''));
        });
      }

      if (cookiesToLoad.length > 0) {
        await page.context().addCookies(cookiesToLoad);
        this.logger.debug(`🍪 Loaded ${cookiesToLoad.length} cookies`);
      }

    } catch (error) {
      this.logger.warn('Failed to load cookies:', error.message);
    }
  }

  async loadLocalStorage(page) {
    try {
      await page.evaluate((data) => {
        Object.entries(data).forEach(([key, value]) => {
          try {
            localStorage.setItem(key, value);
          } catch (e) {
            console.warn(`Failed to set localStorage item: ${key}`, e);
          }
        });
      }, this.sessionData.localStorage);
      
      this.logger.debug(`💾 Loaded ${Object.keys(this.sessionData.localStorage).length} localStorage items`);

    } catch (error) {
      this.logger.warn('Failed to load localStorage:', error.message);
    }
  }

  async loadSessionStorage(page) {
    try {
      await page.evaluate((data) => {
        Object.entries(data).forEach(([key, value]) => {
          try {
            sessionStorage.setItem(key, value);
          } catch (e) {
            console.warn(`Failed to set sessionStorage item: ${key}`, e);
          }
        });
      }, this.sessionData.sessionStorage);
      
      this.logger.debug(`🗃️ Loaded ${Object.keys(this.sessionData.sessionStorage).length} sessionStorage items`);

    } catch (error) {
      this.logger.warn('Failed to load sessionStorage:', error.message);
    }
  }

  async saveSession(page) {
    try {
      if (!page) {
        this.logger.warn('No page provided to save session');
        return false;
      }

      this.logger.info('💾 Saving current session state...');

      // Save cookies
      await this.saveCookies(page);

      // Save localStorage
      await this.saveLocalStorage(page);

      // Save sessionStorage  
      await this.saveSessionStorage(page);

      // Update metadata
      await this.updateMetadata(page);

      // Write to file
      await this.writeSessionToFile();

      this.logger.success(`✅ Session saved to ${this.sessionFile}`);
      return true;

    } catch (error) {
      this.logger.error('Failed to save session:', error);
      return false;
    }
  }

  async saveCookies(page) {
    try {
      const cookies = await page.context().cookies();
      
      // Filter out session cookies and expired cookies
      const persistentCookies = cookies.filter(cookie => {
        // Keep cookies that don't expire (session cookies have expires: -1)
        // or have future expiration dates
        return cookie.expires === -1 || cookie.expires > Date.now() / 1000;
      });

      this.sessionData.cookies = persistentCookies;
      this.logger.debug(`🍪 Saved ${persistentCookies.length} cookies`);

    } catch (error) {
      this.logger.warn('Failed to save cookies:', error.message);
    }
  }

  async saveLocalStorage(page) {
    try {
      const localStorage = await page.evaluate(() => {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            data[key] = localStorage.getItem(key);
          }
        }
        return data;
      });

      this.sessionData.localStorage = localStorage;
      this.logger.debug(`💾 Saved ${Object.keys(localStorage).length} localStorage items`);

    } catch (error) {
      this.logger.warn('Failed to save localStorage:', error.message);
    }
  }

  async saveSessionStorage(page) {
    try {
      const sessionStorage = await page.evaluate(() => {
        const data = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key) {
            data[key] = sessionStorage.getItem(key);
          }
        }
        return data;
      });

      this.sessionData.sessionStorage = sessionStorage;
      this.logger.debug(`🗃️ Saved ${Object.keys(sessionStorage).length} sessionStorage items`);

    } catch (error) {
      this.logger.warn('Failed to save sessionStorage:', error.message);
    }
  }

  async updateMetadata(page) {
    try {
      const url = page.url();
      const userAgent = await page.evaluate(() => navigator.userAgent);
      
      this.sessionData.metadata.lastUpdated = new Date().toISOString();
      this.sessionData.metadata.url = url;
      this.sessionData.metadata.userAgent = userAgent;
      
      if (url) {
        this.sessionData.metadata.domain = new URL(url).hostname;
      }

      if (!this.sessionData.metadata.createdAt) {
        this.sessionData.metadata.createdAt = this.sessionData.metadata.lastUpdated;
      }

    } catch (error) {
      this.logger.warn('Failed to update session metadata:', error.message);
    }
  }

  async writeSessionToFile() {
    try {
      const sessionJson = JSON.stringify(this.sessionData, null, 2);
      await fs.writeFile(this.sessionFile, sessionJson, 'utf8');
      
      this.logger.debug(`Session written to ${this.sessionFile} (${sessionJson.length} bytes)`);

    } catch (error) {
      this.logger.error('Failed to write session file:', error);
      throw error;
    }
  }

  async clearSession() {
    try {
      this.logger.info('🧹 Clearing session data...');
      
      await this.createNewSession();
      
      if (existsSync(this.sessionFile)) {
        await fs.unlink(this.sessionFile);
        this.logger.debug('Session file deleted');
      }
      
      this.logger.success('✅ Session cleared');

    } catch (error) {
      this.logger.error('Failed to clear session:', error);
      throw error;
    }
  }

  async exportSession(exportPath) {
    try {
      const exportData = {
        ...this.sessionData,
        exportedAt: new Date().toISOString(),
        exportedBy: 'SpeedCrawl Pro v14.0'
      };

      await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2), 'utf8');
      this.logger.info(`📤 Session exported to ${exportPath}`);
      
      return true;

    } catch (error) {
      this.logger.error('Failed to export session:', error);
      return false;
    }
  }

  async importSession(importPath) {
    try {
      if (!existsSync(importPath)) {
        throw new Error('Import file does not exist');
      }

      const importContent = await fs.readFile(importPath, 'utf8');
      const importData = JSON.parse(importContent);

      if (this.isValidSessionData(importData)) {
        this.sessionData = {
          cookies: importData.cookies || [],
          localStorage: importData.localStorage || {},
          sessionStorage: importData.sessionStorage || {},
          metadata: {
            ...importData.metadata,
            importedAt: new Date().toISOString(),
            importedFrom: importPath
          }
        };

        await this.writeSessionToFile();
        this.logger.info(`📥 Session imported from ${importPath}`);
        return true;
      } else {
        throw new Error('Invalid session data format');
      }

    } catch (error) {
      this.logger.error('Failed to import session:', error);
      return false;
    }
  }

  getSessionSummary() {
    return {
      cookieCount: this.sessionData.cookies.length,
      localStorageKeys: Object.keys(this.sessionData.localStorage).length,
      sessionStorageKeys: Object.keys(this.sessionData.sessionStorage).length,
      createdAt: this.sessionData.metadata.createdAt,
      lastUpdated: this.sessionData.metadata.lastUpdated,
      domain: this.sessionData.metadata.domain,
      hasData: this.hasSessionData()
    };
  }

  hasSessionData() {
    return this.sessionData.cookies.length > 0 ||
           Object.keys(this.sessionData.localStorage).length > 0 ||
           Object.keys(this.sessionData.sessionStorage).length > 0;
  }

  isSessionValid() {
    // Check if session is not too old (default: 24 hours)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const lastUpdated = new Date(this.sessionData.metadata.lastUpdated);
    const age = Date.now() - lastUpdated.getTime();
    
    return age < maxAge;
  }

  async renewSession(page) {
    try {
      this.logger.info('🔄 Renewing session...');
      
      // Save current state
      await this.saveSession(page);
      
      // Update timestamp
      this.sessionData.metadata.lastUpdated = new Date().toISOString();
      await this.writeSessionToFile();
      
      this.logger.success('✅ Session renewed');
      return true;

    } catch (error) {
      this.logger.error('Failed to renew session:', error);
      return false;
    }
  }

  getStats() {
    return {
      sessionFile: this.sessionFile,
      hasSessionData: this.hasSessionData(),
      isValid: this.isSessionValid(),
      summary: this.getSessionSummary()
    };
  }
}

module.exports = { SessionManager };
