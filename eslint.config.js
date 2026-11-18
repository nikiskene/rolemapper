import js from '@eslint/js'
import ts from 'typescript-eslint'
export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  {ignores:['dist/**']},
  {files:['scripts/**/*.mjs','tests/**/*.mjs'],languageOptions:{globals:{console:'readonly',process:'readonly',URL:'readonly'}}}
]
