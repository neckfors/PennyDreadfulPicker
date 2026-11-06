// Local search: a small Scryfall-style query parser and matcher. Unsupported keys throw Unsupported.
export class Unsupported extends Error {}
// r:, s: and a: match any printing of a card, so they use the `prints` list ([rarity, set, artist]) saved with it.

const RARITY = { c: 0, common: 0, u: 1, uncommon: 1, r: 2, rare: 2, m: 3, mythic: 3 };
const RANK = { ...RARITY, special: 4, bonus: 5 };
const COLOR_NAMES = { white: 'w', blue: 'u', black: 'b', red: 'r', green: 'g' };
const DFC_LAYOUTS = ['transform', 'modal_dfc', 'double_faced_token', 'reversible_card'];
const TEXT_KEYS = ['name', 'n', 't', 'type', 'o', 'oracle', 'is', 'a', 'artist', 's', 'set', 'e'];
const prints = c => c.prints || [[c.rarity, c.set, c.artist || '']];

// ---- Parser: tokens -> tree of {or|and|not|term} ----
function tokenize(q) {
  const toks = [];
  let i = 0;
  const readValue = () => {
    if (q[i] === '"') {
      const end = q.indexOf('"', i + 1);
      if (end < 0) throw new Unsupported('quote');
      const v = q.slice(i + 1, end);
      i = end + 1;
      return { v, quoted: true };
    }
    const m = /^[^\s()]+/.exec(q.slice(i));
    if (!m) throw new Unsupported('value');
    i += m[0].length;
    return { v: m[0], quoted: false };
  };
  while (i < q.length) {
    const ch = q[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '(' || ch === ')') { toks.push({ t: ch }); i++; continue; }
    let neg = false;
    if (ch === '-') { neg = true; i++; }
    if (q[i] === '(') { toks.push({ t: 'neg' }); continue; }
    if (q[i] === '!' || q[i] === '/') throw new Unsupported('exact or regex');
    const km = /^([a-z]+)(>=|<=|!=|:|=|>|<)/i.exec(q.slice(i));
    if (km) {
      i += km[0].length;
      const { v, quoted } = readValue();
      if (!quoted && v.startsWith('/')) throw new Unsupported('regex');
      toks.push({ t: 'term', neg, key: km[1].toLowerCase(), op: km[2], val: v });
    } else {
      const { v, quoted } = readValue();
      const lc = v.toLowerCase();
      if (!neg && !quoted && (lc === 'or' || lc === 'and')) toks.push({ t: lc });
      else toks.push({ t: 'term', neg, key: 'name', op: ':', val: v });
    }
  }
  return toks;
}

function parse(toks) {
  let p = 0;
  const close = () => { if (!toks[p] || toks[p].t !== ')') throw new Unsupported('paren'); p++; };
  const unary = () => {
    const t = toks[p++];
    if (t.t === 'neg') { p++; const e = orExpr(); close(); return { not: e }; }
    if (t.t === '(') { const e = orExpr(); close(); return e; }
    return { term: t };
  };
  const andExpr = () => {
    const parts = [];
    while (toks[p] && toks[p].t !== 'or' && toks[p].t !== ')') {
      if (toks[p].t === 'and') { p++; continue; }
      parts.push(unary());
    }
    if (!parts.length) throw new Unsupported('empty');
    return parts.length > 1 ? { and: parts } : parts[0];
  };
  const orExpr = () => {
    const parts = [andExpr()];
    while (toks[p] && toks[p].t === 'or') { p++; parts.push(andExpr()); }
    return parts.length > 1 ? { or: parts } : parts[0];
  };
  const tree = orExpr();
  if (p < toks.length) throw new Unsupported('paren');
  return tree;
}

// ---- Matchers ----
const noReminder = s => (s || '').toLowerCase().replace(/\([^)]*\)/g, '');
const faces = c => (c.card_faces && c.card_faces.length ? c.card_faces : [c]);
// Card-level text plus every face's text, lower-cased.
const texts = (c, k) => [c[k], ...faces(c).map(f => f[k])].filter(s => typeof s === 'string').map(s => s.toLowerCase());
// Power/toughness as a number: `*` counts as 0, `2+*` as 2 and `*+1` as 1, like Scryfall.
const statNum = x => (x.replace(/[^0-9+\-*]/g, '').replace(/\*/g, '0').match(/[+-]?\d+/g) || [0]).reduce((a, b) => a + Number(b), 0);
const cmp = (a, op, b) => ({ ':': a === b, '=': a === b, '!=': a !== b, '>': a > b, '<': a < b, '>=': a >= b, '<=': a <= b })[op];

