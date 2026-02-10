// src/core/PageProcessor.js
const { URL } = require('url');
const crypto = require('crypto');
const fs = require('fs'); // For _writeHARFile

class PageProcessor {
  constructor(config, logger, formProcessor, captchaHandler, techDetector, jsAnalyzer, endpointAnalyzer, secretDetector, queueManager, resultManager, stateManager) {
    this.config = config;
    this.logger = logger;
    this.formProcessor = formProcessor;
    this.captchaHandler = captchaHandler;
    this.techDetector = techDetector;
    this.jsAnalyzer = jsAnalyzer;
    this.endpointAnalyzer = endpointAnalyzer;
    this.secretDetector = secretDetector;
    this.queueManager = queueManager;
    this.resultManager = resultManager;
    this.stateManager = stateManager;
    this.redirects = new Map();
    this.contentHashes = new Map();
    this.stats = {pagesVisited: 0};
    this.submittedForms = new Set(); // To track submitted forms
  }

  async crawlPages(context, startUrl) {
    this.stats.startTime = Date.now();
    const threads = this.config.get('threads') || 1;
    this.logger.info(`Starting crawl with ${threads} threads (PQueue concurrency: ${threads})`);
    
    // Dynamic import for ESM-only p-queue module
    const { default: PQueue } = await import('p-queue');
    const queue = new PQueue({ 
      concurrency: threads,
      autoStart: true 
    });

    const maxPages = Number(this.config.get('maxPages'));
    const maxDepth = Number(this.config.get('maxDepth'));
    const origin = new URL(startUrl).origin;
    const baseHost = new URL(startUrl).hostname;
    
    queue.add(() => this._processPage(context, { url: startUrl, depth: 0 }, queue, maxPages, maxDepth, origin, baseHost));

    await queue.onIdle();
    this.logger.info(`Queue finished. Processed ${this.resultManager.allPages.length} pages.`);
  }

