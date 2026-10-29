import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: ["@mantine/core", "@mantine/hooks"],
    // One 1 MB part image per call plus multipart overhead
    serverActions: { bodySizeLimit: "2mb" },
  },
  // Old links: the public browser moved to another frontend, then parts were
  // renamed to units
  async redirects() {
    return [
      { source: "/inventory", destination: "/", permanent: true },
      { source: "/backoffice", destination: "/", permanent: true },
      { source: "/backoffice/add", destination: "/units/new", permanent: true },
      { source: "/inventory/:path+", destination: "/units/:path+", permanent: true },
      { source: "/backoffice/:path+", destination: "/units/:path+", permanent: true },
      { source: "/parts/:path+", destination: "/units/:path+", permanent: true },
    ];
  },
};

export default nextConfig;
