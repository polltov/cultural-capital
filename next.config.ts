import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // globalNotFound: фирменная 404 для несуществующих адресов при двух корневых layout (сайт и админка)
  experimental: { serverActions: { bodySizeLimit: "10mb" }, globalNotFound: true },
  images: { remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }] },
  async redirects() {
    return [
      { source: "/mockups/direction-d.html", destination: "/", permanent: true },
      { source: "/index.html", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
