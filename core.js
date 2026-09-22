'use strict';

/* ============================================================
   上岸计划 · 通用备考版 —— 核心纯逻辑层（core.js）

   为什么单独抽这一层：
   1. 这里全都是「输入 → 输出」的纯函数，不碰 DOM、不碰 localStorage、
      不碰任何全局状态，所以在浏览器里能跑，在 Node 测试里也能跑；
   2. SM-2 间隔重复、多端合并、去重、连续打卡这些算法一旦出错，
      表现是「数据悄悄丢失」而不报错，必须靠自动化测试守住；
   3. 同一个文件两种用法，不需要打包工具：
      - 浏览器：<script src="core.js"></script> → window.SGCore
      - Node  ：require('./core.js')          → module.exports

   注意：文件的唯一事实来源是这里。app.js 只负责界面与状态，
   算法一律调用 SGCore，避免「两份实现慢慢跑偏」。
   ============================================================ */

(function (root) {
  var C = {};

  /* ---------------- 日期（一律用 'YYYY-MM-DD' 字符串，避开时区坑） ---------------- */

  C.pad2 = function (n) { return n < 10 ? '0' + n : '' + n; };

  C.todayStr = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + C.pad2(d.getMonth() + 1) + '-' + C.pad2(d.getDate());
  };

  /* 按本地时区解析，不用 new Date('2026-09-17')（那个按 UTC 解析，会差一天） */
  C.parseDate = function (s) {
    var p = String(s || '').split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  };

  C.addDaysStr = function (s, n) {
    var d = C.parseDate(s);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + C.pad2(d.getMonth() + 1) + '-' + C.pad2(d.getDate());
  };

  /* 用 Math.round 抵消夏令时造成的 23/25 小时误差 */
  C.diffDays = function (a, b) {
    return Math.round((C.parseDate(b) - C.parseDate(a)) / 86400000);
  };

  C.daysUntil = function (s, today) { return C.diffDays(today || C.todayStr(), s); };

  /* ---------------- 数据清理 ---------------- */

  C.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* 生成唯一 id：时间戳(36 进制) + 6 位随机。前缀可选，方便测试与排查 */
  C.uid = function (prefix) {
    var rnd = Math.random().toString(36).slice(2, 8);
    return (prefix ? prefix + '-' : '') + Date.now().toString(36) + rnd;
  };

  C.mergeDefaults = function (s, d) {
    s = s || {};
    var i, k;
    for (k in d) { if (s[k] === undefined) s[k] = d[k]; }
    for (i = 0; i < arguments.length; i++) {
      (function (src) {
        for (var kk in src) { if (s[kk] === undefined) s[kk] = src[kk]; }
      })(arguments[i]);
    }
    return s;
  };

  /* 同名任务按「日期|科目|标题」去重，保留已完成的那条；卡片按「科目|问题」去重 */
  C.dedupeTasks = function (tasks) {
    var map = {}, out = [], removed = 0, k, title;
    (tasks || []).forEach(function (t) {
      if (!t) return;
      title = String(t.title == null ? '' : t.title).trim();
      k = (t.date || '') + '|' + (t.subject || '') + '|' + title;
      if (!map[k]) map[k] = t;
      else { if (t.done && !map[k].done) map[k] = t; removed++; }
    });
    for (k in map) out.push(map[k]);
    return { tasks: out, removed: removed };
  };

  C.dedupeCards = function (cards) {
    var seen = {}, out = [], removed = 0;
    (cards || []).forEach(function (c) {
      if (!c) return;
      var key = (c.subject || '') + '|' + String(c.q == null ? '' : c.q).trim();
      if (seen[key]) { removed++; return; }
      seen[key] = 1;
      out.push(c);
    });
    return { cards: out, removed: removed };
  };

  /* ---------------- 学习统计 ---------------- */

  /* 连续打卡天数：今天没打卡就从昨天起算，不让连续记录白白断掉 */
  C.calcStreak = function (days, today) {
    today = today || C.todayStr();
    days = days || {};
    var streak = 0;
    var d = (days[today] && days[today].active) ? today : C.addDaysStr(today, -1);
    while (days[d] && days[d].active) { streak++; d = C.addDaysStr(d, -1); }
    return streak;
  };

  C.totalActiveDays = function (days) {
    days = days || {};
    return Object.keys(days).filter(function (k) { return days[k] && days[k].active; }).length;
  };

  C.sumMinutes = function (sessions, date) {
    return (sessions || []).filter(function (s) { return s && s.date === date; })
      .reduce(function (a, s) { return a + (+s.minutes || 0); }, 0);
  };

  /* ---------------- SM-2 间隔重复 ---------------- */

  /* 评分为 0~5：<3 视为答错（重新排队、难度上升）；>=3 视为通过。
     纯函数：返回新卡片对象，不改传入的 card，也不读系统时间（now 可注入）。 */
  C.srsGrade = function (card, q, now) {
    now = now || C.todayStr();
    var c = {};
    for (var k in card) c[k] = card[k];
    q = Math.max(0, Math.min(5, +q || 0));
    c.ease = +c.ease || 2.5;
    c.reps = +c.reps || 0;
    c.interval = +c.interval || 0;
    c.lapses = +c.lapses || 0;

    if (q < 3) {
      c.reps = 0; c.interval = 0; c.lapses = c.lapses + 1; c.due = now;
    } else {
      if (c.reps === 0) c.interval = 1;
      else if (c.reps === 1) c.interval = 6;
      else c.interval = Math.max(6, Math.round(c.interval * c.ease));
      c.reps = c.reps + 1;
      c.due = C.addDaysStr(now, c.interval);
    }
    var delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
    c.ease = Math.max(1.3, +(c.ease + delta).toFixed(2));
    c.lastAt = now;
    return c;
  };

  /* 待复习队列：到今天为止到期的卡片，按到期日从早到晚 */
  C.buildQueue = function (cards, today) {
    today = today || C.todayStr();
    return (cards || [])
      .filter(function (c) { return c && c.due && c.due <= today; })
      .sort(function (a, b) { return a.due < b.due ? -1 : (a.due > b.due ? 1 : 0); })
      .map(function (c) { return c.id; });
  };

  /* ---------------- 多端合并（电脑 ↔ 手机局域网同步） ---------------- */

  var MERGE_LISTS = ['tasks', 'cards', 'notes', 'errors', 'goals', 'checklist', 'milestones', 'materials', 'sessions'];

  /* 按 id 求并集：prefer 里的同 id 条目优先，other 只补 prefer 没有的 */
  C.unionById = function (prefer, other) {
    var map = {}, out = [], k;
    (prefer || []).forEach(function (x) { if (x && x.id) map[x.id] = x; });
    (other || []).forEach(function (x) { if (x && x.id && !map[x.id]) map[x.id] = x; });
    for (k in map) out.push(map[k]);
    return out;
  };

  /* 评论记录去重：不用 JSON.stringify 全量比对，避免字段顺序不同导致漏判 */
  C.reviewKey = function (r) {
    if (!r) return '';
    return [r.cardId || '', r.date || '', r.quality == null ? '' : r.quality, r.at || 0].join('|');
  };
  C.unionReviews = function (a, b) {
    var seen = {}, out = [];
    (a || []).concat(b || []).forEach(function (r) {
      var k = C.reviewKey(r);
      if (seen[k]) return;
      seen[k] = 1;
      out.push(r);
    });
    return out;
  };

  /* 每日记录合并：保底项任一为真即真，单词数取大，任一端活跃即活跃 */
  C.mergeDays = function (a, b) {
    var out = JSON.parse(JSON.stringify(a || {}));
    var d, i, len, x, y, ba, bb;
    for (d in (b || {})) {
      if (!out[d]) { out[d] = JSON.parse(JSON.stringify(b[d])); continue; }
      x = out[d]; y = b[d];
      ba = (x.baodi || []).slice();
      bb = y.baodi || [];
      len = Math.max(ba.length, bb.length, 3);
      for (i = 0; i < len; i++) {
        if (ba[i] === undefined) ba[i] = false;
        if (bb[i]) ba[i] = true;
      }
      x.baodi = ba;
      x.words = Math.max(x.words || 0, y.words || 0);
      x.active = !!(x.active || y.active);
    }
    return out;
  };

  /* 整库合并：以 savedAt 较新的一端为底，再并上另一端的增量。
     规则刻意的保守——合并只增不减，避免「一端删掉、另一端又同步回来」。 */
  C.mergeStates = function (local, server) {
    var l = local || {}, r = server || {};
    var lTs = (l.meta && l.meta.savedAt) || 0;
    var rTs = (r.meta && r.meta.savedAt) || 0;
    var base = rTs > lTs ? r : l;
    var other = base === r ? l : r;
    var out = JSON.parse(JSON.stringify(base));
    out.meta = Object.assign({}, out.meta || {}, { v: 1, savedAt: Math.max(lTs, rTs) });
    for (var i = 0; i < MERGE_LISTS.length; i++) {
      var k = MERGE_LISTS[i];
      out[k] = C.unionById(out[k] || [], other[k] || []);
    }
    out.reviews = C.unionReviews(out.reviews || [], other.reviews || []);
    out.days = C.mergeDays(out.days || {}, other.days || {});
    return out;
  };

  /* ---------------- 计划骨架生成 ---------------- */

  C.buildMilestones = function (tpl, examDate, uid) {
    uid = uid || C.uid;
    return ((tpl && tpl.milestones) || []).map(function (m) {
      return { id: uid(), title: m.title, due: C.addDaysStr(examDate, m.off), cat: '节点', done: false };
    });
  };

  C.buildPhases = function (tpl) {
    return ((tpl && tpl.phases) || []).map(function (p, i) {
      return { id: 'S' + (i + 1), name: p.n, time: p.t, lines: p.lines || [] };
    });
  };

  C.sameDay = function (a, b) { return C.diffDays(a, b) === 0; };

  /* ---------------- 导出 ---------------- */

  var api = C;
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node / 测试
  if (root) root.SGCore = api;                                              // 浏览器
})(typeof window !== 'undefined' ? window : null);
