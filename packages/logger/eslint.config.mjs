import config from "@repo/eslint-config/react-internal";

export default [
  ...config,
  {
    ignores: ["**/__tests__/"],
  },
];
