import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: ["@mantine/core", "@mantine/hooks"],
    // One 1 MB part image per call plus multipart overhead
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
