'use strict';

/* ============================================================
   上岸计划 · 通用备考版 —— 核心逻辑自动化测试

   跑法（不需要 npm install，零依赖）：
     node --test test/
   只看某一个文件：
     node --test test/core.test.js

   为什么这些用例值得存在：
   这些函数出错时不会抛异常，而是「数据悄悄丢失或错乱」——
   卡片复习间隔算错、两端同步把记录吃掉、任务被重复生成。
   所以每条用例都对应一个真实会出问题的场景。
   ============================================================ */

var test = require('node:test');
var assert = require('node:assert/strict');
var CORE = require('../core.js');

/* ---------------- 日期工具 ---------------- */

test('日期：addDaysStr 跨月、跨年、闰年都正确', function () {
  assert.equal(CORE.addDaysStr('2026-01-31', 1), '2026-02-01');
  assert.equal(CORE.addDaysStr('2026-12-31', 1), '2027-01-01');
  assert.equal(CORE.addDaysStr('2024-02-28', 1), '2024-02-29'); // 闰年
  assert.equal(CORE.addDaysStr('2026-02-28', 1), '2026-03-01'); // 平年
  assert.equal(CORE.addDaysStr('2026-03-01', -1), '2026-02-28');
  assert.equal(CORE.addDaysStr('2026-09-17', 0), '2026-09-17');
});

test('日期：diffDays 与 daysUntil 计算天数差', function () {
  assert.equal(CORE.diffDays('2026-09-17', '2026-09-17'), 0);
  assert.equal(CORE.diffDays('2026-09-17', '2026-09-20'), 3);
  assert.equal(CORE.diffDays('2026-09-20', '2026-09-17'), -3);
  assert.equal(CORE.diffDays('2026-12-31', '2027-01-01'), 1);
  assert.equal(CORE.daysUntil('2026-09-20', '2026-09-17'), 3);
  // 跨夏令时的月份也要稳定（round 抵消 23/25 小时误差）
  assert.equal(CORE.diffDays('2026-03-01', '2026-04-01'), 31);
});

