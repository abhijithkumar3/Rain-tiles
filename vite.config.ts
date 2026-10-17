import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const siteUrl = (env["VITE_SITE_URL"] || "https://your-production-domain.example").replace(
    /\/+$/,
    "",
  );

  return {
    resolve: { tsconfigPaths: true },
    plugins: [
      tanstackStart({
        server: { entry: "server" },
        prerender: { enabled: true },
      }),
      viteReact(),
      tailwindcss(),
      {
        name: "raintiles-seo-files",
        apply: "build",
        closeBundle() {
          const clientDir = resolve(process.cwd(), "dist/client");
          mkdirSync(clientDir, { recursive: true });
          writeFileSync(
            resolve(clientDir, "robots.txt"),
            `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
          );
          writeFileSync(
            resolve(clientDir, "sitemap.xml"),
            `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteUrl}/</loc></url></urlset>\n`,
          );
        },
      },
    ],
  };
});
