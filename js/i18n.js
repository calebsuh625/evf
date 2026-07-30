/**
 * i18n.js — English / Simplified Chinese.
 *
 * Bilingual from day one (principle 6), which means the dictionary is the
 * only place UI copy lives. A string hardcoded in a view is a bug: it is
 * text a student's parent cannot read.
 *
 * Keys are dotted paths. Missing keys fall back to English, then to the key
 * itself, and log once — a silently blank label is worse than an ugly one.
 */

import { loadLangPreference, saveLangPreference } from './store.js';

export const LANGS = Object.freeze(['en', 'zh']);

export const LOCALES = Object.freeze({ en: 'en-US', zh: 'zh-CN' });

const STRINGS = {
  en: {
    'app.title': 'Weekend Tutoring',
    'lang.toggle': '中文',
    'lang.name': 'English',

    'nav.home': 'Home',
    'nav.tutors': 'Tutors',
    'nav.students': 'Students',
    'nav.pairings': 'Pairings',
    'nav.log': 'Log a session',
    'nav.sessions': 'Sessions',
    'nav.hours': 'Hours',
    'nav.data': 'Data',
    'nav.settings': 'Settings',

    'footer.local': 'All data stays in this browser. Export to keep it.',
    'footer.tests': 'Run tests',

    'home.title': 'Weekend Tutoring',
    'home.lede': 'One-on-one tutoring between US high school volunteers and students in mainland China. Everything runs in this browser — there is no server holding anyone\'s information.',
    'home.empty.title': 'Nothing loaded yet',
    'home.empty.body': 'Load the demo dataset to see how the app works, or import a program file you exported earlier.',
    'home.clocks': 'Right now',
    'home.zone.here': 'Your time',
    'home.zone.students': 'Students',
    'home.stat.tutors': 'Tutors',
    'home.stat.students': 'Students',
    'home.stat.pairings': 'Active pairings',
    'home.stat.hours': 'Hours tutored',
    'home.next': 'What to do next',

    'tutors.title': 'Tutors',
    'tutors.lede': 'US high school volunteers, their weekend availability, and what they can teach.',
    'students.title': 'Students',
    'students.lede': 'Students in mainland China. Nothing on this screen is required of a student or a guardian.',
    'pairings.title': 'Pairings',
    'pairings.lede': 'Suggested and confirmed tutor/student pairings, scored on shared time, subject, level, and language.',
    'log.title': 'Log a session',
    'log.lede': 'Under twenty seconds on a phone. Pick the pair, confirm the length, done.',
    'sessions.title': 'Sessions',
    'sessions.lede': 'Everything logged so far, newest first.',
    'hours.title': 'Hours',
    'hours.lede': 'Computed from logged sessions. Nobody enters an hour figure by hand.',
    'settings.title': 'Settings',
    'settings.lede': 'Language, time zones, and session defaults.',

    'data.title': 'Data',
    'data.lede': 'The exported JSON file is the real save. This browser keeps a copy for convenience.',
    'data.export.title': 'Export',
    'data.export.body': 'Download everything as one JSON file. Keep it somewhere you control. This file is what makes the program survive any individual leaving.',
    'data.export.action': 'Download JSON',
    'data.import.title': 'Import',
    'data.import.body': 'Replaces everything currently loaded. Older files are migrated forward automatically.',
    'data.import.drop': 'Choose a JSON file, or drop one here',
    'data.sample.title': 'Demo data',
    'data.sample.body': 'A realistic invented dataset, committed to the repository. No real names, ever.',
    'data.sample.action': 'Load sample data',
    'data.status.title': 'Currently loaded',
    'data.status.schema': 'Schema version',
    'data.status.cache': 'Browser cache',
    'data.status.exported': 'Last exported',
    'data.status.never': 'Never',
    'data.reset.title': 'Start over',
    'data.reset.body': 'Clears this browser\'s copy. Your exported files are untouched.',
    'data.reset.action': 'Clear this browser',
    'data.reset.confirm': 'Clear all data from this browser? Anything not exported is gone.',
    'data.peek': 'Preview of the export',

    'data.csv.title': 'Spreadsheets',
    'data.csv.body': 'Import a roster from a spreadsheet, or export any table as CSV. Column names match the JSON field names.',
    'data.csv.export': 'Export CSV',
    'data.csv.import': 'Import CSV',
    'data.csv.table': 'Table',
    'data.csv.importHint': 'Adds new rows and updates existing ones by id. Nothing is ever deleted by an import.',
    'data.status.pairings': 'Pairings (active)',
    'data.status.availability': 'Availability rows',
    'data.status.unpaired': 'Students waiting',
    'data.status.capacity': 'Tutors with room',

    'toast.csvImported': 'Added {added}, updated {updated}.',
    'toast.sampleLoaded': 'Sample data loaded.',
    'toast.imported': 'Imported {count} records.',
    'toast.exported': 'Saved {name}',
    'toast.cleared': 'This browser\'s copy has been cleared.',
    'toast.migrated': 'Migrated from schema {from} to {to}.',

    'placeholder.tag': 'Coming next',
    'placeholder.body': 'The shell, the router, and the data layer are in place. This screen is next.',
    'placeholder.willDo': 'What this screen will do',
    'placeholder.dataReady': 'Data already available to this screen:',

    'notfound.title': 'No such screen',
    'notfound.body': 'That link does not point anywhere in this app.',
    'notfound.action': 'Back to home',

    'action.loadSample': 'Load sample data',
    'action.goToData': 'Import a file',
    'action.viewTutors': 'See the tutors',
    'action.logSession': 'Log a session',

    'count.records': 'records',
    'integrity.warnings': '{count} thing(s) in that file look off — check the Data screen.'
  },

  zh: {
    'app.title': '周末辅导',
    'lang.toggle': 'English',
    'lang.name': '简体中文',

    'nav.home': '首页',
    'nav.tutors': '辅导员',
    'nav.students': '学生',
    'nav.pairings': '配对',
    'nav.log': '记录课程',
    'nav.sessions': '课程记录',
    'nav.hours': '志愿时长',
    'nav.data': '数据',
    'nav.settings': '设置',

    'footer.local': '所有数据都保存在此浏览器中。请导出以长期保存。',
    'footer.tests': '运行测试',

    'home.title': '周末辅导',
    'home.lede': '美国高中志愿者与中国大陆学生的一对一辅导。全部功能在浏览器中运行，没有服务器保存任何人的信息。',
    'home.empty.title': '尚未载入数据',
    'home.empty.body': '载入示例数据以了解本应用的用法，或导入此前导出的项目文件。',
    'home.clocks': '当前时间',
    'home.zone.here': '你的时间',
    'home.zone.students': '学生时间',
    'home.stat.tutors': '辅导员',
    'home.stat.students': '学生',
    'home.stat.pairings': '进行中的配对',
    'home.stat.hours': '累计辅导时长',
    'home.next': '下一步',

    'tutors.title': '辅导员',
    'tutors.lede': '美国高中志愿者、他们的周末可用时间，以及可教授的科目。',
    'students.title': '学生',
    'students.lede': '中国大陆的学生。本页面不要求学生或家长填写任何内容。',
    'pairings.title': '配对',
    'pairings.lede': '建议与已确认的辅导员／学生配对，依据共同时间、科目、水平与语言评分。',
    'log.title': '记录课程',
    'log.lede': '在手机上二十秒内完成：选择配对，确认时长，结束。',
    'sessions.title': '课程记录',
    'sessions.lede': '已记录的全部课程，最新的在前。',
    'hours.title': '志愿时长',
    'hours.lede': '由课程记录自动计算。无需任何人手动填写时长。',
    'settings.title': '设置',
    'settings.lede': '语言、时区与课程默认设置。',

    'data.title': '数据',
    'data.lede': '导出的 JSON 文件才是真正的存档。浏览器仅保留一份副本以便使用。',
    'data.export.title': '导出',
    'data.export.body': '将全部数据下载为一个 JSON 文件，保存在你自己掌握的地方。有了这个文件，即使有人离开，项目也能延续。',
    'data.export.action': '下载 JSON',
    'data.import.title': '导入',
    'data.import.body': '将替换当前载入的全部数据。较旧的文件会自动升级。',
    'data.import.drop': '选择一个 JSON 文件，或将文件拖到此处',
    'data.sample.title': '示例数据',
    'data.sample.body': '一份虚构但贴近真实的数据集，已随代码库提交。绝不包含真实姓名。',
    'data.sample.action': '载入示例数据',
    'data.status.title': '当前载入',
    'data.status.schema': '数据结构版本',
    'data.status.cache': '浏览器缓存',
    'data.status.exported': '上次导出',
    'data.status.never': '从未',
    'data.reset.title': '重新开始',
    'data.reset.body': '清除此浏览器中的副本。已导出的文件不受影响。',
    'data.reset.action': '清除此浏览器的数据',
    'data.reset.confirm': '确定清除此浏览器中的所有数据吗？未导出的内容将无法恢复。',
    'data.peek': '导出内容预览',

    'data.csv.title': '表格文件',
    'data.csv.body': '从电子表格导入名单，或将任意数据表导出为 CSV。列名与 JSON 字段名一致。',
    'data.csv.export': '导出 CSV',
    'data.csv.import': '导入 CSV',
    'data.csv.table': '数据表',
    'data.csv.importHint': '新增行并按 id 更新已有行。导入操作绝不会删除任何数据。',
    'data.status.pairings': '配对（进行中）',
    'data.status.availability': '可用时间条目',
    'data.status.unpaired': '等待配对的学生',
    'data.status.capacity': '仍有名额的辅导员',

    'toast.csvImported': '新增 {added} 条，更新 {updated} 条。',
    'toast.sampleLoaded': '示例数据已载入。',
    'toast.imported': '已导入 {count} 条记录。',
    'toast.exported': '已保存 {name}',
    'toast.cleared': '此浏览器中的副本已清除。',
    'toast.migrated': '数据结构已从版本 {from} 升级到 {to}。',

    'placeholder.tag': '即将推出',
    'placeholder.body': '应用框架、路由与数据层已就绪。此页面为下一步开发内容。',
    'placeholder.willDo': '此页面将实现',
    'placeholder.dataReady': '此页面已可使用的数据：',

    'notfound.title': '页面不存在',
    'notfound.body': '该链接在本应用中没有对应的页面。',
    'notfound.action': '返回首页',

    'action.loadSample': '载入示例数据',
    'action.goToData': '导入文件',
    'action.viewTutors': '查看辅导员',
    'action.logSession': '记录课程',

    'count.records': '条记录',
    'integrity.warnings': '该文件中有 {count} 处看起来异常，请查看「数据」页面。'
  }
};

const missingWarned = new Set();

let current = resolveInitialLang();

function resolveInitialLang() {
  const saved = loadLangPreference();
  if (LANGS.includes(saved)) return saved;

  const nav = (globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? 'en'])
    .join(',')
    .toLowerCase();
  return nav.includes('zh') ? 'zh' : 'en';
}

export function getLang() {
  return current;
}

export function getLocale() {
  return LOCALES[current];
}

export function setLang(lang) {
  if (!LANGS.includes(lang)) return current;
  current = lang;
  saveLangPreference(lang);
  // Guarded so the dictionaries can be checked outside a browser.
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';
  }
  return current;
}

export function toggleLang() {
  return setLang(current === 'en' ? 'zh' : 'en');
}

/**
 * Look up a key. `vars` fills {placeholders}.
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 */
export function t(key, vars) {
  let str = STRINGS[current]?.[key];

  if (str === undefined) {
    str = STRINGS.en[key];
    if (str === undefined) {
      if (!missingWarned.has(key)) {
        missingWarned.add(key);
        console.warn(`[i18n] no string for "${key}"`);
      }
      return key;
    }
  }

  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole
  );
}

/** Apply translations to any element carrying data-i18n. */
export function applyStaticStrings(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-label]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nLabel));
  }
}
