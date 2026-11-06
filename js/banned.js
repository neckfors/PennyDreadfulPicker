// Banned list file parsing. Lands are never banned.
export function parseList(text) {
  const names = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      if (names.length) break;  // first blank line ends the list (sideboard follows)
      continue;
    }
    names.push(line.replace(/^\d+x?\s+/i, ''));
  }
  return names;
}

const norm = s => s.toLowerCase().trim();

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
    if (c && c.isLand) lands.push(c.name);
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
