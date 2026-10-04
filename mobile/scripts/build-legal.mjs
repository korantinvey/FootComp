// Builds the public legal pages required by the stores from src/legal/legal.json,
// so the app and the website always show the same text.
// Usage: node scripts/build-legal.mjs  → writes ../legal-site/*.html (host it on GitHub Pages, Netlify…)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const legal = JSON.parse(readFileSync(join(root, 'src/legal/legal.json'), 'utf8'));
const out = join(root, '..', 'legal-site');
mkdirSync(out, { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => legal.publisher[k] ?? '');
const updated = new Date(legal.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const page = (doc) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)} · FootComp</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0B2018; color: #EEF2EA; font: 16px/1.6 system-ui, -apple-system, Segoe UI, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 48px 20px 80px; }
  .eyebrow { color: #93AB9C; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; font-weight: 600; }
  h1 { font-size: 40px; line-height: 1.05; text-transform: uppercase; margin: 8px 0 32px; letter-spacing: .01em; }
  h2 { font-size: 17px; margin: 32px 0 8px; }
  p { color: #C9D6CD; margin: 0; }
  nav { margin-top: 48px; padding-top: 24px; border-top: 1px solid rgba(238,242,234,.14); display: flex; gap: 24px; }
  a { color: #EEF2EA; }
  .bibs { display: flex; gap: 8px; margin-bottom: 24px; } .bibs i { width: 36px; height: 8px; border-radius: 3px; }
</style>
</head>
<body><main>
<div class="bibs"><i style="background:#FF7A2F"></i><i style="background:#3FA7FF"></i></div>
<div class="eyebrow">FootComp · mis à jour le ${updated}</div>
<h1>${esc(doc.title)}</h1>
${doc.sections.map((s) => `<h2>${esc(s.heading)}</h2>\n<p>${esc(fill(s.body))}</p>`).join('\n')}
<nav><a href="conditions.html">Conditions d’utilisation</a><a href="confidentialite.html">Confidentialité</a><a href="mailto:${esc(legal.publisher.email)}">Contact</a></nav>
</main></body>
</html>
`;

writeFileSync(join(out, 'conditions.html'), page(legal.terms));
writeFileSync(join(out, 'confidentialite.html'), page(legal.privacy));
writeFileSync(join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=confidentialite.html">');
console.log(`Pages écrites dans ${out}`);
