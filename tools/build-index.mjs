// build-index.mjs — regenerates filed.json (hub search + "Recently filed")
// and feed.xml (RSS) from the sibling repos in ../../ .
//
//   cd blog && node tools/build-index.mjs
//
// Reads each repo's *pushed* state (origin/main), never the working tree,
// so held/uncommitted work can't leak into the feed. Run `git fetch` in the
// sibling repos first if they might be behind. "Filed" dates come from git
// history: the first pushed commit that linked or added each thing.
// No dependencies — plain Node.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BLOG = path.resolve(HERE, '..');
const WEB = path.resolve(BLOG, '..');
const REF = 'origin/main';

const REPOS = {
  wander: { dir: path.join(WEB, 'wander/field-notes'), base: 'https://wander.varunagarwal.com/' },
  books:  { dir: path.join(WEB, 'books'),              base: 'https://books.varunagarwal.com/' },
  notes:  { dir: path.join(WEB, 'notes'),              base: 'https://notes.varunagarwal.com/' },
  blog:   { dir: BLOG,                                 base: 'https://blog.varunagarwal.com/' },
};

// ---------- git helpers ----------
function git(repo, args) {
  try {
    return execFileSync('git', ['-C', REPOS[repo].dir, ...args], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return ''; }
}
const show = (repo, file) => git(repo, ['show', `${REF}:${file}`]);
const exists = (repo, file) => git(repo, ['cat-file', '-t', `${REF}:${file}`]).trim() === 'blob';
function firstLine(s) { return s.split('\n').map(l => l.trim()).filter(Boolean).pop() || null; }
// oldest pushed commit that added `file`
const firstAdded = (repo, file) =>
  firstLine(git(repo, ['log', REF, '--diff-filter=A', '--format=%aI', '--', file]));
// oldest pushed commit whose diff of `file` introduced `needle`
const firstSeen = (repo, file, needle) =>
  firstLine(git(repo, ['log', REF, '--format=%aI', `-S${needle}`, '--', file]));

// ---------- parsing helpers ----------
// Same bracket-matching trick the hub's Wander card already uses.
function extractArray(src, name) {
  const marker = `const ${name} = [`;
  const start = src.indexOf(marker);
  if (start === -1) return [];
  let depth = 0, end = -1, quote = null;
  for (let i = start + marker.length - 1; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) { end = i; break; }
  }
  if (end === -1) return [];
  return new Function('return ' + src.slice(start + marker.length - 1, end + 1))();
}
const decode = s => (s || '').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').trim();
function metaDescription(html) {
  const m = html.match(/<meta name="description" content="([^"]*)"/);
  return m ? decode(m[1]) : '';
}

const items = [];   // everything searchable
const add = o => items.push({ blurb: '', ...o });

// ---------- sites themselves ----------
add({ section: 'site', title: 'Books',   url: REPOS.books.base,  blurb: 'Reading log.' });
add({ section: 'site', title: 'Wander',  url: REPOS.wander.base, blurb: 'Photos and travel.' });
add({ section: 'site', title: 'Notes',   url: REPOS.notes.base,  blurb: 'Gadgets, projects, writeups.' });
add({ section: 'site', title: 'Paws',    url: REPOS.blog.base + 'paws/', blurb: 'Pet photos.' });
add({ section: 'site', title: 'Contact', url: 'https://contact.varunagarwal.com/', blurb: 'Email, phone, vCard.' });
add({ section: 'site', title: 'CV',      url: 'https://varunagarwal.com/', blurb: 'Professional profile.' });

