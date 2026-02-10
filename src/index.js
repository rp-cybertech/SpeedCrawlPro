/**
 * SpeedCrawl Pro v14.0 - Main Module Exports
 */

module.exports = {
    // Core Engine
    CrawlEngine: require('./src/core/CrawlEngine').CrawlEngine,
    BrowserManager: require('./src/core/BrowserManager').BrowserManager,
    NetworkCapture: require('./src/core/NetworkCapture').NetworkCapture,
    
    // Forms
    FormProcessor: require('./src/forms/FormProcessor').FormProcessor,
    WorkflowManager: require('./src/forms/WorkflowManager').WorkflowManager,
    ActionButtonFinder: require('./src/forms/ActionButtonFinder').ActionButtonFinder,
    
    // Discovery
    TechnologyDetector: require('./src/discovery/TechnologyDetector').TechnologyDetector,
    LinkExtractor: require('./src/discovery/LinkExtractor').LinkExtractor,
    EndpointAnalyzer: require('./src/discovery/EndpointAnalyzer').EndpointAnalyzer,
    
    // Security
    SecretDetector: require('./src/security/SecretDetector').SecretDetector,
    CAPTCHAHandler: require('./src/evasion/CAPTCHAHandler').CAPTCHAHandler,
    FingerprintManager: require('./src/evasion/FingerprintManager').FingerprintManager,
    
    // Utils
    ConfigManager: require('./src/utils/ConfigManager').ConfigManager,
    Logger: require('./src/utils/Logger').Logger,
    ValidationHelper: require('./src/utils/ValidationHelper').ValidationHelper,
    
    // Output
    ReportGenerator: require('./src/output/ReportGenerator').ReportGenerator,
    StreamWriter: require('./src/output/StreamWriter').StreamWriter,
    HTTPFormatter: require('./src/output/HTTPFormatter').HTTPFormatter
  };
  