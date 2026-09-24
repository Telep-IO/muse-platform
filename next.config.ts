import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@telep/registry",
    "@telep/platform",
  ],
  serverExternalPackages: ["stripe"],
  poweredByHeader: false,
};

export default nextConfig;
