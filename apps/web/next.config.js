const path = require("path");
const { version } = require("./package.json");

module.exports = {
  reactStrictMode: true,
  transpilePackages: ["@repo/ui"],
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../../"),
  },
};
