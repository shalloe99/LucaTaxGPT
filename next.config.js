/** @type {import('next').NextConfig} */
const nextConfig = {
  // Custom API routes handle proxy with better timeout control
  // Increase timeout for API routes to handle long-running AI requests
  experimental: {
    // Removed deprecated serverComponentsExternalPackages
  },
  // Configure webpack to handle longer timeouts
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Increase timeout for client-side requests
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
  // Increase server timeout
  serverRuntimeConfig: {
    // Increase timeout for server-side operations
    maxDuration: 1200000, // 20 minutes
  },
}

module.exports = nextConfig; 