/**
 * i18n.test.js
 *
 * Principle 6 is "bilingual from day one", which in practice fails one key at
 * a time: someone adds an English string, ships it, and a student's parent
 * sees English on an otherwise Chinese screen. This test makes that a build
 * failure rather than something a reviewer has to notice.
 */

import { describe, it, equal, ok, deepEqual } from './runner.js';
import { LANGS, LOCALES, t, setLang, getLang, toggleLang, allKeys, rawString } from '../js/i18n.js';


describe('dictionary parity', () => {
  it('defines exactly the same keys in both languages', () => {
    // Derived from the dictionaries themselves, so a key added to one and
    // forgotten in the other fails here without anyone updating a list.
    const en = allKeys('en');
    const zh = allKeys('zh');
    const missingFromZh = en.filter((k) => !zh.includes(k));
    const missingFromEn = zh.filter((k) => !en.includes(k));
    deepEqual(missingFromZh, [], `no Chinese for: ${missingFromZh.join(', ')}`);
    deepEqual(missingFromEn, [], `no English for: ${missingFromEn.join(', ')}`);
  });

  it('has a substantial dictionary', () => {
    ok(allKeys('en').length > 180, `expected a full dictionary, got ${allKeys('en').length}`);
  });

  it('has no empty string in either language', () => {
    for (const lang of LANGS) {
      const blank = allKeys(lang).filter((k) => String(rawString(lang, k)).trim() === '');
      deepEqual(blank, [], `${lang} has blank values: ${blank.join(', ')}`);
    }
  });

  it('translates every Chinese value rather than copying the English', () => {
    const SAME_IN_BOTH = new Set(['lang.toggle', 'lang.name', 'app.title']);
    const copied = allKeys('en')
      .filter((k) => !SAME_IN_BOTH.has(k))
      .filter((k) => rawString('en', k) === rawString('zh', k));
    deepEqual(copied, [], `identical in both languages: ${copied.join(', ')}`);
  });

  it('keeps every placeholder in the Chinese translation', () => {
    const broken = [];
    for (const key of allKeys('en')) {
      const en = String(rawString('en', key));
      const zh = String(rawString('zh', key));
      const names = (str) => [...str.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      if (JSON.stringify(names(en)) !== JSON.stringify(names(zh))) broken.push(key);
    }
    deepEqual(broken, [], `placeholders differ between languages: ${broken.join(', ')}`);
  });
});

describe('i18n coverage', () => {
  it('has both languages registered', () => {
    deepEqual(LANGS, ['en', 'zh']);
    equal(LOCALES.en, 'en-US');
    equal(LOCALES.zh, 'zh-CN');
  });

  it('resolves every key in both languages', () => {
    // Derived from the dictionaries rather than a hand-kept list, so a new
    // screen cannot add a key that nothing checks.
    for (const lang of LANGS) {
      setLang(lang);
      const missing = allKeys(lang).filter((k) => t(k) === k);
      deepEqual(missing, [], `${lang} is missing: ${missing.join(', ')}`);
    }
  });

  it('every Chinese string actually contains Chinese characters', () => {
    setLang('zh');
    const HAS_HAN = /[一-鿿]/;
    // A few values are legitimately Latin-only: the toggle reads "English"
    // when the UI is in Chinese, and weekday keys are checked separately.
    const LATIN_OK = new Set(['lang.toggle', 'app.title']);
    const suspicious = allKeys('zh')
      .filter((k) => !LATIN_OK.has(k))
      .filter((k) => !HAS_HAN.test(String(rawString('zh', k))));
    deepEqual(suspicious, [], `no Han characters in: ${suspicious.join(', ')}`);
  });
});

describe('interpolation', () => {
  it('fills placeholders in both languages', () => {
    for (const lang of LANGS) {
      setLang(lang);
      const out = t('admin.roster.imported', { added: 3, updated: 5 });
      ok(out.includes('3') && out.includes('5'), `${lang}: ${out}`);
      ok(!out.includes('{added}'), `${lang} left a placeholder unfilled: ${out}`);
    }
  });

  it('fills every placeholder the dictionary declares, in both languages', () => {
    // Sweeps the whole dictionary rather than sampling one key, so a template
    // whose placeholder name was typo'd in one language is caught.
    const unfilled = [];
    for (const lang of LANGS) {
      setLang(lang);
      for (const key of allKeys(lang)) {
        const raw = String(rawString(lang, key));
        const names = [...raw.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        if (!names.length) continue;
        const filled = t(key, Object.fromEntries(names.map((n) => [n, 'X'])));
        if (/\{\w+\}/.test(filled)) unfilled.push(`${lang}:${key}`);
      }
    }
    deepEqual(unfilled, []);
  });

  it('leaves an unknown placeholder alone rather than printing undefined', () => {
    setLang('en');
    const out = t('toast.imported', {});
    ok(out.includes('{count}'), out);
    ok(!out.includes('undefined'), out);
  });

  it('returns the key and does not throw for an unknown key', () => {
    equal(t('no.such.key.exists'), 'no.such.key.exists');
  });
});

describe('language switching', () => {
  it('toggles between the two languages', () => {
    setLang('en');
    equal(toggleLang(), 'zh');
    equal(getLang(), 'zh');
    equal(toggleLang(), 'en');
  });

  it('ignores an unsupported language rather than blanking the UI', () => {
    setLang('en');
    setLang('fr');
    equal(getLang(), 'en');
  });
});
