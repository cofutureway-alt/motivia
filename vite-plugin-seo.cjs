/**
 * Generates sitemap.xml + robots.txt from VITE_SITE_URL at build time,
 * and serves them on the dev server. Keeps SEO domain fully env-configurable.
 */
import fs from "node:fs";
import path from "node:path";

const ROUTES = [
  { loc: "/", changefreq: "daily", priority: "1.0" },
  { loc: "/courses", changefreq: "daily", priority: "0.9" },
  { loc: "/bundles", changefreq: "weekly", priority: "0.8" },
  { loc: "/books", changefreq: "weekly", priority: "0.7" },
  { loc: "/branches", changefreq: "monthly", priority: "0.5" },
  { loc: "/leaderboard", changefreq: "daily", priority: "0.4" },
  { loc: "/signup", changefreq: "monthly", priority: "0.6" },
];

function buildFiles(siteUrl) {
  const base = siteUrl.replace(/\/+$/, "");
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    ROUTES.map(
      (r) =>
        `  <url><loc>${base}${r.loc}</loc><changefreq>${r.changefreq}</changefreq><priority>${r.priority}</priority></url>`
    ).join("\n") +
    `\n</urlset>\n`;
  const robots =
    `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`;
  return { sitemap, robots };
}

export function seoFilesPlugin() {
  let files = null;
  return {
    name: "seo-files",
    configResolved(config) {
      const siteUrl = config.env.VITE_SITE_URL || "https://www.motivai-edu.online";
      files = buildFiles(siteUrl);
    },
    configureServer(server) {
      if (!files) return;
      server.middlewares.use((req, res, next) => {
        if (req.url === "/sitemap.xml") {
          res.setHeader("Content-Type", "application/xml");
          res.end(files.sitemap);
          return;
        }
        if (req.url === "/robots.txt") {
          res.setHeader("Content-Type", "text/plain");
          res.end(files.robots);
          return;
        }
        next();
      });
    },
    transformIndexHtml(html) {
      // Guarantee %VITE_SITE_URL% replacement in index.html regardless of Vite's built-in env handling.
      if (!files) return html;
      const base = files.robots.match(/Sitemap: (.+)\/sitemap\.xml/)?.[1];
      if (!base) return html;
      return html.replace(/%VITE_SITE_URL%/g, base);
    },
    closeBundle() {
      if (!files) return;
      const out = path.resolve(process.cwd(), "dist");
      fs.writeFileSync(path.join(out, "sitemap.xml"), files.sitemap);
      fs.writeFileSync(path.join(out, "robots.txt"), files.robots);
      console.log("[seo-files] wrote sitemap.xml + robots.txt");
    },
  };
}