// ---------- wander ----------
{
  const hub = 'index.html';
  const src = show('wander', hub);
  const PLACES = extractArray(src, 'PLACES').filter(p => p.status === 'live');
  // the page file's first commit wins; the hub-link date is only a fallback
  // for things with no page of their own (e.g. STRAAT, a filtered view).
  // (A slug can sit in PLACES as a draft long before its page exists.)
  const pageDate = (href, needle) =>
    (href.includes('?') ? null : firstAdded('wander', href.replace(/\/?$/, '/index.html')))
    || firstSeen('wander', hub, needle);
  for (const p of PLACES) {
    const secs = p.sections || [];
    const landing = `${p.slug}/`;
    const landingIsSection = secs.some(s => s.href === landing);
    if (!landingIsSection && exists('wander', `${p.slug}/index.html`)) {
      add({
        section: 'wander', title: p.name, url: REPOS.wander.base + landing,
        keywords: [p.slug, ...(p.tickerNames || [])].join(' '),
        blurb: p.blurb || '', meta: [p.count, p.region].filter(Boolean).join(' · '),
        cover: p.cover ? REPOS.wander.base + p.cover : null,
        date: pageDate(landing, `slug:'${p.slug}'`),
      });
    }
    for (const s of secs) {
      add({
        section: 'wander', title: `${p.name}: ${s.tag}`, url: REPOS.wander.base + s.href,
        keywords: [s.label, s.href.replace(/[/?=]+/g, ' ')].join(' '),
        blurb: s.desc || '', meta: s.count || '',
        cover: s.cover ? REPOS.wander.base + s.cover : null,
        date: pageDate(s.href, `href:'${s.href}'`),
      });
    }
  }
  // standalone pages not in PLACES
  for (const [dir, title] of [['street-art', 'Street art']]) {
    const html = show('wander', `${dir}/index.html`);
    if (html) add({ section: 'wander', title, url: `${REPOS.wander.base}${dir}/`,
      blurb: metaDescription(html), date: firstAdded('wander', `${dir}/index.html`) });
  }
  // concerts: every artist searchable (not dated — they're not separate pages)
  const CONCERTS = extractArray(show('wander', 'concerts/index.html'), 'DATA');
  for (const c of CONCERTS) {
    add({ section: 'wander', kind: 'gig', title: c.artist, url: `${REPOS.wander.base}concerts/`,
      blurb: [c.venue, c.city].filter(Boolean).join(', '), meta: c.date || '' });
  }
}

// ---------- books ----------
{
  const file = 'index.html';
  const src = show('books', file);
  for (const b of extractArray(src, 'DATA')) {
    add({ section: 'books', kind: 'book', title: b.title, url: REPOS.books.base,
      blurb: b.author || '', meta: b.note || '', cover: b.cover || null,
      date: firstSeen('books', file, `title: "${b.title}"`) });
  }
  // wider library: searchable, never dated
  for (const b of [...extractArray(src, 'DATA_HIGHLIGHTS'), ...extractArray(src, 'DATA_REST')]) {
    add({ section: 'books', kind: 'book', title: b.title, url: REPOS.books.base, blurb: b.author || '' });
  }
}

// ---------- notes ----------
{
  const file = 'index.html';
  const ENTRIES = extractArray(show('notes', file), 'ENTRIES');
  for (const e of ENTRIES) {
    if (e.status === 'live') {
      const html = show('notes', `${e.slug}/index.html`);
      add({ section: 'notes', title: e.name, url: `${REPOS.notes.base}${e.slug}/`, keywords: e.slug,
        blurb: e.blurb || metaDescription(html),
        date: firstAdded('notes', `${e.slug}/index.html`) || firstSeen('notes', file, `slug:'${e.slug}'`) });
      // one level of sub-pages (e.g. individual conversations)
      const subs = git('notes', ['ls-tree', '-d', '--name-only', REF, `${e.slug}/`]).split('\n').filter(Boolean);
      for (const sub of subs) {
        const subHtml = show('notes', `${sub}/index.html`);
        if (!subHtml || sub.endsWith('/img') || sub.endsWith('/assets')) continue;
        const t = (subHtml.match(/<title>([^<]*)<\/title>/) || [])[1] || sub;
        add({ section: 'notes', title: decode(t).replace(/^★\s*|\s*★$/g, '').split(' — ')[0],
          url: `${REPOS.notes.base}${sub}/`, blurb: metaDescription(subHtml),
          date: firstAdded('notes', `${sub}/index.html`) });
      }
    } else if (e.status === 'locked') {
      add({ section: 'notes', title: e.name, url: e.url, blurb: e.meta || '' });
    }
  }
}

