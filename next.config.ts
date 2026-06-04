import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fija la raíz a este proyecto (hay otros lockfiles en carpetas hermanas).
  turbopack: { root: __dirname },
};

export default nextConfig;
