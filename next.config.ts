import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The platform preview proxies requests; allow the sandbox host to embed the app.
  allowedDevOrigins: ["*"],
  eslint: {
    // Lint runs separately via `npm run lint` to keep builds fast.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
