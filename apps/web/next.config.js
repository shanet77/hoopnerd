const path = require("path");
const { version } = require("./package.json");

module.exports = {
  reactStrictMode: true,
  transpilePackages: ["@repo/ui"],
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // The only <Image> usage is an inline SVG (larry_obrien.svg), which Next
  // serves unoptimized anyway. Disabling the optimizer keeps sharp/libvips
  // (~16MB) out of the runtime image.
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || version,
  },
};
