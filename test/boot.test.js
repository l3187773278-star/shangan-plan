'use strict';

/* ============================================================
   test/boot.test.js —— 在没有浏览器的环境里真跑一遍启动流程

   为什么需要它：契约测试只能证明「名字对得上」，证明不了「页面能起来」。
   白屏这种问题恰恰是启动时抛了异常：后面的模块都没执行，DOM 一直是空的。

   做法：造一套最小的 document / localStorage / fetch，把 index.html 里
   那 8 个脚本按顺序丢进 vm 里执行，然后：
     1. 任何异常都会被抛出，测试直接失败并指出是哪个文件、哪一行；
     2. 断言启动后关键容器**真的被写入了内容**（不只是「没报错」）；
     3. 模拟点击，验证事件委托能一路走到数据层。

   ⚠️ 一个踩过的坑：假 DOM 必须建在**测试所在的 realm**里。
   如果把假 DOM 建在 vm 沙箱内部再传给测试，跨 realm 的对象代理会让
   「脚本写入的元素」和「测试读取的元素」不是同一个对象——
   断言永远读到空值，排查起来极其费时（这个坑真的踩了两次）。
   所以这里只把 app 的脚本放进沙箱，DOM 由宿主提供。
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

/** 按 index.html 里的顺序加载。 */
const SCRIPTS = [
  'core.js',
  'js/bus.js',
  'js/exams.js',
  'js/ui.js',
  'js/data.js',
  'js/timer.js',
  'js/views.js',
  'js/boot.js',
];

/* ---------------- 假 DOM（宿主 realm） ---------------- */

/** 元素替身：记录被写入的文本/HTML，其余方法都安全空转。 */
function makeElement(id) {
  const classes = new Set();
  const attributes = new Map();
  const element = {
    id,
    tagName: 'DIV',
    textContent: '',
    innerHTML: '',
    outerHTML: '',
    value: '',
    files: null,
    style: {},
    dataset: {},
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      contains: (n) => classes.has(n),
      toggle: (n, force) => {
        const on = force === undefined ? !classes.has(n) : !!force;
        if (on) classes.add(n);
        else classes.delete(n);
        return on;
      },
    },
    addEventListener() {},
    removeEventListener() {},
    click() {},
    closest() {
      return null;
    },
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
    setAttribute: (name, value) => attributes.set(name, String(value)),
    appendChild() {},
    removeChild() {},
    remove() {},
    /** 元素内部的查询：始终返回同一个子替身，模拟稳定的 DOM 节点。 */
    querySelector() {
      if (!element.child) element.child = makeElement('__child__');
      return element.child;
    },
    querySelectorAll() {
      if (!element.child) element.child = makeElement('__child__');
      return [element.child];
    },
  };
  return element;
}

/**
 * 建一个最小 document：按 id 缓存（同一个选择器永远拿到同一个对象，
 * 这样才能断言「某块内容被渲染进去了」），未声明的选择器也给替身，
 * 避免因 null 掩盖真正的错误。
 * @param {string[]} htmlIds
 * @param {Map<string, string>} store 本地存储（供断言落盘内容）
 */
