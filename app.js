'use strict';

/* ============================================================
   上岸计划 · 通用备考版（独立版本）
   适合任何学校 / 专业 / 考试：首次启动按「考试类型 + 学校/专业
   + 科目」快速配置，自动生成阶段、关键节点与起步任务。
   数据只保存在本机浏览器 localStorage。
   ============================================================ */

(function () {
  var APP_KEY = 'shangan-gen-v1';
  var TIMER_KEY = 'shangan-gen-timer-v1';
  var BUILD = '1';

  var PALETTE = [
    { fg: '#0f766e', bg: '#ddf0ec' },
    { fg: '#2f6db3', bg: '#e7eff9' },
    { fg: '#7a5fc0', bg: '#eee9f8' },
    { fg: '#b45309', bg: '#fdf0dd' },
    { fg: '#16924a', bg: '#e3f5ea' },
    { fg: '#c2255c', bg: '#fbe9f1' },
    { fg: '#475569', bg: '#eef0f4' },
    { fg: '#c2410c', bg: '#fdebe1' }
  ];
  function subjects() {
    var s = state && state.settings && state.settings.subjects;
    return (s && s.length) ? s : ['科目一', '科目二'];
  }
  function subColor(sub) {
    var idx = subjects().indexOf(sub);
    return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
  }
  function chipHTML(sub, extraCls) {
    var c = subColor(sub);
    return '<span class="chip' + (extraCls ? ' ' + extraCls : '') + '" style="background:' + c.bg + ';color:' + c.fg + '">' + esc(sub) + '</span>';
  }
  function subjectOptions(sel) {
    return subjects().map(function (s) {
      return '<option value="' + s + '"' + (s === sel ? ' selected' : '') + '>' + s + '</option>';
    }).join('');
  }

  var EXAM_TEMPLATES = [
    {
      tpl: 'kaoyan', name: '考研', icon: '🎓', desc: '政治 · 外语 · 数学/专业课',
      subjects: ['政治', '英语', '数学', '专业课'],
      phases: [
        { n: '打基础', t: '约 3~4 个月', lines: ['按考纲过完一轮：教材 + 网课 + 笔记', '英语每天单词不间断', '数学概念与例题过一遍'] },
        { n: '强化提升', t: '约 2 个月', lines: ['开始真题分科刷题', '错题本与总结成体系', '专业课二轮精读'] },
        { n: '真题模拟', t: '约 1 个月', lines: ['整套真题计时训练', '每周一次全真模拟', '背诵类科目开始滚动背'] },
        { n: '冲刺背诵', t: '考前 3~4 周', lines: ['错题回归 + 模板滚熟', '政治大题背诵', '调整作息，按考试时间复习'] }
      ],
      milestones: [
        { title: '关注考纲 / 招生简章发布', off: -110 }, { title: '预报名', off: -95 },
        { title: '正式报名', off: -85 }, { title: '网上确认', off: -70 },
        { title: '打印准考证', off: -12 }, { title: '初试', off: 0 }
      ]
    },
    {
      tpl: 'zhuanshengben', name: '专升本', icon: '📗', desc: '公共课 + 专业课（各省不同）',
      subjects: ['大学英语', '专业课'],
      phases: [
        { n: '破冰起步', t: '约 4~6 周', lines: ['外语零基础先啃音标与高频词', '专业课：通读教材建立框架', '确定目标院校与考试科目'] },
        { n: '系统学习', t: '约 2~3 个月', lines: ['外语词汇滚动 + 语法过一遍', '专业课逐章精读 + 章节练习', '每周复盘一次'] },
        { n: '题型专项', t: '约 1~2 个月', lines: ['真题题型逐个突破', '作文/大题模板准备', '开始计时训练'] },
        { n: '冲刺', t: '考前 1 个月', lines: ['真题整套模拟', '错题回归 + 要点背诵', '打印准考证、看考点'] }
      ],
      milestones: [
        { title: '目标院校简章发布（确认科目）', off: -75 }, { title: '网上报名（窗口很短）', off: -45 },
        { title: '资格审查 / 缴费确认', off: -40 }, { title: '打印准考证', off: -10 }, { title: '考试', off: 0 }
      ]
    },
    {
      tpl: 'gaokao', name: '高考', icon: '🏫', desc: '语数外 + 选考科目',
      subjects: ['语文', '数学', '英语', '综合'],
      phases: [
        { n: '一轮复习', t: '约 4 个月', lines: ['回归课本，过完所有考点', '整理知识框架与易错点', '跟随老师节奏不掉队'] },
        { n: '二轮专题', t: '约 2 个月', lines: ['专题突破 + 大量刷题', '错题本每周重做', '真题按题型拆解'] },
        { n: '三轮冲刺', t: '考前 1 个月', lines: ['整套模拟计时', '回归基础与错题', '调整心态与作息'] }
      ],
      milestones: [
        { title: '一轮模考（自检）', off: -120 }, { title: '二轮模考', off: -60 },
        { title: '三轮模考', off: -20 }, { title: '打印准考证', off: -7 }, { title: '高考', off: 0 }
      ]
    },
    {
      tpl: 'cet', name: '英语四六级', icon: '🗣', desc: '听力 · 阅读 · 写作与翻译',
      subjects: ['词汇', '听力', '阅读', '写作与翻译'],
      phases: [
        { n: '词汇打底', t: '约 4 周', lines: ['核心词汇过 1~2 遍', '每天精听 20 分钟'] },
        { n: '题型专练', t: '约 4~6 周', lines: ['听力精听 + 阅读限时', '翻译每周 3 篇', '写作模板积累'] },
        { n: '真题冲刺', t: '考前 3 周', lines: ['整套真题计时模拟', '错题复盘', '听力高频场景反复听'] }
      ],
      milestones: [
        { title: '报名（记得抢名额）', off: -75 }, { title: '打印准考证', off: -14 }, { title: '考试', off: 0 }
      ]
    },
    {
      tpl: 'gwy', name: '公务员', icon: '🧑💼', desc: '行测 + 申论',
      subjects: ['行测', '申论'],
      phases: [
        { n: '基础精讲', t: '约 6~8 周', lines: ['行测各模块听课 + 专项练习', '申论学会读材料与概括', '言语/判断/资料分析优先'] },
        { n: '强化刷题', t: '约 6 周', lines: ['行测每日刷题 + 错题本', '申论每周完整写 1~2 套', '限时训练'] },
        { n: '模考冲刺', t: '考前 3~4 周', lines: ['整套模考计时', '行测套卷复盘', '申论素材积累与背诵'] }
      ],
      milestones: [
        { title: '公告发布', off: -45 }, { title: '报名', off: -35 }, { title: '打印准考证', off: -7 }, { title: '笔试', off: 0 }
      ]
    },
    {
      tpl: 'jsz', name: '教师资格', icon: '🧑‍🏫', desc: '综合素质 + 教育知识 + 学科',
      subjects: ['综合素质', '教育知识与能力', '学科知识'],
      phases: [
        { n: '基础学习', t: '约 6 周', lines: ['过一遍教材与网课', '重点：教育心理学、法律法规'] },
        { n: '刷题巩固', t: '约 4 周', lines: ['章节题 + 真题', '主观题按模板练习'] },
        { n: '背诵冲刺', t: '考前 2~3 周', lines: ['简答/论述滚动背诵', '作文与教学设计模板'] }
      ],
      milestones: [
        { title: '报名', off: -60 }, { title: '打印准考证', off: -10 }, { title: '笔试', off: 0 }
      ]
    },
    {
      tpl: 'language', name: '雅思 / 托福', icon: '🌏', desc: '听说读写四科',
      subjects: ['听力', '口语', '阅读', '写作'],
      phases: [
        { n: '摸底入门', t: '约 3~4 周', lines: ['做一套真题摸底', '背核心词汇', '口语每天开口'] },
        { n: '专项突破', t: '约 6 周', lines: ['听力精听 + 阅读题型技巧', '写作按话题练 + 批改', '口语按题库过话题'] },
        { n: '模考冲刺', t: '考前 2~3 周', lines: ['整套模考计时', '弱项补强', '熟悉考试流程'] }
      ],
      milestones: [
        { title: '预约考位（提前订）', off: -30 }, { title: '模拟考试', off: -14 }, { title: '考试', off: 0 }
      ]
    },
    {
      tpl: 'other', name: '其他 / 自定义', icon: '✏️', desc: '自由填写科目与日期',
      subjects: ['科目一', '科目二'],
      phases: [
        { n: '打基础', t: '约 8 周', lines: ['通读教材 / 大纲，建立框架', '每天固定时段学习'] },
        { n: '强化练习', t: '约 6 周', lines: ['章节练习 / 刷题', '整理错题本'] },
        { n: '真题冲刺', t: '考前 3~4 周', lines: ['真题模拟计时', '错题回归 + 要点背诵'] }
      ],
      milestones: [
        { title: '关注报名与考纲', off: -60 }, { title: '打印准考证', off: -7 }, { title: '考试', off: 0 }
      ]
    }
  ];

  var GENERIC_CHECKLIST = [
    '买齐教材 / 资料（或打印考纲）',
    '找到近年真题并了解考试题型',
    '确认报名时间与报名方式',
    '给自己定好每日固定学习时段',
    '把报名、准考证等关键日子写进计划'
  ];
  var WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /* 日期与算法统一走 core.js（浏览器 <script> 加载，Node 测试里 require 同一份文件），
     这里只留同名的极薄包装，保证既有调用点一行都不用改。 */
  var CORE = (typeof window !== 'undefined' && window.SGCore) ? window.SGCore : null;
  if (!CORE) throw new Error('core.js 未加载：请确认 index.html 中 core.js 在 app.js 之前引入');

  function pad2(n) { return CORE.pad2(n); }
  function todayStr() { return CORE.todayStr(); }
  function parseDate(s) { return CORE.parseDate(s); }
  function addDaysStr(s, n) { return CORE.addDaysStr(s, n); }
  function diffDays(a, b) { return CORE.diffDays(a, b); }
  function daysUntil(s) { return CORE.daysUntil(s); }
  function uid(prefix) { return CORE.uid(prefix); }
  function fmtDateCN(s) {
    var d = parseDate(s);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEKDAYS[d.getDay()];
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60);
  }
  function fmtDur(m) {
    if (m < 60) return m + ' 分钟';
    return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分';
  }
  function esc(s) { return CORE.esc(s); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2300);
  }
  function msItem(value, label) {
    return '<div class="ms-item"><b>' + value + '</b><span>' + label + '</span></div>';
  }
  function sgItem(num, unit, label, cls) {
    return '<div class="sg-item"><div class="sg-num ' + (cls || '') + '">' + num + '<small> ' + unit + '</small></div>' +
      '<div class="sg-label">' + label + '</div></div>';
  }
  function wordLabel() {
    var subs = subjects();
    return subs.some(function (s) { return s.indexOf('英语') > -1 || s.indexOf('外语') > -1 || s === '词汇'; }) ? '今日新词' : '今日记忆';
  }

  function defaultSettings() {
    return {
      examType: 'other', examLabel: '我的考试', school: '', examDate: addDaysStr(todayStr(), 180),
      subjects: ['科目一', '科目二'], baodi: ['记忆 / 背诵 30 分钟', '主科学习 30 分钟', '练习 / 刷题 30 分钟'],
      wordTarget: 40, deepseekKey: '',
      pomoWork: 25, pomoBreak: 5, pomoLong: 15, pomoRounds: 4
    };
  }
  function defaultShell() {
    return {
      meta: { v: 1, createdAt: todayStr(), setupDone: false },
      settings: defaultSettings(),
      tasks: [], cards: [], sessions: [], reviews: [], notes: [], errors: [],
      milestones: [], phases: [], goals: [], checklist: [], materials: [], days: {}
    };
  }
  function findTemplate(tpl) {
    for (var i = 0; i < EXAM_TEMPLATES.length; i++) {
      if (EXAM_TEMPLATES[i].tpl === tpl) return EXAM_TEMPLATES[i];
    }
    return EXAM_TEMPLATES[EXAM_TEMPLATES.length - 1];
  }
  function applyTemplate(cfg, fresh) {
    var tpl = findTemplate(cfg.tpl);
    var s = state.settings;
    s.examType = tpl.tpl;
    s.examLabel = (cfg.label || tpl.name).trim() || tpl.name;
    s.school = (cfg.school || '').trim();
    s.examDate = cfg.examDate || s.examDate;
    var subs = (cfg.subjects || []).map(function (x) { return String(x).trim(); }).filter(Boolean);
    s.subjects = subs.length ? subs.slice(0, 8) : ['科目一', '科目二'];
    s.wordTarget = Math.max(1, +cfg.words || s.wordTarget);
    if (cfg.baodi && cfg.baodi.length === 3) s.baodi = cfg.baodi;
    else s.baodi = tpl.baodi || s.baodi;

    if (s.subjects.length) {
      if (subjects().indexOf(TIMER.subject) < 0) TIMER.subject = s.subjects[0];
      aiState.subject = s.subjects[0];
    }
    state.phases = CORE.buildPhases(tpl);
    state.milestones = CORE.buildMilestones(tpl, s.examDate, uid);
    if (fresh) {
      state.checklist = GENERIC_CHECKLIST.map(function (t) { return { id: uid(), text: t, done: false }; });
      state.goals = [];
      var today = todayStr();
      var starter = [
        function (sub) { return '整理《' + sub + '》教材与考纲'; },
        function (sub) { return sub + '：系统学习 ≥ 45 分钟（做笔记）'; },
        function (sub) { return sub + '：做 1 组练习，整理错题'; }
      ];
      for (var d = 0; d < 3; d++) {
        s.subjects.forEach(function (sub) {
          state.tasks.push({ id: uid(), date: addDaysStr(today, d), subject: sub, title: starter[d](sub), done: false });
        });
      }
      s.subjects.forEach(function (sub) {
        state.tasks.push({ id: uid(), date: today, subject: sub, title: '（示例）把今天要学的内容填进来', done: false });
      });
    }
  }
  function seedState() { return defaultShell(); }
  function mergeDefaults(s) {
    var d = defaultShell();
    CORE.mergeDefaults(s, d);
    s.settings = Object.assign({}, d.settings, s.settings || {});
    s.meta = Object.assign({}, d.meta, s.meta || {});
    return s;
  }
  var freshSeed = false;
  var store = {
    load: function () {
      try {
        var raw = localStorage.getItem(APP_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.meta && Array.isArray(parsed.tasks)) return mergeDefaults(parsed);
        }
      } catch (e) {}
      freshSeed = true;
      var seeded = seedState();
      try { localStorage.setItem(APP_KEY, JSON.stringify(seeded)); } catch (e) {}
      return seeded;
    },
    save: function () {
      try { localStorage.setItem(APP_KEY, JSON.stringify(state)); }
      catch (e) { toast('保存失败：浏览器存储空间不足，请先导出备份'); }
    }
  };
  var state = store.load();
  /* ============ 局域网自动同步（服务器存储 + 双向合并） ============ */
  var syncState = { available: false, dirty: false, lastSeen: 0, lastAt: 0, lastMsg: '未连接' };
  var syncTickTimer = null;
  function syncServerOn() { return location.protocol === 'http:'; }
  function syncUrl() {
    try { return new URL('api/sync', location.href).href; } catch (e) { return 'api/sync'; }
  }
  function syncGet() {
    return fetch(syncUrl(), { method: 'GET', cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return null; });
  }
  function syncPut() {
    return fetch(syncUrl(), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) })
      .then(function (r) { return r.json(); }).catch(function () { return null; });
  }
  function syncUnion(prefer, other) { return CORE.unionById(prefer, other); }
  function syncDaysMerge(a, b) { return CORE.mergeDays(a, b); }
  function syncMerge(local, server) { return CORE.mergeStates(local, server); }
  function syncAdopt(serverState) {
    var merged = syncMerge(state, serverState);
    state = merged;
    try { dedupeClean(); } catch (e) {}
    syncState.dirty = false;
    syncState.lastSeen = (serverState.meta && serverState.meta.savedAt) || 0;
    try { localStorage.setItem(APP_KEY, JSON.stringify(state)); } catch (e) {}
    renderAll();
    /* 如果拉取后发现已经配置过，关闭可能已弹出的向导 */
    if (typeof closeOnboard === 'function' && state.meta && state.meta.setupDone) {
      try { closeOnboard(); } catch (e2) {}
    }
  }
  function syncSetMsg(m) {
    syncState.lastMsg = m;
    syncState.lastAt = Date.now();
    var b = $('#sync-badge');
    if (b) b.textContent = m;
    var info = $('#sync-info');
    if (info) {
      info.innerHTML = m === '本机模式' ? '当前以纯本机方式运行（数据不自动上传）。' : '上次同步：' + (new Date(syncState.lastAt)).toTimeString().slice(0, 5);
    }
  }
  function syncTick() {
    if (!syncServerOn()) { syncState.available = false; return; }
    syncState.available = true;
    syncGet().then(function (res) {
      if (!res || !res.ok) { syncSetMsg('服务器未连接'); return; }
      var server = res.data;
      var sTs = res.savedAt || 0;
      if (!server || !server.meta) {
        var hasData = !!(state.tasks && (state.tasks.length || (state.cards && state.cards.length) || state.sessions.length));
        if (hasData || (state.meta && state.meta.savedAt)) {
          syncPut().then(function (pr) {
            if (pr && pr.ok) { syncState.lastSeen = pr.savedAt; syncState.dirty = false; syncSetMsg('已同步'); }
            else syncSetMsg('上传失败');
          });
        } else { syncState.lastSeen = sTs; syncSetMsg('已连接'); }
        return;
      }
      if (sTs > syncState.lastSeen) {
        syncAdopt(server);
        syncPut().then(function (pr) {
          if (pr && pr.ok) { syncState.lastSeen = pr.savedAt; syncState.dirty = false; syncSetMsg('已同步'); }
          else syncSetMsg('同步异常');
        });
        return;
      }
      if (syncState.dirty) {
        syncPut().then(function (pr) {
          if (pr && pr.ok) { syncState.lastSeen = pr.savedAt; syncState.dirty = false; syncSetMsg('已同步'); }
          else syncSetMsg('上传失败');
        });
      } else {
        syncSetMsg('已同步');
      }
    });
  }
  function syncNow() {
    if (!syncServerOn()) { toast('当前不是服务器模式，请用「启动.bat」打开'); return; }
    syncTick();
  }
  function syncPushNow() {
    if (!syncServerOn()) { toast('当前不是服务器模式，请用「启动.bat」打开'); return; }
    syncPut().then(function (pr) {
      if (pr && pr.ok) { syncState.dirty = false; syncState.lastSeen = pr.savedAt; syncSetMsg('已上传'); toast('已上传到服务器'); }
      else toast('上传失败：请确认电脑上的服务在运行');
    });
  }
  function syncPullNow() {
    if (!syncServerOn()) { toast('当前不是服务器模式，请用「启动.bat」打开'); return; }
    syncGet().then(function (res) {
      if (res && res.ok && res.data && res.data.meta) { syncAdopt(res.data); syncSetMsg('已拉取'); toast('已从服务器拉取并合并'); }
      else toast('服务器暂无数据或连接失败');
    });
  }
  function save() {
    try { state.meta.savedAt = Date.now(); } catch (e) {}
    syncState.dirty = true;
    store.save();
    if (syncTickTimer) clearTimeout(syncTickTimer);
    syncTickTimer = setTimeout(function () { syncTick(); }, 2000);
  }
  function syncStart() {
    var b1 = $('#btn-sync-now'); if (b1) b1.onclick = syncNow;
    var b2 = $('#btn-sync-push'); if (b2) b2.onclick = syncPushNow;
    var b3 = $('#btn-sync-pull'); if (b3) b3.onclick = syncPullNow;
    if (!syncServerOn()) { syncSetMsg('本机模式'); return; }
    setTimeout(function () { syncTick(); }, 1200);
    setInterval(syncTick, 4000);
  }

  /* 清理重复数据：任务按“日期|科目|标题”去重（优先保留已完成），卡片按“科目|问题”去重 */
  function dedupeClean() {
    var t = CORE.dedupeTasks(state.tasks);
    state.tasks = t.tasks;
    var c = CORE.dedupeCards(state.cards);
    state.cards = c.cards;
    return t.removed + c.removed;
  }

  function markActive(dateStr) {
    if (!state.days[dateStr]) state.days[dateStr] = { baodi: [false, false, false], words: 0 };
    state.days[dateStr].active = true;
  }
  function calcStreak() { return CORE.calcStreak(state.days); }
  function totalActiveDays() { return CORE.totalActiveDays(state.days); }
  function minutesOn(d) { return CORE.sumMinutes(state.sessions, d); }

  function addTask(date, title, subject) {
    state.tasks.push({ id: uid(), date: date, title: title, subject: subject || subjects()[0], done: false });
    save(); renderAll();
  }
  function toggleTask(id) {
    var t = state.tasks.find(function (x) { return x.id === id; });
    if (!t) return;
    t.done = !t.done;
    if (t.done) markActive(t.date);
    save(); renderAll();
  }
  function delTask(id) {
    confirmModal('删除任务', '确定删除这条任务吗？', function () {
      state.tasks = state.tasks.filter(function (x) { return x.id !== id; });
      save(); renderAll();
    }, '删除');
  }
  function taskModal(id) {
    var t = id ? state.tasks.find(function (x) { return x.id === id; }) : null;
    openModal(t ? '编辑任务' : '新任务',
      '<label class="f-label">任务内容</label>' +
      '<input type="text" id="m-task-title" maxlength="120" value="' + esc(t ? t.title : '') + '">' +
      '<div class="form-row-2" style="margin-top:10px">' +
      '<div><label class="f-label">科目</label><select id="m-task-subject">' + subjectOptions(t ? t.subject : subjects()[0]) + '</select></div>' +
      '<div><label class="f-label">日期</label><input type="date" id="m-task-date" value="' + (t ? t.date : planDate) + '"></div>' +
      '</div>',
      '<button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="m-save">保存</button>');
    $('#m-save').onclick = function () {
      var title = $('#m-task-title').value.trim();
      if (!title) { toast('任务内容不能为空'); return; }
      var date = $('#m-task-date').value || todayStr();
      if (t) { t.title = title; t.subject = $('#m-task-subject').value; t.date = date; }
      else addTask(date, title, $('#m-task-subject').value);
      closeModal(); save(); renderAll();
    };
  }
  function taskItemHTML(t) {
    var done = t.done ? ' done' : '';
    var checkIcon = t.done ? '<svg class="ic"><use href="#i-check"/></svg>' : '';
    return '<li class="task-item' + done + '">' +
      '<button class="task-check" data-action="toggle-task" data-id="' + t.id + '" title="标记完成">' + checkIcon + '</button>' +
      '<div class="task-body">' +
      '<div class="task-title">' + esc(t.title) + '</div>' +
      '<div class="task-meta">' + chipHTML(t.subject) + '<span>' + fmtDateCN(t.date) + '</span></div>' +
      '</div>' +
      '<div class="task-actions">' +
      '<button data-action="edit-task" data-id="' + t.id + '" title="编辑"><svg class="ic"><use href="#i-edit"/></svg></button>' +
      '<button data-action="del-task" data-id="' + t.id + '" title="删除"><svg class="ic"><use href="#i-trash"/></svg></button>' +
      '</div></li>';
  }

  function srsGrade(card, q) {
    var graded = CORE.srsGrade(card, q);
    for (var k in graded) card[k] = graded[k];
    return card;
  }
  var reviewQueue = null, reviewPos = 0, queueDay = '', requeued = {};
  function ensureQueue() {
    var today = todayStr();
    if (reviewQueue === null || queueDay !== today) {
      reviewQueue = CORE.buildQueue(state.cards, today);
      reviewPos = 0; queueDay = today; requeued = {};
    }
  }
  function gradeCurrent(q) {
    if (reviewPos >= reviewQueue.length) return;
    var id = reviewQueue[reviewPos];
    var card = state.cards.find(function (c) { return c.id === id; });
    if (!card) { reviewPos++; renderAll(); return; }
    srsGrade(card, q);
    state.reviews.push({ date: todayStr(), cardId: id, quality: q, at: Date.now() });
    markActive(todayStr());
    if (q < 3 && !requeued[id]) { requeued[id] = true; reviewQueue.push(id); }
    reviewPos++;
    save(); renderAll();
  }

  var TIMER = { subject: subjects()[0], mode: 'work', running: false, remain: 1500, total: 1500, completedRounds: 0, interval: null };
  function timerSettings() {
    var s = state.settings;
    return {
      work: Math.max(1, Math.min(90, +s.pomoWork || 25)),
      brk: Math.max(1, Math.min(30, +s.pomoBreak || 5)),
      long: Math.max(1, Math.min(60, +s.pomoLong || 15)),
      rounds: Math.max(1, Math.min(10, +s.pomoRounds || 4))
    };
  }
  function timerTotalSeconds() {
    var s = timerSettings();
    if (TIMER.mode === 'work') return s.work * 60;
    return (TIMER.completedRounds > 0 && TIMER.completedRounds % s.rounds === 0) ? s.long * 60 : s.brk * 60;
  }
  function tick() {
    TIMER.remain--;
    if (TIMER.remain <= 0) { onTimerComplete(); return; }
    if (TIMER.remain % 30 === 0) persistTimer();
    updateTimerUI();
    document.title = fmtClock(TIMER.remain) + (TIMER.mode === 'work' ? ' · 专注中' : ' · 休息中') + ' - 上岸计划';
  }
  function startTimer() {
    if (TIMER.running) return;
    TIMER.running = true;
    TIMER.interval = setInterval(tick, 1000);
    persistTimer(); updateTimerUI();
  }
  function pauseTimer() {
    TIMER.running = false;
    clearInterval(TIMER.interval); TIMER.interval = null;
    persistTimer(); updateTimerUI();
  }
  function resetTimer() {
    clearInterval(TIMER.interval); TIMER.interval = null; TIMER.running = false;
    TIMER.total = timerTotalSeconds(); TIMER.remain = TIMER.total;
    persistTimer(); updateTimerUI();
  }
  function switchTo(mode) {
    clearInterval(TIMER.interval); TIMER.interval = null; TIMER.running = false;
    TIMER.mode = mode; TIMER.total = timerTotalSeconds(); TIMER.remain = TIMER.total;
    persistTimer(); updateTimerUI();
  }
  function onTimerComplete() {
    beep();
    var s = timerSettings();
    if (TIMER.mode === 'work') {
      TIMER.completedRounds++;
      state.sessions.unshift({ id: uid(), date: todayStr(), subject: TIMER.subject, minutes: s.work, at: Date.now() });
      markActive(todayStr());
      save();
      var longNow = TIMER.completedRounds % s.rounds === 0;
      toast('专注完成！休息 ' + (longNow ? s.long : s.brk) + ' 分钟');
      switchTo('break'); startTimer();
    } else {
      toast('休息结束，开始下一轮专注');
      switchTo('work');
    }
    renderAll();
  }
  function skipTimer() {
    clearInterval(TIMER.interval); TIMER.interval = null;
    if (TIMER.mode === 'work') { switchTo('break'); toast('已跳过本次专注'); startTimer(); }
    else { switchTo('work'); toast('已跳过休息'); }
    renderAll();
  }
  function updateTimerUI() {
    var modeEl = $('#timer-mode');
    if (!modeEl) return;
    var disp = $('#timer-display'), sub = $('#timer-sub'), ring = $('#ring-fg');
    modeEl.textContent = TIMER.mode === 'work' ? '专注' : '休息';
    modeEl.classList.toggle('break', TIMER.mode !== 'work');
    disp.textContent = fmtClock(TIMER.remain);
    var s = timerSettings();
    var roundNum = Math.min(TIMER.completedRounds + 1, s.rounds);
    sub.textContent = TIMER.mode === 'work'
      ? ('第 ' + roundNum + ' 轮 · 共 ' + s.rounds + ' 轮')
      : (TIMER.completedRounds > 0 && TIMER.completedRounds % s.rounds === 0 ? '长休息 · 放松一下' : '短休息');
    ring.classList.toggle('break', TIMER.mode !== 'work');
    var C = 741.4;
    ring.style.strokeDashoffset = String(C * (1 - (TIMER.total > 0 ? TIMER.remain / TIMER.total : 0)));
    var startBtn = $('#btn-start');
    if (startBtn) {
      var label = $('#btn-start-label'), ic = $('#btn-start-ic');
      var idle = TIMER.remain >= TIMER.total;
      label.textContent = TIMER.running ? '暂停'
        : (TIMER.mode === 'work' ? (idle ? '开始专注' : '继续专注') : (idle ? '开始休息' : '继续休息'));
      ic.innerHTML = '<use href="' + (TIMER.running ? '#i-pause' : '#i-play') + '"/>';
    }
  }
  function persistTimer() {
    try {
      localStorage.setItem(TIMER_KEY, JSON.stringify({
        subject: TIMER.subject, mode: TIMER.mode, running: TIMER.running,
        remain: TIMER.remain, total: TIMER.total, completedRounds: TIMER.completedRounds, savedAt: Date.now()
      }));
    } catch (e) {}
  }
  function restoreTimer() {
    try {
      var raw = localStorage.getItem(TIMER_KEY);
      if (!raw) return;
      var t = JSON.parse(raw);
      if (!t || typeof t.remain !== 'number') return;
      TIMER.subject = subjects().indexOf(t.subject) > -1 ? t.subject : subjects()[0];
      TIMER.mode = t.mode === 'break' ? 'break' : 'work';
      TIMER.total = t.total || timerTotalSeconds();
      TIMER.completedRounds = t.completedRounds || 0;
      TIMER.remain = t.remain;
      if (t.running) {
        var elapsed = Math.floor((Date.now() - (t.savedAt || Date.now())) / 1000);
        TIMER.remain = Math.max(0, t.remain - elapsed);
        if (TIMER.remain > 0) { TIMER.running = true; TIMER.interval = setInterval(tick, 1000); }
        else { TIMER.running = false; onTimerComplete(); }
      }
    } catch (e) {}
  }
  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      var note = function (freq, t0, dur) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t0);
        g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + dur + 0.05);
      };
      note(880, 0, 0.25); note(660, 0.28, 0.25); note(990, 0.56, 0.4);
    } catch (e) {}
  }

  function openModal(title, bodyHTML, actionsHTML) {
    document.body.style.overflow = 'hidden';
    var root = $('#modal-root');
    root.innerHTML =
      '<div class="modal-mask"><div class="modal">' +
      '<div class="modal-head"><h3>' + esc(title) + '</h3><button class="modal-close" id="modal-close">×</button></div>' +
      bodyHTML + (actionsHTML ? '<div class="modal-actions">' + actionsHTML + '</div>' : '') +
      '</div></div>';
    $('#modal-close').onclick = closeModal;
    $$('[data-close]', root).forEach(function (b) { b.onclick = closeModal; });
    var mask = $('.modal-mask', root);
    mask.addEventListener('click', function (e) { if (e.target === mask) closeModal(); });
  }
  function closeModal() {
    $('#modal-root').innerHTML = '';
    document.body.style.overflow = '';
  }
  function confirmModal(title, message, onOk, okLabel) {
    openModal(title,
      '<p class="muted" style="margin:4px 0">' + esc(message) + '</p>',
      '<button class="btn btn-ghost" data-close>取消</button>' +
      '<button class="btn btn-danger-ghost" id="confirm-yes">' + esc(okLabel || '确定') + '</button>');
    $('#confirm-yes').onclick = function () { closeModal(); onOk(); };
  }

  function cardModal(id) {
    var c = id ? state.cards.find(function (x) { return x.id === id; }) : null;
    openModal(c ? '编辑卡片' : '新卡片',
      '<div class="form-row-2">' +
      '<div><label class="f-label">科目</label><select id="m-card-subject">' + subjectOptions(c ? c.subject : subjects()[0]) + '</select></div>' +
      '<div><label class="f-label">范围/标签</label><input type="text" id="m-card-chapter" maxlength="40" value="' + esc(c ? c.chapter : '') + '" placeholder="如：第4章 / 高频考点"></div>' +
      '</div>' +
      '<label class="f-label">问题（正面）</label>' +
      '<textarea id="m-card-q" rows="3" placeholder="如：这个概念的定义？">' + esc(c ? c.q : '') + '</textarea>' +
      '<label class="f-label">答案（背面）</label>' +
      '<textarea id="m-card-a" rows="5" placeholder="用自己的话写答案，关键词优先">' + esc(c ? c.a : '') + '</textarea>',
      '<button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="m-save">保存</button>');
    $('#m-save').onclick = function () {
      var q = $('#m-card-q').value.trim(), a = $('#m-card-a').value.trim();
      if (!q || !a) { toast('问题和答案都要填'); return; }
      if (c) { c.subject = $('#m-card-subject').value; c.chapter = $('#m-card-chapter').value; c.q = q; c.a = a; }
      else {
        state.cards.push({ id: uid(), subject: $('#m-card-subject').value, chapter: $('#m-card-chapter').value, q: q, a: a, reps: 0, ease: 2.5, interval: 0, lapses: 0, due: todayStr(), addedAt: todayStr() });
      }
      reviewQueue = null; closeModal(); save(); renderAll();
    };
  }
  function delCard(id) {
    confirmModal('删除卡片', '确定删除这张卡片吗？', function () {
      state.cards = state.cards.filter(function (x) { return x.id !== id; });
      reviewQueue = null; save(); renderAll();
    }, '删除');
  }
  function noteModal(id) {
    var n = id ? state.notes.find(function (x) { return x.id === id; }) : null;
    openModal(n ? '编辑笔记' : '新笔记',
      '<label class="f-label">标题</label>' +
      '<input type="text" id="m-note-title" maxlength="80" value="' + esc(n ? n.title : '') + '" placeholder="笔记标题">' +
      '<div class="form-row-2" style="margin-top:10px">' +
      '<div><label class="f-label">科目</label><select id="m-note-subject">' + subjectOptions(n ? n.subject : subjects()[0]) + '</select></div>' +
      '<div><label class="f-label">范围/标签</label><input type="text" id="m-note-chapter" maxlength="40" value="' + esc(n ? n.chapter : '') + '" placeholder="如：第3章"></div>' +
      '</div>' +
      '<label class="f-label">内容</label>' +
      '<textarea id="m-note-body" rows="9" placeholder="推荐四行法：是什么→解决什么问题→工作流程/做法→关键字">' + esc(n ? n.body : '') + '</textarea>' +
      '<button type="button" class="tpl-btn" id="m-note-tpl">填入「四行法」模板</button>',
      '<button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="m-save">保存</button>');
    $('#m-note-tpl').onclick = function () {
      $('#m-note-body').value = '是什么：' + String.fromCharCode(10, 10) + '解决什么问题：' + String.fromCharCode(10, 10) + '怎么做（流程/步骤）：' + String.fromCharCode(10, 10) + '关键字：';
    };
    $('#m-save').onclick = function () {
      var title = $('#m-note-title').value.trim() || '未命名笔记';
      var body = $('#m-note-body').value;
      if (!body.trim()) { toast('笔记内容不能为空'); return; }
      if (n) { n.title = title; n.subject = $('#m-note-subject').value; n.chapter = $('#m-note-chapter').value; n.body = body; n.updatedAt = todayStr(); }
      else { state.notes.unshift({ id: uid(), title: title, subject: $('#m-note-subject').value, chapter: $('#m-note-chapter').value, body: body, updatedAt: todayStr() }); }
      closeModal(); save(); renderAll();
    };
  }
  function viewNote(id) {
    var n = state.notes.find(function (x) { return x.id === id; });
    if (!n) return;
    openModal(n.title,
      '<div class="rc-meta" style="margin-top:4px">' + chipHTML(n.subject) +
      '<span class="chip chip-ghost">' + esc(n.chapter || '未分类') + '</span>' +
      '<span class="chip chip-ghost">' + fmtDateCN(n.updatedAt) + '</span></div>' +
      '<div style="white-space:pre-wrap;font-size:14px;line-height:1.7;word-break:break-word">' + esc(n.body) + '</div>',
      '<button class="btn btn-ghost" data-close>关闭</button><button class="btn btn-ghost" id="m-edit">编辑</button>');
    $('#m-edit').onclick = function () { closeModal(); noteModal(id); };
  }
  function delNote(id) {
    confirmModal('删除笔记', '确定删除这篇笔记吗？', function () {
      state.notes = state.notes.filter(function (x) { return x.id !== id; });
      save(); renderAll();
    }, '删除');
  }
  function errorModal(id) {
    var er = id ? state.errors.find(function (x) { return x.id === id; }) : null;
    openModal(er ? '编辑错题' : '新错题',
      '<div class="form-row-2">' +
      '<div><label class="f-label">科目</label><select id="m-err-subject">' + subjectOptions(er ? er.subject : subjects()[0]) + '</select></div>' +
      '<div><label class="f-label">范围/标签</label><input type="text" id="m-err-chapter" maxlength="40" value="' + esc(er ? er.chapter : '') + '"></div>' +
      '</div>' +
      '<label class="f-label">题目</label>' +
      '<textarea id="m-err-q" rows="3" placeholder="原题或提问">' + esc(er ? er.q : '') + '</textarea>' +
      '<label class="f-label">我当时写的 / 想的（错因）</label>' +
      '<textarea id="m-err-my" rows="3">' + esc(er ? er.my : '') + '</textarea>' +
      '<label class="f-label">正确答案 / 要点</label>' +
      '<textarea id="m-err-a" rows="4">' + esc(er ? er.a : '') + '</textarea>',
      '<button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="m-save">保存</button>');
    $('#m-save').onclick = function () {
      var q = $('#m-err-q').value.trim();
      if (!q) { toast('题目不能为空'); return; }
      var data = { subject: $('#m-err-subject').value, chapter: $('#m-err-chapter').value, q: q, my: $('#m-err-my').value.trim(), a: $('#m-err-a').value.trim() };
      if (er) Object.assign(er, data);
      else state.errors.unshift(Object.assign({ id: uid(), mastered: false, createdAt: todayStr() }, data));
      closeModal(); save(); renderAll();
    };
  }
  function viewError(id) {
    var er = state.errors.find(function (x) { return x.id === id; });
    if (!er) return;
    openModal(er.q,
      '<div class="rc-meta" style="margin-top:4px">' + chipHTML(er.subject) +
      '<span class="chip chip-ghost">' + esc(er.chapter || '未分类') + '</span></div>' +
      (er.my ? '<div class="f-label" style="color:var(--red)">我当时写的 / 想的</div><div style="white-space:pre-wrap;font-size:13.5px;color:var(--red);margin-bottom:10px">' + esc(er.my) + '</div>' : '') +
      '<div class="f-label" style="color:var(--green)">正确答案 / 要点</div>' +
      '<div style="white-space:pre-wrap;font-size:14px;color:var(--green)">' + esc(er.a) + '</div>',
      '<button class="btn btn-ghost" data-close>关闭</button><button class="btn btn-ghost" id="m-edit">编辑</button>' +
      '<button class="btn btn-ghost" id="m-master">' + (er.mastered ? '标为未掌握' : '标为已掌握') + '</button>');
    $('#m-edit').onclick = function () { closeModal(); errorModal(id); };
    $('#m-master').onclick = function () { toggleError(id); closeModal(); };
  }
  function delError(id) {
    confirmModal('删除错题', '确定删除这道错题吗？', function () {
      state.errors = state.errors.filter(function (x) { return x.id !== id; });
      save(); renderAll();
    }, '删除');
  }
  function toggleError(id) {
    var er = state.errors.find(function (x) { return x.id === id; });
    if (!er) return;
    er.mastered = !er.mastered;
    save(); renderAll();
  }

  var planDate = todayStr();
  function filterChipsHTML(scope) {
    var arr = ['全部'].concat(subjects());
    return arr.map(function (f) {
      var cur = scope === 'card' ? cardFilter : (scope === 'note' ? noteFilter : errFilter);
      var act = scope === 'card' ? 'filter-cards' : scope === 'note' ? 'filter-notes' : 'filter-errors';
      return '<button class="fchip' + (cur === f ? ' active' : '') + '" data-action="' + act + '" data-f="' + f + '">' + f + '</button>';
    }).join('');
  }

  function renderToday() {
    var now = new Date(), today = todayStr();
    var h = now.getHours();
    var greet = h < 6 ? '夜深了' : (h < 12 ? '早上好' : (h < 18 ? '下午好' : '晚上好'));
    $('#today-title').textContent = fmtDateCN(today);
    var examLabel = state.settings.examLabel || '考试';
    $('#today-sub').textContent = greet + '，目标：' + examLabel + '，今天也要上岸一点';
    var streak = calcStreak();
    $('#today-streak').innerHTML = '<svg class="ic"><use href="#i-flame"/></svg>' + (streak > 0 ? streak + ' 天' : '今天打卡');
    var exam = state.settings.examDate;
    var days = daysUntil(exam);
    var pct = Math.max(0, Math.min(100, Math.round((210 - Math.max(days, 0)) / 210 * 100)));
    $('#countdown-card').innerHTML =
      '<div class="cc-label">距 离 ' + esc(examLabel) + '</div>' +
      '<div class="cc-days"><b>' + (days >= 0 ? days : 0) + '</b><span>天</span></div>' +
      '<div class="cc-sub">' + (state.settings.school ? esc(state.settings.school) + ' · ' : '') + fmtDateCN(exam) + '</div>' +
      '<div class="cc-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="cc-foot"><span>' + esc(examLabel) + '</span><span>整体进度约 ' + pct + '%</span></div>';
    var focusToday = minutesOn(today);
    var tasksToday = state.tasks.filter(function (t) { return t.date === today; });
    var doneToday = tasksToday.filter(function (t) { return t.done; }).length;
    var dueCount = state.cards.filter(function (c) { return c.due <= today; }).length;
    $('#today-mini').innerHTML =
      msItem(focusToday, '今日专注(分)') + msItem(doneToday + '/' + tasksToday.length, '今日任务') +
      msItem(dueCount, '到期卡片') + msItem(streak, '连续打卡');
    var todayOrder = [];
    (typeof SUBJECTS !== 'undefined' ? SUBJECTS : (typeof subjects === 'function' ? subjects() : [])).forEach(function (s) { todayOrder.push(s); });
    tasksToday.forEach(function (t) { if (todayOrder.indexOf(t.subject) < 0) todayOrder.push(t.subject); });
    var namedColor = { '英语': '#2f6db3', '计网': '#0f766e', '其他': '#7a5fc0' };
    var pal2 = ['#0f766e', '#2f6db3', '#7a5fc0', '#b45309', '#16924a', '#c2255c', '#475569', '#c2410c'];
    function subCol2(s) {
      if (namedColor[s]) return namedColor[s];
      var arr = typeof subjects === 'function' ? subjects() : null;
      var idx = arr ? arr.indexOf(s) : -1;
      return pal2[(idx < 0 ? 0 : idx) % pal2.length];
    }
    var list = $('#today-tasks');
    if (!tasksToday.length) {
      list.innerHTML = '<li class="empty">今天还没有任务，用下面的输入框加一条吧</li>';
    } else {
      var ghtml = '';
      todayOrder.forEach(function (sub) {
        var arr = tasksToday.filter(function (t) { return t.subject === sub; });
        if (!arr.length) return;
        var dn = arr.filter(function (t) { return t.done; }).length;
        var col = subCol2(sub);
        var rows = arr.slice().sort(function (x, y) { return (x.done ? 1 : 0) - (y.done ? 1 : 0); }).map(function (t) {
          var ic = t.done ? '<svg class="ic"><use href="#i-check"/></svg>' : '';
          return '<li class="task-item' + (t.done ? ' done' : '') + '">' +
            '<button class="task-check" data-action="toggle-task" data-id="' + t.id + '" title="标记完成">' + ic + '</button>' +
            '<div class="task-body"><div class="task-title">' + esc(t.title) + '</div></div>' +
            '<div class="task-actions">' +
            '<button data-action="edit-task" data-id="' + t.id + '" title="编辑"><svg class="ic"><use href="#i-edit"/></svg></button>' +
            '<button data-action="del-task" data-id="' + t.id + '" title="删除"><svg class="ic"><use href="#i-trash"/></svg></button>' +
            '</div></li>';
        }).join('');
        ghtml += '<div class="tg"><div class="tg-head">' +
          '<span class="tg-dot" style="background:' + col + '"></span>' +
          '<b>' + esc(sub) + '</b>' +
          '<span class="tg-count">' + dn + '/' + arr.length + '</span>' +
          '<div class="tg-prog"><i style="width:' + (arr.length ? Math.round(dn / arr.length * 100) : 0) + '%;background:' + col + '"></i></div>' +
          '</div><ul class="task-list">' + rows + '</ul></div>';
      });
      list.innerHTML = ghtml;
    }
    $('#today-task-count').textContent = doneToday + ' / ' + tasksToday.length;
    var day = state.days[today] || { baodi: [false, false, false], words: 0 };
    var baodiTexts = state.settings.baodi || ['记忆 30 分钟', '主科学习 30 分钟', '练习 30 分钟'];
    $('#baodi-list').innerHTML = baodiTexts.map(function (text, i) {
      var on = day.baodi[i];
      return '<div class="baodi-item' + (on ? ' on' : '') + '" data-action="toggle-baodi" data-i="' + i + '">' +
        '<span class="task-check">' + (on ? '<svg class="ic"><use href="#i-check"/></svg>' : '') + '</span>' +
        '<span>' + esc(text) + '</span></div>';
    }).join('');
    var wordsNow = day.words || 0;
    var wordsTarget = state.settings.wordTarget || 40;
    var wlabel = wordLabel();
    var wpct = wordsTarget > 0 ? Math.min(100, Math.round(wordsNow / wordsTarget * 100)) : 0;
    var wordsEl = $('#words-tracker');
    if (wordsEl) {
      wordsEl.innerHTML =
        '<div class="words-info"><b>' + wlabel + ' ' + wordsNow + ' / ' + wordsTarget + '</b>' +
        '<span class="muted">' + (wordsNow >= wordsTarget ? '目标达成，漂亮！' : '每天 ' + wordsTarget + ' 个') + '</span></div>' +
        '<div class="words-bar"><i style="width:' + wpct + '%"></i></div>' +
        '<div class="words-btns">' +
        '<button class="btn btn-ghost btn-sm" data-action="add-words" data-n="10">+10</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="add-words" data-n="20">+20</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="add-words" data-n="-10">-10</button>' +
        '</div>';
    }
    var reviewedToday = state.reviews.filter(function (r) { return r.date === today; }).length;
    var reviewEl = $('#today-review');
    if (reviewEl) {
      if (dueCount > 0) {
        reviewEl.innerHTML = '<div class="review-cta"><div><b>有 ' + dueCount + ' 张卡片到期</b>' +
          '<span class="muted">花几分钟过一遍，记忆更牢固</span></div>' +
          '<button class="btn btn-primary btn-sm" data-goto="review">去复习 ›</button></div>';
      } else {
        reviewEl.innerHTML = '<div class="review-cta"><div><b>今日复习已清空 🎉</b>' +
          '<span class="muted">已复习 ' + reviewedToday + ' 张，可以抽题自测保持手感</span></div>' +
          '<button class="btn btn-ghost btn-sm" data-goto="review">去自测 ›</button></div>';
      }
      $('#review-due-count').textContent = reviewedToday ? '今日已复习 ' + reviewedToday + ' 张' : '';
    }
    var chk = $('#checklist');
    if (chk) {
      chk.innerHTML = state.checklist.map(function (c) {
        return '<div class="check-item' + (c.done ? ' on' : '') + '" data-action="toggle-check" data-id="' + c.id + '">' +
          '<span class="task-check">' + (c.done ? '<svg class="ic"><use href="#i-check"/></svg>' : '') + '</span>' +
          '<span>' + esc(c.text) + '</span></div>';
      }).join('');
      if (!state.checklist.length) chk.innerHTML = '<div class="empty">清单为空。去「设置与备份」重新生成计划骨架。</div>';
    }
  }

  function renderPlan() {
    var dateEl = $('#plan-date');
    dateEl.textContent = fmtDateCN(planDate);
    dateEl.classList.toggle('is-today', planDate === todayStr());
    var tasks = state.tasks.filter(function (t) { return t.date === planDate; });
    $('#plan-tasks').innerHTML = tasks.map(taskItemHTML).join('');
    $('#plan-empty').classList.toggle('hidden', tasks.length > 0);
    var d = parseDate(planDate);
    var weekStart = addDaysStr(planDate, -((d.getDay() + 6) % 7));
    var html = '';
    var weekNames = '一二三四五六日';
    for (var i = 0; i < 7; i++) {
      var dd = addDaysStr(weekStart, i);
      var dayTasks = state.tasks.filter(function (t) { return t.date === dd; });
      var done = dayTasks.filter(function (t) { return t.done; }).length;
      var cls = dayTasks.length && done === dayTasks.length ? 'full' : (done > 0 ? 'part' : '');
      html += '<div class="wo-day' + (dd === todayStr() ? ' today' : '') + '">' +
        '<div class="wo-dot ' + cls + '"></div><span>' + weekNames.charAt(i) + '</span>' +
        '<b>' + done + '/' + dayTasks.length + '</b></div>';
    }
    $('#week-overview').innerHTML = html;
  }

  function renderFocus() {
    $('#focus-subjects').innerHTML = subjects().map(function (s) {
      var c = subColor(s);
      var active = TIMER.subject === s;
      return '<button class="subj-chip' + (active ? ' active' : '') + '" data-subject="' + s + '"' +
        (active ? ' style="background:' + c.fg + ';border-color:' + c.fg + '"' : '') + '>' + s + '</button>';
    }).join('');
    var today = todayStr();
    var todaySessions = state.sessions.filter(function (s) { return s.date === today; });
    var todayMin = todaySessions.reduce(function (a, s) { return a + s.minutes; }, 0);
    var weekMin = state.sessions.filter(function (s) { return s.date >= addDaysStr(today, -6); }).reduce(function (a, s) { return a + s.minutes; }, 0);
    var totalMin = state.sessions.reduce(function (a, s) { return a + s.minutes; }, 0);
    $('#focus-today-stats').innerHTML =
      msItem(todayMin, '今日分钟') + msItem(todaySessions.length, '今日番茄') +
      msItem(weekMin, '近7天分钟') + msItem(Math.round(totalMin / 60 * 10) / 10, '累计小时');
    var log = $('#focus-log');
    var items = todaySessions.slice(0, 20);
    log.innerHTML = items.map(function (s) {
      var dt = new Date(s.at);
      var hm = pad2(dt.getHours()) + ':' + pad2(dt.getMinutes());
      return '<li><svg class="ic"><use href="#i-focus"/></svg>' + chipHTML(s.subject) +
        '<span class="s-at">' + hm + '</span><span class="s-time">' + s.minutes + ' 分钟</span></li>';
    }).join('');
    $('#focus-log-empty').style.display = items.length ? 'none' : '';
    updateTimerUI();
  }

  function renderReview() {
    ensureQueue();
    var today = todayStr();
    var reviewedToday = state.reviews.filter(function (r) { return r.date === today; }).length;
    var mastered = state.cards.filter(function (c) { return c.interval >= 21; }).length;
    $('#review-stats').innerHTML =
      msItem(Math.max(0, reviewQueue.length - reviewPos), '待复习') +
      msItem(reviewedToday, '今日已复习') + msItem(state.cards.length, '卡片总数') + msItem(mastered, '已掌握');
    var stage = $('#review-stage');
    var cardWrap = $('.review-card', stage);
    var doneEl = $('#review-done');
    if (reviewPos >= reviewQueue.length) {
      cardWrap.classList.add('hidden');
      doneEl.classList.remove('hidden');
      $('#review-done-title').textContent = reviewedToday > 0 ? '今日复习完成' : '今日没有到期卡片';
      $('#review-done-sub').textContent = reviewedToday > 0 ? '共复习 ' + reviewedToday + ' 张卡片，明天再见' : '休息一下，或去添加几张新卡片';
      $('#review-progress').textContent = '';
    } else {
      cardWrap.classList.remove('hidden');
      doneEl.classList.add('hidden');
      var card = state.cards.find(function (c) { return c.id === reviewQueue[reviewPos]; });
      if (!card) { reviewPos++; renderReview(); return; }
      var rcSub = $('#rc-subject');
      if (rcSub) rcSub.outerHTML = chipHTML(card.subject);
      var rcCh = $('#rc-chapter');
      if (rcCh) rcCh.textContent = card.chapter || '';
      $('#rc-q').textContent = card.q;
      $('#rc-a').textContent = card.a;
      $('#rc-a').classList.add('hidden');
      $('#rc-reveal').classList.remove('hidden');
      $('#grade-btns').classList.add('hidden');
      $('#review-progress').textContent = '剩余 ' + (reviewQueue.length - reviewPos) + ' 张';
    }
    renderCardLibrary();
    renderAI();
  }

  var cardFilter = '全部';
  function renderCardLibrary() {
    $('#card-filter').innerHTML = filterChipsHTML('card');
    var cards = cardFilter === '全部' ? state.cards : state.cards.filter(function (c) { return c.subject === cardFilter; });
    $('#card-count').textContent = '共 ' + state.cards.length + ' 张';
    $('#card-list').innerHTML = cards.map(function (c) {
      var dueTxt = c.due < todayStr() ? '已到期' : '下次 ' + fmtDateCN(c.due);
      return '<li><div class="card-item-body">' +
        '<div class="card-item-q">' + esc(c.q) + '</div>' +
        '<details class="card-item-a"><summary>查看答案</summary>' + esc(c.a) + '</details>' +
        '<div class="card-item-meta">' + chipHTML(c.subject) +
        (c.chapter ? '<span>' + esc(c.chapter) + '</span>' : '') +
        '<span>' + dueTxt + '</span><span>间隔' + c.interval + '天 · 复习' + (c.reps || 0) + '次</span></div>' +
        '</div><div class="task-actions">' +
        '<button data-action="edit-card" data-id="' + c.id + '" title="编辑"><svg class="ic"><use href="#i-edit"/></svg></button>' +
        '<button data-action="del-card" data-id="' + c.id + '" title="删除"><svg class="ic"><use href="#i-trash"/></svg></button>' +
        '</div></li>';
    }).join('');
    $('#card-list-empty').classList.toggle('hidden', cards.length > 0);
  }

  var aiState = { subject: subjects()[0], topic: '', count: 3, loading: false, items: [] };
  function aiFind(id) {
    for (var i = 0; i < aiState.items.length; i++) if (aiState.items[i].id === id) return aiState.items[i];
    return null;
  }
  function callDeepSeek(messages, onOk, onErr) {
    var key = (state.settings.deepseekKey || '').trim();
    var useProxy = location.protocol === 'http:';
    var url = useProxy ? 'api/deepseek' : 'https://api.deepseek.com/chat/completions';
    var payload = { key: key, model: 'deepseek-chat', messages: messages, temperature: 0.7, max_tokens: 4000, response_format: { type: 'json_object' } };
    var onFail = function (msg) { toast('AI 调用失败：' + msg); if (onErr) onErr(); };
    try {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (res) {
          res.json().then(function (j) {
            if (!res.ok) { onFail((j && j.error && j.error.message) || ('HTTP ' + res.status)); return; }
            var content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
            if (!content) { onFail('返回内容为空'); return; }
            onOk(content);
          }).catch(function () { onFail('响应解析失败'); });
        }).catch(function () { onFail('网络不通（用「启动.bat」打开可走本地代理）'); });
    } catch (e) { onFail(e.message); }
  }
  function stripFences(content) {
    var text = String(content).trim();
    if (text.charCodeAt(0) === 96) {
      var nl = text.indexOf(String.fromCharCode(10));
      text = nl > -1 ? text.slice(nl + 1) : '';
      var end = text.lastIndexOf(String.fromCharCode(96));
      if (end > -1) text = text.slice(0, end);
      text = text.trim();
    }
    return text;
  }
  function parseAIQuestions(content) {
    try {
      var obj = JSON.parse(stripFences(content));
      var qs = obj.questions || obj;
      if (Array.isArray(qs)) {
        return qs.filter(function (x) { return x && x.q; }).map(function (x) {
          return { id: uid(), q: String(x.q), a: String(x.a || ''), my: '', revealed: false, grading: false, gradingLoading: false, feedback: '', subject: aiState.subject, chapter: aiState.topic };
        });
      }
    } catch (e) {}
    return null;
  }
  function parseAIFeedback(content) {
    try {
      var obj = JSON.parse(stripFences(content));
      var parts = [];
      if (obj.score !== undefined) parts.push('评分 ' + obj.score + '/100');
      if (Array.isArray(obj.hit) && obj.hit.length) parts.push('命中：' + obj.hit.join('、'));
      if (Array.isArray(obj.miss) && obj.miss.length) parts.push('遗漏：' + obj.miss.join('、'));
      if (obj.advice) parts.push('建议：' + obj.advice);
      if (parts.length) return parts.join(' ｜ ');
      return String(content);
    } catch (e) { return String(content); }
  }
  function renderAI() {
    var subEl = $('#ai-subject');
    if (subEl) subEl.innerHTML = subjectOptions(aiState.subject);
    var cntEl = $('#ai-count');
    if (cntEl) cntEl.innerHTML = [3, 5, 10, 15].map(function (n) {
      return '<option value="' + n + '"' + (n === aiState.count ? ' selected' : '') + '>' + n + ' 道</option>';
    }).join('');
    var loadEl = $('#ai-loading');
    if (loadEl) loadEl.classList.toggle('hidden', !aiState.loading);
    var box = $('#ai-items');
    if (!box) return;
    var hasKey = !!(state.settings.deepseekKey || '').trim();
    if (aiState.items.length) {
      box.innerHTML = aiState.items.map(function (it, idx) {
        return '<div class="ai-item">' +
          '<div class="ai-q">' + (idx + 1) + '. ' + esc(it.q) + '</div>' +
          (it.revealed ? '<div class="ai-a">' + esc(it.a || '（无参考答案）') + '</div>' : '') +
          (it.grading ? '<textarea class="ai-my" data-action="ai-type" data-id="' + it.id + '" placeholder="先自己写答案（要点先行），再点「提交批改」">' + esc(it.my || '') + '</textarea>' : '') +
          (it.feedback ? '<div class="ai-feedback">' + esc(it.feedback) + '</div>' : '') +
          '<div class="ai-actions">' +
          '<button class="btn btn-ghost btn-sm" data-action="ai-reveal" data-id="' + it.id + '">' + (it.revealed ? '收起答案' : '显示答案') + '</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="ai-grade" data-id="' + it.id + '">' + (it.grading ? (it.gradingLoading ? '批改中…' : '提交批改') : 'AI 批改') + '</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="ai-to-card" data-id="' + it.id + '">收进卡片</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="ai-to-error" data-id="' + it.id + '">进错题本</button>' +
          '</div></div>';
      }).join('');
    } else if (!aiState.loading) {
      box.innerHTML = '<div class="empty">' +
        (hasKey ? '选科目、填范围（如：第4章 / 不定积分 / 长难句），点「出题」' : '先在「设置与备份」填入 DeepSeek API Key，就能让 AI 按你的科目出题') + '</div>';
    }
  }

  function renderMaterials() {
    var list = $('#materials-list');
    if (!list) return;
    if (state.materials.length) {
      list.innerHTML = state.materials.map(function (m) {
        return '<li><div class="mat-row">' +
          '<a class="mat-title" href="' + esc(m.url) + '" target="_blank" rel="noopener">' +
          '<svg class="ic"><use href="#i-book"/></svg>' + esc(m.title) + '</a>' +
          (m.tag ? '<span class="mat-tagline">' + esc(m.tag) + '</span>' : '') +
          '<button class="mat-del" data-action="del-mat" data-id="' + m.id + '" title="删除"><svg class="ic"><use href="#i-trash"/></svg></button>' +
          '</div></li>';
      }).join('');
    } else {
      list.innerHTML = '<li class="empty">还没有资料链接。点右上「添加」，把课本 PDF、课件、真题的在线地址存进来（电脑手机都能打开）。</li>';
    }
    var mc = $('#materials-count');
    if (mc) mc.textContent = state.materials.length ? '共 ' + state.materials.length + ' 个' : '';
  }
  function matModal() {
    openModal('添加资料链接',
      '<label class="f-label">名称</label><input type="text" id="m-mat-title" maxlength="60" placeholder="如：历年真题 PDF">' +
      '<label class="f-label">网址（PDF / 网页链接）</label><input type="text" id="m-mat-url" placeholder="https://...">' +
      '<label class="f-label">标签（可选：如 第4章 / 真题）</label><input type="text" id="m-mat-tag" maxlength="30">',
      '<button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="m-save">保存</button>');
    $('#m-save').onclick = function () {
      var title = $('#m-mat-title').value.trim();
      var url = $('#m-mat-url').value.trim();
      if (!title || !url) { toast('名称和网址都要填'); return; }
      state.materials.push({ id: uid(), title: title, url: url, tag: $('#m-mat-tag').value.trim() });
      closeModal(); save(); renderAll();
    };
  }
  function delMat(id) {
    state.materials = state.materials.filter(function (m) { return m.id !== id; });
    save(); renderMaterials();
  }

  function renderMore() {
    $('#about-body').innerHTML =
      '<ul class="about-list">' +
      '<li><b>这是什么</b><span>上岸计划 · 通用备考版：按你的考试类型 / 学校 / 专业配置的私人备考助手。</span></li>' +
      '<li><b>数据</b><span>全部存在本机浏览器里，不上传服务器。换设备用「设置与备份」导出/导入。</span></li>' +
      '<li><b>重新配置</b><span>换了目标学校或科目？「设置与备份」→「重新生成计划骨架」即可。</span></li>' +
      '<li><b>AI 用法</b><span>AI 是私教不是代写：答案自己先写，AI 负责出题与批改。</span></li>' +
      '</ul>';
  }
  function renderStats() {
    var totalMin = state.sessions.reduce(function (a, s) { return a + s.minutes; }, 0);
    $('#stats-summary').innerHTML =
      sgItem(Math.round(totalMin / 60 * 10) / 10, '小时', '累计专注', 'sg-accent') +
      sgItem(totalActiveDays(), '天', '累计打卡', 'sg-amber') +
      sgItem(state.tasks.filter(function (t) { return t.done; }).length, '项', '完成任务') +
      sgItem(state.reviews.length, '次', '复习卡片');
    barChart($('#chart-focus'), function (d) { return minutesOn(d); }, '', function (v) { return v || ''; });
    barChart($('#chart-tasks'), function (d) {
      var ts = state.tasks.filter(function (t) { return t.date === d; });
      if (!ts.length) return 0;
      return Math.round(ts.filter(function (t) { return t.done; }).length / ts.length * 100);
    }, 'alt', function (v) { return v ? v + '%' : ''; });
    barChart($('#chart-cards'), function (d) {
      return state.reviews.filter(function (r) { return r.date === d; }).length;
    }, 'vio', function (v) { return v || ''; });
    var week = state.sessions.filter(function (s) { return s.date >= addDaysStr(todayStr(), -6); });
    var weekTotal = week.reduce(function (a, s) { return a + s.minutes; }, 0) || 1;
    $('#subject-breakdown').innerHTML = subjects().map(function (sub) {
      var m = week.filter(function (s) { return s.subject === sub; }).reduce(function (a, s) { return a + s.minutes; }, 0);
      var c = subColor(sub);
      return '<div class="sb-row"><span class="sb-name">' + sub + '</span>' +
        '<div class="sb-track"><div class="sb-fill" style="width:' + Math.round(m / weekTotal * 100) + '%;background:' + c.fg + '"></div></div>' +
        '<span class="sb-val">' + fmtDur(m) + '</span></div>';
    }).join('') || '<div class="empty">本周还没有专注记录</div>';
  }
  function barChart(el, getVal, cls, valLabel) {
    var days = [];
    for (var i = 6; i >= 0; i--) days.push(addDaysStr(todayStr(), -i));
    var vals = days.map(getVal);
    var max = Math.max.apply(null, vals.concat([1]));
    var names = ['日', '一', '二', '三', '四', '五', '六'];
    el.innerHTML = days.map(function (d, i) {
      var v = vals[i];
      var hPct = v > 0 ? Math.max(4, Math.round(v / max * 100)) : 0;
      return '<div class="bc-col"><div class="bc-val">' + valLabel(v) + '</div>' +
        '<div class="bc-bar-wrap"><div class="bc-bar ' + (cls || '') + '" style="height:' + hPct + '%"></div></div>' +
        '<div class="bc-day' + (d === todayStr() ? ' today' : '') + '">' + names[parseDate(d).getDay()] + '</div></div>';
    }).join('');
  }
  function renderGoals() {
    var exam = state.settings.examDate;
    var days = daysUntil(exam);
    var examLabel = state.settings.examLabel || '考试';
    var gDiv = $('#goals-countdown');
    if (gDiv) {
      gDiv.innerHTML = '<div class="countdown-card">' +
        '<div class="cc-label">距 离 ' + esc(examLabel) + '</div>' +
        '<div class="cc-days"><b>' + (days >= 0 ? days : 0) + '</b><span>天</span></div>' +
        '<div class="cc-sub">' + (state.settings.school ? esc(state.settings.school) + ' · ' : '') + fmtDateCN(exam) + '</div></div>';
    }
    var phasesEl = $('#phases');
    if (phasesEl) {
      phasesEl.innerHTML = (state.phases || []).map(function (p, i) {
        return '<li><div class="ph-body">' +
          '<div class="ph-title"><span class="ph-id">' + (i + 1) + '</span><span>' + esc(p.name) + '</span>' +
          '<span class="ph-time">' + esc(p.time || '') + '</span></div>' +
          '<div class="ph-lines">' + (p.lines || []).map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') +
          '</div></div></li>';
      }).join('') || '<div class="empty">还没有阶段，去设置里生成</div>';
    }
    var today = todayStr();
    var msEl = $('#milestones');
    if (msEl) {
      msEl.innerHTML = state.milestones.map(function (m) {
        var overdue = !m.done && m.due < today;
        var dueStyle = overdue ? ' style="color:var(--red);font-weight:700"' : '';
        return '<li class="task-item' + (m.done ? ' done' : '') + '">' +
          '<button class="task-check" data-action="toggle-milestone" data-id="' + m.id + '" title="标记完成">' +
          (m.done ? '<svg class="ic"><use href="#i-check"/></svg>' : '') + '</button>' +
          '<div class="task-body"><div class="task-title">' + esc(m.title) + '</div>' +
          '<div class="task-meta"><span class="chip chip-ghost">' + esc(m.cat || '节点') + '</span>' +
          '<span' + dueStyle + '>' + fmtDateCN(m.due) + (overdue ? ' · 已过期' : '') + '</span></div></div></li>';
      }).join('') || '<li class="empty">还没有关键节点，去设置里生成</li>';
    }
    var mygoals = $('#mygoals');
    if (mygoals) {
      mygoals.innerHTML = state.goals.map(function (g) {
        return '<li class="task-item' + (g.done ? ' done' : '') + '">' +
          '<button class="task-check" data-action="toggle-goal" data-id="' + g.id + '" title="标记完成">' +
          (g.done ? '<svg class="ic"><use href="#i-check"/></svg>' : '') + '</button>' +
          '<div class="task-body"><div class="task-title">' + esc(g.title) + '</div></div>' +
          '<div class="task-actions"><button data-action="del-goal" data-id="' + g.id + '" title="删除"><svg class="ic"><use href="#i-trash"/></svg></button></div></li>';
      }).join('');
      if (!state.goals.length) mygoals.innerHTML = '<li class="empty">把大目标拆成小目标，逐个击破</li>';
    }
  }

  var noteFilter = '全部';
  var noteSearch = '';
  var noteReadId = null;
  function openNoteReader(id) {
    var n = state.notes.find(function (x) { return x.id === id; });
    if (!n) return;
    noteReadId = id;
    var ov = $('#note-reader');
    if (!ov) return;
    $('#nr-title').textContent = n.title;
    $('#nr-body').textContent = n.body;
    $('#nr-meta').innerHTML = (typeof chipHTML === 'function'
      ? chipHTML(n.subject)
      : '<span class="chip chip-' + n.subject + '">' + n.subject + '</span>') +
      '<span class="nr-ch">' + esc(n.chapter || '未分类') + '</span>' +
      '<span class="nr-date">' + fmtDateCN(n.updatedAt) + '</span>';
    ov.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeNoteReader() {
    var ov = $('#note-reader');
    if (ov) ov.classList.add('hidden');
    document.body.style.overflow = '';
    noteReadId = null;
  }

  function renderNotes() {
    $('#notes-filter').innerHTML = filterChipsHTML('note');
    var q = (noteSearch || '').trim().toLowerCase();
    var notes = (noteFilter === '全部' ? state.notes : state.notes.filter(function (n) { return n.subject === noteFilter; }))
      .filter(function (n) {
        if (!q) return true;
        return ((n.title || '') + ' ' + (n.body || '') + ' ' + (n.chapter || '')).toLowerCase().indexOf(q) > -1;
      });
        var order = (typeof subjects === 'function' ? subjects() : []).slice();
    notes.forEach(function (n) { if (order.indexOf(n.subject) < 0) order.push(n.subject); });
    var ghtml = '';
    order.forEach(function (sub) {
      var arr = notes.filter(function (n) { return n.subject === sub; });
      if (!arr.length) return;
      ghtml += '<div class="note-group"><div class="note-group-head"><span class="tg-dot" style="background:#0f766e"></span><b>' + esc(sub) + '</b><span class="note-group-count">' + arr.length + '</span></div>';
      ghtml += arr.map(function (n) {
        return '<li class="note-card">' +
          '<div class="note-card-head">' +
          chipHTML(n.subject) +
          (n.chapter ? '<span class="note-card-ch">' + esc(n.chapter) + '</span>' : '') +
          '<div class="note-card-actions">' +
          '<button data-action="edit-note" data-id="' + n.id + '" title="编辑"><svg class="ic"><use href="#i-edit"/></svg></button>' +
          '<button data-action="del-note" data-id="' + n.id + '" title="删除"><svg class="ic"><use href="#i-trash"/></svg></button>' +
          '</div></div>' +
          '<div class="note-read" data-action="note-read" data-id="' + n.id + '">' +
          '<div class="note-card-title">' + esc(n.title) + '</div>' +
          '<div class="note-card-body">' + esc(n.body) + '</div>' +
          '</div>' +
          '<div class="note-card-foot">' + fmtDateCN(n.updatedAt) + ' 更新</div>' +
          '</li>';
      }).join('');
      ghtml += '</div>';
    });
    $('#notes-list').innerHTML = ghtml || '<div class="empty">没有匹配的笔记</div>';
    $('#notes-empty').classList.toggle('hidden', notes.length > 0);
  }

  var errFilter = '未掌握';
  function renderErrors() {
    var filters = ['未掌握', '已掌握', '全部'];
    $('#errors-filter').innerHTML = filters.map(function (f) {
      return '<button class="fchip' + (errFilter === f ? ' active' : '') + '" data-action="filter-errors" data-f="' + f + '">' + f + '</button>';
    }).join('');
    var errors = state.errors.filter(function (e) {
      if (errFilter === '全部') return true;
      return errFilter === '已掌握' ? e.mastered : !e.mastered;
    });
    $('#errors-list').innerHTML = errors.map(function (er) {
      return '<li><div class="err-body" data-action="view-error" data-id="' + er.id + '" style="cursor:pointer">' +
        '<div class="err-q">' + esc(er.q) + '</div>' +
        (er.my ? '<div class="err-my">✗ ' + esc(er.my) + '</div>' : '') +
        '<div class="err-ans">✓ ' + esc(er.a) + '</div>' +
        '<div class="err-meta">' + chipHTML(er.subject) +
        '<span>' + esc(er.chapter || '未分类') + '</span><span>' + fmtDateCN(er.createdAt) + '</span></div></div>' +
        (er.mastered ? '<span class="err-done">已掌握</span>' : '') +
        '<div class="err-actions">' +
        '<button data-action="toggle-error" data-id="' + er.id + '" title="切换掌握状态"><svg class="ic"><use href="#i-done"/></svg></button>' +
        '<button data-action="edit-error" data-id="' + er.id + '" title="编辑"><svg class="ic"><use href="#i-edit"/></svg></button>' +
        '<button data-action="del-error" data-id="' + er.id + '" title="删除"><svg class="ic"><use href="#i-trash"/></svg></button>' +
        '</div></li>';
    }).join('');
    $('#errors-empty').classList.toggle('hidden', errors.length > 0);
  }
  function renderSettings() {
    var s = state.settings;
    var setEl = $('#set-exam-type');
    if (setEl) {
      setEl.innerHTML = EXAM_TEMPLATES.map(function (t) {
        return '<option value="' + t.tpl + '"' + (s.examType === t.tpl ? ' selected' : '') + '>' + t.icon + ' ' + t.name + '</option>';
      }).join('');
      setEl.value = s.examType;
    }
    var map = [
      ['#set-label', s.examLabel || ''],
      ['#set-school', s.school || ''],
      ['#set-exam', s.examDate],
      ['#set-subjects', (s.subjects || []).join('，')],
      ['#set-words', s.wordTarget],
      ['#set-deepseek', s.deepseekKey || ''],
      ['#set-work', s.pomoWork],
      ['#set-break', s.pomoBreak],
      ['#set-long', s.pomoLong],
      ['#set-rounds', s.pomoRounds],
      ['#set-baodi1', (s.baodi || ['', '', ''])[0]],
      ['#set-baodi2', (s.baodi || ['', '', ''])[1]],
      ['#set-baodi3', (s.baodi || ['', '', ''])[2]]
    ];
    for (var i = 0; i < map.length; i++) { var el = $(map[i][0]); if (el) el.value = map[i][1]; }
    var tips = $('#settings-tips');
    if (tips) {
      tips.innerHTML =
        '<ul class="tips-list">' +
        '<li><b>电脑</b><span>双击「启动.bat」或直接打开 index.html。</span></li>' +
        '<li><b>手机 · 同WiFi</b><span>电脑运行「启动.bat」，手机用窗口里的 PHONE 地址打开。</span></li>' +
        '<li><b>分发给别人</b><span>整个文件夹打包发给对方，对方首次打开会进入「备考配置向导」，按自己的学校/专业设置即可。</span></li>' +
        '<li><b>数据</b><span>所有数据在本机浏览器；换设备用导出/导入。</span></li>' +
        '</ul>';
    }
  }
  function renderSideFoot() {
    var el = $('#side-foot');
    if (!el) return;
    var days = daysUntil(state.settings.examDate);
    el.innerHTML = '距 ' + esc(state.settings.examLabel || '考试') + ' <b>' + (days >= 0 ? days : 0) + '</b> 天<br>连续打卡 <b>' + calcStreak() + '</b> 天';
  }

  var RENDERS = {
    today: renderToday, plan: renderPlan, focus: renderFocus, review: renderReview,
    more: renderMore, stats: renderStats, goals: renderGoals, notes: renderNotes,
    errors: renderErrors, settings: renderSettings, materials: renderMaterials
  };
  function renderAll() {
    for (var k in RENDERS) {
      try { RENDERS[k](); } catch (err) { console.error('render ' + k, err); }
    }
    renderSideFoot();
    updateTimerUI();
  }

  function onboardStep(n) {
    var root = $('#onboard-root');
    if (!root) return;
    $$('.ob-step', root).forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-step') === String(n));
    });
    var prev = $('#ob-prev'); if (prev) prev.classList.toggle('hidden', n <= 1);
    var next = $('#ob-next'); if (next) next.classList.toggle('hidden', n >= 3);
    var fin = $('#ob-finish'); if (fin) fin.classList.toggle('hidden', n < 3);
    var bar = $('#ob-stepbar');
    if (bar) bar.textContent = '第 ' + n + ' / 3 步';
  }
  function openOnboard() {
    var root = $('#onboard-root');
    if (!root) return;
    root.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    onboardRenderPresets();
    onboardFill();
    onboardStep(1);
  }
  function closeOnboard() {
    var root = $('#onboard-root');
    if (root) root.style.display = 'none';
    document.body.style.overflow = '';
  }
  function onboardRenderPresets() {
    var grid = $('#ob-tplgrid');
    if (!grid) return;
    grid.innerHTML = EXAM_TEMPLATES.map(function (t) {
      return '<button type="button" class="ob-tpl" data-tpl="' + t.tpl + '">' +
        '<div class="ob-tpl-icon">' + t.icon + '</div>' +
        '<div class="ob-tpl-name">' + t.name + '</div>' +
        '<div class="ob-tpl-desc">' + esc(t.desc) + '</div></button>';
    }).join('');
  }
  function onboardPickTpl(tpl) {
    var t = findTemplate(tpl);
    $$('#onboard-root .ob-tpl').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tpl') === tpl);
    });
    /* 预填规则：仅当字段还是默认占位时才跟随模板；用户改过的就保留 */
    var labelEl = $('#ob-label');
    if (labelEl) {
      var lv = labelEl.value.trim();
      var isDefLabel = !lv || lv === '我的考试' || EXAM_TEMPLATES.some(function (x) { return x.name === lv; });
      if (isDefLabel) labelEl.value = t.name;
    }
    var subsEl = $('#ob-subjects');
    if (subsEl) {
      var sv = subsEl.value.trim();
      var isDefSubs = !sv || sv === '科目一，科目二' || sv === '科目一,科目二';
      if (isDefSubs) subsEl.value = t.subjects.join('，');
    }
    var ph = $('#ob-phaseinfo');
    if (ph) {
      ph.innerHTML = '<b>' + t.name + '</b>：将生成 ' + t.phases.length + ' 个阶段（' +
        t.phases.map(function (p) { return p.n; }).join(' → ') + '）和 ' + t.milestones.length + ' 个关键节点。';
    }
  }
  function onboardFill() {
    var s = state.settings;
    var t = findTemplate(s.examType);
    var labelEl = $('#ob-label');
    if (labelEl) labelEl.value = s.examLabel && s.examLabel !== t.name ? s.examLabel : t.name;
    var schoolEl = $('#ob-school');
    if (schoolEl) schoolEl.value = s.school || '';
    var subsEl = $('#ob-subjects');
    if (subsEl) subsEl.value = (s.subjects && s.subjects.length ? s.subjects : t.subjects).join('，');
    var wordsEl = $('#ob-words');
    if (wordsEl) wordsEl.value = s.wordTarget || 40;
    var dateEl = $('#ob-examdate');
    if (dateEl) dateEl.value = s.examDate || addDaysStr(todayStr(), 180);
    onboardPickTpl(s.examType);
  }
  function onboardFinish() {
    var activeTpl = $('#onboard-root .ob-tpl.active');
    var tpl = activeTpl ? activeTpl.getAttribute('data-tpl') : state.settings.examType;
    var label = ($('#ob-label').value || '').trim();
    var school = ($('#ob-school').value || '').trim();
    var examDate = $('#ob-examdate').value || addDaysStr(todayStr(), 180);
    var subs = ($('#ob-subjects').value || '').split(/[，,、;\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
    var words = parseInt($('#ob-words').value, 10) || 40;
    var firstRun = !state.meta.setupDone;
    state.meta.setupDone = true;
    applyTemplate({ tpl: tpl, label: label, school: school, examDate: examDate, subjects: subs, words: words }, firstRun);
    closeOnboard();
    save();
    renderAll();
    toast(firstRun ? '配置完成！已按你的目标生成阶段、节点与起步任务' : '已更新配置');
  }
  function reconfig() {
    confirmModal('重新生成计划骨架',
      '将按当前设置重建「阶段」和「关键节点」（你添加的任务、笔记、卡片、打卡记录都会保留）。确定继续吗？',
      function () {
        var tpl = $('#set-exam-type').value || 'other';
        var label = ($('#set-label').value || '').trim();
        var school = ($('#set-school').value || '').trim();
        var examDate = $('#set-exam').value;
        var subs = ($('#set-subjects').value || '').split(/[，,、;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
        applyTemplate({ tpl: tpl, label: label, school: school, examDate: examDate, subjects: subs }, false);
        save();
        renderAll();
        toast('已重建阶段与关键节点');
      }, '重建');
  }

  function addWords(n) {
    var today = todayStr();
    if (!state.days[today]) state.days[today] = { baodi: [false, false, false], words: 0 };
    if (!state.days[today].words) state.days[today].words = 0;
    state.days[today].words = Math.max(0, state.days[today].words + n);
    markActive(today);
    save(); renderToday();
  }
  function toggleBaodi(i) {
    var today = todayStr();
    if (!state.days[today]) state.days[today] = { baodi: [false, false, false], words: 0 };
    state.days[today].baodi[i] = !state.days[today].baodi[i];
    markActive(today);
    save(); renderToday();
  }
  function toggleCheck(id) {
    var c = state.checklist.find(function (x) { return x.id === id; });
    if (!c) return;
    c.done = !c.done;
    save(); renderToday();
  }
  function toggleMilestone(id) {
    var m = state.milestones.find(function (x) { return x.id === id; });
    if (!m) return;
    m.done = !m.done;
    save(); renderGoals();
  }
  function toggleGoal(id) {
    var g = state.goals.find(function (x) { return x.id === id; });
    if (!g) return;
    g.done = !g.done;
    if (g.done) markActive(todayStr());
    save(); renderGoals();
  }
  function delGoal(id) {
    state.goals = state.goals.filter(function (x) { return x.id !== id; });
    save(); renderGoals();
  }

  function exportData() {
    try {
      var payload = { app: 'shangan-gen', version: 1, exportedAt: new Date().toISOString(), data: state };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '上岸计划备份-' + todayStr().replace(/-/g, '') + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast('备份已导出');
    } catch (e) { toast('导出失败'); }
  }
  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        var data = parsed.data || parsed;
        if (!data || !Array.isArray(data.tasks) || !data.settings) throw new Error('bad');
        state = mergeDefaults(data);
        reviewQueue = null;
        save(); renderAll();
        toast('恢复成功');
      } catch (e) { toast('导入失败：文件格式不正确'); }
    };
    reader.onerror = function () { toast('读取文件失败'); };
    reader.readAsText(file);
  }

  function bindEvents() {
    document.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-view]');
      if (nav) { e.preventDefault(); showView(nav.getAttribute('data-view')); return; }
      var go = e.target.closest('[data-goto]');
      if (go) showView(go.getAttribute('data-goto'));
    });
    document.addEventListener('click', function (e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;
      var action = target.getAttribute('data-action');
      var id = target.getAttribute('data-id');
      var i = target.getAttribute('data-i');
      var f = target.getAttribute('data-f');
      var n = +target.getAttribute('data-n');
      switch (action) {
        case 'toggle-task': toggleTask(id); break;
        case 'edit-task': taskModal(id); break;
        case 'del-task': delTask(id); break;
        case 'toggle-baodi': toggleBaodi(+i); break;
        case 'add-words': addWords(n); break;
        case 'toggle-check': toggleCheck(id); break;
        case 'toggle-milestone': toggleMilestone(id); break;
        case 'toggle-goal': toggleGoal(id); break;
        case 'del-goal': delGoal(id); break;
        case 'filter-cards': cardFilter = f; renderCardLibrary(); break;
        case 'edit-card': cardModal(id); break;
        case 'del-card': delCard(id); break;
        case 'edit-note': noteModal(id); break;
        case 'note-read': openNoteReader(id); break;
        case 'view-note': viewNote(id); break;
        case 'del-note': delNote(id); break;
        case 'edit-error': errorModal(id); break;
        case 'view-error': viewError(id); break;
        case 'del-error': delError(id); break;
        case 'toggle-error': toggleError(id); break;
        case 'filter-notes': noteFilter = f; renderNotes(); break;
        case 'filter-errors': errFilter = f; renderErrors(); break;
        case 'del-mat': delMat(id); break;
        case 'ai-reveal': { var rIt = aiFind(id); if (rIt) { rIt.revealed = !rIt.revealed; renderAI(); } break; }
        case 'ai-grade': { var gIt = aiFind(id); if (gIt) aiGrade(gIt); break; }
        case 'ai-to-card': {
          var cIt = aiFind(id);
          if (!cIt) break;
          state.cards.push({ id: uid(), subject: cIt.subject, chapter: cIt.chapter, q: cIt.q, a: cIt.a || '', reps: 0, ease: 2.5, interval: 0, lapses: 0, due: todayStr(), addedAt: todayStr() });
          reviewQueue = null; save(); toast('已收进卡片库'); break;
        }
        case 'ai-to-error': {
          var eIt = aiFind(id);
          if (!eIt) break;
          state.errors.unshift({ id: uid(), subject: eIt.subject, chapter: eIt.chapter, q: eIt.q, my: eIt.my || '', a: eIt.a || '', mastered: false, createdAt: todayStr() });
          save(); toast('已记入错题本'); break;
        }
      }
    });
    document.addEventListener('input', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-action="ai-type"]') : null;
      if (!t) return;
      var it = aiFind(t.getAttribute('data-id'));
      if (it) it.my = t.value;
    });

    var or = $('#onboard-root');
    if (or) {
      or.addEventListener('click', function (e) {
        var tplBtn = e.target.closest('.ob-tpl');
        if (tplBtn) { onboardPickTpl(tplBtn.getAttribute('data-tpl')); return; }
        var go = e.target.closest('[data-ob]');
        if (!go) return;
        var act = go.getAttribute('data-ob');
        if (act === 'prev') { var p = parseInt($('#onboard-root .ob-step.active').getAttribute('data-step'), 10); onboardStep(Math.max(1, p - 1)); }
        else if (act === 'next') { var q = parseInt($('#onboard-root .ob-step.active').getAttribute('data-step'), 10); onboardStep(Math.min(3, q + 1)); }
        else if (act === 'finish') onboardFinish();
      });
    }
    var qa = $('#qa-input');
    if (qa) qa.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var title = qa.value.trim();
        if (!title) return;
        addTask(todayStr(), title, $('#qa-subject').value);
        qa.value = '';
      }
    });
    var pp = $('#plan-prev'); if (pp) pp.onclick = function () { planDate = addDaysStr(planDate, -1); renderPlan(); };
    var pn = $('#plan-next'); if (pn) pn.onclick = function () { planDate = addDaysStr(planDate, 1); renderPlan(); };
    var pt = $('#plan-today'); if (pt) pt.onclick = function () { planDate = todayStr(); renderPlan(); };
    var pa = $('#plan-add-btn'); if (pa) pa.onclick = function () {
      var title = $('#plan-add-title').value.trim();
      if (!title) { toast('先写点任务内容'); return; }
      addTask(planDate, title, $('#plan-add-subject').value);
      $('#plan-add-title').value = '';
    };
    var bs = $('#btn-start'); if (bs) bs.onclick = function () { TIMER.running ? pauseTimer() : startTimer(); };
    var br = $('#btn-reset'); if (br) br.onclick = function () { resetTimer(); };
    var bk = $('#btn-skip'); if (bk) bk.onclick = function () { skipTimer(); };
    var fs = $('#focus-subjects'); if (fs) fs.addEventListener('click', function (e) {
      var c = e.target.closest('[data-subject]');
      if (!c) return;
      TIMER.subject = c.getAttribute('data-subject');
      persistTimer(); renderFocus();
    });
    var rr = $('#rc-reveal'); if (rr) rr.addEventListener('click', function () {
      $('#rc-a').classList.remove('hidden');
      $('#rc-reveal').classList.add('hidden');
      $('#grade-btns').classList.remove('hidden');
    });
    $$('#grade-btns .grade').forEach(function (b) {
      b.addEventListener('click', function () { gradeCurrent(+b.getAttribute('data-q')); });
    });
    var bac = $('#btn-add-card'); if (bac) bac.onclick = function () { cardModal(); };
    var qd = $('#quiz-draw'); if (qd) qd.onclick = function () {
      if (!state.cards.length) { toast('还没有卡片，先去添加'); return; }
      var c = state.cards[Math.floor(Math.random() * state.cards.length)];
      $('#quiz-empty').classList.add('hidden');
      $('#quiz-card-body').classList.remove('hidden');
      var qs = $('#qz-subject');
      if (qs) qs.outerHTML = chipHTML(c.subject);
      var qc = $('#qz-chapter');
      if (qc) qc.textContent = c.chapter || '';
      $('#qz-q').textContent = c.q;
      $('#qz-a').textContent = c.a;
      $('#qz-a').classList.add('hidden');
      $('#quiz-reveal').classList.remove('hidden');
    };
    var qr = $('#quiz-reveal'); if (qr) qr.onclick = function () { $('#qz-a').classList.remove('hidden'); };
    var ns = $('#notes-search'); if (ns) ns.addEventListener('input', function (e) { noteSearch = e.target.value; renderNotes(); });
    var nrc = $('#nr-close'); if (nrc) nrc.onclick = closeNoteReader;
    var nre = $('#nr-edit'); if (nre) nre.onclick = function () { var rid = noteReadId; closeNoteReader(); if (rid) noteModal(rid); };
    var ban = $('#btn-add-note'); if (ban) ban.onclick = function () { noteModal(); };
    var bae = $('#btn-add-error'); if (bae) bae.onclick = function () { errorModal(); };
    var bam = $('#btn-add-mat'); if (bam) bam.onclick = function () { matModal(); };
    var gb = $('#goal-add-btn'); if (gb) gb.onclick = function () {
      var t = $('#goal-add-input').value.trim();
      if (!t) return;
      state.goals.push({ id: uid(), title: t, done: false });
      $('#goal-add-input').value = '';
      save(); renderGoals();
    };
    var aiGenBtn = $('#ai-gen');
    if (aiGenBtn) aiGenBtn.onclick = function () { aiGen(); };
    var aiTopicEl = $('#ai-topic');
    if (aiTopicEl) aiTopicEl.addEventListener('input', function (e) { aiState.topic = e.target.value; });
    var ais = $('#ai-subject');
    if (ais) ais.addEventListener('change', function (e) { aiState.subject = e.target.value; renderAI(); });
    var aic = $('#ai-count');
    if (aic) aic.addEventListener('change', function (e) { aiState.count = parseInt(e.target.value, 10) || 3; });

    function onSet(sel, fn) {
      var el = $(sel);
      if (el) el.addEventListener('change', function (e) { fn(e); save(); renderAll(); });
    }
    onSet('#set-label', function (e) { state.settings.examLabel = e.target.value; });
    onSet('#set-school', function (e) { state.settings.school = e.target.value; });
    onSet('#set-exam', function (e) { if (e.target.value) state.settings.examDate = e.target.value; });
    onSet('#set-subjects', function (e) {
      var subs = e.target.value.split(/[，,、;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (subs.length) {
        state.settings.subjects = subs.slice(0, 8);
        if (subjects().indexOf(TIMER.subject) < 0) TIMER.subject = subjects()[0];
      }
    });
    onSet('#set-baodi1', function (e) { state.settings.baodi = state.settings.baodi || ['', '', '']; state.settings.baodi[0] = e.target.value; });
    onSet('#set-baodi2', function (e) { state.settings.baodi = state.settings.baodi || ['', '', '']; state.settings.baodi[1] = e.target.value; });
    onSet('#set-baodi3', function (e) { state.settings.baodi = state.settings.baodi || ['', '', '']; state.settings.baodi[2] = e.target.value; });
    onSet('#set-words', function (e) { state.settings.wordTarget = Math.max(1, +e.target.value || 40); });
    var sd = $('#set-deepseek');
    if (sd) sd.addEventListener('change', function (e) { state.settings.deepseekKey = e.target.value.trim(); save(); toast('API Key 已保存（仅存本机浏览器）'); });
    function onPomoChange(key, sel, lo, hi) {
      var el = $(sel);
      if (el) el.addEventListener('change', function (e) {
        state.settings[key] = Math.max(lo, Math.min(hi, +e.target.value || lo));
        if (!TIMER.running) { TIMER.total = timerTotalSeconds(); TIMER.remain = TIMER.total; }
        save(); updateTimerUI();
      });
    }
    onPomoChange('pomoWork', '#set-work', 5, 90);
    onPomoChange('pomoBreak', '#set-break', 1, 30);
    onPomoChange('pomoLong', '#set-long', 5, 60);
    onPomoChange('pomoRounds', '#set-rounds', 1, 10);
    var rebtn = $('#btn-reconfig'); if (rebtn) rebtn.onclick = function () { reconfig(); };
    var bex = $('#btn-export'); if (bex) bex.onclick = exportData;
    var dd2 = $('#btn-dedupe');
    if (dd2) dd2.onclick = function () {
      var n = dedupeClean(); save(); renderAll();
      toast(n ? '已清理重复数据 ' + n + ' 条' : '没有发现重复数据');
    };
    var bim = $('#btn-import'); if (bim) bim.onclick = function () { $('#import-file').click(); };
    var imp = $('#import-file');
    if (imp) imp.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      confirmModal('导入备份', '导入会覆盖本机当前全部数据，确定继续吗？', function () { importData(file); }, '导入');
    });
    var bre = $('#btn-reset');
    if (bre) bre.onclick = function () {
      confirmModal('清空数据', '将删除本机全部数据并重新进入配置向导，无法撤销。确定吗？', function () {
        localStorage.removeItem(APP_KEY);
        state = seedState();
        reviewQueue = null;
        save(); renderAll();
        openOnboard();
      }, '清空');
    };
    var bin = $('#btn-install');
    if (bin) bin.onclick = function () {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (c) { if (c && c.outcome === 'accepted') toast('安装成功'); deferredPrompt = null; });
      } else toast('请用浏览器菜单里的「安装应用 / 添加到主屏幕」');
    };
  }

  function aiGen() {
    if (!(state.settings.deepseekKey || '').trim()) { toast('先在「设置与备份」填写 DeepSeek API Key'); return; }
    var topicEl = $('#ai-topic');
    aiState.topic = (topicEl ? topicEl.value.trim() : '') || aiState.subject;
    aiState.subject = $('#ai-subject').value;
    var cntEl = $('#ai-count');
    aiState.count = parseInt((cntEl ? cntEl.value : '3'), 10) || aiState.count;
    aiState.loading = true;
    aiState.items = [];
    renderAI();
    var system = '你是备考辅导老师。出题紧扣考点与常见题型，参考答案按要点组织。只输出 JSON：{"questions":[{"q":"题目","a":"参考答案要点"}]}，不要输出任何其他文字。';
    var user = '科目：' + aiState.subject + String.fromCharCode(10) + '考试类型：' + (state.settings.examLabel || '') + String.fromCharCode(10) + '请围绕「' + aiState.topic + '」出 ' + aiState.count + ' 道题。';
    callDeepSeek([{ role: 'system', content: system }, { role: 'user', content: user }], function (content) {
      var items = parseAIQuestions(content);
      aiState.loading = false;
      if (items && items.length) { aiState.items = items; toast('DeepSeek 出了 ' + items.length + ' 道题'); }
      else {
        aiState.items = [{ id: uid(), q: '（AI 返回未能解析，原文如下）', a: content, my: '', revealed: false, grading: false, gradingLoading: false, feedback: '', subject: aiState.subject, chapter: aiState.topic }];
        toast('返回格式异常，已按原文展示');
      }
      renderAI();
    }, function () { aiState.loading = false; renderAI(); });
  }
  function aiGrade(it) {
    if (!it.grading) { it.grading = true; renderAI(); return; }
    var my = (it.my || '').trim();
    if (!my) { toast('先写下你的答案，再点「提交批改」'); return; }
    it.gradingLoading = true;
    renderAI();
    callDeepSeek([
      { role: 'system', content: '你是阅卷老师，按“要点给分”。只输出 JSON：{"score":0,"hit":["命中的要点"],"miss":["遗漏的要点"],"advice":"一句建议"}，不要输出其他文字。' },
      { role: 'user', content: '题目：' + it.q + String.fromCharCode(10) + '参考答案：' + (it.a || '（无）') + String.fromCharCode(10) + '我的作答：' + my }
    ], function (content) {
      it.feedback = parseAIFeedback(content);
      it.gradingLoading = false;
      renderAI();
    }, function () { it.gradingLoading = false; renderAI(); });
  }

  var currentView = 'today';
  function showView(name) {
    $$('.view').forEach(function (v) { v.classList.remove('active'); });
    var el = $('#view-' + name);
    if (!el) return;
    el.classList.add('active');
    currentView = name;
    $$('[data-view]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-view') === name);
    });
    renderAll();
    window.scrollTo(0, 0);
  }

  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    var card = $('#install-card');
    if (card) card.style.display = '';
  });
  window.addEventListener('appinstalled', function () {
    toast('已安装到设备');
    var card = $('#install-card');
    if (card) card.style.display = 'none';
  });
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!secure) return;
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  window.onerror = function (msg, src, line) {
    try {
      if (window.console && console.error) console.error('JS错误:', msg, '@' + src, '第' + line + '行');
      document.title = '出错: ' + msg + ' (' + line + ')';
      var el = document.getElementById('toast');
      if (el) {
        el.textContent = '程序出错了：' + msg + '（第' + line + '行）';
        el.classList.add('show');
        setTimeout(function () { el.classList.remove('show'); }, 6000);
      }
    } catch (e2) {}
  };
  function init() {
    try {
      var bootHint = document.getElementById('boot-hint');
      if (bootHint) bootHint.style.display = 'none';
      if (window.console && console.log) console.log('上岸计划 通用版 build ' + BUILD);
      bindEvents();
      showView('today');
      restoreTimer();
      updateTimerUI();
      registerSW();
      syncStart();
      try {
        var d1 = dedupeClean();
        if (d1 > 0) { store.save(); setTimeout(function () { toast('已自动清理重复数据 ' + d1 + ' 条'); }, 800); }
      } catch (e) {}
      if (!state.meta.setupDone) {
        setTimeout(function () { openOnboard(); }, 400);
      }
    } catch (err) {
      if (window.onerror) window.onerror('初始化失败: ' + err.message, '', 0);
    }
  }
  init();
})();