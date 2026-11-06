// Catalogue of every Penny Dreadful card: one entry per card, shown with its original printing,
// plus the rarity/set/artist/year of all printings. Years are then picked locally, without Scryfall.
import { search, slim } from './scryfall.js';

// Frame effects, promo-like sets and borders that make a printing hard to read.
const WEIRD_EFFECTS = ['showcase', 'extendedart', 'inverted', 'shatteredglass', 'textless', 'etched', 'fullart', 'draft', 'companion', 'tombstone'];
const WEIRD_SETS = ['memorabilia', 'funny', 'token', 'minigame', 'promo', 'box', 'masterpiece'];
const hasImage = c => !!(c.image_uris || (c.card_faces || []).some(f => f.image_uris));
const plain = c => hasImage(c) && c.border_color === 'black' && !c.full_art && !c.promo && !c.textless
  && !WEIRD_SETS.includes(c.set_type) && !(c.frame_effects || []).some(e => WEIRD_EFFECTS.includes(e));
// Lower is better: plain printings first, then the oldest.
const rank = c => `${plain(c) ? 0 : hasImage(c) ? 1 : 2} ${c.released_at}`;

// Reads a printing search into Map(oracle_id -> { card (slim original), key, prints }).
export async function collect(q, onPage) {
  const map = new Map();
  await search(q, onPage, 'prints', batch => {
    for (const raw of batch) {
      const e = map.get(raw.oracle_id) || map.set(raw.oracle_id, { card: null, key: '~', prints: [] }).get(raw.oracle_id);
      const p = [raw.rarity, raw.set, raw.artist || '', Number(raw.released_at.slice(0, 4))];
      if (!e.prints.some(x => x.join() === p.join())) e.prints.push(p);
      const k = rank(raw);
      if (k < e.key) { e.key = k; e.card = slim(raw); }
    }
  });
  return map;
}

const finish = e => ({ ...e.card, prints: e.prints });

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
      if (c) for (const p of e.prints) if (!c.prints.some(x => x.join() === p.join())) c.prints.push(p);
    }
  }
  return { catalog: out, added: fresh.length, removed };
}

// Cards for the picked years: any printing in those years, plus every land.
export function deriveCards(catalog, years) {
  const out = [];
  for (const c of catalog) {
    const inYears = c.prints.filter(p => years.includes(p[3]));
    if (inYears.length || c.isLand) out.push({ ...c, prints: inYears.length ? inYears : c.prints });
  }
  return out;
}
