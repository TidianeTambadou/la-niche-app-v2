import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://*.supabase.co https://placehold.co",
              "frame-src 'self'",
              [
                "connect-src 'self'",
                "https://*.supabase.co",
                "wss://*.supabase.co",
                "https://fonts.googleapis.com",
                // BAN — autocomplete adresse française gratuit, requêté
                // côté client depuis le wizard de saisie de fiche client.
                "https://api-adresse.data.gouv.fr",
              ].join(" "),
              "worker-src 'self' blob:",
              "media-src 'self' blob:",
              "manifest-src 'self'",
            ].join("; "),
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Content-Type", value: "application/manifest+json" }],
      },
    ];
  },
};

export default nextConfig;
