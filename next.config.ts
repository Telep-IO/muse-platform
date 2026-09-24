import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@telep/registry",
    "@telep/platform",
    "@telep/paper-send",
    "@telep/print-merch",
    "@telep/ship-label",
    "@telep/sign-send",
    "@telep/fax-send",
    "@telep/call-send",
    "@telep/ink-send",
    "@telep/domain-send",
    "@telep/sumvid",
    "@telep/shipsignal",
  ],
  serverExternalPackages: ["stripe"],
  poweredByHeader: false,
};

export default nextConfig;
