const configuredSiteUrl = import.meta.env["VITE_SITE_URL"]?.trim();

// Replace this fallback or set VITE_SITE_URL before deploying to production.
export const SITE_URL = (configuredSiteUrl || "https://your-production-domain.example").replace(
  /\/+$/,
  "",
);