  async _processPage(context, { url, depth }, queue, maxPages, maxDepth, origin, baseHost) {
    if (this.queueManager.hasVisited(url) || depth > maxDepth || this.resultManager.allPages.length >= maxPages) {
        return;
    }

    this.logger.debug(`Processing: ${url} (queue size: ${queue.size}, pending: ${queue.pending})`);
    const page = await context.newPage();

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.config.get('timeout') });
        if (this.config.get('networkIdle')) {
            try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}
            await page.waitForTimeout(800);
        } else {
            await page.waitForTimeout(500);
        }

        try { await this.captchaHandler.handleCaptcha(page); } catch {}

        try {
            const tech = await this.techDetector.detectTechnologies(page);
            if (tech) {
                for (const k of ['frameworks', 'libraries', 'cms']) {
                    if (Array.isArray(tech[k])) tech[k].forEach(t => t && this.resultManager.technologies.push(t));
                }
            }
        } catch {}

        if (this.config.get('deepJSAnalysis') && this.stats.pagesVisited % 3 === 0) {
            try {
                const js = await this.jsAnalyzer.analyzeChunks(page);
                this.resultManager.jsChunks += js?.chunksAnalyzed || 0;
                if (Array.isArray(js?.endpoints)) js.endpoints.forEach(ep => ep?.endpoint && this.resultManager.addEndpoint(ep.endpoint));
            } catch {}
        }

        if (this.config.get('submitForms')) {
            try {
                const r = await this.formProcessor.processForm(page, this.submittedForms);
                if (r) {
                    this.resultManager.addForm(r);
                    if (r.delay && this.config.get('formDelay')) {
                        await page.waitForTimeout(this.config.get('formDelay'));
                    }
                }
            } catch {}
        }

        try {
            const eps = await this.endpointAnalyzer.analyzeEndpoints(page);
            if (Array.isArray(eps?.endpoints)) eps.endpoints.forEach(ep => ep?.endpoint && this.resultManager.addEndpoint(ep.endpoint));
        } catch {}

        try {
            const html = await page.content();
            await this.secretDetector.scanContent(html, url);
            const scripts = await page.$$eval('script[src]', s => s.map(x => x.src).filter(y => y && /\.js(\?|$)/.test(y)));
            for (const sc of scripts.slice(0, 20)) {
                try {
                    const code = await page.evaluate(async u => { try { return await (await fetch(u)).text(); } catch { return null; } }, sc);
                    if (code) await this.secretDetector.scanContent(code, sc);
                } catch {}
            }
            const secrets = this.secretDetector.getAllSecrets();
            if (Array.isArray(secrets)) {
                secrets.forEach(s => this.resultManager.addSecret(s));
            }
        } catch {}

        await this._scrollPage(page);
        await this._clickInterestingButtons(page);

        const newAjaxUrls = new Set();
        page.on('response', async (response) => {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('application/json')) {
                try {
                    const json = await response.json();
                    const content = JSON.stringify(json);
                    const urls = this._extractUrlsFromResponse(content, page.url());
                    urls.forEach(u => newAjaxUrls.add(u));
                } catch {}
            }
        });

        if (await this._detectSPA(page)) {
            this.logger.info('🔬 SPA detected, starting AJAX crawl...');
            await this._triggerAJAXCalls(page);
            await this._waitForAJAXCompletion(page);
        }

        let links = [];
        try {
            links = await this.extractLinks(page);
        } catch {}

        links = links.concat(Array.from(newAjaxUrls));

        for (const link of links) {
            try {
                const u = new URL(link);
                if (this.config.get('sameOrigin') && u.origin !== origin) {
                    const allowSubs = this.config.get('includeSubdomains');
                    const endsWithBase = u.hostname === baseHost || u.hostname.endsWith(`.${baseHost}`);
                    if (!(allowSubs && endsWithBase)) continue;
                }
                if (this.queueManager.hasVisited(link)) continue;
                const ext = (link.split('.').pop() || '').toLowerCase().split('?')[0];
                if ((this.config.get('blockedExtensions') || []).includes(ext)) continue;
                if ((this.config.get('jsExcludeExtensions') || []).includes(ext)) continue;
                if(this.resultManager.allPages.length + queue.size < maxPages){
                  this.logger.debug(`Adding ${link} to queue (size: ${queue.size}, pending: ${queue.pending})`);
                  queue.add(() => this._processPage(context, { url: link, depth: depth + 1 }, queue, maxPages, maxDepth, origin, baseHost));
                }
            } catch {}
        }

        const title = await page.title().catch(() => 'Untitled');
        this.resultManager.allPages.push({ url, depth, title, linksFound: links.length, timestamp: Date.now() });
        this.queueManager.addVisited(url);

        // Save state after each page if auto-resume is enabled
        if (this.config.get('autoResume') && this.stateManager) {
            this.stateManager.saveState(this.queueManager, this.resultManager);
        }

    } catch (err) {
        this.logger.warn(`Failed: ${url} - ${err.message}`);
    } finally {
        try { await page.close(); } catch {}
        await this._wait(this.config.get('requestDelay'));
    }
  }

  async _scrollPage(page) {
    try {
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
    } catch (e) {
      this.logger.debug(`Error scrolling page: ${e.message}`);
    }
  }

  async _clickInterestingButtons(page) {
    try {
      const buttons = await page.evaluate(() => {
        const interestingButtons = [];
        document.querySelectorAll('a, button, [role="button"]').forEach(el => {
          if (el.offsetParent === null || el.disabled) return; // Skip hidden or disabled elements
          const text = (el.textContent || el.innerText || '').toLowerCase();
          const href = el.getAttribute('href');
          if (href && href.trim() === '#') return;
          if (el.getAttribute('type') === 'submit') return;

          if (/more|details|show|view|expand|load|next/.test(text)) {
            interestingButtons.push({
              selector: el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ').join('.') : ''),
              text: text
            });
          }
        });
        return interestingButtons;
      });

      for (const button of buttons) {
        try {
          this.logger.debug(`Clicking interesting button: ${button.text}`);
          await page.click(button.selector, { timeout: 500 });
          await page.waitForTimeout(200); // Wait for content to load
        } catch (e) {
          this.logger.debug(`Could not click button with selector ${button.selector}: ${e.message}`);
        }
      }
    } catch (e) {
      this.logger.debug(`Error clicking interesting buttons: ${e.message}`);
    }
  }

  async extractLinks(page) {
    const links = await page.evaluate(() => {
        const urlRegex = /https?:\/\/[^\s"'<>`]+/g;
        const out = new Set();

        // 1. Standard links
        document.querySelectorAll('a[href], area[href]').forEach(el => {
            const href = el.getAttribute('href');
            if (href) out.add(href);
        });

        // 2. Other tags with src
        document.querySelectorAll('iframe[src], frame[src]').forEach(el => {
            const src = el.getAttribute('src');
            if (src) out.add(src);
        });
        
        // 3. Links in onclick attributes
        document.querySelectorAll('[onclick]').forEach(el => {
            const onclick = el.getAttribute('onclick');
            if (onclick) {
                const matches = onclick.match(urlRegex);
                if (matches) matches.forEach(u => out.add(u));
            }
        });
        
        // 4. Aggressive regex on the whole document
        const bodyText = document.body.innerText;
        const bodyHtml = document.body.innerHTML;

        const allTextMatches = bodyText.match(urlRegex);
        if(allTextMatches) allTextMatches.forEach(u => out.add(u));
        
        const allHtmlMatches = bodyHtml.match(urlRegex);
        if(allHtmlMatches) allHtmlMatches.forEach(u => out.add(u.replace(/&amp;/g, '&')));

        // 5. Links in comments
        const comments = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
        let currentNode;
        while(currentNode = comments.nextNode()) {
            const commentText = currentNode.nodeValue;
            const matches = commentText.match(urlRegex);
            if(matches) matches.forEach(u => out.add(u));
        }

        // Resolve and filter
        const result = [];
        for (const link of out) {
            if (!link || link.startsWith('javascript:') || link.startsWith('#') || link.startsWith('mailto:') || link.startsWith('tel:')) continue;
            try {
                result.push(new URL(link, window.location.href).href.split('#')[0]);
            } catch {}
        }
        return result;
    });
    return [...new Set(links)]; // Final uniqueness check
  }
  
  // Moved helper methods from CrawlEngine.js
  _isSameOrigin(url1, url2) {
    try {
      const u1 = new URL(url1);
      const u2 = new URL(url2);
      
      if (this.config.get('includeSubdomains')) {
        return u1.hostname === u2.hostname ||
               u1.hostname.endsWith('.' + u2.hostname) ||
               u2.hostname.endsWith('.' + u1.hostname);
      }
      
      return u1.origin === u2.origin;
    } catch {
      return false;
    }
  }

  async _getPageContentHash(page) {
    try {
      const content = await page.content();
      const crypto = require('crypto');
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (e) {
      return '';
    }
  }

  async _detectSPA(page) {
    try {
      const isSPA = await page.evaluate(() => {
        const checks = {
          hasReact: !!(window.React || window.__NEXT_DATA__ || document.querySelector('[data-reactroot], [data-reactid], [data-reactid]')),
          hasVue: !!(window.Vue || window.__VUE__ || document.querySelector('[data-v-app], [v-cloak]')),
          hasAngular: !!(window.ng || window.angular || document.querySelector('[ng-version], [ng-app]')),
          hasSvelte: !!document.querySelector('[data-svelte]'),
          hasVueRouter: !!(window.$router || window.__VUE_ROUTER__),
          hasHistoryAPI: typeof history.pushState === 'function',
          hasClientRouting: document.querySelectorAll('[data-route], [href^="/"]').length > 5
        };
        
        const score = Object.values(checks).filter(v => v).length;
        return score >= 2;
      });
      
      return isSPA;
    } catch (e) {
      this.logger.debug(`SPA detection error: ${e.message}`);
      return false;
    }
  }

  async _triggerAJAXCalls(page) {
    try {
      await page.evaluate(() => {
        try {
          const triggers = document.querySelectorAll('a[onclick*="load"], a[onclick*="ajax"], a[onclick*="fetch"], button[onclick*="load"], button[onclick*="ajax"]');
          triggers.forEach((trigger, index) => {
            setTimeout(() => {
              try {
                trigger.click();
              } catch (e) {}
            }, index * 200);
          });

          const loadLinks = document.querySelectorAll('a[href^="javascript:"]');
          loadLinks.forEach((link, index) => {
            setTimeout(() => {
              try {
                link.click();
              } catch (e) {}
            }, 500 + (index * 100));
          });

        } catch (e) {}
      });
    } catch (e) {
      if (e.message.includes('Target page') || e.message.includes('browser') || e.message.includes('closed')) {
        this.logger.debug('Page closed during AJAX trigger, aborting');
      } else {
        this.logger.debug(`AJAX trigger error: ${e.message}`);
      }
    }
  }

  async _waitForAJAXCompletion(page, maxWait = 3000) {
    let checkInterval;
    try {
      await page.addScriptTag({ content: `
        window.__sc_active_requests = 0;
        const oldFetch = window.fetch;
        window.fetch = function(...args) {
          window.__sc_active_requests++;
          return oldFetch(...args).finally(() => {
            window.__sc_active_requests--;
          });
        };
        const oldXHR = window.XMLHttpRequest.prototype.send;
        window.XMLHttpRequest.prototype.send = function(...args) {
          window.__sc_active_requests++;
          this.addEventListener('loadend', () => {
            window.__sc_active_requests--;
          });
          return oldXHR.apply(this, args);
        };
      `});

      const startTime = Date.now();
      let lastActiveCount = -1;
      let stallCount = 0;
      
      while (Date.now() - startTime < maxWait) {
        try {
          const activeRequests = await page.evaluate(() => window.__sc_active_requests || 0);
          
          if (activeRequests === 0) {
            this.logger.debug(`✅ AJAX completed after ${Date.now() - startTime}ms`);
            return true;
          }
          
          if (activeRequests === lastActiveCount) {
            stallCount++;
            if (stallCount >= 3) {
              this.logger.debug(`⚠️ AJAX stalled at ${activeRequests} requests, proceeding`);
              return true;
            }
          } else {
            stallCount = 0;
            lastActiveCount = activeRequests;
          }
          
          this.logger.debug(`⏳ Waiting for ${activeRequests} active requests...`);
          await page.waitForTimeout(300);
        } catch (e) {
          if (e.message.includes('Target page') || e.message.includes('browser') || e.message.includes('closed')) {
            this.logger.debug('Page closed during AJAX wait, aborting');
            return false;
          }
          throw e;
        }
      }
      
      this.logger.debug(`⚠️ AJAX wait timeout after ${maxWait}ms`);
      return false;
    } catch (e) {
      this.logger.debug(`AJAX wait error: ${e.message}`);
      return false;
    }
  }

  _extractUrlsFromResponse(content, baseUrl) {
    try {
      const urls = [];
      const urlRegex = /https?:\/\/[^\s"'<>`]+/g;
      const matches = content.match(urlRegex);
      if (matches) {
        matches.forEach(match => {
          try {
            urls.push(new URL(match, baseUrl).href.split('#')[0]);
          } catch {}
        });
      }
      return urls;
    } catch (e) {
      this.logger.debug(`URL extraction from response error: ${e.message}`);
      return [];
    }
  }

  async _wait(ms) { return new Promise(r => setTimeout(r, Number(ms || 0))); }

}

module.exports = { PageProcessor };