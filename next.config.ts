import type { NextConfig } from "next";

function supabaseImageRemotePatterns(): NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
> {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) {
    return [];
  }

  try {
    const url = new URL(raw);
    const protocol = url.protocol.replace(":", "") as "http" | "https";

    return [
      {
        protocol,
        hostname: url.hostname,
        port: url.port || "",
        pathname: "/storage/v1/**",
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["@cursor/sdk"],
  images: {
    remotePatterns: supabaseImageRemotePatterns(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
