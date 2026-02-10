// src/utils/FakerFactory.js
/**
 * SpeedCrawl Pro v22.0 - FakerFactory (v10)
 * - Builds a Faker instance with:
 *   - Primary locale (fakerLocale) and fallback locales (fakerFallbackLocales)
 *   - Seed (fakerSeed) and default reference date (fakerRefDate)
 *   - Optional uniqueness wrapper (fakerUnique)
 * - Usage (CJS):
 *   const { createFaker } = require('./FakerFactory');
 *   const faker = createFaker(config, logger);
 *
 * Docs:
 * - Localization: https://v10.fakerjs.dev/guide/localization.html
 * - Usage (Node.js): https://v10.fakerjs.dev/guide/usage.html
 * - Randomizer/seed/refDate: https://v10.fakerjs.dev/guide/randomizer.html
 * - Frameworks note: https://v10.fakerjs.dev/guide/frameworks.html
 * - Unique helper: https://v10.fakerjs.dev/guide/unique.html
 */
function createFaker(config, logger) {
    try {
      // Prefer CJS require
      const mod = require('@faker-js/faker');
      const FakerClass = mod.Faker || null;
      const defaultFaker = mod.faker || null;
      const allLocales = mod.allLocales || null;
  
      let instance = defaultFaker || null;
  
      // Build custom locale chain when available
      const localeCode = config.get('fakerLocale');
      const fallbackCodes = config.get('fakerFallbackLocales') || [];
      const localeChain = [];
  
      if (FakerClass && allLocales) {
        const pushLocale = (code) => {
          if (!code) return;
          const key = String(code).trim();
          const loc = allLocales[key];
          if (loc) localeChain.push(loc);
        };
  
        if (localeCode) pushLocale(localeCode);
        (Array.isArray(fallbackCodes) ? fallbackCodes : []).forEach(pushLocale);
  
        // Always add en and base as last resort to reduce method errors
        pushLocale('en');
        pushLocale('base');
  
        if (localeChain.length > 0) {
          instance = new FakerClass({ locale: localeChain });
        }
      }
  
      // Fallback to default faker if needed
      if (!instance && defaultFaker) {
        instance = defaultFaker;
      }
      if (!instance) throw new Error('Faker instance unavailable');
  
      // Seed and default refDate for reproducibility
      const seed = config.get('fakerSeed');
      if (typeof seed === 'number' && Number.isFinite(seed)) {
        instance.seed(seed);
        logger?.debug?.(`🎲 Faker seeded: ${seed}`);
      }
      const refDate = config.get('fakerRefDate');
      if (refDate) {
        try { instance.setDefaultRefDate(refDate); } catch {}
        logger?.debug?.(`🗓️  Faker refDate set: ${refDate}`);
      }
  
      // Optional "unique" helper wrapper (best-effort cache)
      if (config.get('fakerUnique')) {
        const cache = new Map();
        instance.__unique = function unique(fn, key = 'default', maxTries = 10) {
          const seen = cache.get(key) || new Set();
          let v, tries = 0;
          do { v = fn(); tries++; } while (seen.has(v) && tries < maxTries);
          seen.add(v);
          cache.set(key, seen);
          return v;
        };
      }
  
      return instance;
    } catch (err) {
      logger?.warn?.(`Faker initialization failed: ${err.message}, falling back to simple generator`);
      // Minimal fallback to keep flows alive
      return {
        string: { uuid: () => `uuid-${Math.random().toString(16).slice(2)}-${Date.now()}` },
        internet: { email: () => `user_${Math.random().toString(16).slice(2)}@example.com` },
        person: {
          firstName: () => 'Alex',
          lastName: () => 'Doe',
          fullName: () => 'Alex Doe',
          sexType: () => (Math.random() < 0.5 ? 'male' : 'female')
        },
        phone: { number: () => `9${Math.floor(100000000 + Math.random()*900000000)}` },
        location: { zipCode: () => String(100000 + Math.floor(Math.random()*900000)) },
        helpers: { arrayElement: (arr) => arr[Math.floor(Math.random()*arr.length)] }
      };
    }
  }
  
  module.exports = { createFaker };
  