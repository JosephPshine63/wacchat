#!/usr/bin/env node
/**
 * i18n tooling. Italian is the source language; en/fr/de/es are generated with DeepL.
 *
 *   node scripts/i18n.mjs translate [--lang=fr] [--bundle=frontend|backend] [--force] [--dry-run]
 *   node scripts/i18n.mjs check
 *
 * `translate` only sends keys that are new or whose Italian source changed (tracked by a hash in
 * <bundle>/.i18n-lock.json), so re-running it is cheap. Only UI strings ever leave the machine.
 * `check` never calls DeepL: it validates key parity, placeholders, and that every key used in
 * the code exists — safe for CI.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'); // repo root
const FRONTEND = join(ROOT, 'wac/frontend');

/** Target languages: our code -> DeepL target_lang, and whether `formality` is accepted. */
const LANGS = {
  en: { deepl: 'EN-US', formality: false },
  fr: { deepl: 'FR', formality: true },
  de: { deepl: 'DE', formality: true },
  es: { deepl: 'ES', formality: true },
};
const SOURCE_LANG = 'it';
/** Informal register, matching the Italian "tu" tone of the UI. */
const FORMALITY = 'prefer_less';
/** Product names DeepL must leave untouched. */
const PROTECTED_TERMS = ['WacChat', 'Arno'];

/**
 * Translation bundles. Add backend / Keycloak-theme bundles here as they are introduced.
 * `file(lang)` gives the path of a language file; `format` is 'json' or 'properties'.
 */
const BUNDLES = [
  { name: 'frontend', format: 'json', file: (l) => join(FRONTEND, `public/i18n/${l}.json`) },
  // Spring MessageSource bundle: Italian is the base file (messages.properties), the rest are messages_<lang>.properties.
  {
    name: 'backend',
    format: 'properties',
    file: (l) => join(ROOT, `wac/backend/src/main/resources/messages${l === SOURCE_LANG ? '' : `_${l}`}.properties`),
    lock: join(ROOT, 'wac/backend/.i18n-lock.json'), // kept out of src/main/resources so it isn't packaged
  },
];

// ---------- bundle IO ----------
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = String(v);
  }
  return out;
}
function unflatten(flat) {
  const root = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let node = root;
    parts.slice(0, -1).forEach((p) => (node = node[p] ??= {}));
    node[parts.at(-1)] = value;
  }
  return root;
}
function parseProperties(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    // One key per line, "\n" for newlines (the only escapes our bundles use, plus \\ and \uXXXX).
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/\\(n|t|\\|u[0-9a-fA-F]{4})/g, (_, e) =>
      e === 'n' ? '\n' : e === 't' ? '\t' : e === '\\' ? '\\' : String.fromCharCode(parseInt(e.slice(1), 16)));
  }
  return out;
}
function readBundle(bundle, lang) {
  const path = bundle.file(lang);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  return bundle.format === 'json' ? flatten(JSON.parse(text)) : parseProperties(text);
}
function writeBundle(bundle, lang, flat) {
  const keys = Object.keys(flat);
  const body = bundle.format === 'json'
    ? JSON.stringify(unflatten(flat), null, 2) + '\n'
    : keys.map((k) => `${k}=${flat[k].replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}`).join('\n') + '\n';
  writeFileSync(bundle.file(lang), body);
}
const lockPath = (bundle) => bundle.lock ?? join(dirname(bundle.file(SOURCE_LANG)), '.i18n-lock.json');
const readLock = (bundle) => (existsSync(lockPath(bundle)) ? JSON.parse(readFileSync(lockPath(bundle), 'utf8')) : {});
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

// ---------- placeholders / markup ----------
const PLACEHOLDER = /\{\{\s*[\w.]+\s*\}\}|\{\d+\}/g;
const placeholders = (s) => (s.match(PLACEHOLDER) ?? []).map((p) => p.replace(/\s+/g, '')).sort();
const htmlTags = (s) => (s.match(/<\/?[a-z][^>]*>/gi) ?? []).sort();

