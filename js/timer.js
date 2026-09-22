'use strict';

/* ============================================================
   番茄钟（timer.js）

   独立性较强的一块：它有自己的运行时状态，并且**必须跨刷新存活**——
   学习到一半刷新页面，计时不能从头开始。

   两处关键设计：
   1. 运行态写进 localStorage（含 savedAt 时间戳）。刷新后用
      「已过去多少秒」倒推剩余时间，而不是直接信 remain，
      否则刷新期间的时间会被白白亏掉；
   2. 只有 work 模式完成才计入 sessions；休息结束不计数，
      避免把从 4 条记录里算出的「今日专注」虚高。
   ============================================================ */

window.SG = window.SG || {};

(function (SG) {
  const CORE = SG.core;
  const bus = SG.bus;
  const { $, toast, fmtClock } = SG.ui;
  const data = SG.data;

  /** SVG 进度环半径 118，周长用于换算进度。 */
  const RING_CIRCUMFERENCE = 741.4;

  /** 番茄钟运行时状态（不放进 SG.state，避免污染用户数据与同步体积）。 */
  const timer = {
    subject: SG.subjects()[0],
    mode: 'work', // work | break
    running: false,
    remain: 1500,
    total: 1500,
    completedRounds: 0,
    intervalId: null,
  };

  /**
   * 计时参数，全部夹在合理区间内——用户手输 0 或 9999 都不会把计时器搞坏。
   * @returns {{work: number, brk: number, long: number, rounds: number}}
   */
  function settings() {
    const s = SG.state.settings;
    return {
      work: Math.max(1, Math.min(90, +s.pomoWork || 25)),
      brk: Math.max(1, Math.min(30, +s.pomoBreak || 5)),
      long: Math.max(1, Math.min(60, +s.pomoLong || 15)),
      rounds: Math.max(1, Math.min(10, +s.pomoRounds || 4)),
    };
  }

  /** 当前这一轮应该跑多少秒（长休息由「已完成轮数」是否整除决定）。 */
  function totalSeconds() {
    const s = settings();
    if (timer.mode === 'work') return s.work * 60;
    const isLongBreak = timer.completedRounds > 0 && timer.completedRounds % s.rounds === 0;
    return (isLongBreak ? s.long : s.brk) * 60;
  }

  /** 把当前计时状态写进 localStorage，供刷新后恢复。 */
  function persist() {
    try {
      localStorage.setItem(
        data.TIMER_KEY,
        JSON.stringify({
          subject: timer.subject,
          mode: timer.mode,
          running: timer.running,
          remain: timer.remain,
          total: timer.total,
          completedRounds: timer.completedRounds,
          savedAt: Date.now(),
        }),
      );
    } catch (err) {
      console.warn('[timer] 计时状态保存失败', err);
    }
  }

  /** 每秒步进：归零则结算，每 30 秒落一次盘。 */
  function tick() {
    timer.remain--;
    if (timer.remain <= 0) {
      complete();
      return;
    }
    if (timer.remain % 30 === 0) persist();
    updateUI();
    document.title = `${fmtClock(timer.remain)}${timer.mode === 'work' ? ' · 专注中' : ' · 休息中'} - 上岸计划`;
  }

  /** 开始（已在运行则忽略，避免叠出两个 interval）。 */
  function start() {
    if (timer.running) return;
    timer.running = true;
    timer.intervalId = setInterval(tick, 1000);
    persist();
    updateUI();
  }

  /** 暂停。 */
  function pause() {
    timer.running = false;
    clearInterval(timer.intervalId);
    timer.intervalId = null;
    persist();
    updateUI();
  }

  /** 重置当前这一轮到满格。 */
  function reset() {
    clearInterval(timer.intervalId);
    timer.intervalId = null;
    timer.running = false;
    timer.total = totalSeconds();
    timer.remain = timer.total;
    persist();
    updateUI();
  }

  /**
   * 切换工作/休息模式并重置计时。
   * @param {'work'|'break'} mode
   */
  function switchTo(mode) {
    clearInterval(timer.intervalId);
    timer.intervalId = null;
    timer.running = false;
    timer.mode = mode;
    timer.total = totalSeconds();
    timer.remain = timer.total;
    persist();
    updateUI();
  }

  /** 一轮计时结束的结算：工作轮记一次专注并自动进入休息。 */
  function complete() {
    beep();
    const s = settings();

    if (timer.mode === 'work') {
      timer.completedRounds++;
      data.addSession(timer.subject, s.work);
      const isLongBreak = timer.completedRounds % s.rounds === 0;
      toast(`专注完成！休息 ${isLongBreak ? s.long : s.brk} 分钟`);
      switchTo('break');
      start();
    } else {
      toast('休息结束，开始下一轮专注');
      switchTo('work');
    }
    bus.emit('change');
  }

  /** 手动跳过当前这一轮。 */
  function skip() {
    clearInterval(timer.intervalId);
    timer.intervalId = null;
    if (timer.mode === 'work') {
      switchTo('break');
      toast('已跳过本次专注');
      start();
    } else {
      switchTo('work');
      toast('已跳过休息');
    }
    bus.emit('change');
  }

  /** 用 WebAudio 合成三声提示音；浏览器不支持时静默跳过。 */
  function beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();

      const note = (freq, delay, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration + 0.05);
      };
      note(880, 0, 0.25);
      note(660, 0.28, 0.25);
      note(990, 0.56, 0.4);
    } catch (err) {
      console.warn('[timer] 提示音播放失败', err);
    }
  }

  /** 刷新界面上的计时显示（元素不存在时直接返回，供早期调用）。 */
  function updateUI() {
    const modeEl = $('#timer-mode');
    if (!modeEl) return;
    const display = $('#timer-display');
    const sub = $('#timer-sub');
    const ring = $('#ring-fg');
    const s = settings();
    const isWork = timer.mode === 'work';

    modeEl.textContent = isWork ? '专注' : '休息';
    modeEl.classList.toggle('break', !isWork);
    display.textContent = fmtClock(timer.remain);

    const roundNum = Math.min(timer.completedRounds + 1, s.rounds);
    const isLongBreak = timer.completedRounds > 0 && timer.completedRounds % s.rounds === 0;
    sub.textContent = isWork
      ? `第 ${roundNum} 轮 · 共 ${s.rounds} 轮`
      : isLongBreak
        ? '长休息 · 放松一下'
        : '短休息';

    ring.classList.toggle('break', !isWork);
    ring.style.strokeDashoffset = String(
      RING_CIRCUMFERENCE * (1 - (timer.total > 0 ? timer.remain / timer.total : 0)),
    );

    const startBtn = $('#btn-start');
    if (startBtn) {
      const idle = timer.remain >= timer.total;
      $('#btn-start-label').textContent = timer.running
        ? '暂停'
        : isWork
          ? idle
            ? '开始专注'
            : '继续专注'
          : idle
            ? '开始休息'
            : '继续休息';
      $('#btn-start-ic').innerHTML = `<use href="${timer.running ? '#i-pause' : '#i-play'}"/>`;
    }
  }

  /**
   * 从 localStorage 恢复计时（含「刷新期间流逝的时间」补偿）。
   * 若恢复时已经超时，直接按完成结算。
   */
  function restore() {
    try {
      const raw = localStorage.getItem(data.TIMER_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved.remain !== 'number') return;

      const subjectList = SG.subjects();
      timer.subject = subjectList.indexOf(saved.subject) > -1 ? saved.subject : subjectList[0];
      timer.mode = saved.mode === 'break' ? 'break' : 'work';
      timer.total = saved.total || totalSeconds();
      timer.completedRounds = saved.completedRounds || 0;
      timer.remain = saved.remain;

      if (!saved.running) return;

      const elapsed = Math.floor((Date.now() - (saved.savedAt || Date.now())) / 1000);
      timer.remain = Math.max(0, saved.remain - elapsed);
      if (timer.remain > 0) {
        timer.running = true;
        timer.intervalId = setInterval(tick, 1000);
      } else {
        timer.running = false;
        complete();
      }
    } catch (err) {
      console.warn('[timer] 计时状态恢复失败', err);
    }
  }

  /**
   * 切换当前专注科目。
   * @param {string} subject
   */
  function setSubject(subject) {
    timer.subject = subject;
    persist();
    bus.emit('change');
  }

  /** 科目列表变化后，确保当前科目仍然存在。 */
  function ensureSubject() {
    const list = SG.subjects();
    if (list.indexOf(timer.subject) < 0) timer.subject = list[0];
  }

  SG.timer = {
    state: timer,
    settings,
    totalSeconds,
    start,
    pause,
    reset,
    skip,
    switchTo,
    updateUI,
    restore,
    setSubject,
    ensureSubject,
    /** 供界面判断按钮该显示「开始」还是「暂停」。 */
    isRunning: () => timer.running,
  };

  bus.on('plan:applied', ensureSubject);
})(window.SG);
