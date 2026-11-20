import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O app desktop compila a versão rápida em .next-prod, separada do modo desenvolvedor (.next)
  distDir: process.env.LOTUS_DIST_DIR || ".next",
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ["@prisma/client", "prisma"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
