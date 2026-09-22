import js from '@eslint/js';
import globals from 'globals';

/**
 * 这份配置的目标不是「把代码管死」，而是暴露三类真实风险：
 *   1. 变量/函数名写错（no-undef）——拆模块后最常见的低级错误；
 *   2. 全局变量被误用（浏览器里 document 在 Node 环境不存在之类）；
 *   3. 明显的可疑写法（重复 case、忘了 await 等）。
 *
 * 刻意关掉 no-unused-vars：serve.js / sw.js 里有几个跨文件约定用的占位，
 * 一开就会刷一堆噪音，反而让人不看 lint 结果。
 */
export default [
  {
    ignores: ['node_modules/**', 'icons/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['warn', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-implicit-globals': 'error',
    },
  },
  {
    // Node 环境：本地服务与测试
    files: ['serve.js', 'test/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-implicit-globals': 'off',
    },
  },
  {
    // Service Worker：既有浏览器 API 又有 self 作用域
    files: ['sw.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
  },
];
