// src/evasion/CAPTCHAHandler.js
/**
 * SpeedCrawl Pro v22.0 - CAPTCHAHandler
 * - Detects reCAPTCHA v2/Enterprise, hCaptcha, and common custom captchas
 * - In headful mode, pauses 2–20 seconds (random) for manual solve, or until detected solved
 * - Non-breaking: no new required flags; honors optional config keys if present:
 *   - captchaWaitMin (ms, default 2000), captchaWaitMax (ms, default 20000)
 */
class CAPTCHAHandler {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.defaultMin = 2000;
    this.defaultMax = 20000;
  }

  async detectCaptcha(page) {
    try {
      // Try to identify known captcha widgets or inputs
      const result = await page.evaluate(() => {
        const found = [];
        // reCAPTCHA iframes
        const recaptcha = Array.from(document.querySelectorAll('iframe[src*="google.com/recaptcha"], iframe[src*="recaptcha.net"]'));
        if (recaptcha.length) found.push({ type: 'recaptcha', selector: 'iframe[src*="recaptcha"]' });

        // hCaptcha
        const hcaptcha = Array.from(document.querySelectorAll('iframe[src*="hcaptcha.com"]'));
        if (hcaptcha.length) found.push({ type: 'hcaptcha', selector: 'iframe[src*="hcaptcha.com"]' });

        // Common image/canvas/text inputs containing "captcha"
        const inputs = Array.from(document.querySelectorAll('input[name*="captcha" i], input[id*="captcha" i]'));
        const canv = Array.from(document.querySelectorAll('canvas[id*="captcha" i]'));
        if (inputs.length || canv.length) found.push({ type: 'custom', selector: 'input[name*="captcha" i], canvas[id*="captcha" i]' });

        // Generic challenge labels
        const labels = Array.from(document.querySelectorAll('label')).map(l => l.textContent?.toLowerCase() || '');
        if (labels.some(t => t.includes('captcha') || t.includes('i am human') || t.includes('not a robot'))) {
          found.push({ type: 'generic', selector: 'label:contains(captcha)' });
        }

        return found;
      });
      return Array.isArray(result) && result.length ? { found: true, items: result } : { found: false, items: [] };
    } catch (err) {
      this.logger?.debug?.(`CAPTCHA detect error: ${err.message}`);
      return { found: false, items: [] };
    }
  }

  async waitForSolved(page, type, maxWaitMs) {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      try {
        const solved = await page.evaluate((t) => {
          try {
            if (t === 'recaptcha' && window.grecaptcha) {
              // Any widget with a response token?
              const count = (window.___grecaptcha_cfg?.clients && Object.keys(window.___grecaptcha_cfg.clients).length) || 0;
              if (count > 0) {
                for (const idx of Object.keys(window.___grecaptcha_cfg.clients)) {
                  try {
                    const api = window.grecaptcha;
                    if (api && typeof api.getResponse === 'function') {
                      const resp = api.getResponse();
                      if (resp && resp.length > 0) return true;
                    }
                  } catch {}
                }
              }
            }
            if (t === 'hcaptcha' && window.hcaptcha && typeof window.hcaptcha.getResponse === 'function') {
              const resp = window.hcaptcha.getResponse();
              if (resp && resp.length > 0) return true;
            }
            // Heuristic: presence of hidden input with token
            const token = document.querySelector('input[name="g-recaptcha-response"], textarea[name="g-recaptcha-response"]');
            if (token && token.value && token.value.length > 0) return true;
          } catch {}
          return false;
        }, type);
        if (solved) return true;
      } catch {}
      await page.waitForTimeout(1000);
    }
    return false;
  }

  async handleCaptcha(page) {
    // Detect presence first
    const det = await this.detectCaptcha(page);
    if (!det.found) return { found: false, waitedMs: 0, solved: false };

    const headless = !!this.config.get('headless');
    const minMs = Number(this.config.get('captchaWaitMin') ?? this.defaultMin);
    const maxMs = Number(this.config.get('captchaWaitMax') ?? this.defaultMax);
    const clampedMin = Math.max(0, Math.min(minMs, maxMs));
    const clampedMax = Math.max(clampedMin, maxMs);
    const randMs = clampedMin + Math.floor(Math.random() * (clampedMax - clampedMin + 1));
    const primaryType = det.items[0]?.type || 'generic';

    if (!headless) {
      this.logger.info(`🧩 CAPTCHA detected (${primaryType}) → pausing for manual entry ${(randMs / 1000).toFixed(1)}s`); 
      const solved = await this.waitForSolved(page, primaryType, randMs);
      if (solved) {
        this.logger.success('✅ CAPTCHA marked as solved, continuing'); 
        return { found: true, waitedMs: randMs, solved: true };
      }
      this.logger.warn('⏭️  CAPTCHA wait elapsed without auto-detecting solve; proceeding anyway'); 
      return { found: true, waitedMs: randMs, solved: false };
    }

    // Headless path: no auto-solve here; proceed without blocking
    this.logger.warn('🧩 CAPTCHA detected in headless mode; no manual wait applied'); 
    return { found: true, waitedMs: 0, solved: false };
  }
}

module.exports = { CAPTCHAHandler };
