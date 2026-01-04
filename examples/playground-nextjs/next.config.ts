import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Transpile the linked resilient-llm package
  transpilePackages: ['resilient-llm'],

  // Configure webpack to properly resolve symlinked packages
  webpack: (config) => {
    config.resolve.symlinks = false;
    // Add the parent lib directory to resolve modules
    config.resolve.alias = {
      ...config.resolve.alias,
      'resilient-llm': path.resolve(__dirname, '../../'),
    };
    return config;
  },
};

export default nextConfig;
