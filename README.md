# raintiles

An interactive rain-and-glass canvas. Draw glass tiles and let the rain play piano notes on them.

## Development

Requires Bun and Node.js.

```sh
bun install
bun run dev
```

## Production SEO configuration

Set `VITE_SITE_URL` to the production origin (for example, `https://raintiles.example`) in the deployment environment before building. The value is used for the canonical URL, social metadata, structured data, `robots.txt`, and `sitemap.xml`. If it is unset, the build uses the explicit `https://your-production-domain.example` placeholder, which must not be deployed as the real domain.

The project currently has a logo but no dedicated social-preview artwork. Open Graph and X/Twitter point to the existing SVG logo. For a full game-scene preview, place a 1200 x 630 PNG or JPEG at `public/raintiles-social.png` and update the `og:image` and `twitter:image` values in `src/routes/index.tsx`.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
