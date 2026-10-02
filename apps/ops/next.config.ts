import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@ojarun/shared", "@ojarun/ui", "@ojarun/convex"],
  reactStrictMode: true,
};

export default config;
