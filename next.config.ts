import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  // Optional compiler API/thread path for hosts that cannot fork Node workers.
  // TypeScript 6 is pinned because TypeScript 7 exposes only the CLI.
  ...(process.env.PARTSROUTE_BUILD_THREADS === "1"
    ? {
        experimental: {
          workerThreads: true,
          webpackBuildWorker: false,
          useTypeScriptCli: false,
          cpus: 2,
        },
      }
    : {}),
};
export default config;
