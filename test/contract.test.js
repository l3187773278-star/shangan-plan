'use strict';

/* ============================================================
   test/contract.test.js —— 「接线」验证

   拆模块最容易出的问题不是算法错，而是**接线断**：
   - 视图代码里 $('#today-mini') 写成了 $('#today-minis')，页面少一块内容但不报错；
   - 按钮写了 data-action="del-note"，但 boot 的分发器里没有这个分支，点了没反应；
   - 脚本加载顺序错了，运行时 SG.xxx 是 undefined；
   - sw.js 漏缓存某个模块，离线打开白屏。

   这些都不需要浏览器就能验：静态比对代码里出现的
   元素 id / 动作名 / 模块路径，和 index.html、各模块实际导出的内容。
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CORE = require('../core.js');

const SOURCE_FILES = [
  'index.html',
  'styles.css',
  'core.js',
  'sw.js',
  'js/bus.js',
  'js/exams.js',
  'js/ui.js',
  'js/data.js',
  'js/timer.js',
  'js/views.js',
  'js/boot.js',
];

/** 按加载顺序排列的脚本（boot 必须最后）。 */
const LOAD_ORDER = [
  'core.js',
  'js/bus.js',
  'js/exams.js',
  'js/ui.js',
  'js/data.js',
  'js/timer.js',
  'js/views.js',
  'js/boot.js',
];

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = () => read('index.html');

/** 元素 id 白名单：由 HTML 之外的地方（服务端模板、浏览器行为）产生。 */
const ID_WHITELIST = new Set();

/* ---------------- 文件结构 ---------------- */

test('结构：所有源文件存在，且旧的单文件 app.js 已移除', () => {
  SOURCE_FILES.forEach((file) => {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `缺少文件：${file}`);
  });
  assert.equal(
    fs.existsSync(path.join(ROOT, 'app.js')),
    false,
    'app.js 已拆分，不应继续存在（否则会出现两份实现）',
  );
});

test('结构：index.html 按依赖顺序加载模块，core 最先、boot 最后', () => {
  const page = html();
  const positions = LOAD_ORDER.map((file) => {
    const index = page.indexOf(`src="${file}"`);
    assert.ok(index > -1, `index.html 没有引入 ${file}`);
    return index;
  });
  const sorted = [...positions].sort((a, b) => a - b);
  assert.deepEqual(positions, sorted, '脚本加载顺序与依赖关系不一致');
});

test('结构：Service Worker 缓存清单覆盖全部脚本（离线才不会白屏）', () => {
  const sw = read('sw.js');
  LOAD_ORDER.forEach((file) => {
    assert.ok(sw.includes(`./${file}`), `sw.js 的 ASSETS 缺少 ${file}`);
  });
  assert.ok(sw.includes('./styles.css'), 'sw.js 的 ASSETS 缺少 styles.css');
});

/* ---------------- 元素 id ---------------- */

