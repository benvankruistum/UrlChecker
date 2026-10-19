import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dynamic check APIs need the Node.js runtime (tls/dns); keep Cache Components off.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
