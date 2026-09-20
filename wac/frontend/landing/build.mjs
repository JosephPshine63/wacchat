#!/usr/bin/env node
/**
 * Renders the public SEO landing pages (one per UI language) and sitemap.xml into the Angular
 * build output. Runs automatically after `npm run build` (npm "postbuild" hook).
 *
 *   node landing/build.mjs [--out=dist/wacchat-ui/browser]
 *
 * nginx serves `landing/index.html` (Italian) on `/` to visitors without the `wac_app` cookie and
 * `<lang>/index.html` on `/en/`, `/fr/`, ... — see nginx.conf. Texts come from landing/i18n/<lang>.json
 * (Italian is the hand-edited source, the rest is generated with `npm run i18n:translate -- --bundle=landing`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '..');
const outArg = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1];
const OUT = resolve(FRONTEND, outArg ?? 'dist/wacchat-ui/browser');
const SITE = (process.env.SITE_URL ?? 'https://wacchat.win').replace(/\/$/, '');

const SOURCE_LANG = 'it';
const LANGS = ['it', 'en', 'fr', 'de', 'es'];
const OG_LOCALE = { it: 'it_IT', en: 'en_US', fr: 'fr_FR', de: 'de_DE', es: 'es_ES' };

const pagePath = (lang) => (lang === SOURCE_LANG ? '/' : `/${lang}/`);
const pageFile = (lang) => (lang === SOURCE_LANG ? 'landing/index.html' : `${lang}/index.html`);
const pageUrl = (lang) => `${SITE}${pagePath(lang)}`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const errors = [];

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') flatten(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = v;
  }
  return out;
}

if (!existsSync(OUT)) {
  console.error(`landing: output directory ${OUT} not found — run "ng build" first.`);
  process.exit(1);
}

// Stylesheet is content-hashed: the cache in front of the site ignores query strings, so a rename is the only reliable bust.
const css = readFileSync(join(HERE, 'landing.css'), 'utf8');
const cssName = `landing-${createHash('sha1').update(css).digest('hex').slice(0, 8)}.css`;
writeFileSync(join(OUT, cssName), css);

if (!existsSync(join(OUT, 'og-image.png'))) errors.push('og-image.png is missing from the build output (expected in public/)');

const template = readFileSync(join(HERE, 'template.html'), 'utf8');

const hreflang = [
  ...LANGS.map((l) => `  <link rel="alternate" hreflang="${l}" href="${pageUrl(l)}">`),
  `  <link rel="alternate" hreflang="x-default" href="${pageUrl(SOURCE_LANG)}">`,
].join('\n');

function jsonLd(lang, t) {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${SITE}/#website`, name: 'WacChat', url: `${SITE}/`, inLanguage: LANGS },
      {
        '@type': 'WebApplication',
        '@id': `${SITE}/#app`,
        name: 'WacChat',
        url: pageUrl(lang),
        description: t['meta.description'],
        applicationCategory: 'CommunicationApplication',
        operatingSystem: 'Any (web browser)',
        inLanguage: LANGS,
        image: `${SITE}/og-image.png`,
        author: {
          '@type': 'Person',
          name: 'Giuseppe Pio Ruocco',
          sameAs: ['https://www.linkedin.com/in/giuseppe-pio-ruocco-7b4367267/'],
        },
      },
    ],
  };
  // "<" is escaped so the payload can never close the <script> element.
  return JSON.stringify(graph, null, 2).replace(/</g, '\\u003c');
}

for (const lang of LANGS) {
  const dictPath = join(HERE, 'i18n', `${lang}.json`);
  if (!existsSync(dictPath)) { errors.push(`[${lang}] missing ${dictPath} (run i18n:translate --bundle=landing)`); continue; }
  const t = flatten(JSON.parse(readFileSync(dictPath, 'utf8')));

  const langNav = LANGS.map((l) =>
    `      <a href="${pagePath(l)}" lang="${l}" hreflang="${l}"${l === lang ? ' aria-current="page"' : ''}>${l.toUpperCase()}</a>`).join('\n');
  const ogAlternates = LANGS.filter((l) => l !== lang)
    .map((l) => `  <meta property="og:locale:alternate" content="${OG_LOCALE[l]}">`).join('\n');

  const vars = {
    lang,
    canonical: pageUrl(lang),
    homeHref: pagePath(lang),
    siteUrl: SITE,
    css: cssName,
    ogLocale: OG_LOCALE[lang],
  };
  const raw = { hreflang, ogAlternates, langNav, jsonld: jsonLd(lang, t) };

  const html = template.replace(/\{\{\{(\w+)\}\}\}|\{\{([\w.]+)\}\}/g, (_, rawKey, key) => {
    if (rawKey) {
      if (raw[rawKey] === undefined) errors.push(`[${lang}] unknown raw placeholder {{{${rawKey}}}}`);
      return raw[rawKey] ?? '';
    }
    const value = vars[key] ?? t[key];
    if (value === undefined) { errors.push(`[${lang}] unresolved placeholder {{${key}}}`); return ''; }
    return esc(value);
  });

  // SEO sanity checks: fail the build rather than ship a page Google would truncate or misread.
  const title = t['meta.title'], desc = t['meta.description'];
  if (title.length > 60) errors.push(`[${lang}] title is ${title.length} chars (max 60)`);
  if (desc.length < 70 || desc.length > 160) errors.push(`[${lang}] description is ${desc.length} chars (want 70-160)`);
  if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) errors.push(`[${lang}] page must contain exactly one <h1>`);
  if ((html.match(/hreflang="/g) ?? []).length < LANGS.length + 1) errors.push(`[${lang}] incomplete hreflang set`);

  const target = join(OUT, pageFile(lang));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
}

const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGS.map((l) => `  <url>
    <loc>${pageUrl(l)}</loc>
    <lastmod>${today}</lastmod>
${LANGS.map((a) => `    <xhtml:link rel="alternate" hreflang="${a}" href="${pageUrl(a)}"/>`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(SOURCE_LANG)}"/>
  </url>`).join('\n')}
</urlset>
`;
writeFileSync(join(OUT, 'sitemap.xml'), sitemap);

if (errors.length) {
  errors.forEach((e) => console.error(`landing: ${e}`));
  process.exit(1);
}
console.log(`landing: rendered ${LANGS.length} pages + sitemap.xml (${cssName}) into ${OUT}`);