function makeDocument(htmlIds, store) {
  const byId = new Map();
  const bySelector = new Map();
  const listeners = new Map();

  const getElement = (id) => {
    if (!byId.has(id)) byId.set(id, makeElement(id));
    return byId.get(id);
  };
  htmlIds.forEach(getElement);

  /** 从选择器里抠出 #id；没有 id 的（类名/属性）按选择器缓存。 */
  const resolve = (selector) => {
    const key = String(selector);
    const idMatch = key.match(/#([A-Za-z][\w-]*)/);
    if (idMatch) return getElement(idMatch[1]);
    if (!bySelector.has(key)) bySelector.set(key, makeElement(key));
    return bySelector.get(key);
  };

  return {
    body: makeElement('body'),
    documentElement: makeElement('html'),
    title: '',
    getElementById: (id) => getElement(id),
    querySelector: resolve,
    querySelectorAll: () => [resolve('__stub__')],
    createElement: (tag) => Object.assign(makeElement('__created__'), { tagName: String(tag).toUpperCase() }),
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener() {},
    /** 测试用：取元素（等价于按 id 查询）。 */
    _element: (id) => resolve(`#${id}`),
    /** 测试用：触发一次事件，模拟点击/输入。 */
    _fire: (type, event) => (listeners.get(type) || []).forEach((handler) => handler(event)),
    _hasListener: (type) => (listeners.get(type) || []).length > 0,
    _store: store,
  };
}

/* ---------------- 加载应用 ---------------- */

/**
 * 用假 DOM 加载整个应用。
 * @param {{seedData?: Object, protocol?: string, storageBroken?: boolean, runTimeouts?: boolean}} [options]
 * @returns {{SG: Object, document: Object, store: Map, errors: string[]}}
 */
function loadApp(options = {}) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const htmlIds = [...html.matchAll(/id="([A-Za-z][\w-]*)"/g)].map((m) => m[1]);

  const store = new Map();
  if (options.seedData) store.set('shangan-gen-v1', JSON.stringify(options.seedData));

  const document = makeDocument(htmlIds, store);
  const errors = [];
  const requests = [];
  const pendingTimeouts = [];

  const consoleFake = {
    log() {},
    warn: (...args) => errors.push(`warn: ${args.join(' ')}`),
    error: (...args) => errors.push(`error: ${args.join(' ')}`),
  };

  const localStorageFake = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      if (options.storageBroken) throw new Error('QuotaExceededError: storage is disabled');
      store.set(key, String(value));
    },
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };

  const window = {
    document,
    location: {
      protocol: options.protocol || 'http:',
      hostname: options.hostname || 'localhost',
      href: options.href || 'http://localhost:4000/',
    },
    navigator: {},
    console: consoleFake,
    setTimeout: (fn) => {
      pendingTimeouts.push(fn);
      return 0;
    },
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    addEventListener() {},
    scrollTo() {},
    URL: { createObjectURL: () => 'blob:', revokeObjectURL() {} },
    localStorage: localStorageFake,
    /** 记录每一次请求：断言要看的是「应用到底发了什么」，只看「没报错」不够。 */
    fetch: (url, init) => {
      requests.push({ url: String(url), init: init || {} });
      // AI 请求给一份合法响应，好让成功路径（解析出题目）也能被断言
      if (String(url).includes('deepseek')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              choices: [{ message: { content: '{"questions":[{"q":"为什么三次握手？","a":"同步双方序号"}]}' } }],
            }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, data: null, savedAt: 0 }) });
    },
  };

  const context = vm.createContext({});
  Object.assign(context, {
    window,
    document,
    localStorage: localStorageFake,
    console: consoleFake,
    location: window.location,
    navigator: window.navigator,
    fetch: window.fetch,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    setInterval: window.setInterval,
    clearInterval: window.clearInterval,
    URL: window.URL,
  });
  context.window.window = window;

  SCRIPTS.forEach((file) => {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    try {
      vm.runInContext(source, context, { filename: file });
    } catch (err) {
      err.message = `加载 ${file} 时抛错：${err.message}`;
      throw err;
    }
  });

  if (options.runTimeouts !== false) pendingTimeouts.splice(0).forEach((fn) => fn());

  return { SG: window.SG, document, store, errors, requests };
}

