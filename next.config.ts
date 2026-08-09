import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // pdfkit reads its base-14 font metrics with
  // `fs.readFileSync(__dirname + '/data/Helvetica.afm')`. Webpack rewrites
  // `__dirname` and never emits those .afm files, so any code path touching a
  // standard font would throw ENOENT at runtime — inside a payment handler.
  // The receipt avoids that path by embedding its own fonts, but externalizing
  // removes the whole class of failure rather than relying on nobody ever
  // typing `doc.font("Helvetica")`.
  serverExternalPackages: ["nodemailer", "pdfkit"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async headers() {
    const developmentEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
    const contentSecurityPolicy = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${developmentEval} https://js.paystack.co https://checkout.paystack.com https://www.googletagmanager.com https://connect.facebook.net https://analytics.tiktok.com https://www.clarity.ms`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paystack.co https://www.google-analytics.com https://analytics.google.com https://www.facebook.com https://analytics.tiktok.com https://www.clarity.ms",
      "frame-src https://checkout.paystack.com https://www.openstreetmap.org",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
        ],
      },
      {
        // The logo every transactional email points at. Next serves `public/`
        // with `max-age=0`, so without this Gmail's image proxy re-fetches it
        // on essentially every open.
        //
        // Deliberately not `immutable`: the filename is stable, so the way to
        // ship new artwork is to RENAME the file (`logo-email-2.png`) and
        // update the one reference in `src/lib/email/templates.ts`. This rule
        // sets only `Cache-Control`, which the catch-all above does not, so the
        // two are additive rather than conflicting.
        source: "/logo-email.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }],
      },
    ];
  },
};

export default nextConfig;
