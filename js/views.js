'use strict';

/* ============================================================
   页面层（views.js）

   只做两件事：把状态渲染成 DOM、把用户操作翻译成 data 层的调用。
   所有写操作都走 SG.data，本文件不直接改 SG.state。

   页面级临时状态（不改数据、不需要同步保存的）就放在这里：
   - planDate    ：计划页正在看哪一天
   - 各过滤器     ：卡片/笔记/错题筛选项
   - reviewSession：本次复习队列与进度
   - aiState     ：AI 出题的输入与结果
   ============================================================ */

window.SG = window.SG || {};

(function (SG) {
  const CORE = SG.core;
  const bus = SG.bus;
  const data = SG.data;
  const timer = SG.timer;
  const {
    $,
    $$,
    toast,
    msItem,
    sgItem,
    subColor,
    chipHTML,
    subjectOptions,
    wordLabel,
    fmtDateCN,
    fmtClock,
    fmtDur,
    openModal,
    closeModal,
    confirmModal,
  } = SG.ui;

  /* ---------------- 页面级状态 ---------------- */

  let planDate = CORE.todayStr();
  let cardFilter = '全部';
  let noteFilter = '全部';
  let noteSearch = '';
  let noteReadId = null;
  let errFilter = '未掌握';

  /** 本次复习会话：队列、当前位置、所属日期、已重新入队的卡片 id。 */
  const reviewSession = { queue: null, pos: 0, day: '', requeued: {} };

  /** AI 出题的输入与结果（临时状态，不落盘）。 */
  const aiState = { subject: null, topic: '', count: 3, loading: false, items: [] };

  /** 今日视图里按科目分组的取色，与科目顺序保持一致。 */
  const TODAY_PALETTE = ['#0f766e', '#2f6db3', '#7a5fc0', '#b45309', '#16924a', '#c2255c', '#475569', '#c2410c'];

  /* ---------------- 小工具 ---------------- */

  /**
   * 生成「全部 + 各科目」的筛选按钮组。
   * @param {'card'|'note'|'error'} scope
   * @returns {string} HTML
   */
  function filterChipsHTML(scope) {
    const current = scope === 'card' ? cardFilter : scope === 'note' ? noteFilter : errFilter;
    const action = scope === 'card' ? 'filter-cards' : scope === 'note' ? 'filter-notes' : 'filter-errors';
    return ['全部', ...SG.subjects()]
      .map(
        (name) =>
          `<button class="fchip${current === name ? ' active' : ''}" ` +
          `data-action="${action}" data-f="${CORE.esc(name)}">${CORE.esc(name)}</button>`,
      )
      .join('');
  }

  /**
   * 今日视图里科目对应的色块颜色（固定调色板，不随主题变化）。
   * @param {string} subject
   * @returns {string}
   */
  function todaySubjectColor(subject) {
    const idx = SG.subjects().indexOf(subject);
    return TODAY_PALETTE[(idx < 0 ? 0 : idx) % TODAY_PALETTE.length];
  }

  /**
   * 近 7 天柱状图。
   * @param {Element} el 容器
   * @param {(date: string) => number} getValue 取某天的值
   * @param {string} [cls] 柱子配色类名
   * @param {(value: number) => string} labelOf 柱子顶部文案
   */
  function barChart(el, getValue, cls, labelOf) {
    if (!el) return;
    const days = [];
    for (let back = 6; back >= 0; back--) days.push(CORE.addDaysStr(CORE.todayStr(), -back));
    const values = days.map(getValue);
    const max = Math.max(...values, 1);
    const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
    const today = CORE.todayStr();

    el.innerHTML = days
      .map((date, i) => {
        const value = values[i];
        const heightPct = value > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
        return (
          '<div class="bc-col">' +
          `<div class="bc-val">${labelOf(value)}</div>` +
          `<div class="bc-bar-wrap"><div class="bc-bar ${cls || ''}" style="height:${heightPct}%"></div></div>` +
          `<div class="bc-day${date === today ? ' today' : ''}">${weekNames[CORE.parseDate(date).getDay()]}</div>` +
          '</div>'
        );
      })
      .join('');
  }

  /* ---------------- 今日 ---------------- */

  /** 渲染今日页：倒计时、今日任务（按科目分组）、保底三件套、记忆量、待复习、开箱待办。 */
  function renderToday() {
    const state = SG.state;
    const today = CORE.todayStr();
    const hour = new Date().getHours();
    const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
    const examLabel = state.settings.examLabel || '考试';

    $('#today-title').textContent = fmtDateCN(today);
    $('#today-sub').textContent = `${greeting}，目标：${examLabel}，今天也要上岸一点`;

    const streakDays = data.streak();
    $('#today-streak').innerHTML =
      `<svg class="ic"><use href="#i-flame"/></svg>${streakDays > 0 ? `${streakDays} 天` : '今天打卡'}`;

    // 倒计时：以 210 天为一个备考周期估算整体进度，仅作心理参照
    const examDate = state.settings.examDate;
    const daysLeft = CORE.daysUntil(examDate);
    const progress = Math.max(0, Math.min(100, Math.round(((210 - Math.max(daysLeft, 0)) / 210) * 100)));
    $('#countdown-card').innerHTML =
      `<div class="cc-label">距 离 ${CORE.esc(examLabel)}</div>` +
      `<div class="cc-days"><b>${daysLeft >= 0 ? daysLeft : 0}</b><span>天</span></div>` +
      `<div class="cc-sub">${state.settings.school ? `${CORE.esc(state.settings.school)} · ` : ''}${fmtDateCN(examDate)}</div>` +
      `<div class="cc-bar"><i style="width:${progress}%"></i></div>` +
      `<div class="cc-foot"><span>${CORE.esc(examLabel)}</span><span>整体进度约 ${progress}%</span></div>`;

    const todayTasks = state.tasks.filter((t) => t.date === today);
    const doneToday = todayTasks.filter((t) => t.done).length;
    const dueCount = state.cards.filter((c) => c.due <= today).length;

    $('#today-mini').innerHTML =
      msItem(data.minutesOn(today), '今日专注(分)') +
      msItem(`${doneToday}/${todayTasks.length}`, '今日任务') +
      msItem(dueCount, '到期卡片') +
      msItem(streakDays, '连续打卡');

    renderTodayTaskList(todayTasks);

    $('#today-task-count').textContent = `${doneToday} / ${todayTasks.length}`;

    const day = state.days[today] || { baodi: [false, false, false], words: 0 };
    const baodiTexts = state.settings.baodi || ['记忆 30 分钟', '主科学习 30 分钟', '练习 30 分钟'];
    $('#baodi-list').innerHTML = baodiTexts
      .map((text, i) => {
        const on = day.baodi[i];
        return (
          `<div class="baodi-item${on ? ' on' : ''}" data-action="toggle-baodi" data-i="${i}">` +
          `<span class="task-check">${on ? '<svg class="ic"><use href="#i-check"/></svg>' : ''}</span>` +
          `<span>${CORE.esc(text)}</span></div>`
        );
      })
      .join('');

    renderWordTracker(day);

    const reviewedToday = state.reviews.filter((r) => r.date === today).length;
    const reviewEl = $('#today-review');
    if (reviewEl) {
      reviewEl.innerHTML =
        dueCount > 0
          ? '<div class="review-cta"><div>' +
            `<b>有 ${dueCount} 张卡片到期</b>` +
            '<span class="muted">花几分钟过一遍，记忆更牢固</span></div>' +
            '<button class="btn btn-primary btn-sm" data-goto="review">去复习 ›</button></div>'
          : '<div class="review-cta"><div><b>今日复习已清空 🎉</b>' +
            `<span class="muted">已复习 ${reviewedToday} 张，可以抽题自测保持手感</span></div>` +
            '<button class="btn btn-ghost btn-sm" data-goto="review">去自测 ›</button></div>';
      $('#review-due-count').textContent = reviewedToday ? `今日已复习 ${reviewedToday} 张` : '';
    }

    const checklist = $('#checklist');
    if (checklist) {
      checklist.innerHTML = state.checklist.length
        ? state.checklist
            .map(
              (item) =>
                `<div class="check-item${item.done ? ' on' : ''}" data-action="toggle-check" data-id="${item.id}">` +
                `<span class="task-check">${item.done ? '<svg class="ic"><use href="#i-check"/></svg>' : ''}</span>` +
                `<span>${CORE.esc(item.text)}</span></div>`,
            )
            .join('')
        : '<div class="empty">清单为空。去「设置与备份」重新生成计划骨架。</div>';
    }
  }

  /**
   * 今日任务按科目分组渲染，未完成的排在前面。
   * @param {Array} todayTasks
   */
  function renderTodayTaskList(todayTasks) {
    const list = $('#today-tasks');
    if (!todayTasks.length) {
      list.innerHTML = '<li class="empty">今天还没有任务，用下面的输入框加一条吧</li>';
      return;
    }

    const order = [...SG.subjects()];
    todayTasks.forEach((t) => {
      if (!order.includes(t.subject)) order.push(t.subject);
    });

    list.innerHTML = order
      .map((subject) => {
        const group = todayTasks.filter((t) => t.subject === subject);
        if (!group.length) return '';
        const done = group.filter((t) => t.done).length;
        const color = todaySubjectColor(subject);
        const rows = group
          .slice()
          .sort((a, b) => Number(a.done) - Number(b.done))
          .map(
            (task) =>
              `<li class="task-item${task.done ? ' done' : ''}">` +
              `<button class="task-check" data-action="toggle-task" data-id="${task.id}" title="标记完成">` +
              `${task.done ? '<svg class="ic"><use href="#i-check"/></svg>' : ''}</button>` +
              `<div class="task-body"><div class="task-title">${CORE.esc(task.title)}</div></div>` +
              '<div class="task-actions">' +
              `<button data-action="edit-task" data-id="${task.id}" title="编辑"><svg class="ic"><use href="#i-edit"/></svg></button>` +
              `<button data-action="del-task" data-id="${task.id}" title="删除"><svg class="ic"><use href="#i-trash"/></svg></button>` +
              '</div></li>',
          )
          .join('');
        return (
          '<div class="tg"><div class="tg-head">' +
          `<span class="tg-dot" style="background:${color}"></span>` +
          `<b>${CORE.esc(subject)}</b>` +
          `<span class="tg-count">${done}/${group.length}</span>` +
          `<div class="tg-prog"><i style="width:${group.length ? Math.round((done / group.length) * 100) : 0}%;background:${color}"></i></div>` +
          `</div><ul class="task-list">${rows}</ul></div>`
        );
      })
      .join('');
  }

  /**
   * 记忆量进度条（单词/知识点），带 +10 / +20 / -10 快捷按钮。
   * @param {{words?: number}} day
   */
  function renderWordTracker(day) {
    const el = $('#words-tracker');
    if (!el) return;
    const current = day.words || 0;
    const target = SG.state.settings.wordTarget || 40;
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

    el.innerHTML =
      `<div class="words-info"><b>${wordLabel()} ${current} / ${target}</b>` +
      `<span class="muted">${current >= target ? '目标达成，漂亮！' : `每天 ${target} 个`}</span></div>` +
      `<div class="words-bar"><i style="width:${pct}%"></i></div>` +
      '<div class="words-btns">' +
      '<button class="btn btn-ghost btn-sm" data-action="add-words" data-n="10">+10</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="add-words" data-n="20">+20</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="add-words" data-n="-10">-10</button>' +
      '</div>';
  }

  /* ---------------- 计划 ---------------- */

  /** 渲染计划页：选中日期 + 当天任务 + 本周概览。 */
  function renderPlan() {
    const state = SG.state;
    const dateEl = $('#plan-date');
    dateEl.textContent = fmtDateCN(planDate);
    dateEl.classList.toggle('is-today', planDate === CORE.todayStr());

    const tasks = state.tasks.filter((t) => t.date === planDate);
    $('#plan-tasks').innerHTML = tasks.map(taskItemHTML).join('');
    $('#plan-empty').classList.toggle('hidden', tasks.length > 0);

    // 本周从周一算起（getDay() 周日为 0，需要换算成周一开头）
    const weekStart = CORE.addDaysStr(planDate, -((CORE.parseDate(planDate).getDay() + 6) % 7));
    const weekNames = '一二三四五六日';
    let html = '';
    for (let i = 0; i < 7; i++) {
      const date = CORE.addDaysStr(weekStart, i);
      const dayTasks = state.tasks.filter((t) => t.date === date);
      const done = dayTasks.filter((t) => t.done).length;
      const cls = dayTasks.length && done === dayTasks.length ? 'full' : done > 0 ? 'part' : '';
      html +=
        `<div class="wo-day${date === CORE.todayStr() ? ' today' : ''}">` +
        `<div class="wo-dot ${cls}"></div><span>${weekNames.charAt(i)}</span>` +
        `<b>${done}/${dayTasks.length}</b></div>`;
    }
    $('#week-overview').innerHTML = html;
  }

  /**
   * 单条任务的行内 HTML（计划页使用，今日页有自己的分组版式）。
   * @param {Object} task
   * @returns {string}
   */
  function taskItemHTML(task) {
    return (
      `<li class="task-item${task.done ? ' done' : ''}">` +
      `<button class="task-check" data-action="toggle-task" data-id="${task.id}" title="标记完成">` +
      `${task.done ? '<svg class="ic"><use href="#i-check"/></svg>' : ''}</button>` +
      '<div class="task-body">' +
      `<div class="task-title">${CORE.esc(task.title)}</div>` +
      `<div class="task-meta">${chipHTML(task.subject)}<span>${fmtDateCN(task.date)}</span></div>` +
      '</div>' +
      '<div class="task-actions">' +
      `<button data-action="edit-task" data-id="${task.id}" title="编辑"><svg class="ic"><use href="#i-edit"/></svg></button>` +
      `<button data-action="del-task" data-id="${task.id}" title="删除"><svg class="ic"><use href="#i-trash"/></svg></button>` +
      '</div></li>'
    );
  }

  /* ---------------- 专注 ---------------- */

  /** 渲染专注页：科目选择、今日/近 7 天/累计统计、今日专注流水。 */
  function renderFocus() {
    const state = SG.state;
    const activeSubject = timer.state.subject;

    $('#focus-subjects').innerHTML = SG.subjects()
      .map((subject) => {
        const color = subColor(subject);
        const isActive = activeSubject === subject;
        return (
          `<button class="subj-chip${isActive ? ' active' : ''}" data-subject="${CORE.esc(subject)}"` +
          `${isActive ? ` style="background:${color.fg};border-color:${color.fg}"` : ''}>${CORE.esc(subject)}</button>`
        );
      })
      .join('');

    const today = CORE.todayStr();
    const todaySessions = state.sessions.filter((s) => s.date === today);
    const todayMinutes = todaySessions.reduce((sum, s) => sum + s.minutes, 0);
    const weekMinutes = state.sessions
      .filter((s) => s.date >= CORE.addDaysStr(today, -6))
      .reduce((sum, s) => sum + s.minutes, 0);
    const totalMinutes = state.sessions.reduce((sum, s) => sum + s.minutes, 0);

    $('#focus-today-stats').innerHTML =
      msItem(todayMinutes, '今日分钟') +
      msItem(todaySessions.length, '今日番茄') +
      msItem(weekMinutes, '近7天分钟') +
      msItem(Math.round((totalMinutes / 60) * 10) / 10, '累计小时');

    const items = todaySessions.slice(0, 20);
    $('#focus-log').innerHTML = items
      .map((session) => {
        const at = new Date(session.at);
        const time = `${CORE.pad2(at.getHours())}:${CORE.pad2(at.getMinutes())}`;
        return (
          '<li><svg class="ic"><use href="#i-focus"/></svg>' +
          chipHTML(session.subject) +
          `<span class="s-at">${time}</span><span class="s-time">${session.minutes} 分钟</span></li>`
        );
      })
      .join('');
    $('#focus-log-empty').style.display = items.length ? 'none' : '';

    timer.updateUI();
  }

  /* ---------------- 复习 ---------------- */

  /**
   * 重建复习队列。同一天内多次渲染不会打乱当前进度，
   * 只有跨天（或主动清空队列）才重新排队。
   */
  function ensureQueue() {
    const today = CORE.todayStr();
    if (reviewSession.queue === null || reviewSession.day !== today) {
      reviewSession.queue = CORE.buildQueue(SG.state.cards, today);
      reviewSession.pos = 0;
      reviewSession.day = today;
      reviewSession.requeued = {};
    }
  }

  /** 卡片增删后强制重新排队。 */
  function invalidateQueue() {
    reviewSession.queue = null;
  }

  /** 渲染复习页：进度统计、当前卡片、卡片库、AI 出题区。 */
  function renderReview() {
    const state = SG.state;
    ensureQueue();
    const today = CORE.todayStr();
    const reviewedToday = state.reviews.filter((r) => r.date === today).length;
    const mastered = state.cards.filter((c) => c.interval >= 21).length;

    $('#review-stats').innerHTML =
      msItem(Math.max(0, reviewSession.queue.length - reviewSession.pos), '待复习') +
      msItem(reviewedToday, '今日已复习') +
      msItem(state.cards.length, '卡片总数') +
      msItem(mastered, '已掌握');

    const stage = $('#review-stage');
    const cardWrap = $('.review-card', stage);
    const doneEl = $('#review-done');

    /* 这几个容器在 HTML 里必须存在；缺失说明页面被改坏了，
       直接抛错比静默少渲染一块更容易定位（renderAll 会打印具体是哪个视图）。 */
    if (!cardWrap || !doneEl) {
      throw new Error('复习页容器缺失：.review-card 或 #review-done 未找到');
    }

    if (reviewSession.pos >= reviewSession.queue.length) {
      cardWrap.classList.add('hidden');
      doneEl.classList.remove('hidden');
      $('#review-done-title').textContent = reviewedToday > 0 ? '今日复习完成' : '今日没有到期卡片';
      $('#review-done-sub').textContent =
        reviewedToday > 0 ? `共复习 ${reviewedToday} 张卡片，明天再见` : '休息一下，或去添加几张新卡片';
      $('#review-progress').textContent = '';
    } else {
      cardWrap.classList.remove('hidden');
      doneEl.classList.add('hidden');

      const card = state.cards.find((c) => c.id === reviewSession.queue[reviewSession.pos]);
      if (!card) {
        // 卡片可能在别处被删掉了，跳过并继续
        reviewSession.pos++;
        renderReview();
        return;
      }
      const subjectEl = $('#rc-subject');
      if (subjectEl) subjectEl.outerHTML = chipHTML(card.subject);
      const chapterEl = $('#rc-chapter');
      if (chapterEl) chapterEl.textContent = card.chapter || '';
      $('#rc-q').textContent = card.q;
      $('#rc-a').textContent = card.a;
      $('#rc-a').classList.add('hidden');
      $('#rc-reveal').classList.remove('hidden');
      $('#grade-btns').classList.add('hidden');
      $('#review-progress').textContent = `剩余 ${reviewSession.queue.length - reviewSession.pos} 张`;
    }

    renderCardLibrary();
    renderAI();
  }

  /**
   * 给当前卡片评分并前进。答错的卡片当天重新入队一次。
   * @param {number} quality 0~5
   */
  function gradeCurrent(quality) {
    const id = reviewSession.queue[reviewSession.pos];
    if (id === undefined) return;
    data.gradeCard(id, quality);
    if (quality < 3 && !reviewSession.requeued[id]) {
      reviewSession.requeued[id] = true;
      reviewSession.queue.push(id);
    }
    reviewSession.pos++;
    renderReview();
  }

  /* ---------------- 卡片库 ---------------- */

  /** 渲染卡片库列表（带科目筛选）。 */
  function renderCardLibrary() {
    const state = SG.state;
    $('#card-filter').innerHTML = filterChipsHTML('card');
    const cards =
      cardFilter === '全部' ? state.cards : state.cards.filter((c) => c.subject === cardFilter);
    $('#card-count').textContent = `共 ${state.cards.length} 张`;

    $('#card-list').innerHTML = cards
      .map((card) => {
        const dueText = card.due < CORE.todayStr() ? '已到期' : `下次 ${fmtDateCN(card.due)}`;
        return (
          '<li><div class="card-item-body">' +
          `<div class="card-item-q">${CORE.esc(card.q)}</div>` +
          `<details class="card-item-a"><summary>查看答案</summary>${CORE.esc(card.a)}</details>` +
          `<div class="card-item-meta">${chipHTML(card.subject)}` +
          `${card.chapter ? `<span>${CORE.esc(card.chapter)}</span>` : ''}` +
          `<span>${dueText}</span><span>间隔${card.interval}天 · 复习${card.reps || 0}次</span></div>` +
          '</div><div class="task-actions">' +
          `<button data-action="edit-card" data-id="${card.id}" title="编辑"><svg class="ic"><use href="#i-edit"/></svg></button>` +
          `<button data-action="del-card" data-id="${card.id}" title="删除"><svg class="ic"><use href="#i-trash"/></svg></button>` +
          '</div></li>'
        );
      })
      .join('');
    $('#card-list-empty').classList.toggle('hidden', cards.length > 0);
  }

  /**
   * 新建 / 编辑卡片。
   * @param {string} [id] 传 id 为编辑
   */
  function cardModal(id) {
    const card = id ? SG.state.cards.find((c) => c.id === id) : null;
    openModal(
      card ? '编辑卡片' : '新卡片',
      '<div class="form-row-2">' +
        `<div><label class="f-label">科目</label><select id="m-card-subject">${subjectOptions(card ? card.subject : SG.subjects()[0])}</select></div>` +
        '<div><label class="f-label">范围/标签</label>' +
        `<input type="text" id="m-card-chapter" maxlength="40" value="${CORE.esc(card ? card.chapter : '')}" placeholder="如：第4章 / 高频考点"></div>` +
        '</div>' +
        '<label class="f-label">问题（正面）</label>' +
        `<textarea id="m-card-q" rows="3" placeholder="如：这个概念的定义？">${CORE.esc(card ? card.q : '')}</textarea>` +
        '<label class="f-label">答案（背面）</label>' +
        `<textarea id="m-card-a" rows="5" placeholder="用自己的话写答案，关键词优先">${CORE.esc(card ? card.a : '')}</textarea>`,
      '<button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="m-save">保存</button>',
    );

    $('#m-save').onclick = () => {
      const question = $('#m-card-q').value.trim();
      const answer = $('#m-card-a').value.trim();
      if (!question || !answer) {
        toast('问题和答案都要填');
        return;
      }
      const payload = {
        subject: $('#m-card-subject').value,
        chapter: $('#m-card-chapter').value.trim(),
        q: question,
        a: answer,
      };
      if (card) data.updateCard(card.id, payload);
      else data.addCard(payload);
      invalidateQueue();
      closeModal();
    };
  }

  /* ---------------- AI 出题 ---------------- */

  /**
   * 调用 DeepSeek。服务器模式下走本机代理（避开 CORS 并保护 Key），
   * 直接打开文件时直连官方接口。
   * @param {Array<{role: string, content: string}>} messages
   * @param {(content: string) => void} onOk
   * @param {() => void} [onErr]
   */
  function callDeepSeek(messages, onOk, onErr) {
    const key = (SG.state.settings.deepseekKey || '').trim();
    const useProxy = location.protocol === 'http:';
    const url = useProxy ? 'api/deepseek' : 'https://api.deepseek.com/chat/completions';
    const payload = {
      key,
      model: 'deepseek-chat',
      messages,
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    };
    const fail = (message) => {
      toast(`AI 调用失败：${message}`);
      if (onErr) onErr();
    };

    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((res) => {
          res
            .json()
            .then((body) => {
              if (!res.ok) {
                fail((body && body.error && body.error.message) || `HTTP ${res.status}`);
                return;
              }
              const content =
                body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
              if (!content) {
                fail('返回内容为空');
                return;
              }
              onOk(content);
            })
            .catch(() => fail('响应解析失败'));
        })
        .catch(() => fail('网络不通（用「启动.bat」打开可走本地代理）'));
    } catch (err) {
      fail(err.message);
    }
  }

  /**
   * 去掉模型偶尔包上的 ```json 代码围栏。
   * @param {string} content
   * @returns {string}
   */
  function stripCodeFence(content) {
    let text = String(content).trim();
    if (text.startsWith('```')) {
      const firstNewline = text.indexOf('\n');
      text = firstNewline > -1 ? text.slice(firstNewline + 1) : '';
      const lastFence = text.lastIndexOf('```');
      if (lastFence > -1) text = text.slice(0, lastFence);
      text = text.trim();
    }
    return text;
  }

  /**
   * 解析出题结果；格式不符时返回 null，由调用方兜底展示原文。
   * @param {string} content
   * @returns {Array|null}
   */
  function parseAIQuestions(content) {
    try {
      const parsed = JSON.parse(stripCodeFence(content));
      const list = parsed.questions || parsed;
      if (!Array.isArray(list)) return null;
      const questions = list
        .filter((item) => item && item.q)
        .map((item) => ({
          id: CORE.uid(),
          q: String(item.q),
          a: String(item.a || ''),
          my: '',
          revealed: false,
          grading: false,
          gradingLoading: false,
          feedback: '',
          subject: aiState.subject,
          chapter: aiState.topic,
        }));
      return questions.length ? questions : null;
    } catch (err) {
      console.warn('[ai] 出题结果解析失败', err);
      return null;
    }
  }

  /**
   * 把批改结果整理成一行可读文本。
   * @param {string} content
   * @returns {string}
   */
  function parseAIFeedback(content) {
    try {
      const parsed = JSON.parse(stripCodeFence(content));
      const parts = [];
      if (parsed.score !== undefined) parts.push(`评分 ${parsed.score}/100`);
      if (Array.isArray(parsed.hit) && parsed.hit.length) parts.push(`命中：${parsed.hit.join('、')}`);
      if (Array.isArray(parsed.miss) && parsed.miss.length) parts.push(`遗漏：${parsed.miss.join('、')}`);
      if (parsed.advice) parts.push(`建议：${parsed.advice}`);
      return parts.length ? parts.join(' ｜ ') : String(content);
    } catch (err) {
      return String(content);
    }
  }

  /**
   * 在结果列表里按 id 找一项。
   * @param {string} id
   * @returns {Object|null}
   */
  function findAIItem(id) {
    return aiState.items.find((item) => item.id === id) || null;
  }

  /** 渲染 AI 出题区（含每题的作答、批改、收进卡片/错题）。 */
  function renderAI() {
    const subjectEl = $('#ai-subject');
    if (subjectEl) subjectEl.innerHTML = subjectOptions(aiState.subject);

    const countEl = $('#ai-count');
    if (countEl) {
      countEl.innerHTML = [3, 5, 10, 15]
        .map((n) => `<option value="${n}"${n === aiState.count ? ' selected' : ''}>${n} 道</option>`)
        .join('');
    }

    const loadingEl = $('#ai-loading');
    if (loadingEl) loadingEl.classList.toggle('hidden', !aiState.loading);

    const box = $('#ai-items');
    if (!box) return;
    const hasKey = !!(SG.state.settings.deepseekKey || '').trim();

    if (aiState.items.length) {
      box.innerHTML = aiState.items
        .map(
          (item, index) =>
            '<div class="ai-item">' +
            `<div class="ai-q">${index + 1}. ${CORE.esc(item.q)}</div>` +
            (item.revealed ? `<div class="ai-a">${CORE.esc(item.a || '（无参考答案）')}</div>` : '') +
            (item.grading
              ? `<textarea class="ai-my" data-action="ai-type" data-id="${item.id}" ` +
                `placeholder="先自己写答案（要点先行），再点「提交批改」">${CORE.esc(item.my || '')}</textarea>`
              : '') +
            (item.feedback ? `<div class="ai-feedback">${CORE.esc(item.feedback)}</div>` : '') +
            '<div class="ai-actions">' +
            `<button class="btn btn-ghost btn-sm" data-action="ai-reveal" data-id="${item.id}">${item.revealed ? '收起答案' : '显示答案'}</button>` +
            `<button class="btn btn-ghost btn-sm" data-action="ai-grade" data-id="${item.id}">` +
            `${item.grading ? (item.gradingLoading ? '批改中…' : '提交批改') : 'AI 批改'}</button>` +
            `<button class="btn btn-ghost btn-sm" data-action="ai-to-card" data-id="${item.id}">收进卡片</button>` +
            `<button class="btn btn-ghost btn-sm" data-action="ai-to-error" data-id="${item.id}">进错题本</button>` +
            '</div></div>',
        )
        .join('');
    } else if (!aiState.loading) {
      box.innerHTML =
        '<div class="empty">' +
        (hasKey
          ? '选科目、填范围（如：第4章 / 不定积分 / 长难句），点「出题」'
          : '先在「设置与备份」填入 DeepSeek API Key，就能让 AI 按你的科目出题') +
        '</div>';
    }
  }

  /** 按当前输入向 DeepSeek 要一组题。 */
  function generateAIQuestions() {
    if (!(SG.state.settings.deepseekKey || '').trim()) {
      toast('先在「设置与备份」填写 DeepSeek API Key');
      return;
    }
    const topicEl = $('#ai-topic');
    aiState.topic = (topicEl ? topicEl.value.trim() : '') || aiState.subject;
    aiState.subject = $('#ai-subject').value;
    const countEl = $('#ai-count');
    aiState.count = parseInt(countEl ? countEl.value : '3', 10) || aiState.count;
    aiState.loading = true;
    aiState.items = [];
    renderAI();

    const system =
      '你是备考辅导老师。出题紧扣考点与常见题型，参考答案按要点组织。' +
      '只输出 JSON：{"questions":[{"q":"题目","a":"参考答案要点"}]}，不要输出任何其他文字。';
    const user =
      `科目：${aiState.subject}\n考试类型：${SG.state.settings.examLabel || ''}\n` +
      `请围绕「${aiState.topic}」出 ${aiState.count} 道题。`;

    callDeepSeek(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      (content) => {
        const questions = parseAIQuestions(content);
        aiState.loading = false;
        if (questions) {
          aiState.items = questions;
          toast(`DeepSeek 出了 ${questions.length} 道题`);
        } else {
          // 解析不了就原样展示，至少不让用户白等一次请求
          aiState.items = [
            {
              id: CORE.uid(),
              q: '（AI 返回未能解析，原文如下）',
              a: content,
              my: '',
              revealed: false,
              grading: false,
              gradingLoading: false,
              feedback: '',
              subject: aiState.subject,
              chapter: aiState.topic,
            },
          ];
          toast('返回格式异常，已按原文展示');
        }
        renderAI();
      },
      () => {
        aiState.loading = false;
        renderAI();
      },
    );
  }

  /**
   * 两段式批改：第一次点「AI 批改」展开作答框，第二次才真的提交。
   * @param {Object} item
   */
  function gradeAIAnswer(item) {
    if (!item.grading) {
      item.grading = true;
      renderAI();
      return;
    }
    const answer = (item.my || '').trim();
    if (!answer) {
      toast('先写下你的答案，再点「提交批改」');
      return;
    }
    item.gradingLoading = true;
    renderAI();

    callDeepSeek(
      [
        {
          role: 'system',
          content:
            '你是阅卷老师，按“要点给分”。只输出 JSON：' +
            '{"score":0,"hit":["命中的要点"],"miss":["遗漏的要点"],"advice":"一句建议"}，不要输出其他文字。',
        },
        {
          role: 'user',
          content: `题目：${item.q}\n参考答案：${item.a || '（无）'}\n我的作答：${answer}`,
        },
      ],
      (content) => {
        item.feedback = parseAIFeedback(content);
        item.gradingLoading = false;
        renderAI();
      },
      () => {
        item.gradingLoading = false;
        renderAI();
      },
    );
  }

  /* ---------------- 笔记 / 错题 / 资料 / 目标 ---------------- */

  /**
   * 新建 / 编辑笔记。
   * @param {string} [id]
   */
  function noteModal(id) {
    const note = id ? SG.state.notes.find((n) => n.id === id) : null;
    openModal(
      note ? '编辑笔记' : '新笔记',
      '<label class="f-label">标题</label>' +
        `<input type="text" id="m-note-title" maxlength="80" value="${CORE.esc(note ? note.title : '')}" placeholder="笔记标题">` +
        '<div class="form-row-2" style="margin-top:10px">' +
        `<div><label class="f-label">科目</label><select id="m-note-subject">${subjectOptions(note ? note.subject : SG.subjects()[0])}</select></div>` +
        '<div><label class="f-label">范围/标签</label>' +
        `<input type="text" id="m-note-chapter" maxlength="40" value="${CORE.esc(note ? note.chapter : '')}" placeholder="如：第3章"></div>` +
        '</div>' +
        '<label class="f-label">内容</label>' +
        `<textarea id="m-note-body" rows="9" placeholder="推荐四行法：是什么→解决什么问题→工作流程/做法→关键字">${CORE.esc(note ? note.body : '')}</textarea>` +
        '<button type="button" class="tpl-btn" id="m-note-tpl">填入「四行法」模板</button>',
      '<button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="m-save">保存</button>',
    );

    $('#m-note-tpl').onclick = () => {
      $('#m-note-body').value = '是什么：\n\n解决什么问题：\n\n怎么做（流程/步骤）：\n\n关键字：';
    };

    $('#m-save').onclick = () => {
      const title = $('#m-note-title').value.trim() || '未命名笔记';
      const body = $('#m-note-body').value;
      if (!body.trim()) {
        toast('笔记内容不能为空');
        return;
      }
      data.upsertNote(note ? note.id : null, {
        title,
        subject: $('#m-note-subject').value,
        chapter: $('#m-note-chapter').value.trim(),
        body,
      });
      closeModal();
    };
  }

  /**
   * 新建 / 编辑错题。
   * @param {string} [id]
   */
  function errorModal(id) {
    const item = id ? SG.state.errors.find((e) => e.id === id) : null;
    openModal(
      item ? '编辑错题' : '新错题',
      '<div class="form-row-2">' +
        `<div><label class="f-label">科目</label><select id="m-err-subject">${subjectOptions(item ? item.subject : SG.subjects()[0])}</select></div>` +
        '<div><label class="f-label">范围/标签</label>' +
        `<input type="text" id="m-err-chapter" maxlength="40" value="${CORE.esc(item ? item.chapter : '')}"></div>` +
        '</div>' +
        '<label class="f-label">题目</label>' +
        `<textarea id="m-err-q" rows="3" placeholder="原题或提问">${CORE.esc(item ? item.q : '')}</textarea>` +
        '<label class="f-label">我当时写的 / 想的（错因）</label>' +
        `<textarea id="m-err-my" rows="3">${CORE.esc(item ? item.my : '')}</textarea>` +
        '<label class="f-label">正确答案 / 要点</label>' +
        `<textarea id="m-err-a" rows="4">${CORE.esc(item ? item.a : '')}</textarea>`,
      '<button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="m-save">保存</button>',
    );

    $('#m-save').onclick = () => {
      const question = $('#m-err-q').value.trim();
      if (!question) {
        toast('题目不能为空');
        return;
      }
      data.upsertError(item ? item.id : null, {
        subject: $('#m-err-subject').value,
        chapter: $('#m-err-chapter').value.trim(),
        q: question,
        my: $('#m-err-my').value.trim(),
        a: $('#m-err-a').value.trim(),
      });
      closeModal();
    };
  }

  /** 只读查看一条错题（带「标为已掌握」）。 */
  function viewError(id) {
    const item = SG.state.errors.find((e) => e.id === id);
    if (!item) return;
    openModal(
      item.q,
      `<div class="rc-meta" style="margin-top:4px">${chipHTML(item.subject)}` +
        `<span class="chip chip-ghost">${CORE.esc(item.chapter || '未分类')}</span></div>` +
        (item.my
          ? '<div class="f-label" style="color:var(--red)">我当时写的 / 想的</div>' +
            `<div style="white-space:pre-wrap;font-size:13.5px;color:var(--red);margin-bottom:10px">${CORE.esc(item.my)}</div>`
          : '') +
        '<div class="f-label" style="color:var(--green)">正确答案 / 要点</div>' +
        `<div style="white-space:pre-wrap;font-size:14px;color:var(--green)">${CORE.esc(item.a)}</div>`,
      '<button class="btn btn-ghost" data-close>关闭</button><button class="btn btn-ghost" id="m-edit">编辑</button>' +
        `<button class="btn btn-ghost" id="m-master">${item.mastered ? '标为未掌握' : '标为已掌握'}</button>`,
    );
    $('#m-edit').onclick = () => {
      closeModal();
      errorModal(id);
    };
    $('#m-master').onclick = () => {
      data.toggleErrorMastered(id);
      closeModal();
    };
  }

  /** 添加资料链接。 */
  function materialModal() {
    openModal(
      '添加资料链接',
      '<label class="f-label">名称</label><input type="text" id="m-mat-title" maxlength="60" placeholder="如：历年真题 PDF">' +
        '<label class="f-label">网址（PDF / 网页链接）</label><input type="text" id="m-mat-url" placeholder="https://...">' +
        '<label class="f-label">标签（可选：如 第4章 / 真题）</label><input type="text" id="m-mat-tag" maxlength="30">',
      '<button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="m-save">保存</button>',
    );
    $('#m-save').onclick = () => {
      const title = $('#m-mat-title').value.trim();
      const url = $('#m-mat-url').value.trim();
      if (!title || !url) {
        toast('名称和网址都要填');
        return;
      }
      data.addMaterial({ title, url, tag: $('#m-mat-tag').value.trim() });
      closeModal();
    };
  }

  /** 渲染资料页。 */
  function renderMaterials() {
    const list = $('#materials-list');
    if (!list) return;
    const materials = SG.state.materials;

    list.innerHTML = materials.length
      ? materials
          .map(
            (item) =>
              '<li><div class="mat-row">' +
              `<a class="mat-title" href="${CORE.esc(item.url)}" target="_blank" rel="noopener">` +
              `<svg class="ic"><use href="#i-book"/></svg>${CORE.esc(item.title)}</a>` +
              (item.tag ? `<span class="mat-tagline">${CORE.esc(item.tag)}</span>` : '') +
              `<button class="mat-del" data-action="del-mat" data-id="${item.id}" title="删除"><svg class="ic"><use href="#i-trash"/></svg></button>` +
              '</div></li>',
          )
          .join('')
      : '<li class="empty">还没有资料链接。点右上「添加」，把课本 PDF、课件、真题的在线地址存进来（电脑手机都能打开）。</li>';

    const countEl = $('#materials-count');
    if (countEl) countEl.textContent = materials.length ? `共 ${materials.length} 个` : '';
  }

  /* ---------------- 统计 / 目标 ---------------- */

  /** 渲染统计页：总量、三张 7 天图表、科目分布。 */
  function renderStats() {
    const state = SG.state;
    const totalMinutes = state.sessions.reduce((sum, s) => sum + s.minutes, 0);

    $('#stats-summary').innerHTML =
      sgItem(Math.round((totalMinutes / 60) * 10) / 10, '小时', '累计专注', 'sg-accent') +
      sgItem(data.activeDays(), '天', '累计打卡', 'sg-amber') +
      sgItem(state.tasks.filter((t) => t.done).length, '项', '完成任务') +
      sgItem(state.reviews.length, '次', '复习卡片');

    barChart($('#chart-focus'), (date) => data.minutesOn(date), '', (v) => (v ? String(v) : ''));
    barChart(
      $('#chart-tasks'),
      (date) => {
        const tasks = state.tasks.filter((t) => t.date === date);
        if (!tasks.length) return 0;
        return Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100);
      },
      'alt',
      (v) => (v ? `${v}%` : ''),
    );
    barChart($('#chart-cards'), (date) => state.reviews.filter((r) => r.date === date).length, 'vio', (v) =>
      v ? String(v) : '',
    );

    const weekSessions = state.sessions.filter((s) => s.date >= CORE.addDaysStr(CORE.todayStr(), -6));
    const weekTotal = weekSessions.reduce((sum, s) => sum + s.minutes, 0) || 1;
    $('#subject-breakdown').innerHTML =
      SG.subjects()
        .map((subject) => {
          const minutes = weekSessions
            .filter((s) => s.subject === subject)
            .reduce((sum, s) => sum + s.minutes, 0);
          const color = subColor(subject);
          return (
            '<div class="sb-row">' +
            `<span class="sb-name">${CORE.esc(subject)}</span>` +
            `<div class="sb-track"><div class="sb-fill" style="width:${Math.round((minutes / weekTotal) * 100)}%;background:${color.fg}"></div></div>` +
            `<span class="sb-val">${fmtDur(minutes)}</span></div>`
          );
        })
        .join('') || '<div class="empty">本周还没有专注记录</div>';
  }

  /** 渲染目标页：倒计时、阶段路线、关键节点、个人目标。 */
  function renderGoals() {
    const state = SG.state;
    const examDate = state.settings.examDate;
    const daysLeft = CORE.daysUntil(examDate);
    const examLabel = state.settings.examLabel || '考试';

    const countdownEl = $('#goals-countdown');
    if (countdownEl) {
      countdownEl.innerHTML =
        '<div class="countdown-card">' +
        `<div class="cc-label">距 离 ${CORE.esc(examLabel)}</div>` +
        `<div class="cc-days"><b>${daysLeft >= 0 ? daysLeft : 0}</b><span>天</span></div>` +
        `<div class="cc-sub">${state.settings.school ? `${CORE.esc(state.settings.school)} · ` : ''}${fmtDateCN(examDate)}</div></div>`;
    }

    const phasesEl = $('#phases');
    if (phasesEl) {
      phasesEl.innerHTML =
        (state.phases || [])
          .map(
            (phase, index) =>
              '<li><div class="ph-body">' +
              `<div class="ph-title"><span class="ph-id">${index + 1}</span><span>${CORE.esc(phase.name)}</span>` +
              `<span class="ph-time">${CORE.esc(phase.time || '')}</span></div>` +
              `<div class="ph-lines">${(phase.lines || []).map((line) => `<div>${CORE.esc(line)}</div>`).join('')}</div>` +
              '</div></li>',
          )
          .join('') || '<div class="empty">还没有阶段，去设置里生成</div>';
    }

    const today = CORE.todayStr();
    const milestonesEl = $('#milestones');
    if (milestonesEl) {
      milestonesEl.innerHTML =
        state.milestones
          .map((milestone) => {
            const overdue = !milestone.done && milestone.due < today;
            const dueStyle = overdue ? ' style="color:var(--red);font-weight:700"' : '';
            return (
              `<li class="task-item${milestone.done ? ' done' : ''}">` +
              `<button class="task-check" data-action="toggle-milestone" data-id="${milestone.id}" title="标记完成">` +
              `${milestone.done ? '<svg class="ic"><use href="#i-check"/></svg>' : ''}</button>` +
              '<div class="task-body">' +
              `<div class="task-title">${CORE.esc(milestone.title)}</div>` +
              `<div class="task-meta"><span class="chip chip-ghost">${CORE.esc(milestone.cat || '节点')}</span>` +
              `<span${dueStyle}>${fmtDateCN(milestone.due)}${overdue ? ' · 已过期' : ''}</span></div></div></li>`
            );
          })
          .join('') || '<li class="empty">还没有关键节点，去设置里生成</li>';
    }

    const goalsEl = $('#mygoals');
    if (goalsEl) {
      goalsEl.innerHTML = state.goals.length
        ? state.goals
            .map(
              (goal) =>
                `<li class="task-item${goal.done ? ' done' : ''}">` +
                `<button class="task-check" data-action="toggle-goal" data-id="${goal.id}" title="标记完成">` +
                `${goal.done ? '<svg class="ic"><use href="#i-check"/></svg>' : ''}</button>` +
                `<div class="task-body"><div class="task-title">${CORE.esc(goal.title)}</div></div>` +
                `<div class="task-actions"><button data-action="del-goal" data-id="${goal.id}" title="删除">` +
                '<svg class="ic"><use href="#i-trash"/></svg></button></div></li>',
            )
            .join('')
        : '<li class="empty">把大目标拆成小目标，逐个击破</li>';
    }
  }

  /* ---------------- 笔记 ---------------- */

  /** 渲染笔记列表（按科目分组、支持关键词搜索）。 */
  function renderNotes() {
    const state = SG.state;
    $('#notes-filter').innerHTML = filterChipsHTML('note');

    const keyword = noteSearch.trim().toLowerCase();
    const notes = (noteFilter === '全部' ? state.notes : state.notes.filter((n) => n.subject === noteFilter)).filter(
      (note) => {
        if (!keyword) return true;
        const haystack = `${note.title || ''} ${note.body || ''} ${note.chapter || ''}`.toLowerCase();
        return haystack.includes(keyword);
      },
    );

    const order = [...SG.subjects()];
    notes.forEach((note) => {
      if (!order.includes(note.subject)) order.push(note.subject);
    });

    let html = '';
    order.forEach((subject) => {
      const group = notes.filter((n) => n.subject === subject);
      if (!group.length) return;
      html +=
        '<div class="note-group"><div class="note-group-head">' +
        `<span class="tg-dot" style="background:${subColor(subject).fg}"></span>` +
        `<b>${CORE.esc(subject)}</b><span class="note-group-count">${group.length}</span></div>`;
      html += group
        .map(
          (note) =>
            '<li class="note-card">' +
            '<div class="note-card-head">' +
            chipHTML(note.subject) +
            (note.chapter ? `<span class="note-card-ch">${CORE.esc(note.chapter)}</span>` : '') +
            '<div class="note-card-actions">' +
            `<button data-action="edit-note" data-id="${note.id}" title="编辑"><svg class="ic"><use href="#i-edit"/></svg></button>` +
            `<button data-action="del-note" data-id="${note.id}" title="删除"><svg class="ic"><use href="#i-trash"/></svg></button>` +
            '</div></div>' +
            `<div class="note-read" data-action="note-read" data-id="${note.id}">` +
            `<div class="note-card-title">${CORE.esc(note.title)}</div>` +
            `<div class="note-card-body">${CORE.esc(note.body)}</div>` +
            '</div>' +
            `<div class="note-card-foot">${fmtDateCN(note.updatedAt)} 更新</div>` +
            '</li>',
        )
        .join('');
      html += '</div>';
    });

    $('#notes-list').innerHTML = html || '<div class="empty">没有匹配的笔记</div>';
    $('#notes-empty').classList.toggle('hidden', notes.length > 0);
  }

  /**
   * 打开笔记阅读浮层（比模态框更适合长文）。
   * @param {string} id
   */
  function openNoteReader(id) {
    const note = SG.state.notes.find((n) => n.id === id);
    const overlay = $('#note-reader');
    if (!note || !overlay) return;
    noteReadId = id;
    $('#nr-title').textContent = note.title;
    $('#nr-body').textContent = note.body;
    $('#nr-meta').innerHTML =
      chipHTML(note.subject) +
      `<span class="nr-ch">${CORE.esc(note.chapter || '未分类')}</span>` +
      `<span class="nr-date">${fmtDateCN(note.updatedAt)}</span>`;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  /** 关闭笔记阅读浮层。 */
  function closeNoteReader() {
    const overlay = $('#note-reader');
    if (overlay) overlay.classList.add('hidden');
    document.body.style.overflow = '';
    noteReadId = null;
  }

  /** 浮层里点「编辑」：先关浮层再开编辑框。 */
  function editNoteFromReader() {
    const id = noteReadId;
    closeNoteReader();
    if (id) noteModal(id);
  }

  /* ---------------- 错题 ---------------- */

  /** 渲染错题本（按掌握状态筛选）。 */
  function renderErrors() {
    const map = { 未掌握: (e) => !e.mastered, 已掌握: (e) => e.mastered, 全部: () => true };
    $('#errors-filter').innerHTML = Object.keys(map)
      .map(
        (name) =>
          `<button class="fchip${errFilter === name ? ' active' : ''}" data-action="filter-errors" ` +
          `data-f="${name}">${name}</button>`,
      )
      .join('');

    const errors = SG.state.errors.filter(map[errFilter] || map['全部']);
    $('#errors-list').innerHTML = errors
      .map(
        (item) =>
          '<li><div class="err-body" data-action="view-error" data-id="' +
          `${item.id}" style="cursor:pointer">` +
          `<div class="err-q">${CORE.esc(item.q)}</div>` +
          (item.my ? `<div class="err-my">✗ ${CORE.esc(item.my)}</div>` : '') +
          `<div class="err-ans">✓ ${CORE.esc(item.a)}</div>` +
          `<div class="err-meta">${chipHTML(item.subject)}` +
          `<span>${CORE.esc(item.chapter || '未分类')}</span><span>${fmtDateCN(item.createdAt)}</span></div></div>` +
          (item.mastered ? '<span class="err-done">已掌握</span>' : '') +
          '<div class="err-actions">' +
          `<button data-action="toggle-error" data-id="${item.id}" title="切换掌握状态"><svg class="ic"><use href="#i-done"/></svg></button>` +
          `<button data-action="edit-error" data-id="${item.id}" title="编辑"><svg class="ic"><use href="#i-edit"/></svg></button>` +
          `<button data-action="del-error" data-id="${item.id}" title="删除"><svg class="ic"><use href="#i-trash"/></svg></button>` +
          '</div></li>',
      )
      .join('');
    $('#errors-empty').classList.toggle('hidden', errors.length > 0);
  }

  /* ---------------- 设置 / 更多 ---------------- */

  /** 把设置项回填到表单（不触发 change，避免自赋值引发保存）。 */
  function renderSettings() {
    const s = SG.state.settings;

    const typeEl = $('#set-exam-type');
    if (typeEl) {
      typeEl.innerHTML = SG.EXAM_TEMPLATES.map(
        (t) => `<option value="${t.tpl}"${s.examType === t.tpl ? ' selected' : ''}>${t.icon} ${t.name}</option>`,
      ).join('');
      typeEl.value = s.examType;
    }

    const fields = [
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
      ['#set-baodi3', (s.baodi || ['', '', ''])[2]],
    ];
    fields.forEach(([selector, value]) => {
      const el = $(selector);
      if (el) el.value = value;
    });

    const tips = $('#settings-tips');
    if (tips) {
      tips.innerHTML =
        '<ul class="tips-list">' +
        '<li><b>电脑</b><span>双击「启动.bat」（或 npm start）打开；数据存在浏览器里，下次打开自动接着用。</span></li>' +
        '<li><b>手机 · 同WiFi</b><span>电脑运行「启动.bat」，手机用窗口里的 PHONE 地址打开。</span></li>' +
        '<li><b>分发给别人</b><span>整个文件夹打包发给对方，对方首次打开会进入「备考配置向导」，按自己的学校/专业设置即可。</span></li>' +
        '<li><b>数据</b><span>所有数据在本机浏览器；换设备用导出/导入。</span></li>' +
        '</ul>';
    }
  }

  /** 渲染侧边栏底部的倒计时与打卡数。 */
  function renderSideFoot() {
    const el = $('#side-foot');
    if (!el) return;
    const daysLeft = CORE.daysUntil(SG.state.settings.examDate);
    el.innerHTML =
      `距 ${CORE.esc(SG.state.settings.examLabel || '考试')} <b>${daysLeft >= 0 ? daysLeft : 0}</b> 天<br>` +
      `连续打卡 <b>${data.streak()}</b> 天`;
  }

  /** 「更多」页的说明文案。 */
  function renderMore() {
    $('#about-body').innerHTML =
      '<ul class="about-list">' +
      '<li><b>这是什么</b><span>上岸计划 · 通用备考版：按你的考试类型 / 学校 / 专业配置的私人备考助手。</span></li>' +
      '<li><b>数据</b><span>全部存在本机浏览器里，不上传服务器。换设备用「设置与备份」导出/导入。</span></li>' +
      '<li><b>重新配置</b><span>换了目标学校或科目？「设置与备份」→「重新生成计划骨架」即可。</span></li>' +
      '<li><b>AI 用法</b><span>AI 是私教不是代写：答案自己先写，AI 负责出题与批改。</span></li>' +
      '</ul>';
  }

  /* ---------------- 汇总渲染 ---------------- */

  /** 视图名 → 渲染函数。加新页面时只需在这里登记。 */
  const RENDERERS = {
    today: renderToday,
    plan: renderPlan,
    focus: renderFocus,
    review: renderReview,
    more: renderMore,
    stats: renderStats,
    goals: renderGoals,
    notes: renderNotes,
    errors: renderErrors,
    settings: renderSettings,
    materials: renderMaterials,
  };

  /** 渲染全部视图。单个视图报错不会影响其余视图，便于定位问题。 */
  function renderAll() {
    Object.keys(RENDERERS).forEach((name) => {
      try {
        RENDERERS[name]();
      } catch (err) {
        console.error(`[views] 渲染 ${name} 失败`, err);
      }
    });
    renderSideFoot();
    timer.updateUI();
  }

  /**
   * 新建 / 编辑任务。日期默认跟随计划页当前选中的那天。
   * @param {string} [id] 传 id 为编辑
   */
  function taskModal(id) {
    const task = id ? SG.state.tasks.find((t) => t.id === id) : null;
    openModal(
      task ? '编辑任务' : '新任务',
      '<label class="f-label">任务内容</label>' +
        `<input type="text" id="m-task-title" maxlength="120" value="${CORE.esc(task ? task.title : '')}">` +
        '<div class="form-row-2" style="margin-top:10px">' +
        `<div><label class="f-label">科目</label><select id="m-task-subject">${subjectOptions(task ? task.subject : SG.subjects()[0])}</select></div>` +
        `<div><label class="f-label">日期</label><input type="date" id="m-task-date" value="${task ? task.date : planDate}"></div>` +
        '</div>',
      '<button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="m-save">保存</button>',
    );

    $('#m-save').onclick = () => {
      const title = $('#m-task-title').value.trim();
      if (!title) {
        toast('任务内容不能为空');
        return;
      }
      const date = $('#m-task-date').value || CORE.todayStr();
      const subject = $('#m-task-subject').value;
      if (task) {
        // 编辑沿用原 id，只改字段，避免同步时被当成新任务
        Object.assign(task, { title, subject, date });
        data.save();
      } else {
        data.addTask(date, title, subject);
      }
      closeModal();
    };
  }

  SG.views = {
    renderAll,
    renderToday,
    renderPlan,
    renderFocus,
    renderReview,
    renderNotes,
    renderErrors,
    renderGoals,
    renderStats,
    renderMore,
    renderMaterials,
    renderSettings,
    renderSideFoot,
    renderAI,
    renderCardLibrary,
    taskItemHTML,
    taskModal,
    cardModal,
    noteModal,
    errorModal,
    viewError,
    materialModal,
    openNoteReader,
    closeNoteReader,
    editNoteFromReader,
    gradeCurrent,
    gradeAIAnswer,
    generateAIQuestions,
    findAIItem,
    invalidateQueue,
    aiState,
    getPlanDate: () => planDate,
    setPlanDate: (date) => {
      planDate = date;
      renderPlan();
    },
    setCardFilter: (value) => {
      cardFilter = value;
      renderCardLibrary();
    },
    setNoteFilter: (value) => {
      noteFilter = value;
      renderNotes();
    },
    setNoteSearch: (value) => {
      noteSearch = value;
      renderNotes();
    },
    setErrorFilter: (value) => {
      errFilter = value;
      renderErrors();
    },
    setAISubject: (value) => {
      aiState.subject = value;
      renderAI();
    },
    setAITopic: (value) => {
      aiState.topic = value;
    },
    setAICount: (value) => {
      aiState.count = value;
    },
  };
})(window.SG);
