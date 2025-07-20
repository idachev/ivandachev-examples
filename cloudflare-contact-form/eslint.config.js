import js from "@eslint/js";
import sonarjs from "eslint-plugin-sonarjs";
import prettierConfig from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettierConfig,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        exports: "writable",
        module: "writable",
        require: "readonly",
        global: "readonly",
        Response: "readonly",
        Request: "readonly",
        URL: "readonly",
      },
    },
    plugins: {
      sonarjs,
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "prefer-const": "error",
      "no-var": "error",
      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/no-duplicate-string": ["error", { threshold: 3 }],
      "sonarjs/prefer-immediate-return": "error",
    },
  },
  {
    ignores: ["node_modules/", "dist/", "build/", ".wrangler/", "*.min.js"],
  },
];
