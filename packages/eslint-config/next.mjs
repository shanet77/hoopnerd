import globals from "globals";
import next from "@next/eslint-plugin-next";
import { base } from "./base.mjs";

export default [
  ...base(),
  next.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        React: "readonly",
        JSX: "readonly",
      },
    },
  },
];
