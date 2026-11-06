// Scryfall access: paged searches (175 cards per request, ~100 ms apart) and image caching.
import * as db from './db.js';

const API = 'https://api.scryfall.com/cards/search';
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const yearClause = years => '(' + years.map(y => `year:${y}`).join(' or ') + ')';

// Runs one search and follows its pages. Returns raw card objects ([] when nothing matches).
export async function search(q, onPage) {
  let url = `${API}?unique=cards&q=${encodeURIComponent(q)}`;
  const out = [];
  while (url) {
    const res = await fetch(url);
    const body = await res.json();
    if (res.status === 404 && body.code === 'not_found') return out;
    if (!res.ok) throw new Error(body.details || `Scryfall error ${res.status}`);
    out.push(...body.data);
    onPage && onPage(out.length, body.total_cards);
    url = body.has_more ? body.next_page : null;
    if (url) await sleep(100);
  }
  return out;
}

const pick = (o, ks) => Object.fromEntries(ks.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const FIELDS = ['id', 'oracle_id', 'name', 'mana_cost', 'cmc', 'colors', 'color_identity', 'type_line', 'rarity',
  'set', 'set_name', 'released_at', 'prices', 'power', 'toughness', 'edhrec_rank', 'penny_rank', 'artist', 'layout'];

// Keeps only what the app uses, so the cache and export files stay small.
export function slim(c) {
  const s = pick(c, FIELDS);
  if (c.image_uris) s.image = c.image_uris.normal;
  if (c.card_faces) {
    s.card_faces = c.card_faces.map(f => ({
      ...pick(f, ['name', 'mana_cost', 'type_line', 'colors', 'power', 'toughness']),
      image: f.image_uris ? f.image_uris.normal : undefined,
    }));
  }
  s.isLand = /\bLand\b/.test((c.type_line || c.card_faces[0].type_line).split(' // ')[0]);
  return s;
}

// Image key and URL for every face that has its own picture.
export function imageList(card) {
  if (card.image) return [[`${card.id}:0`, card.image]];
  return (card.card_faces || []).map((f, i) => [`${card.id}:${i}`, f.image]).filter(x => x[1]);
}

// Downloads missing images and deletes images of cards no longer in the list.
export async function syncImages(cards, onProgress) {
  const wanted = new Map(cards.flatMap(imageList));
  const have = new Set(await db.keys('images'));
  for (const k of have) if (!wanted.has(k)) await db.del('images', k);
  const todo = [...wanted].filter(([k]) => !have.has(k));
  const total = todo.length;
  let done = 0;
  const worker = async () => {
    while (todo.length) {
      const [k, url] = todo.shift();
      try {
        const blob = await (await fetch(url)).blob();
        await db.put('images', k, blob);
      } catch { /* left for the next fetch */ }
      onProgress && onProgress(++done, total);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}
