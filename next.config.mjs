/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Backwards-compat: existing licenser-sdk clients call /wp-json/licenser/v1/*.
      // Route them to /api/v1/* so we don't have to rebump every consumer plugin.
      { source: '/wp-json/licenser/v1/:path*', destination: '/api/v1/:path*' },
    ];
  },
};
export default nextConfig;
