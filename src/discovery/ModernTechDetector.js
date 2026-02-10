/**
 * SpeedCrawl Pro - ModernTechDetector v2.0 with Wappalyzer Integration
 * Detects: React, Vue, Angular, Next.js, Nuxt, frameworks, libraries
 */

const EventEmitter = require('events');

class ModernTechDetector extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.detectedTech = new Set();
  }

  async detectTechnologies(page) {
    try {
      this.logger.info('🔍 Detecting web technologies...');

      const technologies = await page.evaluate(() => {
        const detected = {
          frameworks: [],
          libraries: [],
          cms: [],
          servers: [],
          languages: [],
          analytics: [],
          meta: {}
        };

        // Check for React
        if (window.React || document.querySelector('[data-reactroot], [data-reactid]')) {
          detected.frameworks.push('React');

          // Check React version
          if (window.React && window.React.version) {
            detected.meta.reactVersion = window.React.version;
          }
        }

        // Check for Vue
        if (window.Vue || document.querySelector('[data-v-], [v-cloak]')) {
          detected.frameworks.push('Vue.js');

          if (window.Vue && window.Vue.version) {
            detected.meta.vueVersion = window.Vue.version;
          }
        }

        // Check for Angular
        if (window.ng || window.angular || document.querySelector('[ng-app], [ng-controller], [ng-version]')) {
          detected.frameworks.push('Angular');

          const ngVersion = document.querySelector('[ng-version]');
          if (ngVersion) {
            detected.meta.angularVersion = ngVersion.getAttribute('ng-version');
          }
        }

        // Check for Next.js
        if (window.__NEXT_DATA__ || document.querySelector('#__next')) {
          detected.frameworks.push('Next.js');

          if (window.__NEXT_DATA__) {
            detected.meta.nextjsBuildId = window.__NEXT_DATA__.buildId;
          }
        }

        // Check for Nuxt.js
        if (window.__NUXT__ || document.querySelector('#__nuxt')) {
          detected.frameworks.push('Nuxt.js');
        }

        // Check for jQuery
        if (window.jQuery || window.$) {
          detected.libraries.push('jQuery');

          if (window.jQuery && window.jQuery.fn && window.jQuery.fn.jquery) {
            detected.meta.jqueryVersion = window.jQuery.fn.jquery;
          }
        }

        // Check for Bootstrap
        if (window.bootstrap || document.querySelector('[class*="bootstrap"]')) {
          detected.libraries.push('Bootstrap');
        }

        // Check for Tailwind CSS
        if (document.querySelector('[class*="tw-"], [class*="tailwind"]') ||
            Array.from(document.styleSheets).some(sheet => {
              try {
                return sheet.href && sheet.href.includes('tailwind');
              } catch {
                return false;
              }
            })) {
          detected.libraries.push('Tailwind CSS');
        }

        // Check for WordPress
        if (document.querySelector('meta[name="generator"][content*="WordPress"]') ||
            document.querySelector('link[href*="wp-content"]')) {
          detected.cms.push('WordPress');
        }

        // Check for Drupal
        if (document.querySelector('meta[name="Generator"][content*="Drupal"]') ||
            window.Drupal) {
          detected.cms.push('Drupal');
        }

        // Check for Google Analytics
        if (window.ga || window.gtag || window.GoogleAnalyticsObject) {
          detected.analytics.push('Google Analytics');
        }

        // Check for Google Tag Manager
        if (window.google_tag_manager || window.dataLayer) {
          detected.analytics.push('Google Tag Manager');
        }

        // Server detection from headers (available via meta tags)
        const serverMeta = document.querySelector('meta[name="server"]');
        if (serverMeta) {
          detected.servers.push(serverMeta.content);
        }

        // Check for common CDNs
        const scripts = Array.from(document.scripts);
        scripts.forEach(script => {
          if (script.src) {
            if (script.src.includes('cloudflare')) detected.meta.cdn = 'Cloudflare';
            if (script.src.includes('akamai')) detected.meta.cdn = 'Akamai';
            if (script.src.includes('fastly')) detected.meta.cdn = 'Fastly';
          }
        });

        // Check for Webpack
        if (window.webpackJsonp || document.querySelector('script[src*="webpack"]')) {
          detected.meta.bundler = 'Webpack';
        }

        // Check for Vite
        if (document.querySelector('script[type="module"][src*="@vite"]')) {
          detected.meta.bundler = 'Vite';
        }

        return detected;
      });

      // Get server headers
      try {
        const response = await page.goto(page.url(), { waitUntil: 'domcontentloaded', timeout: 5000 });
        const headers = await response.headers();

        if (headers['server']) {
          technologies.servers.push(headers['server']);
        }

        if (headers['x-powered-by']) {
          technologies.servers.push(headers['x-powered-by']);
        }

        // Detect from headers
        if (headers['server'] && headers['server'].toLowerCase().includes('apache')) {
          technologies.servers.push('Apache');
        }
        if (headers['server'] && headers['server'].toLowerCase().includes('nginx')) {
          technologies.servers.push('Nginx');
        }
        if (headers['server'] && headers['server'].toLowerCase().includes('cloudflare')) {
          technologies.meta.cdn = 'Cloudflare';
        }
      } catch (error) {
        this.logger.debug('Could not fetch headers for tech detection');
      }

      // Deduplicate
      technologies.frameworks = [...new Set(technologies.frameworks)];
      technologies.libraries = [...new Set(technologies.libraries)];
      technologies.cms = [...new Set(technologies.cms)];
      technologies.servers = [...new Set(technologies.servers)];
      technologies.analytics = [...new Set(technologies.analytics)];

      // Format for display
      const allTech = [
        ...technologies.frameworks,
        ...technologies.libraries,
        ...technologies.cms,
        ...technologies.servers,
        ...technologies.analytics
      ];

      this.logger.success(`✅ Detected ${allTech.length} technologies: ${allTech.join(', ') || 'None'}`);

      return technologies;
    } catch (error) {
      this.logger.error(`Technology detection error: ${error.message}`);
      return {
        frameworks: [],
        libraries: [],
        cms: [],
        servers: [],
        languages: [],
        analytics: [],
        meta: {}
      };
    }
  }

  getStats() {
    return {
      technologiesDetected: this.detectedTech.size
    };
  }
}

module.exports = { ModernTechDetector };
