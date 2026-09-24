import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@telep/registry",
    "@telep/platform",
    "@telep/paper-send",
    "@telep/sign-send",
    "@telep/fax-send",
    "@telep/call-send",
    "@telep/ink-send",
    "@telep/domain-send",
    "@telep/sumvid",
    "@telep/shipsignal",
  ],
  serverExternalPackages: ["stripe", "pg"],
  poweredByHeader: false,
};

export default nextConfig;
