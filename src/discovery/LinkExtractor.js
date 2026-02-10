/**
 * SpeedCrawl Pro v14 - Complete Link Extraction with React Wait
 * Extracts HTML links, React Router routes, and DOM-based navigation
 */

class LinkExtractor {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  normalizeUrl(url, baseUrl) {
    try {
      const urlObj = new URL(url, baseUrl);
      urlObj.hash = '';
      return urlObj.href;
    } catch {
      return null;
    }
  }

  async extractLinks(page, pageInfo) {
    try {
      this.logger.debug(`🔗 Extracting links from ${pageInfo.url}`);
      const linksSet = new Set();

      // 1. Extract HTML links (with wait for React)
      const htmlLinks = await this.extractHTMLLinks(page, pageInfo.url);
      this.logger.debug(`  📄 Found ${htmlLinks.length} HTML links`);
      htmlLinks.forEach(link => {
        const normalized = this.normalizeUrl(link, pageInfo.url);
        if (normalized) linksSet.add(normalized);
      });

      // 2. Extract JavaScript routes
      const jsRoutes = await this.extractReactRoutes(page, pageInfo.url);
      this.logger.debug(`  📦 Found ${jsRoutes.length} JS routes`);
      jsRoutes.forEach(link => {
        const normalized = this.normalizeUrl(link, pageInfo.url);
        if (normalized) linksSet.add(normalized);
      });

      // 3. Extract inline routes
      const inlineRoutes = await this.extractInlineRoutes(page, pageInfo.url);
      inlineRoutes.forEach(link => {
        const normalized = this.normalizeUrl(link, pageInfo.url);
        if (normalized) linksSet.add(normalized);
      });

      // 4. Extract DOM routes
      const domRoutes = await this.extractDOMRoutes(page, pageInfo.url);
      domRoutes.forEach(link => {
        const normalized = this.normalizeUrl(link, pageInfo.url);
        if (normalized) linksSet.add(normalized);
      });

      const allLinks = Array.from(linksSet);
      const validLinks = allLinks.filter(link => this.isValidLink(link, pageInfo.url));

      if (validLinks.length > 0) {
        this.logger.info(`🔗 Extracted ${validLinks.length} unique links (${htmlLinks.length} HTML, ${jsRoutes.length} JS, ${domRoutes.length} DOM)`);
      } else {
        this.logger.warn(`⚠️  No links found`);
      }

      return validLinks;

    } catch (error) {
      this.logger.debug(`Link extraction error: ${error.message}`);
      return [];
    }
  }

  async extractHTMLLinks(page, baseUrl) {
    try {
      // CRITICAL: Wait for React to render links
      this.logger.debug('⏳ Waiting for React to render HTML links...');
      await page.waitForTimeout(2000);
      
      // Try to wait for common link containers
      await page.waitForSelector('a[href], footer, nav, [role="navigation"]', { timeout: 3000 }).catch(() => {});
      
      return await page.evaluate((base) => {
        const found = [];
        
        // Get ALL <a> tags with href
        const links = document.querySelectorAll('a[href]');
        console.log(`[DEBUG] Found ${links.length} <a> tags in DOM`);
        
        links.forEach(a => {
          let href = a.getAttribute('href');
          if (!href) return;
          
          // Handle relative URLs
          if (href.startsWith('/')) {
            try {
              const fullUrl = new URL(href, base).href;
              found.push(fullUrl);
              console.log(`[DEBUG] Added relative link: ${href} -> ${fullUrl}`);
            } catch (e) {
              console.log(`[DEBUG] Failed to parse relative: ${href}`);
            }
          } else if (href.startsWith('http')) {
            found.push(href);
            console.log(`[DEBUG] Added absolute link: ${href}`);
          }
        });

        // Get data attributes
        document.querySelectorAll('[data-href], [data-url], [data-route]').forEach(el => {
          const href = el.dataset.href || el.dataset.url || el.dataset.route;
          if (href && href.startsWith('/')) {
            try {
              const fullUrl = new URL(href, base).href;
              found.push(fullUrl);
              console.log(`[DEBUG] Added data attribute: ${href}`);
            } catch {}
          }
        });
        
        console.log(`[DEBUG] Total HTML links extracted: ${found.length}`);
        return found;
      }, baseUrl);
    } catch (error) {
      this.logger.debug(`HTML link extraction error: ${error.message}`);
      return [];
    }
  }

