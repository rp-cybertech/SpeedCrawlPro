/**
 * SPAFormProcessor v4.0 - NO INFINITE LOOPS
 */

const EventEmitter = require('events');

class SPAFormProcessor extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
  }

  async processSPAForms(page, formProcessor) {
    try {
      this.logger.info('⚛️ Processing SPA forms (single pass)...');
      
      // Just call the main form processor ONCE
      const result = await formProcessor.processForm(page);
      
      return { processed: result.fieldsProcessed > 0 ? 1 : 0 };

    } catch (error) {
      this.logger.debug(`SPA processing error: ${error.message}`);
      return { processed: 0 };
    }
  }

  async cleanup() {
    // Nothing to clean
  }
}

module.exports = { SPAFormProcessor };