// ---------- paws (lives inside the blog repo) ----------
{
  const html = show('blog', 'paws/index.html');
  const cardRe = /<a class="pet-card[^"]*" href="([^"]+)">([\s\S]*?)<\/a>/g;
  for (const [, href, inner] of html.matchAll(cardRe)) {
    const name = decode((inner.match(/class="pet-name">([^<]*)/) || [])[1]);
    const tag = decode((inner.match(/class="pet-tag">([^<]*)/) || [])[1]);
    const blurb = decode((inner.match(/class="pet-blurb">([^<]*)/) || [])[1]);
    const cover = (inner.match(/src="([^"]+)"/) || [])[1];
    add({ section: 'paws', title: name, url: `${REPOS.blog.base}paws/${href}`, keywords: href.replace(/W+/g, ' '),
      blurb: [tag, blurb].filter(Boolean).join('. '),
      cover: cover ? `${REPOS.blog.base}paws/${cover}` : null,
      date: firstAdded('blog', `paws/${href}index.html`) });
  }
}

// ---------- recent: dated items, newest first ----------
// Books added in a batch on the same day collapse into one entry, so a bulk
// import doesn't bury everything else.
const dated = items.filter(i => i.date).sort((a, b) => new Date(b.date) - new Date(a.date));
const recent = [];
const bookDays = new Map();
for (const i of dated) {
  if (i.kind === 'book') {
    const day = i.date.slice(0, 10);
    if (!bookDays.has(day)) {
      const entry = { section: 'books', title: '', url: REPOS.books.base, date: i.date, books: [] };
      bookDays.set(day, entry);
      recent.push(entry);
    }
    bookDays.get(day).books.push(i.title);
  } else {
    recent.push(i);
  }
}
for (const e of bookDays.values()) {
  e.title = e.books.length === 1 ? e.books[0] : `${e.books.length} books`;
  e.blurb = e.books.length === 1 ? (dated.find(b => b.title === e.books[0]).blurb) : e.books.join(', ');
  delete e.books;
}

const strip = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== '' && v !== undefined));
const out = {
  _note: 'Generated by tools/build-index.mjs. Do not hand-edit; re-run the script.',
  generated: new Date().toISOString(),
  recent: recent.slice(0, 40).map(({ keywords, ...rest }) => strip(rest)),
  // keywords: search-only terms (slugs, city names) never shown on the page
  search: items.map(({ date, cover, ...rest }) => strip(rest)),
};
writeFileSync(path.join(BLOG, 'filed.json'), JSON.stringify(out) + '\n');

// ---------- feed.xml (RSS 2.0) ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const label = { wander: 'Wander', books: 'Books', notes: 'Notes', paws: 'Paws' };
const feedItems = recent.slice(0, 30).map(i => {
  const title = i.section === 'books' && !i.kind ? `Books: ${i.title}` : `${label[i.section] || ''}: ${i.title}`;
  const desc = [i.blurb, i.meta].filter(Boolean).join(' — ');
  const img = i.cover ? `<p><img src="${esc(i.cover)}" alt=""></p>` : '';
  const guid = `${i.url}#${i.date.slice(0, 10)}`;
  return `  <item>
    <title>${esc(title)}</title>
    <link>${esc(i.url)}</link>
    <guid isPermaLink="false">${esc(guid)}</guid>
    <pubDate>${new Date(i.date).toUTCString()}</pubDate>
    <description>${esc(img + (desc ? `<p>${esc(desc)}</p>` : ''))}</description>
  </item>`;
}).join('\n');
const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>lucidité</title>
  <link>https://blog.varunagarwal.com/</link>
  <atom:link href="https://blog.varunagarwal.com/feed.xml" rel="self" type="application/rss+xml"/>
  <description>New things filed across Varun Agarwal's sites: photos, books, notes.</description>
  <language>en</language>
  <lastBuildDate>${new Date(recent[0]?.date || Date.now()).toUTCString()}</lastBuildDate>
${feedItems}
</channel>
</rss>
`;
writeFileSync(path.join(BLOG, 'feed.xml'), feed);

console.log(`filed.json: ${items.length} searchable, ${recent.length} recent · feed.xml: ${Math.min(30, recent.length)} items`);
for (const r of recent.slice(0, 12)) console.log(`  ${r.date.slice(0, 10)}  ${r.section.padEnd(6)} ${r.title}`);
