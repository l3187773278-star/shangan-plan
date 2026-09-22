'use strict';

/* ============================================================
   启动与事件接线（boot.js）

   全应用唯一的入口：负责把 DOM 上发生的事翻译成对 data / views 的调用。

   为什么把「接线」集中在一个文件里：
   1. 用事件委托（document 上监听一次）而不是给成百上千个动态按钮逐个绑定，
      列表重渲染后不需要重新绑定，也不会有监听器泄漏；
   2. 想知道「点这个按钮会发生什么」只需看这一处的 switch。

   加载顺序（index.html 里必须严格遵守）：
     core → bus → exams → ui → data → timer → views → boot
   ============================================================ */

window.SG = window.SG || {};

(function (SG) {
  const CORE = SG.core;
  const bus = SG.bus;
  const data = SG.data;
  const timer = SG.timer;
  const { $, $$, toast, openModal, closeModal, confirmModal, esc } = SG.ui;
  const views = SG.views;

  /* ---------------- 视图切换 ---------------- */

  /**
   * 切到某个视图并重渲染。
   * @param {string} name today | plan | focus | review | more | stats | goals | notes | errors | settings | materials
   */
  function showView(name) {
    const target = $(`#view-${name}`);
    if (!target) return;
    $$('.view').forEach((view) => view.classList.remove('active'));
    target.classList.add('active');
    $$('[data-view]').forEach((link) => {
      link.classList.toggle('active', link.getAttribute('data-view') === name);
    });
    views.renderAll();
    window.scrollTo(0, 0);
  }

  /* ---------------- 引导向导 ---------------- */

  const ONBOARD_STEPS = 3;

  /**
   * 切换到向导的第 n 步（1~3），并按位置显示对应的按钮。
   * @param {number} step
   */
  function onboardGoToStep(step) {
    const root = $('#onboard-root');
    if (!root) return;
    $$('.ob-step', root).forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-step') === String(step));
    });
    const prev = $('#ob-prev');
    if (prev) prev.classList.toggle('hidden', step <= 1);
    const next = $('#ob-next');
    if (next) next.classList.toggle('hidden', step >= ONBOARD_STEPS);
    const finish = $('#ob-finish');
    if (finish) finish.classList.toggle('hidden', step < ONBOARD_STEPS);
    const bar = $('#ob-stepbar');
    if (bar) bar.textContent = `第 ${step} / ${ONBOARD_STEPS} 步`;
  }

  /** 当前处于第几步。 */
  function onboardCurrentStep() {
    const active = $('#onboard-root .ob-step.active');
    return active ? parseInt(active.getAttribute('data-step'), 10) : 1;
  }

  /** 把考试模板渲染成卡片网格。 */
  function renderOnboardTemplates() {
    const grid = $('#ob-tplgrid');
    if (!grid) return;
    grid.innerHTML = SG.EXAM_TEMPLATES.map(
      (tpl) =>
        `<button type="button" class="ob-tpl" data-tpl="${tpl.tpl}">` +
        `<div class="ob-tpl-icon">${tpl.icon}</div>` +
        `<div class="ob-tpl-name">${tpl.name}</div>` +
        `<div class="ob-tpl-desc">${esc(tpl.desc)}</div></button>`,
    ).join('');
  }

  /**
   * 选中某个考试模板。
   * 预填规则：只有字段还是默认占位时才跟随模板覆盖，
   * 用户已经改过的内容一律保留。
   * @param {string} tplId
   */
  function pickOnboardTemplate(tplId) {
    const tpl = data.findTemplate(tplId);
    $$('#onboard-root .ob-tpl').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tpl') === tplId);
    });

    const labelEl = $('#ob-label');
    if (labelEl) {
      const value = labelEl.value.trim();
      const isPlaceholder =
        !value || value === '我的考试' || SG.EXAM_TEMPLATES.some((t) => t.name === value);
      if (isPlaceholder) labelEl.value = tpl.name;
    }

    const subjectsEl = $('#ob-subjects');
    if (subjectsEl) {
      const value = subjectsEl.value.trim();
      const isPlaceholder = !value || value === '科目一，科目二' || value === '科目一,科目二';
      if (isPlaceholder) subjectsEl.value = tpl.subjects.join('，');
    }

    const infoEl = $('#ob-phaseinfo');
    if (infoEl) {
      infoEl.innerHTML =
        `<b>${tpl.name}</b>：将生成 ${tpl.phases.length} 个阶段（` +
        `${tpl.phases.map((p) => p.n).join(' → ')}）和 ${tpl.milestones.length} 个关键节点。`;
    }
  }

  /** 用当前设置预填向导表单。 */
  function fillOnboardForm() {
    const s = SG.state.settings;
    const tpl = data.findTemplate(s.examType);

    const labelEl = $('#ob-label');
    if (labelEl) labelEl.value = s.examLabel && s.examLabel !== tpl.name ? s.examLabel : tpl.name;
    const schoolEl = $('#ob-school');
    if (schoolEl) schoolEl.value = s.school || '';
    const subjectsEl = $('#ob-subjects');
    if (subjectsEl) subjectsEl.value = (s.subjects && s.subjects.length ? s.subjects : tpl.subjects).join('，');
    const wordsEl = $('#ob-words');
    if (wordsEl) wordsEl.value = s.wordTarget || 40;
    const dateEl = $('#ob-examdate');
    if (dateEl) dateEl.value = s.examDate || CORE.addDaysStr(CORE.todayStr(), 180);

    pickOnboardTemplate(s.examType);
  }

  /** 打开配置向导。 */
  function openOnboard() {
    const root = $('#onboard-root');
    if (!root) return;
    root.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    renderOnboardTemplates();
    fillOnboardForm();
    onboardGoToStep(1);
  }

  /** 关闭配置向导。 */
  function closeOnboard() {
    const root = $('#onboard-root');
    if (root) root.style.display = 'none';
    document.body.style.overflow = '';
  }

  /** 向导完成：按填写的配置生成阶段、节点与起步任务。 */
  function finishOnboard() {
    const activeTpl = $('#onboard-root .ob-tpl.active');
    const tplId = activeTpl ? activeTpl.getAttribute('data-tpl') : SG.state.settings.examType;
    const firstSetup = !SG.state.meta.setupDone;

    SG.state.meta.setupDone = true;
    data.applyTemplate(
      {
        tpl: tplId,
        label: ($('#ob-label').value || '').trim(),
        school: ($('#ob-school').value || '').trim(),
        examDate: $('#ob-examdate').value || CORE.addDaysStr(CORE.todayStr(), 180),
        subjects: ($('#ob-subjects').value || '')
          .split(/[，,、;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        words: parseInt($('#ob-words').value, 10) || 40,
      },
      firstSetup,
    );

    closeOnboard();
    data.save();
    views.renderAll();
    toast(firstSetup ? '配置完成！已按你的目标生成阶段、节点与起步任务' : '已更新配置');
  }

  /* ---------------- 设置页操作 ---------------- */

  /** 用设置页里的当前值重建计划骨架（保留用户已有数据）。 */
  function rebuildPlan() {
    confirmModal(
      '重新生成计划骨架',
      '将按当前设置重建「阶段」和「关键节点」（你添加的任务、笔记、卡片、打卡记录都会保留）。确定继续吗？',
      () => {
        data.applyTemplate(
          {
            tpl: $('#set-exam-type').value || 'other',
            label: ($('#set-label').value || '').trim(),
            school: ($('#set-school').value || '').trim(),
            examDate: $('#set-exam').value,
            subjects: ($('#set-subjects').value || '')
              .split(/[，,、;]+/)
              .map((s) => s.trim())
              .filter(Boolean),
          },
          false,
        );
        data.save();
        toast('已重建阶段与关键节点');
      },
      '重建',
    );
  }

  /** 清空本机数据并重新走配置向导。 */
  function resetEverything() {
    confirmModal(
      '清空数据',
      '将删除本机全部数据并重新进入配置向导，无法撤销。确定吗？',
      () => {
        data.resetAll();
        views.invalidateQueue();
        openOnboard();
      },
      '清空',
    );
  }

  /** 选择备份文件后确认导入。 */
  function requestImport(file) {
    confirmModal('导入备份', '导入会覆盖本机当前全部数据，确定继续吗？', () => {
      data.importBackup(file);
    }, '导入');
  }

  /** 手动清理重复数据。 */
  function runDedupe() {
    const removed = data.dedupe();
    data.save();
    toast(removed ? `已清理重复数据 ${removed} 条` : '没有发现重复数据');
  }

  /* ---------------- 事件接线 ---------------- */

  /** 今日页快捷加任务（回车提交）。 */
  function bindQuickAdd() {
    const input = $('#qa-input');
    if (!input) return;
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const title = input.value.trim();
      if (!title) return;
      data.addTask(CORE.todayStr(), title, $('#qa-subject').value);
      input.value = '';
    });
  }

  /** 计划页翻页、添加任务。 */
  function bindPlanControls() {
    const bind = (selector, handler) => {
      const el = $(selector);
      if (el) el.onclick = handler;
    };

    bind('#plan-prev', () => views.setPlanDate(CORE.addDaysStr(views.getPlanDate(), -1)));
    bind('#plan-next', () => views.setPlanDate(CORE.addDaysStr(views.getPlanDate(), 1)));
    bind('#plan-today', () => views.setPlanDate(CORE.todayStr()));
    bind('#plan-add-btn', () => {
      const input = $('#plan-add-title');
      const title = input.value.trim();
      if (!title) {
        toast('先写点任务内容');
        return;
      }
      data.addTask(views.getPlanDate(), title, $('#plan-add-subject').value);
      input.value = '';
    });
  }

  /** 番茄钟与复习/自测控件。 */
  function bindFocusAndReview() {
    const bind = (selector, handler) => {
      const el = $(selector);
      if (el) el.onclick = handler;
    };

    bind('#btn-start', () => (timer.isRunning() ? timer.pause() : timer.start()));
    bind('#btn-reset', () => {
      timer.reset();
      views.renderAll();
    });
    bind('#btn-skip', () => {
      timer.skip();
      views.renderAll();
    });

    const subjectsEl = $('#focus-subjects');
    if (subjectsEl) {
      subjectsEl.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-subject]');
        if (chip) timer.setSubject(chip.getAttribute('data-subject'));
      });
    }

    const reveal = $('#rc-reveal');
    if (reveal) {
      reveal.addEventListener('click', () => {
        $('#rc-a').classList.remove('hidden');
        $('#rc-reveal').classList.add('hidden');
        $('#grade-btns').classList.remove('hidden');
      });
    }
    $$('#grade-btns .grade').forEach((btn) => {
      btn.addEventListener('click', () => views.gradeCurrent(+btn.getAttribute('data-q')));
    });

    bind('#btn-add-card', () => views.cardModal());
    bind('#quiz-draw', () => {
      const cards = SG.state.cards;
      if (!cards.length) {
        toast('还没有卡片，先去添加');
        return;
      }
      const card = cards[Math.floor(Math.random() * cards.length)];
      $('#quiz-empty').classList.add('hidden');
      $('#quiz-card-body').classList.remove('hidden');
      const subjectEl = $('#qz-subject');
      if (subjectEl) subjectEl.outerHTML = SG.ui.chipHTML(card.subject);
      const chapterEl = $('#qz-chapter');
      if (chapterEl) chapterEl.textContent = card.chapter || '';
      $('#qz-q').textContent = card.q;
      $('#qz-a').textContent = card.a;
      $('#qz-a').classList.add('hidden');
      $('#quiz-reveal').classList.remove('hidden');
    });
    bind('#quiz-reveal', () => $('#qz-a').classList.remove('hidden'));
  }

  /** 笔记 / 错题 / 资料 / 目标的按钮与搜索。 */
  function bindContentControls() {
    const bind = (selector, handler) => {
      const el = $(selector);
      if (el) el.onclick = handler;
    };

    bind('#btn-add-note', () => views.noteModal());
    bind('#btn-add-error', () => views.errorModal());
    bind('#btn-add-mat', () => views.materialModal());
    bind('#nr-close', () => views.closeNoteReader());
    bind('#nr-edit', () => views.editNoteFromReader());

    const search = $('#notes-search');
    if (search) search.addEventListener('input', (e) => views.setNoteSearch(e.target.value));

    bind('#goal-add-btn', () => {
      const input = $('#goal-add-input');
      const title = input.value.trim();
      if (!title) return;
      data.addGoal(title);
      input.value = '';
    });
  }

  /** AI 出题控件的联动。 */
  function bindAIControls() {
    const genBtn = $('#ai-gen');
    if (genBtn) genBtn.onclick = () => views.generateAIQuestions();

    const topicEl = $('#ai-topic');
    if (topicEl) topicEl.addEventListener('input', (e) => views.setAITopic(e.target.value));

    const subjectEl = $('#ai-subject');
    if (subjectEl) subjectEl.addEventListener('change', (e) => views.setAISubject(e.target.value));

    const countEl = $('#ai-count');
    if (countEl) {
      countEl.addEventListener('change', (e) => views.setAICount(parseInt(e.target.value, 10) || 3));
    }
  }

  /** 设置页表单：改动即写入设置并重渲染。 */
  function bindSettingsForm() {
    /**
     * 给一个输入框挂 change 事件。
     * @param {string} selector
     * @param {(value: string) => void} apply
     */
    const onChange = (selector, apply) => {
      const el = $(selector);
      if (!el) return;
      el.addEventListener('change', (e) => {
        apply(e.target.value);
        data.save();
      });
    };

    onChange('#set-label', (v) => {
      SG.state.settings.examLabel = v;
    });
    onChange('#set-school', (v) => {
      SG.state.settings.school = v;
    });
    onChange('#set-exam', (v) => {
      if (v) SG.state.settings.examDate = v;
    });
    onChange('#set-subjects', (v) => {
      const subjects = v
        .split(/[，,、;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!subjects.length) return;
      SG.state.settings.subjects = subjects.slice(0, 8);
      timer.ensureSubject();
    });
    onChange('#set-baodi1', (v) => {
      SG.state.settings.baodi = SG.state.settings.baodi || ['', '', ''];
      SG.state.settings.baodi[0] = v;
    });
    onChange('#set-baodi2', (v) => {
      SG.state.settings.baodi = SG.state.settings.baodi || ['', '', ''];
      SG.state.settings.baodi[1] = v;
    });
    onChange('#set-baodi3', (v) => {
      SG.state.settings.baodi = SG.state.settings.baodi || ['', '', ''];
      SG.state.settings.baodi[2] = v;
    });
    onChange('#set-words', (v) => {
      SG.state.settings.wordTarget = Math.max(1, +v || 40);
    });

    const keyEl = $('#set-deepseek');
    if (keyEl) {
      keyEl.addEventListener('change', (e) => {
        SG.state.settings.deepseekKey = e.target.value.trim();
        data.save();
        toast('API Key 已保存（仅存本机浏览器）');
      });
    }

    /**
     * 番茄钟时长：夹在合法区间内；没在计时时立即把表盘同步到新时长。
     * @param {string} key
     * @param {string} selector
     * @param {number} min
     * @param {number} max
     */
    const onPomodoroChange = (key, selector, min, max) => {
      const el = $(selector);
      if (!el) return;
      el.addEventListener('change', (e) => {
        SG.state.settings[key] = Math.max(min, Math.min(max, +e.target.value || min));
        if (!timer.isRunning()) {
          timer.state.total = timer.totalSeconds();
          timer.state.remain = timer.state.total;
        }
        data.save();
        timer.updateUI();
      });
    };
    onPomodoroChange('pomoWork', '#set-work', 5, 90);
    onPomodoroChange('pomoBreak', '#set-break', 1, 30);
    onPomodoroChange('pomoLong', '#set-long', 5, 60);
    onPomodoroChange('pomoRounds', '#set-rounds', 1, 10);
  }

  /** 数据管理按钮：导出、导入、清空、去重、重配置、安装。 */
  function bindDataControls() {
    const bind = (selector, handler) => {
      const el = $(selector);
      if (el) el.onclick = handler;
    };

    bind('#btn-reconfig', () => rebuildPlan());
    bind('#btn-export', () => data.exportBackup());
    bind('#btn-dedupe', () => runDedupe());
    bind('#btn-reset', () => resetEverything());
    bind('#btn-import', () => $('#import-file').click());

    const fileInput = $('#import-file');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (file) requestImport(file);
      });
    }

    bind('#btn-install', () => {
      if (!deferredPrompt) {
        toast('请用浏览器菜单里的「安装应用 / 添加到主屏幕」');
        return;
      }
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choice) => {
        if (choice && choice.outcome === 'accepted') toast('安装成功');
        deferredPrompt = null;
      });
    });
  }

  /** 全局委托：导航、所有 data-action 按钮、AI 作答输入。 */
  function bindDelegatedEvents() {
    document.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-view]');
      if (nav) {
        e.preventDefault();
        showView(nav.getAttribute('data-view'));
        return;
      }
      const goTo = e.target.closest('[data-goto]');
      if (goTo) showView(goTo.getAttribute('data-goto'));
    });

    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      handleAction(target.getAttribute('data-action'), target);
    });

    document.addEventListener('input', (e) => {
      const field = e.target && e.target.closest ? e.target.closest('[data-action="ai-type"]') : null;
      if (!field) return;
      const item = views.findAIItem(field.getAttribute('data-id'));
      if (item) item.my = field.value;
    });
  }

  /**
   * 统一的按钮动作分发。
   * @param {string} action
   * @param {Element} target 触发元素（用于读取 data-id / data-i / data-n / data-f）
   */
  function handleAction(action, target) {
    const id = target.getAttribute('data-id');
    const index = target.getAttribute('data-i');
    const filter = target.getAttribute('data-f');
    const delta = +target.getAttribute('data-n');

    switch (action) {
      /* 任务 */
      case 'toggle-task':
        data.toggleTask(id);
        break;
      case 'edit-task':
        views.taskModal(id);
        break;
      case 'del-task':
        confirmModal('删除任务', '确定删除这条任务吗？', () => data.removeTask(id), '删除');
        break;

      /* 今日页打卡 / 记忆量 / 待办 */
      case 'toggle-baodi':
        toggleBaodi(+index);
        break;
      case 'add-words':
        addWords(delta);
        break;
      case 'toggle-check':
        data.toggleChecklist(id);
        break;
      case 'toggle-milestone':
        data.toggleMilestone(id);
        break;
      case 'toggle-goal':
        data.toggleGoal(id);
        break;
      case 'del-goal':
        data.removeGoal(id);
        break;

      /* 卡片 */
      case 'filter-cards':
        views.setCardFilter(filter);
        break;
      case 'edit-card':
        views.cardModal(id);
        break;
      case 'del-card':
        confirmModal(
          '删除卡片',
          '确定删除这张卡片吗？',
          () => {
            data.removeCard(id);
            views.invalidateQueue();
          },
          '删除',
        );
        break;

      /* 笔记 */
      case 'filter-notes':
        views.setNoteFilter(filter);
        break;
      case 'edit-note':
        views.noteModal(id);
        break;
      case 'note-read':
        views.openNoteReader(id);
        break;
      case 'del-note':
        confirmModal('删除笔记', '确定删除这篇笔记吗？', () => data.removeNote(id), '删除');
        break;

      /* 错题 */
      case 'filter-errors':
        views.setErrorFilter(filter);
        break;
      case 'edit-error':
        views.errorModal(id);
        break;
      case 'view-error':
        views.viewError(id);
        break;
      case 'del-error':
        confirmModal('删除错题', '确定删除这道错题吗？', () => data.removeError(id), '删除');
        break;
      case 'toggle-error':
        data.toggleErrorMastered(id);
        break;

      /* 资料 */
      case 'del-mat':
        data.removeMaterial(id);
        break;

      /* AI 出题结果 */
      case 'ai-reveal': {
        const item = views.findAIItem(id);
        if (item) {
          item.revealed = !item.revealed;
          views.renderAI();
        }
        break;
      }
      case 'ai-grade': {
        const item = views.findAIItem(id);
        if (item) views.gradeAIAnswer(item);
        break;
      }
      case 'ai-to-card': {
        const item = views.findAIItem(id);
        if (!item) break;
        data.addCard({ subject: item.subject, chapter: item.chapter, q: item.q, a: item.a || '' });
        views.invalidateQueue();
        toast('已收进卡片库');
        break;
      }
      case 'ai-to-error': {
        const item = views.findAIItem(id);
        if (!item) break;
        data.upsertError(null, {
          subject: item.subject,
          chapter: item.chapter,
          q: item.q,
          my: item.my || '',
          a: item.a || '',
        });
        toast('已记入错题本');
        break;
      }
      default:
        console.warn('[boot] 未处理的 data-action：', action);
    }
  }

  /**
   * 记忆量加减（今日页的 +10 / +20 / -10）。
   * @param {number} delta
   */
  function addWords(delta) {
    const today = CORE.todayStr();
    const record = data.dayRecord(today);
    record.words = Math.max(0, (record.words || 0) + delta);
    data.markActive(today);
    data.save();
  }

  /**
   * 切换今天的保底项。
   * @param {number} index 0~2
   */
  function toggleBaodi(index) {
    const today = CORE.todayStr();
    const record = data.dayRecord(today);
    record.baodi[index] = !record.baodi[index];
    data.markActive(today);
    data.save();
  }

  /** 绑定向导内部的点击（模板选择、上一步/下一步/完成）。 */
  function bindOnboard() {
    const root = $('#onboard-root');
    if (!root) return;
    root.addEventListener('click', (e) => {
      const tplBtn = e.target.closest('.ob-tpl');
      if (tplBtn) {
        pickOnboardTemplate(tplBtn.getAttribute('data-tpl'));
        return;
      }
      const control = e.target.closest('[data-ob]');
      if (!control) return;
      const step = onboardCurrentStep();
      const action = control.getAttribute('data-ob');
      if (action === 'prev') onboardGoToStep(Math.max(1, step - 1));
      else if (action === 'next') onboardGoToStep(Math.min(ONBOARD_STEPS, step + 1));
      else if (action === 'finish') finishOnboard();
    });
  }

  /** 全部接线入口。 */
  function bindEvents() {
    bindDelegatedEvents();
    bindOnboard();
    bindQuickAdd();
    bindPlanControls();
    bindFocusAndReview();
    bindContentControls();
    bindAIControls();
    bindSettingsForm();
    bindDataControls();
  }

  /* ---------------- PWA 与全局兜底 ---------------- */

  /** 记住安装提示事件，供「安装应用」按钮使用。 */
  let deferredPrompt = null;

  function bindInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const card = $('#install-card');
      if (card) card.style.display = '';
    });
    window.addEventListener('appinstalled', () => {
      toast('已安装到设备');
      const card = $('#install-card');
      if (card) card.style.display = 'none';
    });
  }

  /** 注册 Service Worker（仅 https 或 localhost 下可用）。 */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const isSecure =
      location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) return;
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[boot] SW 注册失败', err));
  }

  /** 把未捕获的错误显示到界面上，避免用户只看到「没反应」。 */
  function bindErrorReporting() {
    window.onerror = (message, source, line) => {
      console.error('JS 错误:', message, `@${source}`, `第${line}行`);
      const el = document.getElementById('toast');
      if (!el) return;
      el.textContent = `程序出错了：${message}（第${line}行）`;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 6000);
    };
  }

  /* ---------------- 启动 ---------------- */

  /**
   * 检查浏览器能不能真正保存数据。
   *
   * 为什么必须查这一项：用 file:// 直接打开 html 时，部分浏览器把每个文件
   * 当作独立源，localStorage 会写入失败——表现是「加了任务，刷新就没了」，
   * 而且没有任何报错。与其让用户以为软件坏了，不如启动时就说清楚怎么开。
   * @returns {boolean} 是否可正常保存
   */
  function storageWorks() {
    try {
      const probe = '__shangan_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch (err) {
      console.warn('[boot] localStorage 不可用', err);
      return false;
    }
  }

  /** 数据存不住时，用弹窗给出可执行的解决办法。 */
  function warnStorageUnavailable() {
    openModal(
      '数据存不住（浏览器限制）',
      '<p class="muted" style="margin:4px 0 10px">当前是用文件方式直接打开的，浏览器不允许本页保存数据，' +
        '所以你加的任务刷新后可能消失。</p>' +
        '<p style="margin:0 0 10px"><b>解决办法：</b>双击文件夹里的「启动.bat」' +
        '（或在文件夹里执行 <code>npm start</code>），然后在自动打开的浏览器页面里使用。</p>' +
        '<p class="muted" style="margin:0">启动后地址形如 http://localhost:4000，用它打开就能正常保存了。</p>',
      '<button class="btn btn-primary" data-close>我知道了</button>',
    );
  }

  /** 应用入口。 */
  function init() {
    try {
      const bootHint = document.getElementById('boot-hint');
      if (bootHint) bootHint.style.display = 'none';
      console.log(`上岸计划 通用版 build ${data.BUILD}`);

      bindInstallPrompt();
      bindErrorReporting();

      const canStore = storageWorks();
      const firstRun = data.isFirstRun();
      data.init();
      timer.ensureSubject();

      bindEvents();
      showView('today');
      timer.restore();
      timer.updateUI();
      registerServiceWorker();
      data.syncStart();

      // 首次打开自动弹配置向导；局域网同步拉到已配置过的数据时则关掉它
      if (!SG.state.meta.setupDone) setTimeout(openOnboard, 400);
      // 存不住数据时优先告诉用户原因，不再叠加向导（先解决问题再配置）
      if (!canStore) setTimeout(warnStorageUnavailable, 600);
      if (firstRun) console.log('[boot] 首次运行，已准备配置向导');
    } catch (err) {
      console.error('[boot] 初始化失败', err);
      if (window.onerror) window.onerror(`初始化失败: ${err.message}`, '', 0);
    }
  }

  /* 数据变化 → 重渲染（唯一的渲染触发点，避免各处手工调用） */
  bus.on('change', () => views.renderAll());

  /* 同步采纳了另一端的数据 → 刷新，并在已配置时关掉向导 */
  bus.on('sync:adopted', () => {
    if (SG.state.meta.setupDone) closeOnboard();
  });

  /* 阶段/科目重建后，保证 AI 出题的科目选择仍然有效 */
  bus.on('plan:applied', () => {
    const subjects = SG.subjects();
    if (!subjects.includes(views.aiState.subject)) views.setAISubject(subjects[0]);
  });

  SG.boot = { init, showView, openOnboard, closeOnboard };

  init();
})(window.SG);
