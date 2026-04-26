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
              // PayPal Smart Buttons : le SDK est chargé depuis paypal.com,
              // le popup de paiement embed paypalobjects.com.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.paypal.com https://*.paypal.com https://www.paypalobjects.com https://*.paypalobjects.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org https://staticmap.openstreetmap.de https://placehold.co https://fimgs.net https://*.fimgs.net https://*.fragrantica.com https://*.fragrantica.fr https://www.fragrantica.fr https://cdn.fragella.com https://*.fragella.com https://cdn.fragrancenet.com https://*.fragrancenet.com https://www.dior.com https://*.dior.com https://*.paypalobjects.com https://*.paypal.com",
              // PayPal popup + iframe de checkout.
              "frame-src 'self' https://www.openstreetmap.org https://www.paypal.com https://*.paypal.com",
              [
                "connect-src 'self'",
                "https://*.supabase.co",
                "wss://*.supabase.co",
                "https://api-adresse.data.gouv.fr",
                "https://nominatim.openstreetmap.org",
                "https://fonts.googleapis.com",
                "https://www.paypal.com",
                "https://*.paypal.com",
                "https://*.paypalobjects.com",
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
