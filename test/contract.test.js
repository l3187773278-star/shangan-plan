'use strict';

/* ============================================================
   test/contract.test.js —— 「接线」验证

   背景：core.js 是唯一的算法实现，app.js 只调用它。
   这类「两个文件之间的约定」最容易在重构时悄悄断掉：
   app.js 里写了 CORE.xxx，而 core.js 根本没导出 xxx；
   或者 index.html 忘了先加载 core.js（浏览器里会直接白屏）。

   这个测试不需要浏览器就能把这两件事验掉：
   1. 逐个检查 app.js 里用到的 CORE.* 是否都在 core.js 导出；
   2. 检查 index.html 里 core.js 在 app.js 之前引入；
   3. 检查 sw.js 的离线缓存清单包含 core.js（否则离线打开白屏）；
   4. 用假的 window 载入 core.js，验证浏览器那条分支确实挂上了 SGCore。
   ============================================================ */

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var ROOT = path.join(__dirname, '..');
var CORE = require('../core.js');

function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

test('接线：app.js 里每一个 CORE.xxx 调用都在 core.js 里有实现', function () {
  var app = read('app.js');
  var used = {};
  var re = /CORE\.([A-Za-z_$][\w$]*)/g;
  var m;
  while ((m = re.exec(app)) !== null) used[m[1]] = (used[m[1]] || 0) + 1;

  var names = Object.keys(used);
  assert.ok(names.length >= 10, 'app.js 里 CORE.* 调用太少，可能接线被改坏了：' + names.length);

  var missing = names.filter(function (n) { return typeof CORE[n] !== 'function'; });
  assert.deepEqual(missing, [], 'app.js 调用了 core.js 里不存在的函数：' + missing.join(', '));
});

test('接线：index.html 必须先加载 core.js 再加载 app.js', function () {
  var html = read('index.html');
  var iCore = html.indexOf('src="core.js"');
  var iApp = html.indexOf('src="app.js"');
  assert.ok(iCore > -1, 'index.html 没有引入 core.js（浏览器会白屏）');
  assert.ok(iApp > -1, 'index.html 没有引入 app.js');
  assert.ok(iCore < iApp, 'core.js 必须在 app.js 之前加载，否则 SGCore 还没定义');
});

test('接线：Service Worker 缓存清单包含 core.js（离线打开才不会白屏）', function () {
  var sw = read('sw.js');
  assert.ok(sw.indexOf("'./core.js'") > -1 || sw.indexOf('"./core.js"') > -1,
    'sw.js 的 ASSETS 里缺少 core.js');
  ['index.html', 'app.js', 'styles.css', 'manifest.json'].forEach(function (f) {
    assert.ok(sw.indexOf(f) > -1, 'sw.js 的 ASSETS 里缺少 ' + f);
  });
});

test('接线：核心逻辑没有被重复实现（app.js 里不应再出现 SM-2 公式）', function () {
  var app = read('app.js');
  // 这行是 SM-2 难度系数公式的特征片段，只应存在于 core.js
  assert.equal(app.indexOf('(5 - q) * (0.08'), -1,
    'app.js 里又出现了一份 SM-2 实现，说明逻辑分叉了');
  var core = read('core.js');
  assert.ok(core.indexOf('(5 - q) * (0.08') > -1, 'core.js 里应有 SM-2 难度系数公式');
});

test('接线：core.js 在浏览器环境（假 window）下会挂载 window.SGCore', function () {
  var src = read('core.js');
  var sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  var api = sandbox.window.SGCore;
  assert.ok(api, 'core.js 没有挂载 window.SGCore');
  ['srsGrade', 'mergeStates', 'buildQueue', 'calcStreak', 'addDaysStr', 'esc', 'uid'].forEach(function (n) {
    assert.equal(typeof api[n], 'function', 'window.SGCore 缺少 ' + n);
  });
  // 浏览器分支不该污染全局 window 属性
  assert.equal(sandbox.window.esc, undefined, 'core.js 不该往 window 上直接挂裸函数');
});

test('接线：package.json 的 test 脚本指向真实存在的测试目录', function () {
  var pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts && pkg.scripts.test, 'package.json 没有 test 脚本');
  assert.ok(fs.existsSync(path.join(ROOT, 'test')), 'test 目录不存在');
  assert.ok(fs.existsSync(path.join(ROOT, 'test', 'core.test.js')), 'core.test.js 不存在');
});
