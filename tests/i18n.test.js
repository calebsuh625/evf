/**
 * i18n.test.js
 *
 * Principle 6 is "bilingual from day one", which in practice fails one key at
 * a time: someone adds an English string, ships it, and a student's parent
 * sees English on an otherwise Chinese screen. This test makes that a build
 * failure rather than something a reviewer has to notice.
 */

import { describe, it, equal, ok, deepEqual } from './runner.js';
import { LANGS, LOCALES, t, setLang, getLang, toggleLang } from '../js/i18n.js';

/**
 * The dictionaries are module-private, so probe them through t(): a key is
 * "missing" from a language when t() falls back and returns the same string
 * the other language gave, or returns the key itself.
 *
 * The key list is derived from the English dictionary by asking for every key
 * used anywhere in the app. Kept explicit so a new screen has to add its keys
 * here too, which is the moment to notice the Chinese is missing.
 */
const KEYS = [
  'app.title', 'lang.toggle', 'lang.name',
  'nav.home', 'nav.tutors', 'nav.students', 'nav.pairings', 'nav.log',
  'nav.sessions', 'nav.hours', 'nav.data', 'nav.settings',
  'footer.local', 'footer.tests',
  'home.title', 'home.lede', 'home.empty.title', 'home.empty.body',
  'home.clocks', 'home.zone.here', 'home.zone.students',
  'home.stat.tutors', 'home.stat.students', 'home.stat.pairings', 'home.stat.hours',
  'home.next',
  'tutors.title', 'tutors.lede', 'students.title', 'students.lede',
  'pairings.title', 'pairings.lede', 'log.title', 'log.lede',
  'sessions.title', 'sessions.lede', 'hours.title', 'hours.lede',
  'settings.title', 'settings.lede',
  'data.title', 'data.lede',
  'data.export.title', 'data.export.body', 'data.export.action',
  'data.import.title', 'data.import.body', 'data.import.drop',
  'data.sample.title', 'data.sample.body', 'data.sample.action',
  'data.csv.title', 'data.csv.body', 'data.csv.export', 'data.csv.import',
  'data.csv.table', 'data.csv.importHint',
  'data.status.title', 'data.status.schema', 'data.status.cache',
  'data.status.exported', 'data.status.never', 'data.status.pairings',
  'data.status.availability', 'data.status.unpaired', 'data.status.capacity',
  'data.reset.title', 'data.reset.body', 'data.reset.action', 'data.reset.confirm',
  'data.peek',
  'toast.sampleLoaded', 'toast.imported', 'toast.exported', 'toast.cleared',
  'toast.migrated', 'toast.csvImported',
  'placeholder.tag', 'placeholder.body', 'placeholder.willDo', 'placeholder.dataReady',
  'notfound.title', 'notfound.body', 'notfound.action',
  'action.loadSample', 'action.goToData', 'action.viewTutors', 'action.logSession',
  'count.records', 'integrity.warnings',
  'footer.selftest',
  'selftest.title', 'selftest.lede', 'selftest.pass', 'selftest.fail',
  'selftest.ranIn', 'selftest.rerun', 'selftest.reran', 'selftest.example',
  'selftest.tutorSide', 'selftest.studentSide', 'selftest.exampleNote',
  'selftest.expected', 'selftest.actual', 'selftest.passed', 'selftest.failed',
  'selftest.footnote', 'selftest.nFailing'
];

describe('i18n coverage', () => {
  it('has both languages registered', () => {
    deepEqual(LANGS, ['en', 'zh']);
    equal(LOCALES.en, 'en-US');
    equal(LOCALES.zh, 'zh-CN');
  });

  it('resolves every key in English', () => {
    setLang('en');
    const missing = KEYS.filter((k) => t(k) === k);
    deepEqual(missing, [], `English is missing: ${missing.join(', ')}`);
  });

  it('resolves every key in Chinese', () => {
    setLang('zh');
    const missing = KEYS.filter((k) => t(k) === k);
    deepEqual(missing, [], `Chinese is missing: ${missing.join(', ')}`);
  });

  it('has no key that silently falls back to English', () => {
    setLang('en');
    const english = new Map(KEYS.map((k) => [k, t(k)]));
    setLang('zh');

    // A Chinese value identical to the English one means the key is absent
    // from the zh dictionary and t() fell back. Keys whose value is legitimately
    // the same in both languages are listed as exceptions.
    const SAME_IN_BOTH = new Set(['lang.toggle', 'lang.name']);
    const fellBack = KEYS.filter((k) => !SAME_IN_BOTH.has(k) && t(k) === english.get(k));
    deepEqual(fellBack, [], `these keys have no Chinese translation: ${fellBack.join(', ')}`);
  });

  it('every Chinese string actually contains Chinese characters', () => {
    setLang('zh');
    const HAS_HAN = /[一-鿿]/;
    // Latin-only values are legitimate for a few keys (the toggle reads
    // "English" when the UI is in Chinese).
    const LATIN_OK = new Set(['lang.toggle', 'app.title']);
    const suspicious = KEYS.filter((k) => !LATIN_OK.has(k) && !HAS_HAN.test(t(k)));
    deepEqual(suspicious, [], `no Han characters in: ${suspicious.join(', ')}`);
  });
});

describe('interpolation', () => {
  it('fills placeholders in both languages', () => {
    for (const lang of LANGS) {
      setLang(lang);
      const out = t('toast.csvImported', { added: 3, updated: 5 });
      ok(out.includes('3') && out.includes('5'), `${lang}: ${out}`);
      ok(!out.includes('{added}'), `${lang} left a placeholder unfilled: ${out}`);
    }
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
