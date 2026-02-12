import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "images.clerk.dev" },
    ],
  },
  // Suppress hydration warnings for Radix UI IDs (server/client mismatch)
  reactStrictMode: true,
};

export default nextConfig;