// getSets(c) returns the colour sets to try; a card matches when any one of them does.
function colorMatch(getSets, op, val, isId) {
  const v = val.toLowerCase();
  const simple = op === ':' || op === '=';
  if (v === 'm' || v === 'multicolor') {
    if (!simple) throw new Unsupported('op');
    return c => getSets(c).some(h => h.length >= 2);
  }
  if (v === 'c' || v === 'colorless') {
    if (!simple) throw new Unsupported('op');
    return c => getSets(c).some(h => h.length === 0);
  }
  const w = COLOR_NAMES[v] ? [COLOR_NAMES[v]] : /^[wubrg]+$/.test(v) ? [...new Set(v)] : null;
  if (!w) throw new Unsupported('color');
  const test = have => {
    const sup = w.every(x => have.includes(x));    // have >= want
    const sub = have.every(x => w.includes(x));    // have <= want
    switch (op) {
      case ':': return isId ? sub : sup;
      case '=': return sup && sub;
      case '>=': return sup;
      case '<=': return sub;
      case '>': return sup && !sub;
      case '<': return sub && !sup;
      default: throw new Unsupported('op');
    }
  };
  return c => getSets(c).some(test);
}

function termFn({ key, op, val, neg }) {
  const v = val.toLowerCase();
  const num = () => { if (!/^-?\d+(\.\d+)?$/.test(val)) throw new Unsupported('number'); return Number(val); };
  if (TEXT_KEYS.includes(key) && op !== ':' && op !== '=') throw new Unsupported('op');
  let fn;
  switch (key) {
    case 'name': case 'n': fn = c => [c.name, ...faces(c).map(f => f.name)].some(n => n && n.toLowerCase().includes(v)); break;
    case 't': case 'type': fn = c => texts(c, 'type_line').some(s => s.includes(v)); break;
    case 'o': case 'oracle':
      if (v.includes('~')) throw new Unsupported('~');
      fn = c => faces(c).some(f => noReminder(f.oracle_text).includes(v));
      break;
    case 'c': case 'color': case 'colors':
      fn = colorMatch(c => [c.colors, ...faces(c).map(f => f.colors)].filter(Boolean).map(a => a.map(x => x.toLowerCase())), op, val, false);
      break;
    case 'id': case 'identity': case 'ci':
      fn = colorMatch(c => [(c.color_identity || []).map(x => x.toLowerCase())], op, val, true);
      break;
    case 'cmc': case 'mv': { const n = num(); fn = c => cmp(c.cmc, op, n); break; }
    case 'pow': case 'power': case 'tou': case 'toughness': {
      const n = num();
      const k = key[0] === 'p' ? 'power' : 'toughness';
      fn = c => [c[k], ...faces(c).map(f => f[k])].some(x => x !== undefined && cmp(statNum(x), op, n));
      break;
    }
    case 'r': case 'rarity':
      if (!(v in RARITY)) throw new Unsupported('rarity');
      fn = (c, p) => p[0] in RANK && cmp(RANK[p[0]], op, RARITY[v]);
      fn.print = true;
      break;
    case 's': case 'set': case 'e': fn = (c, p) => p[1] === v; fn.print = true; break;
    case 'a': case 'artist': fn = (c, p) => p[2].toLowerCase().includes(v); fn.print = true; break;
    case 'is': if (v !== 'dfc') throw new Unsupported('is'); fn = c => DFC_LAYOUTS.includes(c.layout); break;
    default: throw new Unsupported(key);
  }
  const out = neg ? (c, p) => !fn(c, p) : fn;
  out.print = !!fn.print;
  return out;
}

// Compiled matchers take (card, printing); only r:, s: and a: look at the printing.
function compile(node) {
  if (node.term) return termFn(node.term);
  if (node.not) { const f = compile(node.not); const g = (c, p) => !f(c, p); g.print = f.print; return g; }
  const fs = (node.or || node.and).map(compile);
  const g = node.or ? (c, p) => fs.some(f => f(c, p)) : (c, p) => fs.every(f => f(c, p));
  g.print = fs.some(f => f.print);
  return g;
}

// True when stored cards carry the text fields local search needs (older saves lack them).
export const hasSearchData = (list, needPrints) => list.every(c => (!needPrints || Array.isArray(c.prints))
  && (typeof c.oracle_text === 'string' || (c.card_faces && c.card_faces.every(f => typeof f.oracle_text === 'string'))));

// Returns the oracle ids of matching cards, or null when the query needs Scryfall.
export function localSearch(q, pool) {
  let fn;
  try { fn = compile(parse(tokenize(q))); } catch (e) { if (e instanceof Unsupported) return null; throw e; }
  const seen = new Set();
  const out = [];
  for (const c of pool) if (!seen.has(c.oracle_id) && (fn.print ? prints(c).some(p => fn(c, p)) : fn(c))) { seen.add(c.oracle_id); out.push(c.oracle_id); }
  return out;
}