  async extractReactRoutes(page, baseUrl) {
    try {
      this.logger.debug('🔍 Analyzing JavaScript bundles for React Router routes...');
      
      const scriptUrls = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('script[src]'))
          .map(s => s.src)
          .filter(src => {
            if (!src) return false;
            const url = src.toLowerCase();
            if (url.includes('google') || url.includes('facebook') || 
                url.includes('cdn.jsdelivr') || url.includes('cdnjs.cloudflare') ||
                url.includes('analytics') || url.includes('gtag')) {
              return false;
            }
            return true;
          });
      });

      const routes = new Set();
      let totalRoutesFound = 0;

      for (const scriptUrl of scriptUrls.slice(0, 5)) {
        try {
          this.logger.debug(`  📦 Analyzing: ${scriptUrl.split('/').pop()}`);
          
          const jsContent = await page.evaluate(async (url) => {
            try {
              const response = await fetch(url);
              const text = await response.text();
              return text.length < 5000000 ? text : '';
            } catch {
              return '';
            }
          }, scriptUrl);

          if (jsContent) {
            const foundRoutes = this.parseRoutesFromJS(jsContent, baseUrl);
            const beforeCount = routes.size;
            foundRoutes.forEach(route => routes.add(route));
            const newRoutes = routes.size - beforeCount;
            
            if (newRoutes > 0) {
              totalRoutesFound += newRoutes;
              this.logger.debug(`    ✅ Found ${newRoutes} routes`);
            }
          }
        } catch (error) {
          this.logger.debug(`    ⚠️  Error: ${error.message}`);
        }
      }

      if (totalRoutesFound > 0) {
        this.logger.info(`🎯 Discovered ${totalRoutesFound} React Router routes from JavaScript`);
      }

      return Array.from(routes);
    } catch {
      return [];
    }
  }

  parseRoutesFromJS(jsCode, baseUrl) {
    const routes = new Set();
    
    try {
      const patterns = [
        /path:\s*['"`]([\/][a-z0-9\-_\/]+)['"`]/gi,
        /to\s*[=:]\s*['"`]([\/][a-z0-9\-_\/]+)['"`]/gi,
        /navigate\s*\(\s*['"`]([\/][a-z0-9\-_\/]+)['"`]/gi,
        /(?:push|replace)\s*\(\s*['"`]([\/][a-z0-9\-_\/]+)['"`]/gi,
        /href\s*:\s*['"`]([\/][a-z0-9\-_\/]+)['"`]/gi,
        /['"`]path['"`]\s*:\s*['"`]([\/][a-z0-9\-_\/]+)['"`]/gi,
        /Route\s*\(\s*['"`]([\/][a-z0-9\-_\/]+)['"`]/gi,
        /url\s*:\s*['"`]([\/][a-z0-9\-_\/]+)['"`]/gi
      ];

      patterns.forEach(pattern => {
        let match;
        let count = 0;
        while ((match = pattern.exec(jsCode)) !== null && count++ < 1000) {
          let route = match[1];
          
          if (!route.startsWith('/')) route = '/' + route;
          route = route.toLowerCase();
          
          if (route.includes('$') || route.includes('{') || route.includes(':') || 
              route.includes('*') || route.includes('..') || route.length > 100) {
            continue;
          }
          
          if (route === '/' || route === '/api' || route === '/static') {
            continue;
          }
          
          if (route.includes('/api/') || route.endsWith('.json') || 
              route.includes('/assets/') || route.includes('/public/')) {
            continue;
          }
          
          try {
            const fullUrl = new URL(route, baseUrl).href;
            routes.add(fullUrl);
          } catch {}
        }
      });

    } catch (error) {
      this.logger.debug(`Route parsing error: ${error.message}`);
    }

    return Array.from(routes);
  }

  async extractInlineRoutes(page, baseUrl) {
    try {
      return await page.evaluate((base) => {
        const routes = new Set();
        
        if (window.__NEXT_DATA__) {
          try {
            const nextData = JSON.stringify(window.__NEXT_DATA__);
            const routeMatches = nextData.match(/["']\/[a-z0-9\-_\/]+["']/gi);
            if (routeMatches) {
              routeMatches.forEach(match => {
                const route = match.replace(/["']/g, '');
                if (route.length < 50 && !route.includes('/api/')) {
                  try {
                    const fullUrl = new URL(route, base).href;
                    routes.add(fullUrl);
                  } catch {}
                }
              });
            }
          } catch {}
        }
        
        if (window.__REACT_ROUTER__) {
          try {
            const routerData = JSON.stringify(window.__REACT_ROUTER__);
            const routeMatches = routerData.match(/["']\/[a-z0-9\-_\/]+["']/gi);
            if (routeMatches) {
              routeMatches.forEach(match => {
                const route = match.replace(/["']/g, '');
                try {
                  const fullUrl = new URL(route, base).href;
                  routes.add(fullUrl);
                } catch {}
              });
            }
          } catch {}
        }
        
        return Array.from(routes);
      }, baseUrl);
    } catch {
      return [];
    }
  }

  async extractDOMRoutes(page, baseUrl) {
    try {
      return await page.evaluate((base) => {
        const routes = new Set();
        
        document.querySelectorAll('[onclick]').forEach(el => {
          const onclick = el.getAttribute('onclick');
          const matches = onclick.match(/['"`](\/[a-z0-9\-_\/]+)['"`]/gi);
          if (matches) {
            matches.forEach(match => {
              const route = match.replace(/['"`]/g, '');
              if (route.length < 50 && !route.includes('/api/')) {
                try {
                  const fullUrl = new URL(route, base).href;
                  routes.add(fullUrl);
                } catch {}
              }
            });
          }
        });
        
        return Array.from(routes);
      }, baseUrl);
    } catch {
      return [];
    }
  }

  isValidLink(url, currentUrl) {
    try {
      const urlObj = new URL(url, currentUrl);
      
      if (!['http:', 'https:'].includes(urlObj.protocol)) return false;
      
      const blockedExtensions = this.config.get('blockedExtensions', [
        'jpg', 'jpeg', 'png', 'gif', 'css', 'js', 'woff', 'ttf', 'svg', 'ico',
        'pdf', 'zip', 'mp4', 'mp3', 'avi', 'mov', 'wav', 'woff2', 'eot', 'otf'
      ]);
      
      const pathname = urlObj.pathname.toLowerCase();
      if (blockedExtensions.some(ext => pathname.endsWith(`.${ext}`))) return false;
      
      if (this.config.get('sameOrigin')) {
        const currentUrlObj = new URL(currentUrl);
        
        if (this.config.get('includeSubdomains')) {
          const currentDomain = currentUrlObj.hostname.split('.').slice(-2).join('.');
          const urlDomain = urlObj.hostname.split('.').slice(-2).join('.');
          if (currentDomain !== urlDomain) return false;
        } else {
          if (urlObj.origin !== currentUrlObj.origin) return false;
        }
      }
      
      const avoidPatterns = ['logout', 'signout', 'sign-out', 'log-out', 'exit'];
      if (avoidPatterns.some(pattern => pathname.includes(pattern))) return false;
      
      if (pathname.includes('/api/') || pathname.startsWith('/api')) return false;
      
      if (pathname.includes('/assets/') || pathname.includes('/static/') || 
          pathname.includes('/_next/') || pathname.includes('/webpack/') ||
          pathname.includes('/chunk') || pathname.includes('.chunk.')) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { LinkExtractor };
