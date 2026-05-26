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
  serverExternalPackages: ["@cursor/sdk", "sqlite3"],
  images: {
    remotePatterns: supabaseImageRemotePatterns(),
  },
  experimental: {
    serverActions: {
      // Align with Suno upload max (50 MB) + multipart overhead.
      bodySizeLimit: "55mb",
    },
  },
  // The cloud render orchestrator (`/api/inngest` → `renderCompositionExport`)
  // hashes these files at runtime to compute the Vercel Sandbox snapshot
  // warm-start cache key. Next.js's automatic file tracing does not pick them
  // up because they are read via plain `fs.readFile`, not via `import`.
  outputFileTracingIncludes: {
    "/api/inngest": [
      "./remotion-export/package.json",
      "./remotion-export/package-lock.json",
      "./remotion-export/render.mjs",
      "./remotion/index.tsx",
      "./remotion/compositions/recipe-assembly.tsx",
    ],
  },
};

export default nextConfig;
