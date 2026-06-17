/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The /admin/sdk/download route reads the WP SDK source from disk at runtime
  // to build the zip on demand. Those files live outside the standard Next.js
  // tracing roots, so we have to opt them into the serverless function bundle.
  outputFileTracingIncludes: {
    '/admin/sdk/download': [
      './packages/licenser-sdk-php/*.php',
      './packages/licenser-sdk-php/README.md',
      './packages/licenser-sdk-php/scripts/setup.php',
    ],
  },
  async rewrites() {
    return [
      // Backwards-compat: existing licenser-sdk clients call /wp-json/licenser/v1/*.
      // Route them to /api/v1/* so we don't have to rebump every consumer plugin.
      { source: '/wp-json/licenser/v1/:path*', destination: '/api/v1/:path*' },
    ];
  },
};
export default nextConfig;
