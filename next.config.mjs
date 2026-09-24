/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next's file tracer misses these packages' non-code runtime assets
  // (playwright-core's browsers.json, @sparticuz/chromium's brotli binary) —
  // without this, the deployed function can't find them at runtime even
  // though the packages themselves are bundled correctly. See
  // render-card.tsx.
  outputFileTracingIncludes: {
    "/*": ["node_modules/playwright-core/**/*", "node_modules/@sparticuz/chromium/**/*"],
  },
};

export default nextConfig;
