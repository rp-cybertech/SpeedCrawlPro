
const EventEmitter = require('events');
const { createFaker } = require('../utils/FakerFactory');

class FormProcessor extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;

    // faker is optional; only used inside page context via data passed
    try {
      this.faker = createFaker(config, logger);
      this.logger.debug('✅ Faker.js initialized (English locale)');
    } catch {
      this.faker = null;
      this.logger.warn('⚠️ Faker.js not found, continuing without it');
    }
  }

  async processForm(page, submittedForms) {
    try {
      this.logger.info('🌐 Processing forms...');
      await page.waitForTimeout(1000);

      const useFaker = !!this.config.get('useFaker');
      const fakerPool = useFaker && this.faker ? {
        email: this.faker.internet.email(),
        tel: this.faker.string.numeric(10),
        phone: this.faker.string.numeric(10),
        mobile: this.faker.string.numeric(10),
        password: this.faker.internet.password({ length: 12, memorable: true, pattern: /[A-Za-z0-9]/ }),
        name: this.faker.person.fullName(),
        text: this.faker.lorem.words(3),
        number: this.faker.string.numeric(6)
      } : null;

      const customInputs = this.config.get('customInputData') || {};

      const forms = await page.evaluate(() => {
        const res = [];
        const seen = new Set();

        const cap = (c, t, x) => {
          const inp = c.querySelectorAll('input:not([type="hidden"]):not([disabled]):not([type="submit"]), textarea:not([disabled]), select:not([disabled])');
          if (inp.length === 0) return null;
          const sig = Array.from(inp).map((i, idx) => `${i.tagName.toLowerCase()}:${i.type || 'text'}:${i.name || i.id || idx}`).sort().join('|');
          if (seen.has(sig)) return null;
          seen.add(sig);
          
          let action = c.action || '';
          if (action && typeof action !== 'string') {
            action = c.getAttribute('action') || '';
          }
          if (action && !action.startsWith('http')) {
            action = new URL(action, window.location.href).href;
          }

          return {
            t, x,
            action: action || window.location.href,
            method: (c.method || 'GET').toUpperCase(),
            sig: sig,
            f: Array.from(inp).map((i, idx) => ({
              tag: i.tagName.toLowerCase(),
              type: i.type || 'text',
              name: i.name || '',
              id: i.id || '',
              idx
            })),
            b: Array.from(c.querySelectorAll('button:not([disabled]), input[type="submit"]')).map((b, idx) => ({
              txt: b.textContent?.trim() || b.value || '',
              id: b.id || '',
              idx
            }))
          };
        };

        document.querySelectorAll('form').forEach((f, i) => {
          const d = cap(f, 'form', i);
          if (d) res.push(d);
        });

        if (res.length === 0) {
          document.querySelectorAll('div, section, main, article').forEach((d, i) => {
            if (d.closest('form')) return;
            const inp = d.querySelectorAll('input:not([type="hidden"]):not([disabled])');
            const btn = d.querySelectorAll('button:not([disabled])');
            if (inp.length >= 1 && btn.length >= 1) {
              const x = cap(d, 'spa', i);
              if (x) res.push(x);
            }
          });
        }
        return res;
      });

      if (!forms || forms.length === 0) {
        this.logger.warn('⚠️  No forms');
        return { fieldsProcessed: 0, submitted: false };
      }

      this.logger.info(`📋 Found ${forms.length} forms`);
      let totalFieldsProcessed = 0;
      let anySubmitted = false;

      for (let i = 0; i < forms.length; i++) {
        const frm = forms[i];
        const formGlobalSignature = `${frm.method}:${frm.action}:${frm.sig}`;

        if (submittedForms.has(formGlobalSignature)) {
          this.logger.debug(`⏭️  Skipping already submitted form: ${formGlobalSignature}`);
          continue;
        }

        this.logger.info(`📝 Form ${i + 1}/${forms.length} (${frm.t}, ${frm.f.length} fields)`);
        
        const fillResult = await this.fillAndSubmitForm(page, frm, fakerPool, customInputs);

        if (fillResult.submitted) {
          submittedForms.add(formGlobalSignature);
          anySubmitted = true;
          totalFieldsProcessed += fillResult.fieldsProcessed;
          // Wait a bit for navigation/SPA update after submission
          await page.waitForTimeout(1500); 
        }
      }

      return { fieldsProcessed: totalFieldsProcessed, submitted: anySubmitted };

    } catch (error) {
      this.logger.warn(`Form processing error: ${error.message}`);
      return { fieldsProcessed: 0, submitted: false };
    }
  }

  async fillAndSubmitForm(page, frm, fakerPool, customInputs) {
    const fillResult = await page.evaluate(({ frm, fakerPool, cust }) => {
      const log = [];
      let fieldsProcessed = 0;

      const setReactValue = (el, val) => {
        const proto = el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, val ?? '');
        else el.value = val ?? '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      const checkBySetter = (el) => {
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked');
        if (desc && desc.set) desc.set.call(el, true);
        else el.checked = true;
        el.dispatchEvent(new Event('click', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      for (const f of frm.f) {
        try {
          let el = null;
          if (f.id) el = document.getElementById(f.id);
          if (!el && f.name) el = document.querySelector(`[name="${CSS.escape(f.name)}"]`);
          if (!el) {
            const all = document.querySelectorAll('input:not([type="hidden"]):not([disabled]):not([type="submit"]), textarea, select');
            el = all[f.idx];
          }
          if (!el) { log.push(`❌ ${f.name || f.id || f.idx} NOT FOUND`); continue; }
          if (el.disabled || el.readOnly || el.offsetParent === null) {
            log.push(`⏭️  ${f.name || f.id || `field${f.idx}`} skipped (disabled/hidden)`); 
            continue;
          }

          if (f.type === 'checkbox' || f.type === 'radio') {
            checkBySetter(el);
            fieldsProcessed++;
            log.push(`✅ ${f.name || f.id || `field${f.idx}`} = checked`);
            continue;
          }

          const key = (f.name || f.id || '').toLowerCase();
          let val = '';
          if (cust[key]) val = String(cust[key]);
          else if (f.name && cust[f.name]) val = String(cust[f.name]);
          else if (f.id && cust[f.id]) val = String(cust[f.id]);

          if (!val && fakerPool) {
            if (key.includes('mobile') || key.includes('phone')) val = fakerPool.mobile;
            else if (key.includes('email')) val = fakerPool.email;
            else if (key.includes('password')) val = fakerPool.password;
            else if (key.includes('name')) val = fakerPool.name;
            else if (f.type === 'tel' || f.type === 'phone') val = fakerPool.mobile;
            else if (f.type === 'email') val = fakerPool.email;
            else if (f.type === 'number') val = fakerPool.number;
            else val = fakerPool.text;
          }
          if (!val) val = 'test123';

          if (f.tag === 'select') {
            const opts = el.querySelectorAll('option:not([value=""])');
            if (opts.length > 1) el.value = opts[1].value;
            else if(opts.length === 1) el.value = opts[0].value
            el.dispatchEvent(new Event('change', { bubbles: true }));
            fieldsProcessed++;
            log.push(`✅ ${f.name || f.id || `field${f.idx}`} = "${el.value}"`);
          } else {
            el.focus();
            setReactValue(el, ''); // clear first
            setReactValue(el, val);
            el.blur();
            fieldsProcessed++;
            log.push(`✅ ${f.name || f.id || `field${f.idx}`} = "${val}"`);
          }
        } catch (err) {
          log.push(`❌ Error on ${f.name || f.id || f.idx}: ${err.message}`);
        }
      }
      return { fieldsProcessed, log };
    }, { frm, fakerPool, cust: customInputs });

    if (this.config.get('debug')) {
      (fillResult?.log || []).forEach(l => this.logger.debug(`   ${l}`));
    }

    if (!fillResult || fillResult.fieldsProcessed === 0) {
      this.logger.warn('   ⚠️  No fields filled');
    } else {
      this.logger.info(`   ✅ Filled ${fillResult.fieldsProcessed} fields`);
    }

    const postPromise = page.waitForRequest(req =>
      (req.method() === 'POST' || req.isNavigationRequest()) &&
      !req.url().includes('google-analytics'), 
      { timeout: 5000 }).catch(() => null);

    let clicked = false;
    try {
      const btn = await page.evaluateHandle((frm) => {
        let container = document;
        if (frm.t === 'spa') {
          const all = document.querySelectorAll('div, section, main, article');
          container = all[frm.x] || document;
        } else {
          const all = document.querySelectorAll('form');
          container = all[frm.x] || document;
        }
        return container.querySelector('button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])');
      }, frm);
      
      if (btn && (await btn.asElement())) {
        await btn.click({ timeout: 2000 });
        clicked = true;
      }
    } catch {}

    if (!clicked) {
      clicked = await page.evaluate((frm) => {
        let container = document;
         if (frm.t === 'spa') {
          const all = document.querySelectorAll('div, section, main, article');
          container = all[frm.x] || document;
        } else {
          const all = document.querySelectorAll('form');
          container = all[frm.x] || document;
        }

        const list = Array.from(container.querySelectorAll('button, input[type="button"], a[role="button"]'));
        for (const b of list) {
          const t = (b.textContent || b.value || b.innerText || '').toLowerCase();
          if (t && /submit|continue|next|login|sign in|go|search/.test(t) && b.offsetParent !== null && !b.disabled) {
            b.click(); return true;
          }
        }
        return false;
      }, frm);
    }
    
    if (clicked) this.logger.info('   ✅ Submit clicked');

    const postReq = await postPromise;
    if (postReq) {
      this.logger.success(`   ✅ Navigation/POST to → ${postReq.url()}`);
      await page.waitForLoadState('domcontentloaded').catch(()=>{});
      return { fieldsProcessed: fillResult.fieldsProcessed || 0, submitted: true };
    } else {
      this.logger.warn('   ⚠️  No navigation or POST detected after click (likely client-side action)');
      await page.waitForTimeout(1200);
      return { fieldsProcessed: fillResult.fieldsProcessed || 0, submitted: true };
    }
  }

  cleanup() {}
}

module.exports = { FormProcessor };

