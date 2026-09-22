'use strict';

/* ============================================================
   核心纯逻辑层（core.js）

   这一层放的是**算法与数据规则**：日期计算、SM-2 间隔重复、
   多端合并、去重、连续打卡。它们有三个共同点：

   1. 纯函数：同样的输入永远得到同样的输出，不改传入的参数；
   2. 不碰环境：不读 DOM、不写 localStorage、不取系统时间（需要"今天"
      的地方一律由调用方传入或注入，所以测试可以固定时间）；
   3. 双环境可用，且**只有这一份实现**：
        - 浏览器：<script src="core.js"> → window.SGCore
        - Node   ：require('./core.js')  → module.exports

   为什么值得单独成层：这些函数算错时不会抛异常，只会让数据
   悄悄错乱（复习间隔算飞、同步吃掉记录），必须能在 Node 里逐条断言。
   ============================================================ */

(function (root) {
  const core = {};

  /* ---------------- 日期（统一用 'YYYY-MM-DD' 字符串，避开时区坑） ---------------- */

  /**
   * 补零到两位。
   * @param {number} n
   * @returns {string}
   */
  core.pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);

  /**
   * 取某天的 'YYYY-MM-DD'（默认今天，按本地时区）。
   * @param {Date} [date]
   * @returns {string}
   */
  core.todayStr = (date) => {
    const d = date || new Date();
    return `${d.getFullYear()}-${core.pad2(d.getMonth() + 1)}-${core.pad2(d.getDate())}`;
  };

  /**
   * 解析日期字符串。
   * 刻意不用 new Date('2026-09-17')：那样按 UTC 解析，东八区会差一天。
   * @param {string} dateStr
   * @returns {Date}
   */
  core.parseDate = (dateStr) => {
    const parts = String(dateStr || '').split('-');
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  };

  /**
   * 日期加减天数，返回新的 'YYYY-MM-DD'。
   * @param {string} dateStr
   * @param {number} days
   * @returns {string}
   */
  core.addDaysStr = (dateStr, days) => {
    const d = core.parseDate(dateStr);
    d.setDate(d.getDate() + days);
    return core.todayStr(d);
  };

  /**
   * 两个日期相差多少天（b - a）。
   * 用 round 抵消夏令时造成的 23/25 小时误差。
   * @param {string} a
   * @param {string} b
   * @returns {number}
   */
  core.diffDays = (a, b) => Math.round((core.parseDate(b) - core.parseDate(a)) / 86400000);

  /**
   * 距离目标日期还有几天（可注入"今天"以便测试）。
   * @param {string} dateStr
   * @param {string} [today]
   * @returns {number}
   */
  core.daysUntil = (dateStr, today) => core.diffDays(today || core.todayStr(), dateStr);

  /**
   * 是否同一天。
   * @param {string} a
   * @param {string} b
   * @returns {boolean}
   */
  core.sameDay = (a, b) => core.diffDays(a, b) === 0;

  /* ---------------- 基础工具 ---------------- */

  /**
   * HTML 转义。所有拼进 innerHTML 的用户输入都必须先过这里。
   * @param {*} value
   * @returns {string}
   */
  core.esc = (value) =>
    String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  /**
   * 生成唯一 id：时间戳（36 进制）+ 6 位随机。可加前缀便于排查。
   * @param {string} [prefix]
   * @returns {string}
   */
  core.uid = (prefix) => {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix ? `${prefix}-` : ''}${Date.now().toString(36)}${random}`;
  };

  /**
   * 按骨架补齐缺失字段（只补 undefined，不覆盖已有值）。
   * @param {Object} target
   * @param {...Object} skeletons
   * @returns {Object} target
   */
  core.mergeDefaults = (target, ...skeletons) => {
    const merged = target || {};
    skeletons.forEach((skeleton) => {
      Object.keys(skeleton || {}).forEach((key) => {
        if (merged[key] === undefined) merged[key] = skeleton[key];
      });
    });
    return merged;
  };

  /* ---------------- 数据清理 ---------------- */

  /**
   * 任务去重：键为「日期|科目|标题」，重复时保留已完成的那条。
   * @param {Array} tasks
   * @returns {{tasks: Array, removed: number}}
   */
  core.dedupeTasks = (tasks) => {
    const byKey = new Map();
    let removed = 0;

    (tasks || []).forEach((task) => {
      if (!task) return;
      const title = String(task.title == null ? '' : task.title).trim();
      const key = `${task.date || ''}|${task.subject || ''}|${title}`;
      const kept = byKey.get(key);
      if (!kept) {
        byKey.set(key, task);
        return;
      }
      if (task.done && !kept.done) byKey.set(key, task);
      removed++;
    });

    return { tasks: [...byKey.values()], removed };
  };

  /**
   * 卡片去重：键为「科目|问题」，先出现的保留。
   * @param {Array} cards
   * @returns {{cards: Array, removed: number}}
   */
  core.dedupeCards = (cards) => {
    const seen = new Set();
    const kept = [];
    let removed = 0;

    (cards || []).forEach((card) => {
      if (!card) return;
      const key = `${card.subject || ''}|${String(card.q == null ? '' : card.q).trim()}`;
      if (seen.has(key)) {
        removed++;
        return;
      }
      seen.add(key);
      kept.push(card);
    });

    return { cards: kept, removed };
  };

  /* ---------------- 学习统计 ---------------- */

  /**
   * 连续打卡天数。
   * 今天还没打卡时从昨天起算——否则每天零点一过，连续记录会显示成 0，
   * 用户会以为断签。
   * @param {Object<string, {active?: boolean}>} days
   * @param {string} [today]
   * @returns {number}
   */
  core.calcStreak = (days, today) => {
    const records = days || {};
    const start = today || core.todayStr();
    let cursor = records[start] && records[start].active ? start : core.addDaysStr(start, -1);
    let streak = 0;
    while (records[cursor] && records[cursor].active) {
      streak++;
      cursor = core.addDaysStr(cursor, -1);
    }
    return streak;
  };

  /**
   * 累计「有学习」的天数。
   * @param {Object} days
   * @returns {number}
   */
  core.totalActiveDays = (days) =>
    Object.keys(days || {}).filter((date) => days[date] && days[date].active).length;

  /**
   * 某天的专注分钟数（脏数据里没有 minutes 时按 0 计，避免整列变 NaN）。
   * @param {Array} sessions
   * @param {string} date
   * @returns {number}
   */
  core.sumMinutes = (sessions, date) =>
    (sessions || [])
      .filter((session) => session && session.date === date)
      .reduce((sum, session) => sum + (+session.minutes || 0), 0);

  /* ---------------- SM-2 间隔重复 ---------------- */

  /**
   * 按评分推进一张卡片的复习计划（SM-2 的简化实现）。
   *
   * 顺序很重要：先用**本次评分前**的难度系数算间隔，再按评分调整系数。
   * 评分 0~5，<3 视为答错：重置进度、当天重新出现。
   * @param {Object} card 原卡片（不会被修改）
   * @param {number} quality 0~5
   * @param {string} [now] 'YYYY-MM-DD'，默认今天
   * @returns {Object} 新卡片
   */
  core.srsGrade = (card, quality, now) => {
    const today = now || core.todayStr();
    const next = Object.assign({}, card);
    const grade = Math.max(0, Math.min(5, +quality || 0));

    next.ease = +next.ease || 2.5;
    next.reps = +next.reps || 0;
    next.interval = +next.interval || 0;
    next.lapses = +next.lapses || 0;

    if (grade < 3) {
      next.reps = 0;
      next.interval = 0;
      next.lapses += 1;
      next.due = today;
    } else {
      if (next.reps === 0) next.interval = 1;
      else if (next.reps === 1) next.interval = 6;
      else next.interval = Math.max(6, Math.round(next.interval * next.ease));
      next.reps += 1;
      next.due = core.addDaysStr(today, next.interval);
    }

    const delta = 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02);
    next.ease = Math.max(1.3, +(next.ease + delta).toFixed(2));
    next.lastAt = today;
    return next;
  };

  /**
   * 今天该复习哪些卡片：到期日 ≤ 今天，按到期日从早到晚。
   * @param {Array} cards
   * @param {string} [today]
   * @returns {string[]} 卡片 id
   */
  core.buildQueue = (cards, today) => {
    const limit = today || core.todayStr();
    return (cards || [])
      .filter((card) => card && card.due && card.due <= limit)
      .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
      .map((card) => card.id);
  };

  /* ---------------- 多端合并（电脑 ↔ 手机局域网同步） ---------------- */

  /** 需要按 id 求并集的集合字段。 */
  const MERGE_LISTS = [
    'tasks',
    'cards',
    'notes',
    'errors',
    'goals',
    'checklist',
    'milestones',
    'materials',
    'sessions',
  ];

  /**
   * 按 id 求并集：prefer 优先，other 只补 prefer 没有的。
   * @param {Array} prefer
   * @param {Array} other
   * @returns {Array}
   */
  core.unionById = (prefer, other) => {
    const byId = new Map();
    (prefer || []).forEach((item) => {
      if (item && item.id) byId.set(item.id, item);
    });
    (other || []).forEach((item) => {
      if (item && item.id && !byId.has(item.id)) byId.set(item.id, item);
    });
    return [...byId.values()];
  };

  /**
   * 复习记录的指纹。
   * 不用 JSON.stringify 整条比对：字段顺序变化会导致同一条被当成两条。
   * @param {Object} review
   * @returns {string}
   */
  core.reviewKey = (review) => {
    if (!review) return '';
    return [review.cardId || '', review.date || '', review.quality == null ? '' : review.quality, review.at || 0].join(
      '|',
    );
  };

  /**
   * 合并两端的复习记录并去重。
   * @param {Array} a
   * @param {Array} b
   * @returns {Array}
   */
  core.unionReviews = (a, b) => {
    const seen = new Set();
    const merged = [];
    (a || []).concat(b || []).forEach((review) => {
      const key = core.reviewKey(review);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(review);
    });
    return merged;
  };

  /**
   * 合并两端的每日记录：保底项任一为真即真，记忆量取大，任一活跃即活跃。
   * @param {Object} a
   * @param {Object} b
   * @returns {Object}
   */
  core.mergeDays = (a, b) => {
    const merged = JSON.parse(JSON.stringify(a || {}));

    Object.keys(b || {}).forEach((date) => {
      if (!merged[date]) {
        merged[date] = JSON.parse(JSON.stringify(b[date]));
        return;
      }
      const left = merged[date];
      const right = b[date];
      const baodi = (left.baodi || []).slice();
      const otherBaodi = right.baodi || [];
      const length = Math.max(baodi.length, otherBaodi.length, 3);

      for (let i = 0; i < length; i++) {
        if (baodi[i] === undefined) baodi[i] = false;
        if (otherBaodi[i]) baodi[i] = true;
      }
      left.baodi = baodi;
      left.words = Math.max(left.words || 0, right.words || 0);
      left.active = !!(left.active || right.active);
    });

    return merged;
  };

  /**
   * 整库合并：以 savedAt 较新的一端为底，再并上另一端的增量。
   * 规则刻意保守——合并只增不减，避免「一端删掉、另一端又同步回来」。
   * @param {Object} local
   * @param {Object} server
   * @returns {Object}
   */
  core.mergeStates = (local, server) => {
    const left = local || {};
    const right = server || {};
    const leftSavedAt = (left.meta && left.meta.savedAt) || 0;
    const rightSavedAt = (right.meta && right.meta.savedAt) || 0;
    const base = rightSavedAt > leftSavedAt ? right : left;
    const other = base === right ? left : right;

    const merged = JSON.parse(JSON.stringify(base));
    merged.meta = Object.assign({}, merged.meta || {}, {
      v: 1,
      savedAt: Math.max(leftSavedAt, rightSavedAt),
    });

    MERGE_LISTS.forEach((key) => {
      merged[key] = core.unionById(merged[key] || [], other[key] || []);
    });
    merged.reviews = core.unionReviews(merged.reviews || [], other.reviews || []);
    merged.days = core.mergeDays(merged.days || {}, other.days || {});
    return merged;
  };

  /* ---------------- 计划骨架 ---------------- */

  /**
   * 按模板生成关键节点：日期 = 考试日 + 偏移量（负数表示提前）。
   * @param {Object} template
   * @param {string} examDate
   * @param {Function} [uid] 可注入的 id 生成器（便于测试断言）
   * @returns {Array}
   */
  core.buildMilestones = (template, examDate, uid) => {
    const makeId = uid || core.uid;
    return ((template && template.milestones) || []).map((milestone) => ({
      id: makeId(),
      title: milestone.title,
      due: core.addDaysStr(examDate, milestone.off),
      cat: '节点',
      done: false,
    }));
  };

  /**
   * 按模板生成阶段（编号 S1、S2…）。
   * @param {Object} template
   * @returns {Array}
   */
  core.buildPhases = (template) =>
    ((template && template.phases) || []).map((phase, index) => ({
      id: `S${index + 1}`,
      name: phase.n,
      time: phase.t,
      lines: phase.lines || [],
    }));

  /* ---------------- 双环境导出 ---------------- */

  /* 浏览器：同时挂到 SG.core（各模块统一从这里取）与 window.SGCore（历史写法/调试用）。
     Node：交给 module.exports 供测试 require。
     注意：必须保证 SG.core 一定存在——views/data/timer 等模块在加载时就会读它，
     少挂一个名字就会让整个应用在启动阶段直接抛错（页面全白）。 */
  if (root) {
    root.SG = root.SG || {};
    root.SG.core = core;
    root.SGCore = core;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
})(typeof window !== 'undefined' ? window : null);
