// Filtering, sorting and drawing the card grid. Never calls Scryfall.
import * as db from './db.js';
import { state, cards } from './state.js';
import { matchFace, COLORS, BIT } from './mana.js';
import { bannedSet, isBanned } from './banned.js';

export const SORTS = {
  name: 'Name', cmc: 'Mana value', color: 'Colour', rarity: 'Rarity', set: 'Set', released: 'Released',
  usd: 'Price USD', eur: 'Price EUR', tix: 'Price TIX', power: 'Power', toughness: 'Toughness',
  edhrec: 'EDHREC rank', penny: 'Penny rank', artist: 'Artist',
};
const RARITY = { common: 0, uncommon: 1, rare: 2, mythic: 3, special: 4, bonus: 5 };
const num = v => (v === undefined || v === null || isNaN(parseFloat(v)) ? Infinity : parseFloat(v));
const front = (c, k) => c[k] ?? (c.card_faces && c.card_faces[0][k]);

function colorKey(c) {
  if (c.isLand) return 99;
  const m = c._colorMask;
  const n = COLORS.filter(x => m & BIT[x]).length;
  if (n === 0) return 50;
  if (n === 1) return COLORS.findIndex(x => m === BIT[x]);
  return 10 + n * 32 + m;
}

const KEYS = {
  name: c => c.name,
  cmc: c => c.cmc ?? 0,
  color: colorKey,
  rarity: c => RARITY[c.rarity] ?? 9,
  set: c => c.set,
  released: c => c.released_at,
  usd: c => num(c.prices && c.prices.usd),
  eur: c => num(c.prices && c.prices.eur),
  tix: c => num(c.prices && c.prices.tix),
  power: c => num(front(c, 'power')),
  toughness: c => num(front(c, 'toughness')),
  edhrec: c => num(c.edhrec_rank),
  penny: c => num(c.penny_rank),
  artist: c => c.artist || '',
};

function compare(a, b) {
  const k = KEYS[state.sort] || KEYS.cmc;
  const x = k(a), y = k(b);
  let r = typeof x === 'string' ? x.localeCompare(y) : x - y;
  if (state.sortDesc) r = -r;
  return r || a.name.localeCompare(b.name);
}

// Returns visible cards as [card, faceIndex] pairs.
export function visible() {
  const f = state.filters;
  const anyFilter = f.colors || f.multi || f.colorless || f.lands;
  const sel = new Set(state.selected);
  const hits = state.searchHits ? new Set(state.searchHits) : null;
  const banned = bannedSet(state.banned);
  const out = [];
  for (const c of cards) {
    if (state.selOnly && !sel.has(c.oracle_id)) continue;
    if (hits && !hits.has(c.oracle_id)) continue;
    if (state.hideBanned && isBanned(banned, c)) continue;
    let face = 0;
    if (anyFilter) {
      const m = f.colors ? matchFace(c, f.colors) : -1;
      const ok = m >= 0 || (f.multi && c._multi) || (f.colorless && c._colorless) || (f.lands && c.isLand);
      if (!ok) continue;
      if (m >= 0) face = m;
    }
    out.push([c, face]);
  }
  return out.sort((a, b) => compare(a[0], b[0]));
}

// Object URLs for cached images, created when a card scrolls into view.
const urls = new Map();
const observer = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    observer.unobserve(e.target);
    showImage(e.target);
  }
}, { rootMargin: '600px' });

async function showImage(el) {
  const key = el.dataset.img;
  if (!urls.has(key)) {
    const blob = await db.get('images', key);
    urls.set(key, blob ? URL.createObjectURL(blob) : el.dataset.url);
  }
  const img = document.createElement('img');
  img.alt = el.title;
  img.src = urls.get(key);
  el.replaceChildren(img);
}

export function imageKey(c, face) {
  if (c.image) return [`${c.id}:0`, c.image];
  const f = c.card_faces && c.card_faces[face];
  return f && f.image ? [`${c.id}:${face}`, f.image] : [`${c.id}:0`, c.card_faces?.[0]?.image];
}

export function forgetImages() {
  for (const u of urls.values()) if (u.startsWith('blob:')) URL.revokeObjectURL(u);
  urls.clear();
}

export function render(grid, counter) {
  observer.disconnect();
  const list = visible();
  const sel = new Set(state.selected);
  const banned = bannedSet(state.banned);
  const frag = document.createDocumentFragment();
  for (const [c, face] of list) {
    const el = document.createElement('div');
    el.className = 'card' + (sel.has(c.oracle_id) ? ' sel' : '') + (isBanned(banned, c) ? ' banned' : '');
    el.dataset.oid = c.oracle_id;
    el.title = c.name;
    [el.dataset.img, el.dataset.url] = imageKey(c, face);
    el.innerHTML = `<span class="name"></span>`;
    el.firstChild.textContent = c.name;
    frag.append(el);
    observer.observe(el);
  }
  grid.replaceChildren(frag);
  if (!cards.length) grid.innerHTML = '<p class="empty">No cards yet. Pick years and press Fetch cards.</p>';
  counter.textContent = `${list.length} / ${cards.length}`;
}
