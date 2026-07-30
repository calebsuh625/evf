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
    'selftest.title': 'Time zone self-test',
    'selftest.lede': 'The timezone assertions, run in this browser, right now. This is the part of the app most likely to be wrong, so it is the part you can check.',
    'selftest.pass': 'All {total} checks passing',
    'selftest.fail': '{failed} of {total} checks failing',
    'selftest.ranIn': 'Ran in this browser in {ms} ms.',
    'selftest.rerun': 'Run again',
    'selftest.reran': 'Checks re-run.',
    'selftest.example': 'The case that matters most',
    'selftest.tutorSide': 'Tutor · US Pacific',
    'selftest.studentSide': 'Student · Beijing',
    'selftest.exampleNote': 'One instant ({utc}), named differently at each end.',
    'selftest.expected': 'Expected',
    'selftest.actual': 'Actual',
    'selftest.passed': 'passing',
    'selftest.failed': 'failing',
    'selftest.nFailing': '{failed} failing',
    'selftest.footnote': 'These are the same assertions the unit suite runs. For the full suite, see',
    'footer.selftest': 'Time zone self-test',
    'role.label': 'Viewing as',
    'role.admin': 'Coordinator',
    'role.tutors': 'Tutors',
    'role.needTutor.title': 'Pick a tutor first',
    'role.needTutor.body': 'These screens show one tutor\'s own teaching. Choose who you are from the picker at the top right.',
    'role.needTutor.action': 'Back to home',

    'tutor.nav.home': 'My teaching',
    'tutor.nav.hours': 'My hours',
    'tutor.nav.availability': 'My availability',

    'tutor.home.greeting': 'Hi {name}',
    'tutor.home.lede': 'Your next class, your students, and your hours.',
    'tutor.home.noStudents.title': 'No students yet',
    'tutor.home.noStudents.body': 'Once you are paired with a student they will show up here, along with your next class and everything you have covered together.',
    'tutor.home.setAvailability': 'Set my availability',

    'tutor.next.title': 'Next class',
    'tutor.next.none': 'Nothing scheduled. Set your availability and the coordinator can pair you.',
    'tutor.next.yourTime': 'Your time',
    'tutor.next.theirTime': 'Their time',
    'tutor.next.recurring': 'From your shared weekly window',
    'tutor.next.scheduled': 'Scheduled',
    'tutor.next.join': 'Open meeting link',
    'tutor.next.homework': 'Homework you set last time',
    'tutor.next.noHomework': 'No homework set last time.',
    'tutor.next.lastCovered': 'Last time you covered',
    'tutor.next.logIt': 'Log this class',

    'tutor.students.title': 'My students',
    'tutor.students.level': 'Level',
    'tutor.students.goals': 'Working on',
    'tutor.students.lastSession': 'Last session',
    'tutor.students.covered': 'Covered',
    'tutor.students.never': 'Not met yet',
    'tutor.students.sessions': '{count} sessions',
    'tutor.students.open': 'Open student page',
    'tutor.students.log': 'Log a session',

    'tutor.hours.title': 'My hours',
    'tutor.hours.lede': 'Computed from the sessions you logged. Nothing here is typed in by hand.',
    'tutor.hours.thisTerm': 'This term',
    'tutor.hours.allTime': 'All time',
    'tutor.hours.teaching': 'Teaching',
    'tutor.hours.prep': 'Prep',
    'tutor.hours.followup': 'Follow-up',
    'tutor.hours.total': 'Total',
    'tutor.hours.hoursShort': 'h',
    'tutor.hours.sessions': 'Sessions',
    'tutor.hours.students': 'Students',
    'tutor.hours.range': 'First to last session',
    'tutor.hours.tableTitle': 'Every session',
    'tutor.hours.date': 'Date',
    'tutor.hours.student': 'Student',
    'tutor.hours.duration': 'Teaching',
    'tutor.hours.empty': 'No logged sessions yet. Once you log one it will appear here and count towards your hours.',
    'tutor.hours.export.title': 'Export for verification',
    'tutor.hours.export.body': 'A signed record of volunteer hours, formatted for NHS, the Congressional Award, and the President\'s Volunteer Service Award. Print it or save it as a PDF.',
    'tutor.hours.export.print': 'Print / save as PDF',
    'tutor.hours.export.csv': 'Download CSV',
    'tutor.hours.export.term': 'Period',
    'tutor.hours.export.allTime': 'All time',

    'tutor.cert.title': 'Volunteer Service Record',
    'tutor.cert.volunteer': 'Volunteer',
    'tutor.cert.organisation': 'Organisation',
    'tutor.cert.activity': 'Activity',
    'tutor.cert.activityBody': 'One-to-one online academic tutoring for students in mainland China. Sessions are held at weekends over video call.',
    'tutor.cert.period': 'Period',
    'tutor.cert.school': 'School',
    'tutor.cert.generated': 'Generated',
    'tutor.cert.summary': 'Summary of hours',
    'tutor.cert.detail': 'Session detail',
    'tutor.cert.verify': 'Verification',
    'tutor.cert.verifyBody': 'I confirm that the volunteer named above completed the hours recorded in this document.',
    'tutor.cert.supervisor': 'Supervisor name',
    'tutor.cert.signature': 'Signature',
    'tutor.cert.date': 'Date',
    'tutor.cert.note': 'Hours are derived from session records logged by the volunteer at the time of each session.',

    'tutor.log.title': 'Log a session',
    'tutor.log.with': 'with {name}',
    'tutor.log.happened': 'Did it happen?',
    'tutor.log.yes': 'Yes',
    'tutor.log.no': 'No',
    'tutor.log.duration': 'How long?',
    'tutor.log.prep': 'Prep',
    'tutor.log.followup': 'Follow-up',
    'tutor.log.covered': 'What did you cover?',
    'tutor.log.coveredHint': 'One line is plenty. This is what you will read before the next class.',
    'tutor.log.homework': 'Homework set',
    'tutor.log.optional': 'optional',
    'tutor.log.save': 'Save',
    'tutor.log.saved': 'Saved. Thank you.',
    'tutor.log.cancel': 'Cancel',
    'tutor.log.total': 'Total {total}',
    'tutor.log.capped': 'Capped at 2 hours per session.',
    'tutor.log.minutes': '{n} min',
    'tutor.log.none': 'None',
    'tutor.log.noNeedForDetail': 'Nothing else to fill in. Sessions that did not happen count for nothing and against nobody.',

    'tutor.nudge.title': 'Not logged yet',
    'tutor.nudge.body': 'These classes have been and gone. Log them whenever suits you.',
    'tutor.nudge.log': 'Log',

    'tutor.student.title': 'Student',
    'tutor.student.about': 'About',
    'tutor.student.level': 'English level',
    'tutor.student.goals': 'Goals',
    'tutor.student.interests': 'Interests',
    'tutor.student.grade': 'Grade',
    'tutor.student.timezone': 'Time zone',
    'tutor.student.pairedSince': 'Paired since',
    'tutor.student.handover': 'Picking up from here',
    'tutor.student.handoverBody': 'Written so somebody new can read this page and know where to start.',
    'tutor.student.history': 'Session history',
    'tutor.student.covered': 'Covered',
    'tutor.student.homework': 'Homework',
    'tutor.student.didNotHappen': 'Did not happen',
    'tutor.student.noHistory': 'No sessions logged yet.',
    'tutor.student.notYours': 'That student is not one of yours.',
    'tutor.student.totals': '{sessions} sessions · {hours}h together',

    'tutor.avail.title': 'My availability',
    'tutor.avail.lede': 'Only used when you are looking for a new student. It is not a commitment to be free every week.',
    'tutor.avail.accepting': 'Open to a new student',
    'tutor.avail.acceptingOn': 'You are open to being paired with a new student.',
    'tutor.avail.acceptingOff': 'You are not taking new students right now. Nothing else changes, and your current students are unaffected.',
    'tutor.avail.windows': 'Weekend windows',
    'tutor.avail.windowsBody': 'Your local time, with what that is for a student in China.',
    'tutor.avail.add': 'Add a window',
    'tutor.avail.remove': 'Remove',
    'tutor.avail.day': 'Day',
    'tutor.avail.from': 'From',
    'tutor.avail.to': 'To',
    'tutor.avail.theirs': 'In China',
    'tutor.avail.none': 'No windows set. Add one and the coordinator can pair you with a student who fits.',
    'tutor.avail.save': 'Save availability',
    'tutor.avail.saved': 'Availability saved.',
    'tutor.avail.overnight': 'crosses midnight',

    'weekday.0': 'Sunday',
    'weekday.1': 'Monday',
    'weekday.2': 'Tuesday',
    'weekday.3': 'Wednesday',
    'weekday.4': 'Thursday',
    'weekday.5': 'Friday',
    'weekday.6': 'Saturday',
    'role.students': 'Students',
    'role.guardians': 'Guardians',
    'role.guardianOf': 'Guardian of {name}',
    'role.needStudent.title': 'Pick a student first',
    'role.needStudent.body': 'This screen shows one student\'s own classes. Choose who you are from the picker at the top right.',

    'st.nav.home': 'My classes',
    'st.title': 'My classes',
    'st.greeting': 'Hi {name}',
    'st.tutor.title': 'My tutor',
    'st.tutor.teaches': 'Teaches',
    'st.tutor.contact': 'Contact',
    'st.tutor.none': 'You have not been paired with a tutor yet. Your coordinator is working on it.',
    'st.next.title': 'Next class',
    'st.next.none': 'No class scheduled yet.',
    'st.next.join': 'Join the class',
    'st.next.yourTime': 'Your time',
    'st.next.tutorTime': 'Your tutor\'s time',
    'st.homework.title': 'Homework',
    'st.homework.none': 'Nothing set right now.',
    'st.homework.from': 'Set on {date}',
    'st.history.title': 'Past classes',
    'st.history.covered': 'What you did',
    'st.history.homework': 'Homework',
    'st.history.none': 'No classes yet.',
    'st.history.didNotHappen': 'This class did not happen',
    'st.nothingRequired': 'There is nothing you need to fill in here.',

    'gd.nav.home': 'My child\'s classes',
    'gd.contact.title': 'Guardian contact details',
    'gd.contact.body': 'Optional. Leave anything blank and it stays blank — the program will still work exactly the same.',
    'gd.contact.name': 'Your name',
    'gd.contact.wechat': 'WeChat',
    'gd.contact.email': 'Email',
    'gd.contact.save': 'Save',
    'gd.contact.saved': 'Saved.',
    'gd.contact.onlyYou': 'Only you can edit these.',
    'gd.contact.viewOnly': 'Guardian contact details can only be changed from the guardian view.',

    'match.nav': 'Matching',
    'match.title': 'Matching',
    'match.lede': 'Suggestions only. Nothing is paired until you accept it.',
    'match.waiting.title': 'Students waiting',
    'match.waiting.none': 'Every active student has a tutor.',
    'match.blocked.title': 'Nobody can take these students yet',
    'match.blocked.body': 'Each one says what would have to change.',
    'match.idle.title': 'Volunteers with room and nobody to take',
    'match.idle.body': 'These tutors are free and willing. Worth recruiting a student who fits.',
    'match.stale.title': 'Pairings that no longer share any time',
    'match.stale.body': 'These are active but their availability has drifted apart. Nobody will mention it, so this is the only place it shows up.',
    'match.stale.noOverlap': 'No shared time',
    'match.stale.missing': 'One of them has not set any availability',
    'match.candidate': 'Suggestion {n}',
    'match.why': 'Why',
    'match.watch': 'Worth knowing',
    'match.score': 'Fit',
    'match.accept': 'Pair them',
    'match.accepted': 'Paired {student} with {tutor}.',
    'match.slotsOpen': '{remaining} of {total} places open',
    'match.noCandidates': 'No suitable tutor',
    'match.nearest': 'Closest so far',
    'match.blockedBy': 'Blocked by',
    'match.counts': '{waiting} waiting · {matchable} matchable · {blocked} blocked',

    'match.part.morning': 'morning',
    'match.part.afternoon': 'afternoon',
    'match.part.evening': 'evening',

    'match.reason.overlap': '{hours} shared hours, {weekday} {part} Beijing time ({startTime}–{endTime})',
    'match.reason.goals': 'Both listed {list}',
    'match.reason.level': 'Tutor is comfortable at {level} level',
    'match.reason.interests': 'Both interested in {list}',
    'match.reason.capacity': 'Tutor has {remaining} of {total} places open',

    'match.weak.single-window': 'Only one shared window — fragile if either has to cancel',
    'match.weak.short-overlap': 'Only {minutes} minutes shared, so there is little room to move',
    'match.weak.goals-partial': 'Does not cover {list}',
    'match.weak.level-unstated': 'Level fit is unconfirmed — nobody has said which levels they take',
    'match.weak.no-shared-interests': 'No interests in common',
    'match.weak.no-shared-language': 'No shared language, and the student is a beginner',
    'match.weak.tutor-last-slot': 'This is the tutor\'s last place',

    'match.blocker.no-shared-time': 'No shared time',
    'match.blocker.no-shared-goal': 'Does not teach what the student asked for',
    'match.blocker.level-outside-comfort': 'Level outside what the tutor takes',
    'match.blocker.tutor-at-capacity': 'Tutor is full',
    'match.blocker.tutor-not-accepting': 'Tutor is not taking new students',
    'match.blocker.tutor-inactive': 'Tutor is on a break',
    'match.blocker.student-inactive': 'Student is inactive',

    'match.fix.no-tutors': 'There are no tutors on the roster yet.',
    'match.fix.matchable': 'This student is matchable.',
    'match.fix.one-tutor-full': 'One tutor fits this student well but has no places left. This needs another tutor with the same subject and hours, not more asking.',
    'match.fix.all-tutors-full': 'Every suitable tutor is at the maximum they set for themselves. This needs another tutor.',
    'match.fix.no-shared-time': 'Nobody shares a weekend window with this student. Ask them for one more slot, or recruit a tutor further west.',
    'match.fix.no-shared-goal': 'No available tutor covers what this student asked for. Recruit for that subject, or ask the student what else would help.',
    'match.fix.level-outside-comfort': 'No available tutor has said they take this English level. Worth asking whether someone would try it.',
    'match.fix.tutor-not-accepting': 'The tutors who fit are not taking new students right now.',
    'match.fix.tutor-inactive': 'The tutors who fit are on a break.',
    'match.fix.student-inactive': 'This student is marked inactive.',
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
    'selftest.title': '时区自检',
    'selftest.lede': '时区相关的断言，现在就在此浏览器中运行。这是本应用最容易出错的部分，因此也是你可以亲自核对的部分。',
    'selftest.pass': '全部 {total} 项检查通过',
    'selftest.fail': '{total} 项检查中有 {failed} 项未通过',
    'selftest.ranIn': '在此浏览器中运行耗时 {ms} 毫秒。',
    'selftest.rerun': '重新运行',
    'selftest.reran': '已重新运行检查。',
    'selftest.example': '最关键的例子',
    'selftest.tutorSide': '辅导员 · 美国太平洋时间',
    'selftest.studentSide': '学生 · 北京时间',
    'selftest.exampleNote': '同一时刻（{utc}），两端的称法不同。',
    'selftest.expected': '预期',
    'selftest.actual': '实际',
    'selftest.passed': '通过',
    'selftest.failed': '未通过',
    'selftest.nFailing': '{failed} 项未通过',
    'selftest.footnote': '这些断言与单元测试完全相同。完整测试请见',
    'footer.selftest': '时区自检',
    'role.label': '当前身份',
    'role.admin': '协调员',
    'role.tutors': '辅导员',
    'role.needTutor.title': '请先选择一位辅导员',
    'role.needTutor.body': '这些页面展示的是某一位辅导员自己的辅导情况。请在右上角选择你的身份。',
    'role.needTutor.action': '返回首页',

    'tutor.nav.home': '我的辅导',
    'tutor.nav.hours': '我的时长',
    'tutor.nav.availability': '我的可用时间',

    'tutor.home.greeting': '你好，{name}',
    'tutor.home.lede': '你的下一节课、你的学生，以及你的志愿时长。',
    'tutor.home.noStudents.title': '暂时还没有学生',
    'tutor.home.noStudents.body': '配对成功后，学生会显示在这里，同时还会显示你的下一节课以及你们一起学过的内容。',
    'tutor.home.setAvailability': '设置我的可用时间',

    'tutor.next.title': '下一节课',
    'tutor.next.none': '暂无安排。设置可用时间后，协调员就可以为你配对。',
    'tutor.next.yourTime': '你的时间',
    'tutor.next.theirTime': '对方时间',
    'tutor.next.recurring': '来自你们每周的共同时间段',
    'tutor.next.scheduled': '已安排',
    'tutor.next.join': '打开上课链接',
    'tutor.next.homework': '你上次布置的作业',
    'tutor.next.noHomework': '上次没有布置作业。',
    'tutor.next.lastCovered': '上次学习的内容',
    'tutor.next.logIt': '记录这节课',

    'tutor.students.title': '我的学生',
    'tutor.students.level': '水平',
    'tutor.students.goals': '正在学习',
    'tutor.students.lastSession': '最近一次课',
    'tutor.students.covered': '学习内容',
    'tutor.students.never': '尚未开始',
    'tutor.students.sessions': '{count} 次课',
    'tutor.students.open': '打开学生页面',
    'tutor.students.log': '记录课程',

    'tutor.hours.title': '我的时长',
    'tutor.hours.lede': '根据你记录的课程自动计算。这里没有任何需要手动填写的数字。',
    'tutor.hours.thisTerm': '本学期',
    'tutor.hours.allTime': '累计',
    'tutor.hours.teaching': '授课',
    'tutor.hours.prep': '备课',
    'tutor.hours.followup': '课后',
    'tutor.hours.total': '合计',
    'tutor.hours.hoursShort': '小时',
    'tutor.hours.sessions': '课程次数',
    'tutor.hours.students': '学生人数',
    'tutor.hours.range': '首次至最近一次',
    'tutor.hours.tableTitle': '全部课程',
    'tutor.hours.date': '日期',
    'tutor.hours.student': '学生',
    'tutor.hours.duration': '授课',
    'tutor.hours.empty': '尚未记录任何课程。记录之后就会显示在这里，并计入你的时长。',
    'tutor.hours.export.title': '导出用于时长认证',
    'tutor.hours.export.body': '一份可供签字的志愿时长记录，格式适用于 NHS、Congressional Award 与 President\'s Volunteer Service Award。可直接打印或另存为 PDF。',
    'tutor.hours.export.print': '打印／另存为 PDF',
    'tutor.hours.export.csv': '下载 CSV',
    'tutor.hours.export.term': '统计范围',
    'tutor.hours.export.allTime': '全部时间',

    'tutor.cert.title': '志愿服务时长记录',
    'tutor.cert.volunteer': '志愿者',
    'tutor.cert.organisation': '组织',
    'tutor.cert.activity': '服务内容',
    'tutor.cert.activityBody': '为中国大陆学生提供一对一线上学业辅导。课程在周末通过视频通话进行。',
    'tutor.cert.period': '统计期间',
    'tutor.cert.school': '学校',
    'tutor.cert.generated': '生成时间',
    'tutor.cert.summary': '时长汇总',
    'tutor.cert.detail': '课程明细',
    'tutor.cert.verify': '核实签字',
    'tutor.cert.verifyBody': '本人确认上述志愿者完成了本文件中记录的服务时长。',
    'tutor.cert.supervisor': '负责人姓名',
    'tutor.cert.signature': '签字',
    'tutor.cert.date': '日期',
    'tutor.cert.note': '时长由志愿者在每次课程当时记录的课程数据自动计算得出。',

    'tutor.log.title': '记录课程',
    'tutor.log.with': '与 {name}',
    'tutor.log.happened': '这节课上了吗？',
    'tutor.log.yes': '上了',
    'tutor.log.no': '没上',
    'tutor.log.duration': '上了多久？',
    'tutor.log.prep': '备课',
    'tutor.log.followup': '课后',
    'tutor.log.covered': '这节课学了什么？',
    'tutor.log.coveredHint': '一行就够。下次上课前你会先看到这句话。',
    'tutor.log.homework': '布置的作业',
    'tutor.log.optional': '选填',
    'tutor.log.save': '保存',
    'tutor.log.saved': '已保存，谢谢你。',
    'tutor.log.cancel': '取消',
    'tutor.log.total': '合计 {total}',
    'tutor.log.capped': '每节课最多计 2 小时。',
    'tutor.log.minutes': '{n} 分钟',
    'tutor.log.none': '无',
    'tutor.log.noNeedForDetail': '不需要再填写其他内容。没上成的课不计入任何时长，也不会记在任何人头上。',

    'tutor.nudge.title': '还没有记录',
    'tutor.nudge.body': '这些课已经过去了。方便的时候记录一下就好。',
    'tutor.nudge.log': '记录',

    'tutor.student.title': '学生',
    'tutor.student.about': '基本情况',
    'tutor.student.level': '英语水平',
    'tutor.student.goals': '学习目标',
    'tutor.student.interests': '兴趣爱好',
    'tutor.student.grade': '年级',
    'tutor.student.timezone': '时区',
    'tutor.student.pairedSince': '配对开始于',
    'tutor.student.handover': '从这里接手',
    'tutor.student.handoverBody': '本页的写法是为了让新接手的人读完就知道该从哪里继续。',
    'tutor.student.history': '课程记录',
    'tutor.student.covered': '学习内容',
    'tutor.student.homework': '作业',
    'tutor.student.didNotHappen': '未进行',
    'tutor.student.noHistory': '尚未记录任何课程。',
    'tutor.student.notYours': '这不是你的学生。',
    'tutor.student.totals': '共 {sessions} 次课 · {hours} 小时',

    'tutor.avail.title': '我的可用时间',
    'tutor.avail.lede': '仅在你希望接收新学生时使用。这不是每周都必须有空的承诺。',
    'tutor.avail.accepting': '愿意接收新学生',
    'tutor.avail.acceptingOn': '你目前愿意与新学生配对。',
    'tutor.avail.acceptingOff': '你目前不接收新学生。其他一切不变，现有学生不受影响。',
    'tutor.avail.windows': '周末时间段',
    'tutor.avail.windowsBody': '按你的当地时间填写，同时显示中国学生一侧对应的时间。',
    'tutor.avail.add': '添加时间段',
    'tutor.avail.remove': '删除',
    'tutor.avail.day': '星期',
    'tutor.avail.from': '从',
    'tutor.avail.to': '到',
    'tutor.avail.theirs': '中国时间',
    'tutor.avail.none': '尚未设置时间段。添加之后，协调员就能为你配对合适的学生。',
    'tutor.avail.save': '保存可用时间',
    'tutor.avail.saved': '可用时间已保存。',
    'tutor.avail.overnight': '跨越午夜',

    'weekday.0': '星期日',
    'weekday.1': '星期一',
    'weekday.2': '星期二',
    'weekday.3': '星期三',
    'weekday.4': '星期四',
    'weekday.5': '星期五',
    'weekday.6': '星期六',
    'role.students': '学生',
    'role.guardians': '家长',
    'role.guardianOf': '{name} 的家长',
    'role.needStudent.title': '请先选择一位学生',
    'role.needStudent.body': '本页面展示某一位学生自己的课程。请在右上角选择你的身份。',

    'st.nav.home': '我的课程',
    'st.title': '我的课程',
    'st.greeting': '你好，{name}',
    'st.tutor.title': '我的辅导员',
    'st.tutor.teaches': '教授科目',
    'st.tutor.contact': '联系方式',
    'st.tutor.none': '还没有为你配对辅导员。协调员正在安排。',
    'st.next.title': '下一节课',
    'st.next.none': '尚未安排课程。',
    'st.next.join': '进入课堂',
    'st.next.yourTime': '你的时间',
    'st.next.tutorTime': '辅导员的时间',
    'st.homework.title': '作业',
    'st.homework.none': '目前没有作业。',
    'st.homework.from': '{date} 布置',
    'st.history.title': '往期课程',
    'st.history.covered': '学习内容',
    'st.history.homework': '作业',
    'st.history.none': '还没有上过课。',
    'st.history.didNotHappen': '这节课没有进行',
    'st.nothingRequired': '本页面无需你填写任何内容。',

    'gd.nav.home': '孩子的课程',
    'gd.contact.title': '家长联系方式',
    'gd.contact.body': '均为选填。留空即可，项目运作完全不受影响。',
    'gd.contact.name': '你的姓名',
    'gd.contact.wechat': '微信',
    'gd.contact.email': '电子邮箱',
    'gd.contact.save': '保存',
    'gd.contact.saved': '已保存。',
    'gd.contact.onlyYou': '只有你可以修改这些内容。',
    'gd.contact.viewOnly': '家长联系方式只能在家长视图中修改。',

    'match.nav': '配对',
    'match.title': '配对',
    'match.lede': '这些只是建议。在你确认之前，不会建立任何配对。',
    'match.waiting.title': '等待配对的学生',
    'match.waiting.none': '所有在读学生都已有辅导员。',
    'match.blocked.title': '暂时无人可以接收这些学生',
    'match.blocked.body': '每一位都会说明需要改变什么。',
    'match.idle.title': '有名额但无合适学生的志愿者',
    'match.idle.body': '这些辅导员有时间也愿意接收。值得为他们招募合适的学生。',
    'match.stale.title': '已无共同时间的配对',
    'match.stale.body': '这些配对仍在进行，但双方的可用时间已经错开。没有人会主动提起，因此这里是唯一能发现的地方。',
    'match.stale.noOverlap': '没有共同时间',
    'match.stale.missing': '其中一方尚未填写可用时间',
    'match.candidate': '建议 {n}',
    'match.why': '推荐理由',
    'match.watch': '需要留意',
    'match.score': '匹配度',
    'match.accept': '建立配对',
    'match.accepted': '已将 {student} 与 {tutor} 配对。',
    'match.slotsOpen': '{total} 个名额中还有 {remaining} 个',
    'match.noCandidates': '暂无合适的辅导员',
    'match.nearest': '目前最接近的',
    'match.blockedBy': '受阻于',
    'match.counts': '{waiting} 人等待 · {matchable} 人可配对 · {blocked} 人受阻',

    'match.part.morning': '上午',
    'match.part.afternoon': '下午',
    'match.part.evening': '晚上',

    'match.reason.overlap': '共有 {hours} 小时重叠时间，北京时间{weekday}{part}（{startTime}–{endTime}）',
    'match.reason.goals': '双方都填写了{list}',
    'match.reason.level': '辅导员可以教{level}水平',
    'match.reason.interests': '双方都对{list}感兴趣',
    'match.reason.capacity': '辅导员 {total} 个名额中还有 {remaining} 个',

    'match.weak.single-window': '只有一个共同时间段——任何一方有事就很难调整',
    'match.weak.short-overlap': '共同时间只有 {minutes} 分钟，几乎没有调整空间',
    'match.weak.goals-partial': '无法覆盖{list}',
    'match.weak.level-unstated': '水平是否合适尚未确认——没有人填写可教的水平范围',
    'match.weak.no-shared-interests': '没有共同的兴趣爱好',
    'match.weak.no-shared-language': '没有共同语言，而学生是初学者',
    'match.weak.tutor-last-slot': '这是该辅导员的最后一个名额',

    'match.blocker.no-shared-time': '没有共同时间',
    'match.blocker.no-shared-goal': '不教该学生想学的科目',
    'match.blocker.level-outside-comfort': '水平超出该辅导员可教范围',
    'match.blocker.tutor-at-capacity': '辅导员名额已满',
    'match.blocker.tutor-not-accepting': '辅导员目前不接收新学生',
    'match.blocker.tutor-inactive': '辅导员正在休息',
    'match.blocker.student-inactive': '该学生未在读',

    'match.fix.no-tutors': '名单中还没有辅导员。',
    'match.fix.matchable': '这位学生可以配对。',
    'match.fix.one-tutor-full': '有一位辅导员非常合适，但已没有名额。这需要再招一位同科目、同时段的辅导员，而不是继续询问。',
    'match.fix.all-tutors-full': '所有合适的辅导员都已达到自己设定的上限。这需要再招一位辅导员。',
    'match.fix.no-shared-time': '没有人与这位学生有共同的周末时段。可以请学生再填一个时段，或招募更靠西部时区的辅导员。',
    'match.fix.no-shared-goal': '没有可用的辅导员教这位学生想学的科目。可以针对该科目招募，或问问学生还有什么需要。',
    'match.fix.level-outside-comfort': '没有可用的辅导员填写可教这一英语水平。值得问问是否有人愿意尝试。',
    'match.fix.tutor-not-accepting': '合适的辅导员目前不接收新学生。',
    'match.fix.tutor-inactive': '合适的辅导员正在休息。',
    'match.fix.student-inactive': '该学生已标记为未在读。',
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

