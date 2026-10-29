import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: ["@mantine/core", "@mantine/hooks"],
    // One 1 MB part image per call plus multipart overhead
    serverActions: { bodySizeLimit: "2mb" },
  },
  // Old links from before the public browser moved to another frontend
  async redirects() {
    return [
      { source: "/inventory", destination: "/", permanent: true },
      { source: "/backoffice", destination: "/", permanent: true },
      { source: "/backoffice/add", destination: "/parts/new", permanent: true },
      { source: "/inventory/:path+", destination: "/parts/:path+", permanent: true },
      { source: "/backoffice/:path+", destination: "/parts/:path+", permanent: true },
    ];
  },
};

export default nextConfig;
