import type { NextConfig } from "next";

// Baseline security headers — the app had none of these before, which is
// low-risk on its own but free to fix. No CSP here on purpose: this app
// dynamically renders admin-configured background images, theme colors,
// and Google Fonts URLs (config/Themes.ts / store_themes.background_image_url
// etc.), so a strict CSP would need to be built and tested against every
// one of those admin-editable surfaces to avoid silently breaking them —
// that's real follow-up work, not something to bolt on blind.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
