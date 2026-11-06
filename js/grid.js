// Filtering, sorting and drawing the card grid. Never calls Scryfall.
import * as db from './db.js';
import { state, cards, bannedCards, landCards } from './state.js';
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

// Cards to filter: the fetched list, plus banned cards while "Banned only" is on and all PD lands while Lands is on.
function pool() {
  const extra = [...(state.filters.banned ? bannedCards : []), ...(state.filters.lands ? landCards : [])];
  if (!extra.length) return cards;
  const have = new Set(cards.map(c => c.oracle_id));
  return [...cards, ...extra.filter(c => !have.has(c.oracle_id) && have.add(c.oracle_id))];
}

// Returns visible cards as [card, faceIndex] pairs.
export function visible() {
  const f = state.filters;
  const anyFilter = f.colors || f.multi || f.colorless || f.lands;
  const sel = new Set(state.selected);
  const hits = state.searchHits ? new Set(state.searchHits) : null;
  const banned = bannedSet(state.banned);
  const out = [];
  for (const c of pool()) {
    // The banned view shows every banned card; only the colour and land filters apply.
    if (!f.banned && state.selOnly && !sel.has(c.oracle_id)) continue;
    if (!f.banned && hits && !hits.has(c.oracle_id)) continue;
    const ban = isBanned(banned, c);
    if (f.banned ? !ban : state.hideBanned && ban) continue;
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

// Card tiles kept between renders (keyed by card id and face) so filtering only moves them, never redraws images.
const tiles = new Map();

export function forgetImages() {
  for (const u of urls.values()) if (u.startsWith('blob:')) URL.revokeObjectURL(u);
  urls.clear();
  observer.disconnect();
  tiles.clear();
}

function tile(c, face) {
  const [img, url] = imageKey(c, face);
  const key = `${c.oracle_id}|${img}|${url}`;
  let el = tiles.get(key);
  if (el) return el;
  el = document.createElement('div');
  el.dataset.oid = c.oracle_id;
  el.title = c.name;
  el.dataset.img = img;
  el.dataset.url = url;
  el.innerHTML = `<span class="name"></span>`;
  el.firstChild.textContent = c.name;
  tiles.set(key, el);
  observer.observe(el);
  return el;
}

export function render(grid, counter) {
  const list = visible();
  const sel = new Set(state.selected);
  const banned = bannedSet(state.banned);
  const els = list.map(([c, face]) => {
    const el = tile(c, face);
    const cls = 'card' + (sel.has(c.oracle_id) ? ' sel' : '') + (isBanned(banned, c) ? ' banned' : '');
    if (el.className !== cls) el.className = cls;
    return el;
  });
  // Skip the DOM work when nothing moved (e.g. a selection-only change).
  const kids = grid.children;
  if (els.length !== kids.length || els.some((el, i) => kids[i] !== el)) grid.replaceChildren(...els);
  if (!list.length && !cards.length && !state.filters.banned) grid.innerHTML = '<p class="empty">No cards yet. Pick years and press Fetch cards.</p>';
  counter.textContent = `${list.length} / ${pool().length}`;
}