/** 当前日期（与 core.js 的 todayStr 一致）。 */
function todayStr() {
  const d = new Date();
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 一份完整的示例数据，用于验证渲染结果。 */
function sampleState() {
  const today = todayStr();
  return {
    meta: { v: 1, createdAt: today, setupDone: true, savedAt: 1 },
    settings: {
      examType: 'zhuanshengben',
      examLabel: '专升本',
      school: '目标院校',
      examDate: '2027-04-15',
      subjects: ['英语', '计网'],
      baodi: ['记忆 30 分钟', '主科 30 分钟', '刷题 30 分钟'],
      wordTarget: 40,
      deepseekKey: '',
      pomoWork: 25,
      pomoBreak: 5,
      pomoLong: 15,
      pomoRounds: 4,
    },
    tasks: [{ id: 't1', date: today, subject: '英语', title: '背单词', done: false }],
    cards: [
      {
        id: 'c1',
        subject: '计网',
        chapter: '第4章',
        q: 'TCP 三次握手？',
        a: 'SYN / SYN-ACK / ACK',
        reps: 0,
        ease: 2.5,
        interval: 0,
        lapses: 0,
        due: today,
      },
    ],
    sessions: [{ id: 's1', date: today, subject: '英语', minutes: 25, at: 1 }],
    reviews: [],
    notes: [{ id: 'n1', title: '四行法笔记', subject: '英语', chapter: '', body: '内容', updatedAt: today }],
    errors: [
      { id: 'e1', subject: '计网', chapter: '', q: '三次握手', my: '两次', a: '三次', mastered: false, createdAt: today },
    ],
    milestones: [],
    phases: [],
    goals: [],
    checklist: [{ id: 'ck1', text: '买齐资料', done: false }],
    materials: [],
    days: { [today]: { baodi: [true, false, false], words: 20, active: true } },
  };
}

/* ---------------- 启动 ---------------- */

test('启动：8 个脚本能全部加载并执行完，不抛异常', () => {
  const { SG } = loadApp();
  assert.ok(SG.core, 'core.js 未挂载');
  assert.ok(SG.data, 'data.js 未挂载');
  assert.ok(SG.views, 'views.js 未挂载');
  assert.ok(SG.boot, 'boot.js 未挂载');
  assert.ok(SG.state, 'state 未初始化');
});

test('启动：全新用户会得到一份可用的空状态并写入本地存储', () => {
  const { SG, store } = loadApp();
  const saved = JSON.parse(store.get('shangan-gen-v1'));
  assert.ok(saved, '首次启动应把初始数据写进 localStorage');
  assert.equal(saved.meta.setupDone, false, '新用户应标记为未配置');
  assert.ok(Array.isArray(saved.tasks));
  assert.ok(SG.state.settings.examDate, '默认应有考试日期（今天 +180 天）');
});

test('启动：启动过程中不得写入 console.error / console.warn', () => {
  const { errors } = loadApp({ seedData: sampleState() });
  assert.equal(errors.length, 0, `启动期间出现告警/错误：\n${errors.join('\n')}`);
});

/* ---------------- 渲染 ---------------- */

test('渲染：启动后关键容器真的被写入了内容（不是白屏）', () => {
  const { document, SG } = loadApp({ seedData: sampleState() });
  const el = (id) => document._element(id);

  assert.equal(SG.state.meta.setupDone, true, '示例数据未被载入');
  assert.ok(el('today-title').textContent, `今日页标题未渲染（实际：${JSON.stringify(el('today-title').textContent)}）`);
  assert.ok(el('countdown-card').innerHTML.includes('天'), '倒计时未渲染');
  assert.ok(el('today-tasks').innerHTML.includes('背单词'), '今日任务列表未渲染');
  assert.ok(el('today-mini').innerHTML.includes('今日专注'), '今日统计未渲染');
  assert.ok(el('baodi-list').innerHTML.includes('记忆 30 分钟'), '保底三件套未渲染');
  assert.ok(el('words-tracker').innerHTML.includes('20 / 40'), '记忆量进度未渲染');
  assert.ok(el('checklist').innerHTML.includes('买齐资料'), '开箱待办未渲染');
  assert.ok(el('card-list').innerHTML.includes('TCP 三次握手'), '卡片库未渲染');
  assert.ok(el('notes-list').innerHTML.includes('四行法笔记'), '笔记列表未渲染');
  assert.ok(el('errors-list').innerHTML.includes('三次握手'), '错题本未渲染');
  assert.ok(el('review-stats').innerHTML.includes('待复习'), '复习统计未渲染');
  assert.ok(el('stats-summary').innerHTML.includes('累计专注'), '统计页未渲染');
  assert.ok(el('settings-tips').innerHTML.includes('启动.bat'), '设置页提示未渲染');
  assert.ok(el('side-foot').innerHTML.includes('连续打卡'), '侧边栏底部未渲染');
  assert.ok(el('today-title').textContent.includes('月'), '标题不是中文日期格式');
});

test('渲染：逐个视图切换都不会抛错', () => {
  const { SG, errors } = loadApp({ seedData: sampleState() });
  ['today', 'plan', 'focus', 'review', 'more', 'stats', 'goals', 'notes', 'errors', 'settings', 'materials'].forEach(
    (view) => SG.boot.showView(view),
  );
  assert.equal(errors.length, 0, `切换视图期间出现错误：\n${errors.join('\n')}`);
});

test('渲染：复习页能显示到期卡片与评分按钮', () => {
  const { document, SG } = loadApp({ seedData: sampleState() });
  SG.boot.showView('review');
  assert.ok(document._element('rc-q').textContent.includes('TCP'), '复习卡片题干未渲染');
  assert.ok(document._element('review-progress').textContent.includes('剩余'), '复习进度未渲染');
});

/* ---------------- 交互 ---------------- */

test('交互：点击任务复选框会真的落到数据层（事件委托没断）', () => {
  const { SG, document, store } = loadApp({ seedData: sampleState() });
  const task = SG.state.tasks[0];
  assert.ok(task, '示例任务未载入');
  assert.ok(document._hasListener('click'), 'document 上没有注册点击委托');

  document._fire('click', {
    target: {
      closest: (selector) =>
        selector === '[data-action]'
          ? {
              getAttribute: (name) =>
                ({ 'data-action': 'toggle-task', 'data-id': task.id, 'data-i': '0', 'data-n': '10', 'data-f': '' }[
                  name
                ] ?? null),
            }
          : null,
    },
  });

  assert.equal(SG.state.tasks[0].done, true, '点击后任务应标记为完成');
  assert.equal(JSON.parse(store.get('shangan-gen-v1')).tasks[0].done, true, '完成状态应已落盘');
});

test('交互：番茄钟能启动、暂停，完成后写入专注记录', () => {
  const { SG, document } = loadApp({ seedData: sampleState() });
  SG.boot.showView('focus');

  assert.match(document._element('timer-display').textContent, /^\d{2}:\d{2}$/, '计时显示格式不对');

  SG.timer.start();
  assert.equal(SG.timer.isRunning(), true, '计时未启动');
  SG.timer.pause();
  assert.equal(SG.timer.isRunning(), false, '暂停未生效');

  const before = SG.state.sessions.length;
  SG.data.addSession(SG.timer.state.subject, SG.timer.settings().work);
  assert.equal(SG.state.sessions.length, before + 1, '专注记录未写入');
  assert.ok(document._element('focus-log').innerHTML.includes('分钟'), '专注流水未渲染');
});

test('交互：加一条任务后，今日页与落盘数据都更新', () => {
  const { SG, document, store } = loadApp({ seedData: sampleState() });
  SG.data.addTask(todayStr(), '新增的任务', SG.subjects()[0]);
  assert.ok(document._element('today-tasks').innerHTML.includes('新增的任务'), '今日页未刷新');
  assert.ok(
    JSON.parse(store.get('shangan-gen-v1')).tasks.some((t) => t.title === '新增的任务'),
    '新任务未落盘',
  );
});

test('交互：部署到 https 后，AI 出题直连官方接口且必须带 Authorization 头', async () => {
  const { SG, requests } = loadApp({
    protocol: 'https:',
    hostname: 'l3187773278-star.github.io',
    href: 'https://l3187773278-star.github.io/shangan/',
    seedData: sampleState(),
  });
  SG.state.settings.deepseekKey = 'sk-test-abc';

  SG.views.generateAIQuestions();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const call = requests.find((r) => r.url.includes('deepseek'));
  assert.ok(call, `应发出一次 AI 请求，实际：${requests.map((r) => r.url).join(', ') || '（一次都没有）'}`);
  assert.equal(call.url, 'https://api.deepseek.com/chat/completions', 'https 下应直连官方接口');
  // 回归点：这条路径只在部署后才会走，本地用 启动.bat（http）永远走不到，
  // 所以必须在这里把「鉴权头」钉死——没有它上线就是 401。
  assert.equal(call.init.headers.Authorization, 'Bearer sk-test-abc', '直连必须自己带 Authorization 头');
  assert.equal(JSON.parse(call.init.body).key, undefined, '直连时 key 不应出现在 body 里');
  assert.ok(SG.views.aiState.items.length > 0, '拿到合法 JSON 后应解析出题目');
});

test('交互：本机（http）跑 启动.bat 时，AI 出题仍走代理且 key 在 body 里', async () => {
  const { SG, requests } = loadApp({ seedData: sampleState() }); // 默认 protocol 为 http:
  SG.state.settings.deepseekKey = 'sk-test-abc';

  SG.views.generateAIQuestions();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const call = requests.find((r) => r.url.includes('deepseek'));
  assert.ok(call, '本机应发出一次 AI 请求');
  assert.equal(call.url, 'api/deepseek', 'http 下应走同源代理（由 serve.js 转发并加鉴权头）');
  assert.equal(call.init.headers.Authorization, undefined, '代理模式由服务端加 Authorization');
  assert.equal(JSON.parse(call.init.body).key, 'sk-test-abc', 'key 交给服务端');
});

/* ---------------- 异常环境 ---------------- */

test('启动：存储不可用（file:// 常见）时会弹窗说明，而不是静默丢数据', () => {
  const { document } = loadApp({ protocol: 'file:', hostname: '', href: 'file:///D:/app/index.html', storageBroken: true });
  const modal = document._element('modal-root').innerHTML;
  assert.ok(modal.includes('数据存不住'), '存储不可用时应弹出说明');
  assert.ok(modal.includes('启动.bat'), '提示里应给出可执行的解决办法');
});

test('启动：存储不可用时应用仍能渲染（只是不保存），不应白屏', () => {
  const { document, errors } = loadApp({ storageBroken: true });
  assert.ok(document._element('today-title').textContent, '即使存不住数据，页面也该正常显示');

  // 这种降级环境下 console.warn 是预期行为（开发排查用），
  // 但不应出现 console.error —— 那说明有真正的异常。
  const fatal = errors.filter((message) => message.startsWith('error:'));
  assert.equal(fatal.length, 0, `存储不可用时出现了异常：\n${fatal.join('\n')}`);
  assert.ok(
    errors.some((message) => message.includes('localStorage 不可用')),
    '应在控制台留一条可排查的告警',
  );
});