/** Wraps things DeepL must not touch in <x> (declared via ignore_tags) and escapes XML chars. */
function protect(text, wide = false) {
  let s = text.replace(/&/g, '&amp;').replace(/<(?![/]?[a-z][^>]*>)/gi, '&lt;');
  // URLs and e-mail addresses are never translated.
  s = s.replace(/https?:\/\/[^\s<]+|[\w.+-]+@[\w-]+\.[\w.]+/g, (m) => `<x>${m}</x>`);
  // `wide` also swallows punctuation glued to a placeholder, e.g. "({{ n }})" — DeepL sometimes
  // returns an empty string for a bare "(<x>…</x>)".
  const ph = wide ? new RegExp(`[(\\[]?(?:${PLACEHOLDER.source})[)\\]]?`, 'g') : PLACEHOLDER;
  s = s.replace(ph, (m) => `<x>${m}</x>`);
  for (const term of PROTECTED_TERMS) s = s.replace(new RegExp(`\\b${term}\\b`, 'g'), `<x>${term}</x>`);
  return s;
}
function unprotect(text) {
  return text.replace(/<\/?x>/g, '').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

// ---------- DeepL ----------
function loadApiKey() {
  if (process.env.DEEPL_API_KEY) return process.env.DEEPL_API_KEY.trim();
  const envFile = join(ROOT, '.env');
  if (existsSync(envFile)) {
    // Read only this one variable; the rest of .env is none of our business.
    const m = readFileSync(envFile, 'utf8').match(/^DEEPL_API_KEY=(.*)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}
const endpoint = (key) => (key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com');

async function deeplRaw(key, texts, lang, wide = false) {
  const cfg = LANGS[lang];
  const body = {
    text: texts.map((t) => protect(t, wide)),
    source_lang: SOURCE_LANG.toUpperCase(),
    target_lang: cfg.deepl,
    tag_handling: 'xml',
    ignore_tags: ['x'],
    preserve_formatting: true,
    ...(cfg.formality ? { formality: FORMALITY } : {}),
  };
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${endpoint(key)}/v2/translate`, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()).translations.map((t) => unprotect(t.text));
    if (res.status === 456) throw new Error('DeepL quota exhausted (456). Wait for the monthly reset or upgrade.');
    if (res.status === 403) throw new Error('DeepL rejected the API key (403). Check DEEPL_API_KEY.');
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    throw new Error(`DeepL error ${res.status}: ${await res.text()}`);
  }
}

/**
 * Multi-line strings are translated line by line and re-joined: with tag handling on, DeepL
 * shuffles line breaks that sit next to protected spans (it turned "Ciao {0},\n\nBenvenuto"
 * into "Hi {0}\n\n,\n\nWelcome"). Single-line strings pass through untouched.
 */
async function deeplTranslate(key, texts, lang, wide = false) {
  const lines = texts.flatMap((t) => t.split('\n')).filter((l) => l.trim());
  const translated = [];
  for (let i = 0; i < lines.length; i += 50) {
    translated.push(...(await deeplRaw(key, lines.slice(i, i + 50), lang, wide)));
  }
  let n = 0;
  return texts.map((t) => t.split('\n').map((l) => (l.trim() ? translated[n++] : l)).join('\n'));
}

/**
 * DeepL sometimes swallows the space between a word and a protected placeholder
 * ("Dauer {{duration}}" -> "Dauer{{duration}}"). If the Italian source had a space before/after
 * a placeholder and the translation has a letter/digit glued to it, put the space back.
 */
function repairSpacing(source, value) {
  let out = value;
  for (const ph of new Set(source.match(PLACEHOLDER) ?? [])) {
    const esc = ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\s${esc}`).test(source)) out = out.replace(new RegExp(`([\\p{L}\\p{N}])(${esc})`, 'gu'), '$1 $2');
    if (new RegExp(`${esc}\\s`).test(source)) out = out.replace(new RegExp(`(${esc})([\\p{L}\\p{N}])`, 'gu'), '$1 $2');
  }
  return out;
}

/** A translation is usable if it is non-empty and keeps the same placeholders and HTML tags. */
function isValid(source, value) {
  return Boolean(value?.trim())
    && placeholders(source).join('|') === placeholders(value).join('|')
    && htmlTags(source).join('|') === htmlTags(value).join('|');
}

async function translate(args) {
  const only = args.find((a) => a.startsWith('--lang='))?.split('=')[1];
  const force = args.includes('--force');
  const dry = args.includes('--dry-run');
  const bundleOnly = args.find((a) => a.startsWith('--bundle='))?.split('=')[1];
  const langs = only ? [only] : Object.keys(LANGS);
  for (const l of langs) if (!LANGS[l]) throw new Error(`Unsupported language: ${l}`);

  const apiKey = loadApiKey();
  if (!apiKey && !dry) throw new Error('DEEPL_API_KEY is not set (env var or repo-root .env).');

  let totalChars = 0;
  for (const bundle of BUNDLES) {
    if (bundleOnly && bundle.name !== bundleOnly) continue;
    const source = readBundle(bundle, SOURCE_LANG);
    if (!source) throw new Error(`Missing source file ${bundle.file(SOURCE_LANG)}`);
    const lock = readLock(bundle);
    for (const lang of langs) {
      const existing = readBundle(bundle, lang) ?? {};
      const locked = lock[lang] ?? {};
      const todo = Object.keys(source).filter((k) => force || existing[k] === undefined || locked[k] !== hash(source[k]));
      const result = {};
      for (const k of Object.keys(source)) if (existing[k] !== undefined) result[k] = existing[k];
      const chars = todo.reduce((n, k) => n + source[k].length, 0);
      totalChars += chars;
      console.log(`[${bundle.name}] ${lang}: ${todo.length} to translate (${chars} chars)`);
      if (dry || todo.length === 0) continue;

      for (let i = 0; i < todo.length; i += 50) {
        const chunk = todo.slice(i, i + 50);
        const out = await deeplTranslate(apiKey, chunk.map((k) => source[k]), lang);
        for (const [j, k] of chunk.entries()) {
          let value = out[j];
          if (!isValid(source[k], value)) {
            [value] = await deeplTranslate(apiKey, [source[k]], lang, true);
          }
          if (!isValid(source[k], value)) {
            console.error(`  ! ${lang}: DeepL result for "${k}" is unusable, left untranslated (fix by hand)`);
            continue;
          }
          value = repairSpacing(source[k], value);
          result[k] = value;
          locked[k] = hash(source[k]);
        }
      }
      // Keep source key order, drop keys that no longer exist in the source.
      const ordered = Object.fromEntries(Object.keys(source).filter((k) => result[k] !== undefined).map((k) => [k, result[k]]));
      writeBundle(bundle, lang, ordered);
      lock[lang] = Object.fromEntries(Object.keys(source).filter((k) => locked[k]).map((k) => [k, locked[k]]));
    }
    if (!dry) writeFileSync(lockPath(bundle), JSON.stringify(lock, null, 2) + '\n');
  }
  console.log(dry ? `Dry run: ${totalChars} chars would be sent.` : `Done. ${totalChars} chars sent to DeepL.`);
}

// ---------- check ----------
function walk(dir, exts, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f === 'services' || f === 'node_modules') continue; // generated API client
      walk(p, exts, out);
    } else if (exts.some((e) => p.endsWith(e)) && !p.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

function check() {
  const errors = [];
  const warnings = [];
  for (const bundle of BUNDLES) {
    const source = readBundle(bundle, SOURCE_LANG);
    if (!source) { errors.push(`[${bundle.name}] missing source file`); continue; }
    for (const lang of Object.keys(LANGS)) {
      const t = readBundle(bundle, lang);
      if (!t) { errors.push(`[${bundle.name}] ${lang}: file missing (run translate)`); continue; }
      for (const k of Object.keys(source)) {
        if (!t[k]?.trim()) { errors.push(`[${bundle.name}] ${lang}: missing or empty key ${k}`); continue; }
        if (placeholders(source[k]).join('|') !== placeholders(t[k]).join('|'))
          errors.push(`[${bundle.name}] ${lang}: placeholder mismatch in ${k}: "${source[k]}" vs "${t[k]}"`);
        if (source[k].split('\n').length !== t[k].split('\n').length)
          errors.push(`[${bundle.name}] ${lang}: line-break count differs in ${k}`);
        if (htmlTags(source[k]).join('|') !== htmlTags(t[k]).join('|'))
          errors.push(`[${bundle.name}] ${lang}: HTML tag mismatch in ${k}`);
      }
      for (const k of Object.keys(t)) if (source[k] === undefined) warnings.push(`[${bundle.name}] ${lang}: extra key ${k}`);
    }
  }

  // Every key referenced by the frontend code must exist in the Italian source, and vice versa.
  const fe = readBundle(BUNDLES[0], SOURCE_LANG);
  const namespaces = new Set(Object.keys(fe).map((k) => k.split('.')[0]));
  const used = new Set();
  for (const file of walk(join(FRONTEND, 'src/app'), ['.html', '.ts'])) {
    for (const m of readFileSync(file, 'utf8').matchAll(/'([A-Za-z][\w-]*(?:\.[\w-]+)+)'/g)) {
      if (namespaces.has(m[1].split('.')[0])) used.add(m[1]);
    }
  }
  for (const k of used) if (fe[k] === undefined) errors.push(`code references unknown key: ${k}`);
  for (const k of Object.keys(fe)) if (!used.has(k)) warnings.push(`unused key (not referenced in code): ${k}`);

  warnings.forEach((w) => console.warn(`warn  ${w}`));
  errors.forEach((e) => console.error(`error ${e}`));
  console.log(`i18n check: ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'translate') translate(rest).catch((e) => { console.error(e.message); process.exit(1); });
else if (cmd === 'check') check();
else { console.error('Usage: i18n.mjs <translate [--lang=xx] [--force] [--dry-run] | check>'); process.exit(2); }