let current = storedLang() ?? browserLang();

/** The language this browser has explicitly chosen, or null. */
export function storedLang() {
  const saved = loadLangPreference();
  return LANGS.includes(saved) ? saved : null;
}

/** True once somebody has actually used the toggle. */
export function hasExplicitLang() {
  return storedLang() !== null;
}

function browserLang() {
  const nav = (globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? 'en'])
    .join(',')
    .toLowerCase();
  return nav.includes('zh') ? 'zh' : 'en';
}

/**
 * The language a role should start in.
 *
 * Students and guardians get Chinese by default: they are the people least
 * likely to read English, and asking a family to hunt for a toggle before
 * they can read their own child's homework is the opposite of being served.
 * An explicit choice always wins over this.
 */
export function defaultLangFor(role) {
  return role === 'student' || role === 'guardian' ? 'zh' : browserLang();
}

export function getLang() {
  return current;
}

export function getLocale() {
  return LOCALES[current];
}

/** Switch language for this render. Does not persist — see chooseLang. */
export function setLang(lang) {
  if (!LANGS.includes(lang)) return current;
  current = lang;
  // Guarded so the dictionaries can be checked outside a browser.
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';
  }
  return current;
}

/** Switch language and remember it, overriding any role default from here on. */
export function chooseLang(lang) {
  if (!LANGS.includes(lang)) return current;
  saveLangPreference(lang);
  return setLang(lang);
}

export function toggleLang() {
  return chooseLang(current === 'en' ? 'zh' : 'en');
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

/**
 * Every key defined for a language.
 *
 * Exists so the test suite can compare the two dictionaries directly rather
 * than against a hand-kept list — a list is the thing that drifts, and a key
 * missing from Chinese is exactly the failure principle 6 is about.
 */
export function allKeys(lang) {
  return Object.keys(STRINGS[lang] ?? {}).sort();
}

/** The raw string for a key in a specific language, without fallback. */
export function rawString(lang, key) {
  return STRINGS[lang]?.[key];
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
