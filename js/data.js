'use strict';

/* ============================================================
   状态中枢（data.js）

   全应用**唯一**持有数据的地方。职责：
   1. 读/写 localStorage（唯一的持久化入口）；
   2. 提供的 state 是「活引用」——外部只能读，改动必须走本模块的函数；
   3. 所有增删改在完成后统一收口：标记保存 → 通知服务器 → 触发 'change' 事件。

   设计取舍：
   - 为什么用 Object.defineProperty 暴露 state，而不是导出一个变量副本？
     因为同步合并、导入备份、清空数据都会**整体替换** state 对象；
     用 getter 保证别的模块永远拿到最新那份，不会读到过期引用。
   - 为什么不在这里直接调用渲染函数？
     那会让数据层依赖页面层，拆模块就白拆了。这里只 emit('change')，
     由 boot.js 订阅并刷新界面。

   数据形状（v1）：
     meta      { v, createdAt, savedAt?, setupDone }
     settings  { examType, examLabel, school, examDate, subjects[], baodi[3],
                 wordTarget, deepseekKey, pomoWork, pomoBreak, pomoLong, pomoRounds }
     tasks[]   { id, date, subject, title, done }
     cards[]   { id, subject, chapter, q, a, reps, ease, interval, lapses, due, addedAt }
     sessions[] { id, date, subject, minutes, at }      番茄钟完成记录
     reviews[] { date, cardId, quality, at }            复习评分记录
     notes[]   { id, title, subject, chapter, body, updatedAt }
     errors[]  { id, subject, chapter, q, my, a, mastered, createdAt }
     milestones[] { id, title, due, cat, done }
     phases[]  { id, name, time, lines[] }
     goals[]   { id, title, done }
     checklist[] { id, text, done }
     materials[] { id, title, url, tag }
     days      { 'YYYY-MM-DD': { baodi[3], words, active } }
   ============================================================ */

window.SG = window.SG || {};

