// Banned list file parsing. Lands are never banned.

// Reads a file as text, handling UTF-16 files (some deck exporters write those).
export async function readText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf);
  return new TextDecoder('utf-8').decode(buf);
}

// Every row until the first row with no text. Any line ending works (Windows, Mac, Unix).
// Double-faced rows ("A // B") keep only the front name. Returns kept names and skipped count-0 names.
export function parseList(text) {
  const names = [];
  const zero = [];
  for (const raw of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line) break;
    const name = line.replace(/^\d+x?\s+/i, '').split(' // ')[0].trim();
    if (/^0+x?\s/i.test(line)) zero.push(name);
    else names.push(name);
  }
  return { names, zero };
}

const norm = s => s.toLowerCase().trim();

// A card is skipped as a land only when every face is a land.
export const allLand = c => (c.card_faces && c.card_faces.length > 1
  ? c.card_faces.every(f => /\bLand\b/.test(f.type_line))
  : /\bLand\b/.test(c.type_line || ''));

// Splits names into kept names and ignored lands, using the loaded card list.
export function applyList(names, cards, current, mode) {
  const byName = new Map();
  for (const c of cards) {
    byName.set(norm(c.name), c);
    if (c.card_faces) byName.set(norm(c.card_faces[0].name), c);
  }
  const lands = [];
  const kept = [];
  for (const n of names) {
    const c = byName.get(norm(n));
    if (c && allLand(c)) lands.push(c.name);
    else kept.push(c ? c.name : n);
  }
  const base = mode === 'add' ? current : [];
  return { list: [...new Set([...base, ...kept])], lands };
}

export function bannedSet(names) {
  return new Set(names.map(norm));
}
export const isBanned = (set, card) =>
  set.has(norm(card.name)) || !!(card.card_faces && set.has(norm(card.card_faces[0].name)));
