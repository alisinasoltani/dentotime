/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://backend-v1-dentotime.runflare.run/api/:path*",
      },
      {
        source: "/s3-proxy/:path*",
        destination: "https://s3.ir-tbz-sh1.arvanstorage.ir/:path*",
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
