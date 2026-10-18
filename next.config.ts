import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the site is plain HTML/CSS/JS in `out/`, so it can be
  // hosted anywhere (Vercel, S3 + CloudFront, GitHub Pages).
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
