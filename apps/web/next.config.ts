import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@runwayops/cash-engine", "@runwayops/domain"],
  serverExternalPackages: ["zod"],
};

export default nextConfig;
