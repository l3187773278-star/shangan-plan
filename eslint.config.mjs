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
 *
 * 刻意关掉 no-var：本仓库统一用 var 写（core.js / js/*.js 以经典 <script> 方式加载，
 * 不经过任何转译），这是一个一致的风格选择，不是错误。曾经把它设成 'error'，
 * 结果是 `npm run lint` 恒红（95 条 no-var），谁也不会去看剩下的真问题——
 * 比不检查更糟。下面这些规则才是这份配置真正要守的东西。
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
      'no-var': 'off',
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
    /* core.js 同时支持浏览器与 Node：末尾有 `if (typeof module !== 'undefined' && module.exports)`
       这一句 CommonJS 导出（test/core.test.js 靠它 require）。不声明 globals.node 就会报
       module is not defined，而且整套 globals.node 又会让浏览器里根本不存在的 process 等名字逃过检查。
       另一个选择是给这一行加 eslint-disable 注释，但文件里保留那句可读的导出更值。 */
    files: ['core.js'],
    languageOptions: {
      globals: {
        module: 'writable',
        require: 'readonly',
      },
    },
  },
  {
    /* Service Worker：注册后由浏览器以经典脚本（非 module）加载，
       scope 挂在 self 上而不是 window，缓存名等顶层变量只能在 install/activate 里读写。 */
    files: ['sw.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
    rules: {
      'no-implicit-globals': 'off',
    },
  },
];
