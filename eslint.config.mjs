import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import babelParser from '@babel/eslint-parser'

// ---------------------------------------------------------------------------
// 说明：@typescript-eslint（parser / plugin / typescript-estree）当前对 TS 7.x
// 存在硬性版本门（dist/index.js 加载时直接 throw，见 typescript-eslint#10940），
// 而本项目使用 TypeScript 7.0.2（原生 Go 版 tsc），故 ESLint 暂以 @babel/eslint-parser
// 做纯语法级 lint：可运行 react-hooks 与 JS 基线规则，但不含类型相关规则。
// 待 typescript-eslint 官方支持 TS 7.x 后，建议换回 tseslint.configs.recommended。
// ---------------------------------------------------------------------------
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'resources/**', 'release/**', 'debug.log', 'tests/**']
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          parserOpts: {
            // @babel/parser 内建 TS / JSX 语法插件
            plugins: ['typescript', 'jsx']
          }
        },
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
        ecmaVersion: 'latest'
      }
    },
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      // TS 编译器已负责的检查（对 TS 语法会误报），关闭：
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-dupe-class-members': 'off',
      'no-unused-vars': 'off',
      'no-use-before-define': 'off',
      // 路径/输入消毒正则中 \x00-\x1f 控制字符是有意写的
      'no-control-regex': 'off',
      // 渐进治理（历史代码风格问题，先降为告警，不阻塞）：
      'no-useless-escape': 'warn',
      'preserve-caught-error': 'warn',
      'no-useless-assignment': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // React Hooks 规则（最重要的一类静态检查）
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  }
]
