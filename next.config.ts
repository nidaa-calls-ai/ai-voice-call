import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep native/CJS server packages out of the bundler (required for
  // libsql native bindings, web-push and the z-ai SDK on Vercel).
  serverExternalPackages: ["@libsql/client", "@prisma/adapter-libsql", "web-push", "z-ai-web-dev-sdk"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
