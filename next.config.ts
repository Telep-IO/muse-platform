import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@telep/registry", "@telep/platform", "@telep/paper-send"],
  serverExternalPackages: ["stripe"],
  poweredByHeader: false,
};

export default nextConfig;
