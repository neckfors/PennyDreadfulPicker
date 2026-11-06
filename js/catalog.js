// Catalogue of every Penny Dreadful card: one entry per card, shown with a chosen printing, plus the
// rarity/set/artist/year of all printings (for r:/s:/a: search) and a compact record of every printing
// (`cands`), so the choice can be changed later without downloading again.
import { search, slim } from './scryfall.js';

// Bump when the catalogue's shape changes and it must be downloaded again. (A change to the printing
// choice alone only needs repick(), which works from the stored `cands`.)
export const CATALOG_VERSION = 3;
// Bump when the printing choice changes: repick() then runs once on the stored catalogue.
export const PICK_VERSION = 1;

// Frame effects and set types that make a printing hard to read.
const WEIRD_EFFECTS = ['showcase', 'extendedart', 'inverted', 'shatteredglass', 'textless', 'etched', 'fullart', 'draft', 'companion', 'tombstone'];
const WEIRD_SETS = ['memorabilia', 'funny', 'token', 'minigame', 'promo', 'box', 'masterpiece'];
const hasImage = k => !!(k.image || (k.fimg || []).some(Boolean));
const plain = k => hasImage(k) && k.border === 'black' && !k.full && !k.promo && !k.textless
  && !WEIRD_SETS.includes(k.st) && !(k.fx || []).some(e => WEIRD_EFFECTS.includes(e));
// Lower is better: plain printings first, then the newest (the date is flipped so newer sorts first).
const rank = k => `${plain(k) ? 0 : hasImage(k) ? 1 : 2} ${99999999 - Number(k.released_at.replace(/-/g, ''))}`;

const toCand = raw => ({
  id: raw.id, set: raw.set, set_name: raw.set_name, rarity: raw.rarity, released_at: raw.released_at,
  prices: raw.prices, artist: raw.artist, image: raw.image_uris ? raw.image_uris.normal : undefined,
  fimg: raw.card_faces ? raw.card_faces.map(f => (f.image_uris ? f.image_uris.normal : undefined)) : undefined,
  fart: raw.card_faces ? raw.card_faces.map(f => f.artist) : undefined,
  border: raw.border_color, full: raw.full_art, promo: raw.promo, textless: raw.textless, st: raw.set_type, fx: raw.frame_effects,
});

// Shows card `c` with its best printing: copies that printing's own fields onto it.
function repickCard(c) {
  const best = c.cands.reduce((a, b) => (rank(b) < rank(a) ? b : a));
  Object.assign(c, { id: best.id, set: best.set, set_name: best.set_name, rarity: best.rarity, released_at: best.released_at, prices: best.prices, artist: best.artist });
  if (best.image) c.image = best.image; else delete c.image;
  if (c.card_faces) c.card_faces.forEach((f, i) => {
    f.image = best.fimg && best.fimg[i];
    if (best.fart && best.fart[i] !== undefined) f.artist = best.fart[i];
  });
}
export function repick(catalog) { catalog.forEach(repickCard); }

// Reads a printing search into Map(oracle_id -> { base (slim card), cands, prints }).
export async function collect(q, onPage) {
  const map = new Map();
  await search(q, onPage, 'prints', batch => {
    for (const raw of batch) {
      const e = map.get(raw.oracle_id) || map.set(raw.oracle_id, { base: slim(raw), cands: [], prints: [] }).get(raw.oracle_id);
      const p = [raw.rarity, raw.set, raw.artist || '', Number(raw.released_at.slice(0, 4))];
      if (!e.prints.some(x => x.join() === p.join())) e.prints.push(p);
      e.cands.push(toCand(raw));
    }
  });
  return map;
}

const finish = e => { const c = { ...e.base, prints: e.prints, cands: e.cands }; repickCard(c); return c; };

export async function buildCatalog(onStatus) {
  const map = await collect('f:pd', (n, t) => onStatus(`Fetching all printings… ${n} / ${t}`));
  return [...map.values()].map(finish);
}

// Adds new cards and new printings since `since` (YYYY-MM-DD), drops cards that are no longer legal.
export async function updateCatalog(catalog, since, onStatus) {
  const ids = new Set();
  await search('f:pd', (n, t) => onStatus(`Checking cards… ${n} / ${t}`), 'cards', batch => batch.forEach(c => ids.add(c.oracle_id)));
  const have = new Set(catalog.map(c => c.oracle_id));
  const out = catalog.filter(c => ids.has(c.oracle_id));
  const removed = catalog.length - out.length;
  const fresh = [...ids].filter(id => !have.has(id));
  for (let i = 0; i < fresh.length; i += 40) {
    onStatus(`Fetching new cards… ${i} / ${fresh.length}`);
    const map = await collect(`f:pd (${fresh.slice(i, i + 40).map(id => `oracleid:${id}`).join(' or ')})`);
    out.push(...[...map.values()].map(finish));
  }
  if (since) {
    onStatus('Checking new printings…');
    const map = await collect(`f:pd date>=${since}`);
    const byId = new Map(out.map(c => [c.oracle_id, c]));
    for (const [id, e] of map) {
      const c = byId.get(id);
      if (!c) continue;
      for (const p of e.prints) if (!c.prints.some(x => x.join() === p.join())) c.prints.push(p);
      for (const k of e.cands) if (!c.cands.some(x => x.id === k.id)) c.cands.push(k);
      repickCard(c);
    }
  }
  return { catalog: out, added: fresh.length, removed };
}

// Cards for the picked years: any printing in those years, plus every land. `cands` stays in the catalogue.
export function deriveCards(catalog, years) {
  const out = [];
  for (const { cands, ...c } of catalog) {
    const inYears = c.prints.filter(p => years.includes(p[3]));
    if (inYears.length || c.isLand) out.push({ ...c, prints: inYears.length ? inYears : c.prints });
  }
  return out;
}