test('日期：pad2 与 todayStr 格式固定为两位月日', function () {
  assert.equal(CORE.pad2(7), '07');
  assert.equal(CORE.pad2(12), '12');
  assert.match(CORE.todayStr(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(CORE.todayStr(new Date(2026, 0, 5)), '2026-01-05');
});

test('日期：同一天判定 sameDay', function () {
  assert.equal(CORE.sameDay('2026-09-17', '2026-09-17'), true);
  assert.equal(CORE.sameDay('2026-09-17', '2026-09-18'), false);
});

/* ---------------- SM-2 间隔重复 ---------------- */

test('SM-2：连续答对时间隔按 1 → 6 → 6×ease 增长', function () {
  var c = { id: 'c1', ease: 2.5, reps: 0, interval: 0 };
  c = CORE.srsGrade(c, 5, '2026-09-17');
  assert.equal(c.interval, 1);
  assert.equal(c.due, '2026-09-18');
  assert.equal(c.reps, 1);

  c = CORE.srsGrade(c, 5, '2026-09-18');
  assert.equal(c.interval, 6);
  assert.equal(c.due, '2026-09-24');
  assert.equal(c.reps, 2);

  var easeBefore = c.ease;
  c = CORE.srsGrade(c, 5, '2026-09-24');
  // 第三次起：间隔 = 上次间隔 × 本次评分前的难度系数，且不低于 6 天
  // （注意顺序：先用旧 ease 算间隔，再按评分调 ease，所以这里必须用 easeBefore）
  assert.equal(c.interval, Math.max(6, Math.round(6 * easeBefore)));
  assert.equal(c.reps, 3);
  assert.equal(c.due, CORE.addDaysStr('2026-09-24', c.interval));
  assert.ok(c.interval >= 6);
});

test('SM-2：答错(评分<3)重置进度、累计遗忘次数，并且当天重新到期', function () {
  var c = { id: 'c2', ease: 2.5, reps: 4, interval: 30, lapses: 0 };
  var wrong = CORE.srsGrade(c, 1, '2026-09-17');
  assert.equal(wrong.reps, 0);
  assert.equal(wrong.interval, 0);
  assert.equal(wrong.lapses, 1);
  assert.equal(wrong.due, '2026-09-17'); // 当天再来
  // 原本的卡片对象不能被改动（纯函数）
  assert.equal(c.reps, 4);
  assert.equal(c.lapses, 0);
});

test('SM-2：评分 3 算通过、评分 2 算答错（边界）', function () {
  assert.equal(CORE.srsGrade({ id: 'a', reps: 0, interval: 0 }, 3, '2026-09-17').reps, 1);
  assert.equal(CORE.srsGrade({ id: 'b', reps: 2, interval: 6 }, 2, '2026-09-17').reps, 0);
});

test('SM-2：难度系数下限 1.3，且低分让难度上升', function () {
  var easy = CORE.srsGrade({ id: 'e', ease: 2.5 }, 5, '2026-09-17');
  var hard = CORE.srsGrade({ id: 'h', ease: 2.5 }, 3, '2026-09-17');
  assert.ok(easy.ease > 2.5, '评分 5 应当变简单：' + easy.ease);
  assert.ok(hard.ease < 2.5, '评分 3 应当变难：' + hard.ease);

  var floored = { id: 'f', ease: 1.3 };
  for (var i = 0; i < 20; i++) floored = CORE.srsGrade(floored, 0, '2026-09-17');
  assert.equal(floored.ease, 1.3, '难度系数不得低于 1.3');
});

test('SM-2：缺字段的旧卡片也能安全升级', function () {
  var c = CORE.srsGrade({ id: 'old' }, 4, '2026-09-17');
  assert.equal(c.ease, 2.5);
  assert.equal(c.interval, 1);
  assert.equal(c.reps, 1);
  assert.equal(c.lapses, 0);
  assert.equal(c.lastAt, '2026-09-17');
});

test('SM-2：待复习队列只取已到期，并按到期日从早到晚排序', function () {
  var cards = [
    { id: 'A', due: '2026-09-20' },  // 未到期
    { id: 'B', due: '2026-09-15' },
    { id: 'C', due: '2026-09-17' },  // 今天到期
    { id: 'D', due: '2026-09-10' }
  ];
  assert.deepEqual(CORE.buildQueue(cards, '2026-09-17'), ['D', 'B', 'C']);
  assert.deepEqual(CORE.buildQueue([], '2026-09-17'), []);
});

/* ---------------- 多端合并 ---------------- */

test('合并：以 savedAt 较新的一端为底，同时不丢掉另一端的独有记录', function () {
  var local = {
    meta: { savedAt: 200 },
    tasks: [{ id: 'L1', title: '本地任务' }],
    cards: [{ id: 'LC', q: '本地卡片' }]
  };
  var server = {
    meta: { savedAt: 100 },
    tasks: [{ id: 'S1', title: '手机任务' }],
    cards: []
  };
  var out = CORE.mergeStates(local, server);
  var ids = out.tasks.map(function (t) { return t.id; }).sort();
  assert.deepEqual(ids, ['L1', 'S1']);
  assert.equal(out.meta.savedAt, 200);
  assert.equal(out.cards.length, 1);
});

test('合并：反向（服务器较新）时同样两边都保留', function () {
  var out = CORE.mergeStates(
    { meta: { savedAt: 1 }, tasks: [{ id: 'L', title: '本地' }] },
    { meta: { savedAt: 9 }, tasks: [{ id: 'S', title: '服务器' }] }
  );
  assert.deepEqual(out.tasks.map(function (t) { return t.id; }).sort(), ['L', 'S']);
  assert.equal(out.meta.savedAt, 9);
});

test('合并：同一份数据反复合并不会产生重复（幂等）', function () {
  var s = {
    meta: { savedAt: 5 },
    tasks: [{ id: 'T1', title: 'a' }, { id: 'T2', title: 'b' }],
    cards: [{ id: 'C1', q: 'x' }],
    notes: [{ id: 'N1', text: 'n' }]
  };
  var once = CORE.mergeStates(s, s);
  var twice = CORE.mergeStates(once, s);
  assert.equal(once.tasks.length, 2);
  assert.equal(twice.tasks.length, 2);
  assert.equal(twice.cards.length, 1);
  assert.equal(twice.notes.length, 1);
});

test('合并：同 id 冲突时保留 savedAt 较新那一端的版本', function () {
  var out = CORE.mergeStates(
    { meta: { savedAt: 2 }, tasks: [{ id: 'X', title: '旧' }] },
    { meta: { savedAt: 8 }, tasks: [{ id: 'X', title: '新' }] }
  );
  assert.equal(out.tasks.length, 1);
  assert.equal(out.tasks[0].title, '新');
});

test('合并：每日打卡按「任一为真即真」合并，单词数取大', function () {
  var merged = CORE.mergeDays(
    { '2026-09-16': { baodi: [true, false, false], words: 30, active: true } },
    { '2026-09-16': { baodi: [false, true, false], words: 45, active: false },
      '2026-09-17': { baodi: [false, false, true], words: 10, active: true } }
  );
  assert.deepEqual(merged['2026-09-16'].baodi, [true, true, false]);
  assert.equal(merged['2026-09-16'].words, 45);
  assert.equal(merged['2026-09-16'].active, true);
  assert.equal(merged['2026-09-17'].active, true);
  assert.equal(merged['2026-09-17'].words, 10);
});

test('合并：复习记录按 卡片+日期+评分+时间 去重（字段顺序不同也算同一条）', function () {
  var a = [{ cardId: 'c1', date: '2026-09-17', quality: 5, at: 111 }];
  var b = [{ at: 111, quality: 5, date: '2026-09-17', cardId: 'c1' }];
  assert.equal(CORE.unionReviews(a, b).length, 1);
  assert.equal(CORE.unionReviews(a, [{ cardId: 'c2', date: '2026-09-17', quality: 5, at: 111 }]).length, 2);
});

/* ---------------- 去重与统计 ---------------- */

test('去重：同名任务合并为一条，并优先保留已完成的那条', function () {
  var r = CORE.dedupeTasks([
    { id: '1', date: '2026-09-17', subject: '英语', title: '背单词', done: false },
    { id: '2', date: '2026-09-17', subject: '英语', title: '背单词', done: true },
    { id: '3', date: '2026-09-17', subject: '英语', title: ' 背单词 ', done: false }, // 前后空格
    { id: '4', date: '2026-09-18', subject: '英语', title: '背单词', done: false }  // 不同日期不算重复
  ]);
  assert.equal(r.tasks.length, 2);
  assert.equal(r.removed, 2);
  var kept = r.tasks.filter(function (t) { return t.date === '2026-09-17'; })[0];
  assert.equal(kept.done, true);
});

test('去重：同科目同问题的卡片只留一张', function () {
  var r = CORE.dedupeCards([
    { id: '1', subject: '计网', q: 'TCP 三次握手？' },
    { id: '2', subject: '计网', q: 'TCP 三次握手？' },
    { id: '3', subject: '英语', q: 'TCP 三次握手？' } // 科目不同，保留
  ]);
  assert.equal(r.cards.length, 2);
  assert.equal(r.removed, 1);
});

test('统计：连续打卡天数（今天没打卡从昨天算起，断档即停）', function () {
  var days = {
    '2026-09-15': { active: true },
    '2026-09-16': { active: true },
    '2026-09-17': { active: true }
  };
  assert.equal(CORE.calcStreak(days, '2026-09-17'), 3);

  // 今天还没打卡，但昨天为止是连续的 → 连续记录不该被判为 0
  assert.equal(CORE.calcStreak(days, '2026-09-18'), 3);

  // 中间断了一天，只算最近的一段
  var gapped = {
    '2026-09-10': { active: true },
    '2026-09-11': { active: true },
    '2026-09-16': { active: true },
    '2026-09-17': { active: true }
  };
  assert.equal(CORE.calcStreak(gapped, '2026-09-17'), 2);
  assert.equal(CORE.calcStreak({}, '2026-09-17'), 0);
});

test('统计：累计打卡天数与某日专注分钟数', function () {
  var days = {
    '2026-09-16': { active: true },
    '2026-09-17': { active: true },
    '2026-09-18': { active: false } // 没学习不算
  };
  assert.equal(CORE.totalActiveDays(days), 2);
  assert.equal(CORE.totalActiveDays({}), 0);

  var sessions = [
    { date: '2026-09-17', minutes: 25 },
    { date: '2026-09-17', minutes: 15 },
    { date: '2026-09-16', minutes: 50 },
    { date: '2026-09-17' } // 脏数据：没有 minutes 不应变成 NaN
  ];
  assert.equal(CORE.sumMinutes(sessions, '2026-09-17'), 40);
  assert.equal(CORE.sumMinutes(sessions, '2026-09-15'), 0);
  assert.equal(CORE.sumMinutes([], '2026-09-17'), 0);
});

/* ---------------- 计划骨架 ---------------- */

var KAOYAN = {
  phases: [{ n: '打基础', t: '约 3~4 个月', lines: ['a'] }, { n: '冲刺', t: '考前 3 周', lines: [] }],
  milestones: [{ title: '报名', off: -85 }, { title: '初试', off: 0 }]
};

test('计划：阶段生成连续编号 S1/S2', function () {
  var phases = CORE.buildPhases(KAOYAN);
  assert.equal(phases.length, 2);
  assert.equal(phases[0].id, 'S1');
  assert.equal(phases[1].id, 'S2');
  assert.equal(phases[0].name, '打基础');
  assert.deepEqual(phases[1].lines, []);
});

test('计划：关键节点日期 = 考试日 + 偏移量（负数即提前）', function () {
  var ms = CORE.buildMilestones(KAOYAN, '2027-04-15', (function () {
    var n = 0;
    return function () { return 'id-' + (++n); };
  })());
  assert.equal(ms.length, 2);
  assert.equal(ms[0].due, CORE.addDaysStr('2027-04-15', -85));
  assert.equal(ms[1].due, '2027-04-15'); // 偏移 0 就是考试当天
  assert.equal(ms[0].done, false);
  assert.equal(ms[0].cat, '节点');
  assert.equal(ms[0].id, 'id-1');
});

test('计划：模板没有阶段/节点时返回空数组而不是崩掉', function () {
  assert.deepEqual(CORE.buildPhases(null), []);
  assert.deepEqual(CORE.buildMilestones({}, '2027-04-15'), []);
});

/* ---------------- 其它 ---------------- */

test('转义：HTML 特殊字符全部转义（防止笔记标题破坏页面结构）', function () {
  assert.equal(CORE.esc('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(CORE.esc('a & b "c" \'d\''), 'a &amp; b &quot;c&quot; &#39;d&#39;');
  assert.equal(CORE.esc(null), '');
  assert.equal(CORE.esc(undefined), '');
  assert.equal(CORE.esc(0), '0');
});

test('id：批量生成不重复，支持前缀', function () {
  var seen = {}, i, id;
  for (i = 0; i < 2000; i++) {
    id = CORE.uid();
    assert.equal(seen[id], undefined, '出现了重复 id：' + id);
    seen[id] = 1;
  }
  assert.equal(CORE.uid('T').indexOf('T-'), 0);
  assert.ok(CORE.uid('T-2026').length > 10);
});

test('默认值：mergeDefaults 补齐缺失字段，已有字段不被覆盖', function () {
  var shell = { meta: { v: 1 }, settings: { subjects: ['英语'] }, tasks: [], cards: [], days: {} };
  var s = CORE.mergeDefaults({ settings: { subjects: ['英语', '数学'], wordTarget: 60 } }, shell);
  assert.deepEqual(s.settings.subjects, ['英语', '数学']);
  assert.equal(s.settings.wordTarget, 60);
  assert.deepEqual(s.tasks, []);
  assert.deepEqual(s.cards, []);
  assert.ok(s.days);
});

test('导出面：core.js 同时能在浏览器（window.SGCore）与 Node（require）使用', function () {
  assert.equal(typeof CORE.srsGrade, 'function');
  assert.equal(typeof CORE.mergeStates, 'function');
  var keys = Object.keys(CORE);
  assert.ok(keys.length >= 18, '导出的函数数量异常：' + keys.length);
});
