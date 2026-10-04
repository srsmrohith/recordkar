import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // CSV template uploads are capped at 2 MB in the import action.
    serverActions: { bodySizeLimit: "3mb" },
  },
  async redirects() {
    return [
      // Categories, income heads and events moved from "Settings" to "Master data".
      // Temporary (307), not permanent: /settings is reserved for future preferences.
      { source: "/settings", destination: "/master-data", permanent: false },
    ];
  },
};

export default nextConfig;
