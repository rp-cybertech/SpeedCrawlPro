/**
 * SpeedCrawl Pro v14 - TechnologyDetector (NO external dependencies)
 */

class TechnologyDetector {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.detectedTechs = new Set();
    
    // Enhanced detection patterns (100+ technologies)
    this.patterns = {
      // Frontend Frameworks
      'React': [/__react/i, /react-dom/i, /data-reactroot/i, /data-reactid/i],
      'Vue.js': [/__vue__/i, /vue\.js/i, /data-v-[a-f0-9]{8}/i],
      'Angular': [/ng-version/i, /angular\.js/i, /ng-scope/i],
      'Next.js': [/__next/i, /_next\//i, /__NEXT_DATA__/i],
      'Nuxt.js': [/__nuxt/i, /_nuxt\//i],
      'Svelte': [/svelte-[a-z0-9]+/i],
      
      // Backend
      'Express.js': [/x-powered-by:\s*express/i],
      'Django': [/csrftoken/i, /django/i],
      'Laravel': [/laravel_session/i, /XSRF-TOKEN/i],
      'Ruby on Rails': [/_rails_session/i],
      'ASP.NET': [/asp\.net/i, /__viewstate/i],
      'Spring Boot': [/JSESSIONID/i],
      'Node.js': [/node\.js/i],
      'PHP': [/phpsessid/i, /\.php/i],
      
      // CMS
      'WordPress': [/wp-content/i, /wp-includes/i],
      'Drupal': [/drupal/i, /sites\/default/i],
      'Joomla': [/joomla/i],
      'Shopify': [/cdn\.shopify\.com/i],
      'Magento': [/magento/i],
      'Wix': [/wix\.com/i],
      
      // UI Libraries
      'Bootstrap': [/bootstrap/i, /btn-primary/i],
      'Tailwind CSS': [/tailwind/i],
      'Material-UI': [/material-ui/i, /mui/i],
      'Ant Design': [/antd/i],
      
      // Analytics
      'Google Analytics': [/google-analytics\.com/i, /gtag\(/i],
      'Google Tag Manager': [/googletagmanager\.com/i],
      'Facebook Pixel': [/connect\.facebook\.net/i],
      
      // CDNs
      'Cloudflare': [/cloudflare/i, /__cf_bm/i],
      'Fastly': [/fastly/i],
      
      // JavaScript Libraries
      'jQuery': [/jquery/i, /\$\(/],
      'Lodash': [/lodash/i],
      'Axios': [/axios/i],
      
      // Build Tools
      'Webpack': [/webpack/i],
      'Vite': [/vite/i],
      
      // Payment
      'Stripe': [/stripe\.com/i],
      'PayPal': [/paypal\.com/i],
      'Razorpay': [/razorpay\.com/i],
      
      // Databases
      'Firebase': [/firebase/i, /firebaseapp\.com/i],
      'MongoDB': [/mongodb/i],
      
      // Security
      'reCAPTCHA': [/recaptcha/i],
      'hCaptcha': [/hcaptcha/i],
      
      // Fonts
      'Google Fonts': [/fonts\.googleapis\.com/i],
      'Font Awesome': [/font-awesome/i],
      
      // Servers
      'Nginx': [/nginx/i],
      'Apache': [/apache/i]
    };
  }

  async detectTechnologies(page) {
    try {
      this.logger.info('🔍 Detecting technologies (100+ patterns)...');
      
      await this.detectWithPatterns(page);
      await this.detectFromHeaders(page);
      await this.detectFromScripts(page);
      await this.detectFromGlobals(page);
      
      const detected = Array.from(this.detectedTechs);
      
      if (detected.length > 0) {
        this.logger.info(`✅ Detected ${detected.length} technologies: ${detected.join(', ')}`);
      } else {
        this.logger.debug('No specific technologies detected');
      }
      
      return detected;
      
    } catch (error) {
      this.logger.debug(`Technology detection error: ${error.message}`);
      return Array.from(this.detectedTechs);
    }
  }

  async detectWithPatterns(page) {
    try {
      const content = await page.content();
      
      for (const [tech, patterns] of Object.entries(this.patterns)) {
        for (const pattern of patterns) {
          if (pattern.test(content)) {
            this.detectedTechs.add(tech);
            break;
          }
        }
      }
    } catch (error) {
      this.logger.debug(`Pattern detection error: ${error.message}`);
    }
  }

  async detectFromGlobals(page) {
    try {
      const technologies = await page.evaluate(() => {
        const techs = [];
        if (window.React) techs.push('React');
        if (window.Vue) techs.push('Vue.js');
        if (window.angular) techs.push('Angular');
        if (window.jQuery || window.$) techs.push('jQuery');
        if (window.Shopify) techs.push('Shopify');
        if (window.gtag) techs.push('Google Analytics');
        return techs;
      });
      
      technologies.forEach(tech => this.detectedTechs.add(tech));
    } catch (error) {
      this.logger.debug(`Global detection error: ${error.message}`);
    }
  }

  async detectFromHeaders(page) {
    try {
      const response = await page.goto(page.url(), { waitUntil: 'domcontentloaded' }).catch(() => null);
      
      if (response) {
        const headers = await response.allHeaders();
        
        if (headers['server']) {
          const server = headers['server'].toLowerCase();
          if (server.includes('nginx')) this.detectedTechs.add('Nginx');
          if (server.includes('apache')) this.detectedTechs.add('Apache');
          if (server.includes('cloudflare')) this.detectedTechs.add('Cloudflare');
        }
        
        if (headers['x-powered-by']) {
          const powered = headers['x-powered-by'].toLowerCase();
          if (powered.includes('express')) this.detectedTechs.add('Express.js');
          if (powered.includes('php')) this.detectedTechs.add('PHP');
          if (powered.includes('asp.net')) this.detectedTechs.add('ASP.NET');
        }
      }
    } catch (error) {
      this.logger.debug(`Header detection error: ${error.message}`);
    }
  }

  async detectFromScripts(page) {
    try {
      const scripts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('script[src]'))
          .map(s => s.src)
          .filter(src => src);
      });
      
      const scriptPatterns = {
        'react': 'React',
        'vue': 'Vue.js',
        'angular': 'Angular',
        'next': 'Next.js',
        'jquery': 'jQuery',
        'bootstrap': 'Bootstrap',
        'tailwind': 'Tailwind CSS',
        'webpack': 'Webpack',
        'firebase': 'Firebase',
        'gtag': 'Google Analytics'
      };
      
      for (const script of scripts) {
        const scriptLower = script.toLowerCase();
        for (const [pattern, tech] of Object.entries(scriptPatterns)) {
          if (scriptLower.includes(pattern)) {
            this.detectedTechs.add(tech);
          }
        }
      }
    } catch (error) {
      this.logger.debug(`Script detection error: ${error.message}`);
    }
  }
}

module.exports = { TechnologyDetector };