(function (SG) {
  /* ---------------- 依赖 ---------------- */

  const CORE = SG.core;
  const TEMPLATES = SG.EXAM_TEMPLATES;
  const CHECKLIST = SG.GENERIC_CHECKLIST;
  const bus = SG.bus;
  const { toast } = SG.ui;

  const APP_KEY = 'shangan-gen-v1';
  const TIMER_KEY = 'shangan-gen-timer-v1';
  const BUILD = '2';

  /** 科目配色：按科目在设置里的顺序循环取用，保证同名科目颜色稳定。 */
  const PALETTE = [
    { fg: '#0f766e', bg: '#ddf0ec' },
    { fg: '#2f6db3', bg: '#e7eff9' },
    { fg: '#7a5fc0', bg: '#eee9f8' },
    { fg: '#b45309', bg: '#fdf0dd' },
    { fg: '#16924a', bg: '#e3f5ea' },
    { fg: '#c2255c', bg: '#fbe9f1' },
    { fg: '#475569', bg: '#eef0f4' },
    { fg: '#c2410c', bg: '#fdebe1' },
  ];

  /* ---------------- 当前状态 ---------------- */

  /** @type {Object} 当前状态；只有本模块能整体替换它。 */
  let state = null;

  /** 首次运行（localStorage 里没有数据）标记，供启动流程判断是否需要弹向导。 */
  let isFirstRun = false;

  /** 局域网同步的运行时信息（不持久化）。 */
  const sync = { available: false, dirty: false, lastSeen: 0, lastAt: 0, lastMsg: '未连接' };
  let syncTimer = null;

  /* ---------------- 默认结构 ---------------- */

  /**
   * 默认设置。考试日期默认取今天 +180 天，避免出现「已过期」的假倒计时。
   * @returns {Object}
   */
  function defaultSettings() {
    return {
      examType: 'other',
      examLabel: '我的考试',
      school: '',
      examDate: CORE.addDaysStr(CORE.todayStr(), 180),
      subjects: ['科目一', '科目二'],
      baodi: ['记忆 / 背诵 30 分钟', '主科学习 30 分钟', '练习 / 刷题 30 分钟'],
      wordTarget: 40,
      deepseekKey: '',
      pomoWork: 25,
      pomoBreak: 5,
      pomoLong: 15,
      pomoRounds: 4,
    };
  }

  /**
   * 一份全新的空状态。
   * @returns {Object}
   */
  function emptyState() {
    return {
      meta: { v: 1, createdAt: CORE.todayStr(), setupDone: false },
      settings: defaultSettings(),
      tasks: [],
      cards: [],
      sessions: [],
      reviews: [],
      notes: [],
      errors: [],
      milestones: [],
      phases: [],
      goals: [],
      checklist: [],
      materials: [],
      days: {},
    };
  }

  /**
   * 补齐老版本数据缺少的字段（升级兼容）。
   * 只补 undefined，不覆盖用户已有值。
   * @param {Object} raw
   * @returns {Object}
   */
  function withDefaults(raw) {
    const fresh = emptyState();
    const merged = CORE.mergeDefaults(raw, fresh);
    merged.settings = Object.assign({}, fresh.settings, merged.settings || {});
    merged.meta = Object.assign({}, fresh.meta, merged.meta || {});
    return merged;
  }

  /* ---------------- 持久化 ---------------- */

  /** 当前科目列表；始终返回非空数组，界面不必再判断。 */
  function subjects() {
    const list = SG.state && SG.state.settings && SG.state.settings.subjects;
    return list && list.length ? list : ['科目一', '科目二'];
  }

  /**
   * 从 localStorage 载入；数据损坏或不存在时给一份新状态。
   * @returns {Object}
   */
  function load() {
    try {
      const raw = localStorage.getItem(APP_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.meta && Array.isArray(parsed.tasks)) return withDefaults(parsed);
      }
    } catch (err) {
      console.warn('[data] 本地数据无法解析，已改用新数据', err);
    }
    isFirstRun = true;
    const fresh = emptyState();
    try {
      localStorage.setItem(APP_KEY, JSON.stringify(fresh));
    } catch (err) {
      console.warn('[data] 首次写入失败', err);
    }
    return fresh;
  }

  /**
   * 落盘保存。写失败（多为浏览器存储配额满）时提示用户先导出备份，
   * 而不是静默丢数据。
   */
  function persist() {
    try {
      localStorage.setItem(APP_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('[data] 保存失败', err);
      toast('保存失败：浏览器存储空间不足，请先导出备份');
    }
  }

  /* ---------------- 同步（局域网） ---------------- */

  /**
   * 保存 + 通知。所有会改动数据的操作最后都调这里，避免漏掉同步标记。
   * @param {string} [event] 额外要 emit 的事件名
   */
  function save(event) {
    state.meta.savedAt = Date.now();
    sync.dirty = true;
    persist();
    bus.emit('change');
    if (event) bus.emit(event);
    scheduleSync();
  }

  /** 非服务器模式（直接双击 html 打开）时不轮询，避免无谓报错。 */
  function serverModeOn() {
    return location.protocol === 'http:';
  }

  /** 同步接口地址。 */
  function syncURL() {
    try {
      return new URL('api/sync', location.href).href;
    } catch (err) {
      return 'api/sync';
    }
  }

  /** 拉取服务器数据；失败返回 null，由调用方决定提示文案。 */
  function pull() {
    return fetch(syncURL(), { method: 'GET', cache: 'no-store' })
      .then((res) => res.json())
      .catch(() => null);
  }

  /** 上传本地数据。 */
  function push() {
    return fetch(syncURL(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    })
      .then((res) => res.json())
      .catch(() => null);
  }

  /** 把同步状态写进界面徽章（元素不存在时只更新内存状态）。 */
  function setSyncMessage(message) {
    sync.lastMsg = message;
    sync.lastAt = Date.now();
    const badge = SG.ui.$('#sync-badge');
    if (badge) badge.textContent = message;
    const info = SG.ui.$('#sync-info');
    if (info) {
      info.innerHTML =
        message === '本机模式'
          ? '当前以纯本机方式运行（数据不自动上传）。'
          : `上次同步：${new Date(sync.lastAt).toTimeString().slice(0, 5)}`;
    }
  }

  /** 采纳服务器数据：与本地合并后整体替换，并刷新界面。 */
  function adopt(serverState) {
    state = CORE.mergeStates(state, serverState);
    dedupe();
    sync.dirty = false;
    sync.lastSeen = (serverState.meta && serverState.meta.savedAt) || 0;
    persist();
    bus.emit('change');
    bus.emit('sync:adopted', serverState);
  }

  /** 一次同步往返：决定该拉、该推，还是都已一致。 */
  function tick() {
    if (!serverModeOn()) {
      sync.available = false;
      return;
    }
    sync.available = true;

    pull().then((res) => {
      if (!res || !res.ok) {
        setSyncMessage('服务器未连接');
        return;
      }
      const server = res.data;
      const serverSavedAt = res.savedAt || 0;

      if (!server || !server.meta) {
        // 服务器还没有数据：本地有内容就推上去，否则只标记已连接
        const hasLocalData = !!(
          state.tasks.length ||
          state.cards.length ||
          state.sessions.length ||
          (state.meta && state.meta.savedAt)
        );
        if (hasLocalData) {
          push().then((result) => {
            if (result && result.ok) {
              sync.lastSeen = result.savedAt;
              sync.dirty = false;
              setSyncMessage('已同步');
            } else {
              setSyncMessage('上传失败');
            }
          });
        } else {
          sync.lastSeen = serverSavedAt;
          setSyncMessage('已连接');
        }
        return;
      }

      if (serverSavedAt > sync.lastSeen) {
        // 另一端更新过：合并后回推，让两边收敛到同一份
        adopt(server);
        push().then((result) => {
          if (result && result.ok) {
            sync.lastSeen = result.savedAt;
            sync.dirty = false;
            setSyncMessage('已同步');
          } else {
            setSyncMessage('同步异常');
          }
        });
        return;
      }

      if (sync.dirty) {
        push().then((result) => {
          if (result && result.ok) {
            sync.lastSeen = result.savedAt;
            sync.dirty = false;
            setSyncMessage('已同步');
          } else {
            setSyncMessage('上传失败');
          }
        });
      } else {
        setSyncMessage('已同步');
      }
    });
  }

  /** 改动后延迟 2 秒再同步，避免连续操作打出一串请求。 */
  function scheduleSync() {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(tick, 2000);
  }

  /** 手动同步（界面上「立即同步」按钮）。 */
  function syncNow() {
    if (!serverModeOn()) {
      toast('当前不是服务器模式，请用「启动.bat」打开');
      return;
    }
    tick();
  }

  /** 手动上传。 */
  function syncPushNow() {
    if (!serverModeOn()) {
      toast('当前不是服务器模式，请用「启动.bat」打开');
      return;
    }
    push().then((result) => {
      if (result && result.ok) {
        sync.dirty = false;
        sync.lastSeen = result.savedAt;
        setSyncMessage('已上传');
        toast('已上传到服务器');
      } else {
        toast('上传失败：请确认电脑上的服务在运行');
      }
    });
  }

  /** 手动拉取。 */
  function syncPullNow() {
    if (!serverModeOn()) {
      toast('当前不是服务器模式，请用「启动.bat」打开');
      return;
    }
    pull().then((res) => {
      if (res && res.ok && res.data && res.data.meta) {
        adopt(res.data);
        setSyncMessage('已拉取');
        toast('已从服务器拉取并合并');
      } else {
        toast('服务器暂无数据或连接失败');
      }
    });
  }

  /** 启动同步：绑定按钮 + 首次探测 + 定时轮询。 */
  function syncStart() {
    const bind = (selector, handler) => {
      const el = SG.ui.$(selector);
      if (el) el.onclick = handler;
    };
    bind('#btn-sync-now', syncNow);
    bind('#btn-sync-push', syncPushNow);
    bind('#btn-sync-pull', syncPullNow);

    if (!serverModeOn()) {
      setSyncMessage('本机模式');
      return;
    }
    setTimeout(tick, 1200);
    setInterval(tick, 4000);
  }

  /* ---------------- 计划骨架与去重 ---------------- */

  /**
   * 按模板生成阶段与关键节点；重新配置时可保留用户已有任务。
   * @param {{tpl: string, label?: string, school?: string, examDate?: string,
   *          subjects?: string[], words?: number, baodi?: string[]}} cfg
   * @param {boolean} [isFreshSetup] 是否首次配置（会重写待办清单与起步任务）
   */
  function applyTemplate(cfg, isFreshSetup) {
    const tpl = findTemplate(cfg.tpl);
    const settings = state.settings;

    settings.examType = tpl.tpl;
    settings.examLabel = (cfg.label || tpl.name).trim() || tpl.name;
    settings.school = (cfg.school || '').trim();
    settings.examDate = cfg.examDate || settings.examDate;

    const picked = (cfg.subjects || []).map((s) => String(s).trim()).filter(Boolean);
    settings.subjects = picked.length ? picked.slice(0, 8) : ['科目一', '科目二'];
    settings.wordTarget = Math.max(1, +cfg.words || settings.wordTarget);
    settings.baodi = cfg.baodi && cfg.baodi.length === 3 ? cfg.baodi : tpl.baodi || settings.baodi;

    state.phases = CORE.buildPhases(tpl);
    state.milestones = CORE.buildMilestones(tpl, settings.examDate, CORE.uid);
    bus.emit('plan:applied');

    if (!isFreshSetup) return;

    state.checklist = CHECKLIST.map((text) => ({ id: CORE.uid(), text, done: false }));
    state.goals = [];

    // 前三天各放一条「入门任务」，让用户打开就知道该干什么
    const starters = [
      (sub) => `整理《${sub}》教材与考纲`,
      (sub) => `${sub}：系统学习 ≥ 45 分钟（做笔记）`,
      (sub) => `${sub}：做 1 组练习，整理错题`,
    ];
    const today = CORE.todayStr();
    for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
      settings.subjects.forEach((sub) => {
        state.tasks.push({
          id: CORE.uid(),
          date: CORE.addDaysStr(today, dayOffset),
          subject: sub,
          title: starters[dayOffset](sub),
          done: false,
        });
      });
    }
    settings.subjects.forEach((sub) => {
      state.tasks.push({
        id: CORE.uid(),
        date: today,
        subject: sub,
        title: '（示例）把今天要学的内容填进来',
        done: false,
      });
    });
  }

  /**
   * 按 tpl 找模板；找不到退回最后一项（自定义）。
   * @param {string} tpl
   * @returns {Object}
   */
  function findTemplate(tpl) {
    return TEMPLATES.find((t) => t.tpl === tpl) || TEMPLATES[TEMPLATES.length - 1];
  }

  /**
   * 清理重复数据：任务按「日期|科目|标题」去重（保留已完成的那条），
   * 卡片按「科目|问题」去重。返回清理掉的条数。
   * @returns {number}
   */
  function dedupe() {
    const taskResult = CORE.dedupeTasks(state.tasks);
    state.tasks = taskResult.tasks;
    const cardResult = CORE.dedupeCards(state.cards);
    state.cards = cardResult.cards;
    return taskResult.removed + cardResult.removed;
  }

  /* ---------------- 每日记录（打卡 / 保底 / 单词） ---------------- */

  /**
   * 取某天的记录，没有就创建一条空白的。
   * @param {string} date
   * @returns {{baodi: boolean[], words: number, active?: boolean}}
   */
  function dayRecord(date) {
    if (!state.days[date]) state.days[date] = { baodi: [false, false, false], words: 0 };
    return state.days[date];
  }

  /**
   * 标记某天为「有学习」——连续打卡就靠这个字段累计。
   * @param {string} date
   */
  function markActive(date) {
    dayRecord(date).active = true;
  }

  /** 连续打卡天数。 */
  function streak() {
    return CORE.calcStreak(state.days);
  }

  /** 累计有学习的天数。 */
  function activeDays() {
    return CORE.totalActiveDays(state.days);
  }

  /**
   * 某天累计专注分钟数。
   * @param {string} date
   * @returns {number}
   */
  function minutesOn(date) {
    return CORE.sumMinutes(state.sessions, date);
  }

  /* ---------------- 任务 ---------------- */

  /**
   * 新增任务。
   * @param {string} date
   * @param {string} title
   * @param {string} [subject]
   */
  function addTask(date, title, subject) {
    state.tasks.push({
      id: CORE.uid(),
      date,
      title,
      subject: subject || subjects()[0],
      done: false,
    });
    save();
  }

  /**
   * 切换任务完成状态；完成时顺带记录当天有学习。
   * @param {string} id
   */
  function toggleTask(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    task.done = !task.done;
    if (task.done) markActive(task.date);
    save();
  }

  /**
   * 删除任务。
   * @param {string} id
   */
  function removeTask(id) {
    state.tasks = state.tasks.filter((t) => t.id !== id);
    save();
  }

  /* ---------------- 卡片 / 复习 ---------------- */

  /**
   * 新增卡片（进入间隔重复队列）。
   * @param {{subject: string, chapter?: string, q: string, a: string}} data
   */
  function addCard(data) {
    state.cards.push({
      id: CORE.uid(),
      subject: data.subject,
      chapter: data.chapter || '',
      q: data.q,
      a: data.a,
      reps: 0,
      ease: 2.5,
      interval: 0,
      lapses: 0,
      due: CORE.todayStr(),
      addedAt: CORE.todayStr(),
    });
    save('cards:changed');
  }

  /**
   * 更新卡片内容（不改复习进度）。
   * @param {string} id
   * @param {{subject: string, chapter?: string, q: string, a: string}} data
   */
  function updateCard(id, data) {
    const card = state.cards.find((c) => c.id === id);
    if (!card) return;
    card.subject = data.subject;
    card.chapter = data.chapter || '';
    card.q = data.q;
    card.a = data.a;
    save('cards:changed');
  }

  /**
   * 删除卡片。
   * @param {string} id
   */
  function removeCard(id) {
    state.cards = state.cards.filter((c) => c.id !== id);
    save('cards:changed');
  }

  /**
   * 给卡片评分并推进复习计划。
   * @param {string} cardId
   * @param {number} quality 0~5，<3 视为答错
   */
  function gradeCard(cardId, quality) {
    const card = state.cards.find((c) => c.id === cardId);
    if (!card) return;
    Object.assign(card, CORE.srsGrade(card, quality));
    state.reviews.push({ date: CORE.todayStr(), cardId, quality, at: Date.now() });
    markActive(CORE.todayStr());
    save('cards:changed');
  }

  /* ---------------- 笔记 / 错题 / 资料 / 目标 ---------------- */

  /**
   * 新增或更新笔记。
   * @param {string|null} id 传 null 表示新建
   * @param {{title: string, subject: string, chapter?: string, body: string}} data
   */
  function upsertNote(id, data) {
    const existing = id ? state.notes.find((n) => n.id === id) : null;
    if (existing) {
      Object.assign(existing, {
        title: data.title,
        subject: data.subject,
        chapter: data.chapter || '',
        body: data.body,
        updatedAt: CORE.todayStr(),
      });
    } else {
      state.notes.unshift({
        id: CORE.uid(),
        title: data.title,
        subject: data.subject,
        chapter: data.chapter || '',
        body: data.body,
        updatedAt: CORE.todayStr(),
      });
    }
    save();
  }

  /**
   * 删除笔记。
   * @param {string} id
   */
  function removeNote(id) {
    state.notes = state.notes.filter((n) => n.id !== id);
    save();
  }

  /**
   * 新增或更新错题。
   * @param {string|null} id
   * @param {{subject: string, chapter?: string, q: string, my?: string, a?: string}} data
   */
  function upsertError(id, data) {
    const existing = id ? state.errors.find((e) => e.id === id) : null;
    if (existing) {
      Object.assign(existing, data);
    } else {
      state.errors.unshift(
        Object.assign({ id: CORE.uid(), mastered: false, createdAt: CORE.todayStr() }, data),
      );
    }
    save();
  }

  /**
   * 删除错题。
   * @param {string} id
   */
  function removeError(id) {
    state.errors = state.errors.filter((e) => e.id !== id);
    save();
  }

  /**
   * 切换错题「已掌握」状态。
   * @param {string} id
   */
  function toggleErrorMastered(id) {
    const error = state.errors.find((e) => e.id === id);
    if (!error) return;
    error.mastered = !error.mastered;
    save();
  }

  /**
   * 添加教材/资料链接。
   * @param {{title: string, url: string, tag?: string}} data
   */
  function addMaterial(data) {
    state.materials.push({
      id: CORE.uid(),
      title: data.title,
      url: data.url,
      tag: data.tag || '',
    });
    save();
  }

  /**
   * 删除资料链接。
   * @param {string} id
   */
  function removeMaterial(id) {
    state.materials = state.materials.filter((m) => m.id !== id);
    save();
  }

  /**
   * 添加个人目标。
   * @param {string} title
   */
  function addGoal(title) {
    state.goals.push({ id: CORE.uid(), title, done: false });
    save();
  }

  /**
   * 切换目标完成状态。
   * @param {string} id
   */
  function toggleGoal(id) {
    const goal = state.goals.find((g) => g.id === id);
    if (!goal) return;
    goal.done = !goal.done;
    if (goal.done) markActive(CORE.todayStr());
    save();
  }

  /**
   * 删除目标。
   * @param {string} id
   */
  function removeGoal(id) {
    state.goals = state.goals.filter((g) => g.id !== id);
    save();
  }

  /**
   * 切换关键节点完成状态。
   * @param {string} id
   */
  function toggleMilestone(id) {
    const milestone = state.milestones.find((m) => m.id === id);
    if (!milestone) return;
    milestone.done = !milestone.done;
    save();
  }

  /**
   * 切换开箱待办完成状态。
   * @param {string} id
   */
  function toggleChecklist(id) {
    const item = state.checklist.find((c) => c.id === id);
    if (!item) return;
    item.done = !item.done;
    save();
  }

  /* ---------------- 记录番茄钟 ---------------- */

  /**
   * 记录一次完成的专注。
   * @param {string} subject
   * @param {number} minutes
   */
  function addSession(subject, minutes) {
    state.sessions.unshift({
      id: CORE.uid(),
      date: CORE.todayStr(),
      subject,
      minutes,
      at: Date.now(),
    });
    markActive(CORE.todayStr());
    save();
  }

  /* ---------------- 导入 / 导出 / 重置 ---------------- */

  /** 导出为 JSON 文件（文件名带日期，便于区分多次备份）。 */
  function exportBackup() {
    try {
      const payload = {
        app: 'shangan-gen',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: state,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `上岸计划备份-${CORE.todayStr().replace(/-/g, '')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      toast('备份已导出');
    } catch (err) {
      console.error('[data] 导出失败', err);
      toast('导出失败');
    }
  }

  /**
   * 从备份文件恢复（会整体覆盖当前数据）。
   * @param {File} file
   */
  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const data = parsed.data || parsed;
        if (!data || !Array.isArray(data.tasks) || !data.settings) throw new Error('结构不符合备份格式');
        state = withDefaults(data);
        save('cards:changed');
        toast('恢复成功');
      } catch (err) {
        console.warn('[data] 导入失败', err);
        toast('导入失败：文件格式不正确');
      }
    };
    reader.onerror = () => toast('读取文件失败');
    reader.readAsText(file);
  }

  /** 清空本机数据并回到初始状态（调用方负责随后打开向导）。 */
  function resetAll() {
    try {
      localStorage.removeItem(APP_KEY);
    } catch (err) {
      console.warn('[data] 清除本地数据失败', err);
    }
    state = emptyState();
    save('cards:changed');
  }

  /* ---------------- 初始化与对外接口 ---------------- */

  /** 载入数据并做一次去重（历史版本可能留下重复项）。 */
  function init() {
    state = load();
    const removed = dedupe();
    if (removed > 0) {
      persist();
      setTimeout(() => toast(`已自动清理重复数据 ${removed} 条`), 800);
    }
    return state;
  }

  SG.data = {
    APP_KEY,
    TIMER_KEY,
    BUILD,
    init,
    subjects,
    defaultSettings,
    emptyState,
    withDefaults,
    save,
    persist,
    applyTemplate,
    findTemplate,
    dedupe,
    dayRecord,
    markActive,
    streak,
    activeDays,
    minutesOn,
    addTask,
    toggleTask,
    removeTask,
    addCard,
    updateCard,
    removeCard,
    gradeCard,
    upsertNote,
    removeNote,
    upsertError,
    removeError,
    toggleErrorMastered,
    addMaterial,
    removeMaterial,
    addGoal,
    toggleGoal,
    removeGoal,
    toggleMilestone,
    toggleChecklist,
    addSession,
    exportBackup,
    importBackup,
    resetAll,
    syncStart,
    syncNow,
    syncPushNow,
    syncPullNow,
    isFirstRun: () => isFirstRun,
    syncState: sync,
  };

  /* state 以 getter 暴露：整体替换（合并/导入/清空）后，别处仍能读到最新引用。
     约定：外部只读；要改数据必须调用 SG.data 里的函数。 */
  Object.defineProperty(SG, 'state', { get: () => state, configurable: true });

  /* 上面的 subjects() 会在模块加载期间被 ui.js 间接调用（如 chipHTML），
     因此提前把最小可用的 getter 挂上，避免读到时还是 null。 */
  SG.subjects = subjects;
  SG.PALETTE = PALETTE;
})(window.SG);
