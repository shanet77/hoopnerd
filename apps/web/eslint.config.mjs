import config from "@repo/eslint-config/next";

export default [
  ...config,
  {
    ignores: ["tailwind.config.js", "postcss.config.js"],
  },
];
