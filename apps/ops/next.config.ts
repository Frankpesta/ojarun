import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@ojarun/shared", "@ojarun/ui", "@ojarun/convex"],
  reactStrictMode: true,
  // Keep the dev badge off the sidebar's log-out button.
  devIndicators: { position: "bottom-right" },
};

export default config;
