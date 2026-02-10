// src/core/ResultManager.js
class ResultManager {
  constructor(logger) {
    this.logger = logger;
    this.allEndpoints = new Set();
    this.allFormActions = new Set();
    this.allForms = [];
    this.allSecrets = [];
    this.allKnownFiles = [];
    this.allPages = [];
    this.allRequests = [];
    this.allApiCalls = [];
    this.responseUrls = new Set();
    this.technologies = [];
    this.jsChunks = 0;
  }

  addEndpoint(endpoint) {
    this.allEndpoints.add(endpoint);
  }

  hasEndpoint(endpoint) {
    return this.allEndpoints.has(endpoint);
  }

  addFormAction(action) {
    this.allFormActions.add(action);
  }

  addForm(form) {
    this.allForms.push(form);
  }

  addSecret(secret) {
    this.allSecrets.push(secret);
  }

  addKnownFile(file) {
    this.allKnownFiles.push(file);
  }

  addPage(page) {
    this.allPages.push(page);
  }

  addRequest(request) {
    this.allRequests.push(request);
  }

  addApiCall(apiCall) {
    this.allApiCalls.push(apiCall);
  }

  addResponseUrl(url) {
    this.responseUrls.add(url);
  }

  getResults() {
    return {
      pages: this.allPages,
      endpoints: Array.from(this.allEndpoints),
      formActions: Array.from(this.allFormActions),
      forms: this.allForms,
      secrets: this.allSecrets,
      knownFiles: this.allKnownFiles,
      networkRequests: this.allRequests,
      apiCalls: this.allApiCalls,
    };
  }

  get results() {
    return {
      technologies: this.technologies,
      endpoints: Array.from(this.allEndpoints),
      secrets: this.allSecrets,
      forms: this.allForms.length,
      fieldsProcessed: this.allForms.reduce((sum, f) => sum + (f.fieldsProcessed || 0), 0),
      jsChunks: this.jsChunks
    };
  }
}

module.exports = { ResultManager };
