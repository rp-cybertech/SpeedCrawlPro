/**
 * Worker thread for parallel crawling
 */

const { parentPort, workerData } = require('worker_threads');
const path = require('path');

const { CrawlEngine } = require('../src/core/CrawlEngine');
const { ConfigManager } = require('../src/utils/ConfigManager');
const { Logger } = require('../src/utils/Logger');

const { urls, options, threadId } = workerData;

(async () => {
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    try {
      parentPort.postMessage({
        type: 'progress',
        threadId,
        message: `[${i + 1}/${urls.length}] Starting: ${url}`
      });

      const config = new ConfigManager({
        ...options,
        url,
        outputDir: path.join(options.output, new URL(url).hostname),
        maxPages: parseInt(options.pages),
        maxDepth: parseInt(options.depth),
        timeout: parseInt(options.timeout),
        verbose: parseInt(options.verbose),
        debug: !!options.debug
      });

      const logger = new Logger(config);
      const engine = new CrawlEngine(config, logger);

      await engine.start();

      parentPort.postMessage({
        type: 'complete',
        threadId,
        url
      });

    } catch (err) {
      parentPort.postMessage({
        type: 'error',
        threadId,
        url,
        error: err.message
      });
    }
  }

  process.exit(0);
})();