test('接线：代码里引用的每个 #id 都存在（HTML 静态声明 或 JS 动态生成）', () => {
  const page = html();

  // 静态声明在 index.html 里
  const declared = new Set([...page.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  // 动态生成在 JS 字符串里（模态框、卡片行等由脚本拼出来的节点）
  LOAD_ORDER.forEach((file) => {
    [...read(file).matchAll(/id="([A-Za-z][\w-]*)"/g)].forEach((m) => declared.add(m[1]));
  });

  const referenced = new Set();
  LOAD_ORDER.forEach((file) => {
    const source = read(file);
    // 只检查 $('#xxx') / $$('#xxx') 这类 id 选择器（排除带空格、类名、属性的选择器）
    [...source.matchAll(/\$\$?\(\s*'#([A-Za-z][\w-]*)'\s*\)/g)].forEach((m) => referenced.add(m[1]));
  });

  const missing = [...referenced].filter((id) => !declared.has(id) && !ID_WHITELIST.has(id));
  assert.deepEqual(missing, [], `代码引用了不存在的 id：${missing.join(', ')}`);
  assert.ok(referenced.size > 80, `提取到的 id 数量异常（${referenced.size}），检查正则是否失效`);
});

/* ---------------- 动作分发 ---------------- */

test('接线：所有 click 动作都在 boot 的分发器里有对应分支', () => {
  const boot = read('js/boot.js');
  const handled = new Set([...boot.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]));

  // 动态拼出来的动作名（筛选按钮由 filterChipsHTML 生成）与输入类动作不由 click 分发
  const DYNAMIC_ACTIONS = ['${action}'];
  const INPUT_ONLY_ACTIONS = ['ai-type'];

  const used = new Set();
  ['js/views.js', 'js/boot.js'].forEach((file) => {
    [...read(file).matchAll(/data-action="([^"]+)"/g)].forEach((m) => used.add(m[1]));
  });

  const unhandled = [...used].filter(
    (action) => !handled.has(action) && !DYNAMIC_ACTIONS.includes(action) && !INPUT_ONLY_ACTIONS.includes(action),
  );
  assert.deepEqual(unhandled, [], `按钮动作没有处理分支：${unhandled.join(', ')}`);
  assert.ok(handled.size >= 20, `分发器分支数量异常（${handled.size}）`);

  // 筛选类动作由 filterChipsHTML 动态生成，必须确实存在
  ['filter-cards', 'filter-notes', 'filter-errors'].forEach((action) => {
    assert.ok(handled.has(action), `分发器缺少筛选动作：${action}`);
    assert.ok(
      read('js/views.js').includes(`'${action}'`),
      `filterChipsHTML 里没有生成 ${action}`,
    );
  });
});

/* ---------------- 命名空间 ---------------- */

test('接线：每个模块挂载的 SG 命名空间与代码里用到的一致', () => {
  const boot = read('js/boot.js');
  const defined = new Set();
  ['js/bus.js', 'js/ui.js', 'js/data.js', 'js/timer.js', 'js/views.js', 'js/boot.js'].forEach((file) => {
    [...read(file).matchAll(/SG\.(\w+)\s*=/g)].forEach((m) => defined.add(m[1]));
  });
  // core.js / exams.js 直挂 window.SG
  defined.add('core');
  defined.add('EXAM_TEMPLATES');
  defined.add('GENERIC_CHECKLIST');
  defined.add('PALETTE'); // data.js 里挂的科目配色
  defined.add('state'); // data.js 用 defineProperty 挂的活引用

  const used = new Set();
  LOAD_ORDER.forEach((file) => {
    [...read(file).matchAll(/\bSG\.(\w+)/g)].forEach((m) => used.add(m[1]));
  });

  const missing = [...used].filter((name) => !defined.has(name));
  assert.deepEqual(missing, [], `代码引用了未挂载的命名空间：SG.${missing.join(', SG.')}`);
});

test('接线：boot.js 里调用的 views/data/timer 方法都真实存在（静态检查）', () => {
  const boot = read('js/boot.js');
  const exportedOf = (file, namespace) => {
    const source = read(file);
    const start = source.indexOf(`SG.${namespace} = {`);
    assert.ok(start > -1, `${file} 里找不到 SG.${namespace} 导出块`);
    const block = source.slice(start, source.indexOf('};', start));
    return new Set([...block.matchAll(/^\s{4}(\w+)[,:]/gm)].map((m) => m[1]));
  };

  const tables = {
    views: exportedOf('js/views.js', 'views'),
    data: exportedOf('js/data.js', 'data'),
    timer: exportedOf('js/timer.js', 'timer'),
    ui: exportedOf('js/ui.js', 'ui'),
  };

  const problems = [];
  Object.keys(tables).forEach((namespace) => {
    [...boot.matchAll(new RegExp(`\\b${namespace}\\.(\\w+)`, 'g'))].forEach((m) => {
      if (!tables[namespace].has(m[1])) problems.push(`${namespace}.${m[1]}`);
    });
  });

  assert.deepEqual([...new Set(problems)], [], `boot.js 调用了不存在的成员：${problems.join(', ')}`);
});

/* ---------------- 算法层 ---------------- */

test('算法：SM-2 难度系数公式只存在于 core.js，其它模块不得重复实现', () => {
  // 公式特征片段（允许不同变量名/空白，所以用更宽的正则）
  const SM2_PATTERN = /\(5\s*-\s*\w+\)\s*\*\s*\(0\.08/;
  LOAD_ORDER.filter((file) => file !== 'core.js').forEach((file) => {
    assert.equal(SM2_PATTERN.test(read(file)), false, `${file} 里出现了第二份 SM-2 实现`);
  });
  assert.ok(SM2_PATTERN.test(read('core.js')), 'core.js 里应有 SM-2 难度系数公式');
});

test('算法：core.js 在浏览器（假 window）与 Node 下都可用', () => {
  const source = read('core.js');
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  const api = sandbox.window.SGCore;
  assert.ok(api, 'core.js 没有挂载 window.SGCore');
  ['srsGrade', 'mergeStates', 'buildQueue', 'calcStreak', 'addDaysStr', 'esc', 'uid'].forEach((name) => {
    assert.equal(typeof api[name], 'function', `window.SGCore 缺少 ${name}`);
  });
  assert.equal(sandbox.window.esc, undefined, 'core.js 不该往 window 上直接挂裸函数');

  Object.keys(CORE).forEach((name) => {
    assert.equal(typeof CORE[name], 'function', `Node 侧应导出函数 ${name}`);
  });
});

test('算法：core.js 不依赖 DOM 与 localStorage（保证可测）', () => {
  // 先去掉注释再检查：注释里出现这些词是正常的（如「不碰 localStorage」）
  const source = read('core.js')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  ['document.', 'localStorage', 'window.location', 'fetch('].forEach((token) => {
    assert.equal(source.includes(token), false, `core.js 的代码里不应出现 ${token}`);
  });
});

/* ---------------- 工程配置 ---------------- */

test('工程：package.json 的脚本指向真实存在的测试与入口文件', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts.test.includes('test'), 'package.json 缺少 test 脚本');
  assert.ok(fs.existsSync(path.join(ROOT, 'test')), 'test 目录不存在');
  assert.ok(fs.existsSync(path.join(ROOT, 'test', 'core.test.js')), 'core.test.js 不存在');
  assert.ok(fs.existsSync(path.join(ROOT, 'serve.js')), 'serve.js 不存在');
});

test('工程：仓库里不含个人隐私与本机信息', () => {
  const forbidden = [/192\.168\.\d+\.\d+/, /13235527227/, /L3187773278/, /残疾/, /湖北理工学院/];
  SOURCE_FILES.forEach((file) => {
    const source = read(file);
    forbidden.forEach((pattern) => {
      // README 里作为示例出现的 192.168.x.x 除外
      const hit = source.match(pattern);
      if (!hit) return;
      const isDocExample = file.endsWith('.md') && hit[0] === '192.168.';
      assert.ok(isDocExample, `${file} 里出现了不该提交的内容：${hit[0]}`);
    });
  });
});
