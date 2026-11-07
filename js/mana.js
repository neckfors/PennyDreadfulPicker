// Mana cost analysis: which colour combinations can cast a card.
// Colours are bitmasks so a casting option is one number.
export const COLORS = ['W', 'U', 'B', 'R', 'G'];
export const BIT = { W: 1, U: 2, B: 4, R: 8, G: 16 };

const bitCount = m => COLORS.reduce((n, c) => n + (m & BIT[c] ? 1 : 0), 0);

// One symbol -> list of colour masks it can be paid with. Phyrexian mana can also be paid with life (mask 0).
function symbolAlternatives(sym) {
  const parts = sym.split('/');
  const alts = parts.map(p => (p === 'P' ? 0 : BIT[p] || 0));
  return [...new Set(alts)];
}

// Is this symbol hybrid between two colours (e.g. W/U, W/U/P)?
const isColorHybrid = sym => sym.split('/').filter(p => BIT[p]).length >= 2;

export function analyzeCost(cost) {
  const syms = (cost.match(/\{[^}]+\}/g) || []).map(s => s.slice(1, -1));
  let options = new Set([0]);
  let allColors = 0;
  let hybrid = false;
  for (const sym of syms) {
    const alts = symbolAlternatives(sym);
    const next = new Set();
    for (const o of options) for (const a of alts) next.add(o | a);
    options = next;
    for (const a of alts) allColors |= a;
    if (isColorHybrid(sym)) hybrid = true;
  }
  return { options: [...options], allColors, hybrid };
}

// Faces that can be cast. Transform/meld/flip backs are not cast, so only the front counts there.
function castableFaces(card) {
  const faces = card.card_faces;
  if (!faces || !faces.length) return [{ idx: 0, cost: card.mana_cost || '', type: card.type_line, colors: card.colors }];
  const front = { idx: 0, cost: faces[0].mana_cost || '', type: faces[0].type_line, colors: faces[0].colors || card.colors };
  if (['transform', 'meld', 'flip'].includes(card.layout)) return [front];
  return faces.map((f, i) => ({ idx: i, cost: f.mana_cost || '', type: f.type_line, colors: f.colors || card.colors }))
    .filter(f => f.cost || !/\bLand\b/.test(f.type));
}

// Adds derived fields used by the filters. Called after loading, never stored.
export function classify(card) {
  const isLand = card.isLand;
  const faces = isLand ? [] : castableFaces(card);
  card._faces = faces.map(f => {
    if (!f.cost) {
      // No mana cost (e.g. suspend-only cards): use the colour indicator.
      const m = (f.colors || []).reduce((a, c) => a | BIT[c], 0);
      return { idx: f.idx, options: [m], allColors: m, hybrid: false };
    }
    return { idx: f.idx, ...analyzeCost(f.cost) };
  });
  card._multi = card._faces.some(f => f.hybrid || bitCount(f.allColors) >= 2);
  card._colorless = !isLand && card._faces.some(f => f.options.includes(0));
  card._colorMask = card._faces.reduce((a, f) => a | f.allColors, 0);
}

// Index of the first face castable with only the selected colours, or -1.
export function matchFace(card, sel) {
  for (const f of card._faces) {
    if (f.options.some(o => o !== 0 && (o & ~sel) === 0)) return f.idx;
  }
  return -1;
}
