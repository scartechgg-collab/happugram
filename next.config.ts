import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Node-only packages external so the bundler doesn't try to trace/bundle
  // native or fs-heavy modules (prevents deploy-time build failures).
  serverExternalPackages: ["bcryptjs", "pg", "@supabase/supabase-js"],
};

export default nextConfig;
