/**
 * SpeedCrawl Pro v22.0 - ActionButtonFinder (keeps options as-is)
 * - Finds enabled, visible primary action buttons
 * - Retries and JS-click fallback
 */

class ActionButtonFinder {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.actionKeywords = [
      'submit','send','go','search','find','continue','next','proceed',
      'login','log in','sign in','signin','register','signup','sign up',
      'create account','join','get started','get otp','send otp',
      'verify','confirm','validate','authenticate','save','update',
      'apply','buy','checkout','ok','yes','accept','agree'
    ];
    this.actionIdPatterns = [
      'submit','send','login','signin','register','signup',
      'otp','verify','confirm','continue','next','proceed',
      'btn-primary','btn-submit','btn-action','cta'
    ];
  }

  async tryClickWithRetry(element, method, text = '') {
    try {
      await element.click({ timeout: 2000 });
      return true;
    } catch {
      try {
        this.logger.debug(`Button disabled, waiting... (${text || method})`);
        await element.waitForElementState('enabled', { timeout: 2000 });
        await element.click({ timeout: 2000 });
        return true;
      } catch {
        try {
          await element.evaluate(el => el.click());
          return true;
        } catch {
          return false;
        }
      }
    }
  }

  async tryJavaScriptClick(page) {
    try {
      const clicked = await page.evaluate(() => {
        const submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
        if (submitBtn && !submitBtn.disabled && submitBtn.offsetParent !== null) { submitBtn.click(); return true; }
        const buttons = Array.from(document.querySelectorAll('button, input[type="button"]'));
        for (const btn of buttons) {
          const text = (btn.textContent || btn.value || '').toLowerCase();
          if (text.includes('submit') || text.includes('send') || text.includes('login') ||
              text.includes('otp') || text.includes('verify') || text.includes('continue')) {
            if (!btn.disabled && btn.offsetParent !== null) { btn.click(); return true; }
          }
        }
        return false;
      });
      return clicked;
    } catch {
      return false;
    }
  }

  async findActionButtons(page) {
    try {
      const buttons = await page.evaluate((config) => {
        const { keywords, patterns } = config;
        const found = [];
        const allButtons = [
          ...Array.from(document.querySelectorAll('button')),
          ...Array.from(document.querySelectorAll('input[type="submit"], input[type="button"]')),
          ...Array.from(document.querySelectorAll('[role="button"]'))
        ];
        allButtons.forEach((btn, idx) => {
          const text = (btn.textContent || btn.value || '').trim().toLowerCase();
          const id = (btn.id || '').toLowerCase();
          const className = (btn.className || '').toLowerCase();
          const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
          const textMatch = keywords.some(kw => text.includes(kw) || ariaLabel.includes(kw));
          const idMatch = patterns.some(p => id.includes(p) || className.includes(p));
          const isPrimary = className.includes('primary') || className.includes('btn-action') || className.includes('cta');
          if (textMatch || idMatch || isPrimary) {
            let selector;
            if (btn.id) selector = `#${btn.id}`;
            else if (btn.className) {
              const classes = btn.className.split(' ').filter(c => c.length > 0).slice(0, 2).join('.');
              selector = `${btn.tagName.toLowerCase()}.${classes}`;
            } else selector = `${btn.tagName.toLowerCase()}:nth-of-type(${idx + 1})`;
            const score = (textMatch ? 10 : 0) + (idMatch ? 5 : 0) + (isPrimary ? 3 : 0);
            found.push({ selector, text: text || '[no text]', score, method: textMatch ? 'text-match' : (idMatch ? 'id-match' : 'primary') });
          }
        });
        // Filter visible
        const visible = found.filter(b => {
          try { const el = document.querySelector(b.selector); return el && el.offsetParent !== null && !el.disabled; } catch { return false; }
        });
        return visible.sort((a, b) => b.score - a.score);
      }, { keywords: this.actionKeywords, patterns: this.actionIdPatterns });

      this.logger.info(`🔍 Found ${buttons.length} candidate buttons`);
      buttons.slice(0, 3).forEach((btn, i) => this.logger.debug(` ${i + 1}. "${btn.text}" (${btn.method}, score: ${btn.score})`));
      return buttons;
    } catch (error) {
      this.logger.error(`Button search failed: ${error.message}`);
      return [];
    }
  }

  async findAndClick(page) {
    try {
      this.logger.debug('🔍 Searching for submit buttons...');
      const submitBtn = await page.$('button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])');
      if (submitBtn) {
        const clicked = await this.tryClickWithRetry(submitBtn, 'type=submit');
        if (clicked) return { clicked: true, method: 'type=submit' };
      }
      const buttons = await this.findActionButtons(page);
      for (const btnInfo of buttons.slice(0, 5)) {
        try {
          const button = await page.$(btnInfo.selector);
          if (button) {
            const clicked = await this.tryClickWithRetry(button, btnInfo.method, btnInfo.text);
            if (clicked) {
              this.logger.info(`✅ Clicked: "${btnInfo.text}" (${btnInfo.method})`);
              return { clicked: true, method: btnInfo.method, text: btnInfo.text };
            }
          }
        } catch {}
      }
      this.logger.debug('🔧 Trying JavaScript click...');
      const jsClicked = await this.tryJavaScriptClick(page);
      if (jsClicked) return { clicked: true, method: 'javascript' };
      this.logger.warn('⚠️ No clickable button found');
      return { clicked: false, method: 'none' };
    } catch (error) {
      this.logger.debug(`Button finder error: ${error.message}`);
      return { clicked: false, error: error.message };
    }
  }
}

module.exports = { ActionButtonFinder };
