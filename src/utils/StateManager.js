// src/utils/StateManager.js
/**
 * StateManager - Handles saving and restoring crawl state for auto-resume functionality
 */
const fs = require('fs');
const path = require('path');

class StateManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.stateFile = null;
    this.state = {
      url: null,
      visited: [],
      queue: [],
      results: {
        pages: [],
        requests: [],
        endpoints: [],
        secrets: [],
        forms: [],
        technologies: []
      },
      timestamp: null,
      completed: false
    };
  }

  /**
   * Initialize state manager with a specific URL
   * @param {string} url - Target URL
   */
  init(url) {
    if (!this.config.get('autoResume')) return;
    
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/[^a-zA-Z0-9.-]/g, '-');
      const outputDir = this.config.get('outputDir');
      
      // Create state file path based on domain
      this.stateFile = path.join(outputDir, `.crawl-state-${domain}.json`);
      this.state.url = url;
      
      this.logger.debug(`📝 State file: ${this.stateFile}`);
    } catch (e) {
      this.logger.debug(`Failed to initialize state manager: ${e.message}`);
    }
  }

  /**
   * Load previous state if exists
   * @returns {boolean} - True if state was restored
   */
  loadState() {
    if (!this.config.get('autoResume') || !this.stateFile) return false;
    
    try {
      if (fs.existsSync(this.stateFile)) {
        const savedState = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        
        // Validate state belongs to same URL
        if (savedState.url === this.state.url) {
          this.state = savedState;
          this.logger.info(`🔄 Resuming crawl from previous state (${this.state.visited.length} pages visited)`);
          return true;
        } else {
          this.logger.debug('State file exists but for different URL, starting fresh');
        }
      }
    } catch (e) {
      this.logger.debug(`Failed to load state: ${e.message}`);
    }
    
    return false;
  }

  /**
   * Save current state to file
   */
  saveState(queueManager, resultManager) {
    if (!this.config.get('autoResume') || !this.stateFile) return;
    
    try {
      this.state.visited = Array.from(queueManager?.visited || []);
      this.state.queue = queueManager?.queue?.map(item => ({
        url: item.url || item,
        depth: item.depth || 0
      })) || [];
      
      this.state.results = {
        pages: resultManager?.allPages || [],
        requests: resultManager?.allRequests || [],
        endpoints: Array.from(resultManager?.allEndpoints || []),
        secrets: resultManager?.allSecrets || [],
        forms: resultManager?.allForms || [],
        technologies: resultManager?.technologies || []
      };
      
      this.state.timestamp = Date.now();
      
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
      this.logger.debug(`💾 Saved crawl state (${this.state.visited.length} pages)`);
    } catch (e) {
      this.logger.debug(`Failed to save state: ${e.message}`);
    }
  }

  /**
   * Mark crawl as completed and remove state file
   * @param {QueueManager} queueManager 
   * @param {ResultManager} resultManager 
   */
  markComplete(queueManager, resultManager) {
    if (!this.config.get('autoResume') || !this.stateFile) return;
    
    try {
      this.state.completed = true;
      this.saveState(queueManager, resultManager);
      
      // Remove state file after successful completion
      if (fs.existsSync(this.stateFile)) {
        fs.unlinkSync(this.stateFile);
        this.logger.debug('🗑️  Removed crawl state file after completion');
      }
    } catch (e) {
      this.logger.debug(`Failed to clean up state file: ${e.message}`);
    }
  }

  /**
   * Restore visited URLs to queue manager
   * @param {QueueManager} queueManager 
   */
  restoreVisited(queueManager) {
    if (!this.state.visited || this.state.visited.length === 0) return;
    
    try {
      for (const url of this.state.visited) {
        queueManager.addVisited(url);
      }
      this.logger.debug(`Restored ${this.state.visited.length} visited URLs`);
    } catch (e) {
      this.logger.debug(`Failed to restore visited URLs: ${e.message}`);
    }
  }

  /**
   * Restore queue to queue manager
   * @param {QueueManager} queueManager 
   */
  restoreQueue(queueManager) {
    if (!this.state.queue || this.state.queue.length === 0) return [];
    
    try {
      const restoredQueue = [];
      for (const item of this.state.queue) {
        if (item.url && !queueManager.hasVisited(item.url)) {
          restoredQueue.push(item);
        }
      }
      this.logger.debug(`Restored ${restoredQueue.length} queued URLs`);
      return restoredQueue;
    } catch (e) {
      this.logger.debug(`Failed to restore queue: ${e.message}`);
      return [];
    }
  }

  /**
   * Restore results to result manager
   * @param {ResultManager} resultManager 
   */
  restoreResults(resultManager) {
    if (!this.state.results) return;
    
    try {
      if (this.state.results.pages?.length > 0) {
        resultManager.allPages = this.state.results.pages;
      }
      if (this.state.results.requests?.length > 0) {
        resultManager.allRequests = this.state.results.requests;
      }
      if (this.state.results.endpoints?.length > 0) {
        for (const ep of this.state.results.endpoints) {
          resultManager.addEndpoint(ep);
        }
      }
      if (this.state.results.secrets?.length > 0) {
        for (const secret of this.state.results.secrets) {
          resultManager.addSecret(secret);
        }
      }
      if (this.state.results.forms?.length > 0) {
        resultManager.allForms = this.state.results.forms;
      }
      if (this.state.results.technologies?.length > 0) {
        resultManager.technologies = this.state.results.technologies;
      }
      
      this.logger.debug(`Restored results from previous state`);
    } catch (e) {
      this.logger.debug(`Failed to restore results: ${e.message}`);
    }
  }

  /**
   * Check if there's a valid state to resume from
   * @param {string} url - Target URL
   * @returns {boolean}
   */
  canResume(url) {
    if (!this.config.get('autoResume')) return false;
    
    try {
      this.init(url);
      if (!this.stateFile) return false;
      
      if (fs.existsSync(this.stateFile)) {
        const savedState = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        return savedState.url === url && !savedState.completed && savedState.visited.length > 0;
      }
    } catch (e) {}
    
    return false;
  }
}

module.exports = { StateManager };
