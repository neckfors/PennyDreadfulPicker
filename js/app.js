// Wiring: years, templates, fetch, search, filters, banned list, export/import.
import * as S from './state.js';
import { state } from './state.js';
import { classify, BIT } from './mana.js';
import { search, printings, byNames, slim, syncImages, yearClause } from './scryfall.js';
import { readText, parseList, applyList, bannedSet, isBanned, allLand } from './banned.js';
import { render, forgetImages, SORTS } from './grid.js';
import { buildCatalog, updateCatalog, deriveCards } from './catalog.js';
import { localSearch, hasSearchData } from './query.js';
import { VERSION } from './version.js';

const $ = id => document.getElementById(id);
const grid = $('grid');
// Banned info shows while "Banned only" is on.
const draw = () => {
  $('info').hidden = !state.filters.banned;
  render(grid, $('counter'));
};
const status = t => { $('status').textContent = t; };
const notice = t => { $('notice').hidden = !t; $('notice').textContent = t || ''; };
const changed = () => { S.save(); draw(); };

// ---- Years ----
const parseYears = s => s.split(',').map(x => parseInt(x, 10)).filter(y => y > 1990 && y < 2100);

function drawYears() {
  $('years').innerHTML = '';
  state.pools.forEach((pool, i) => {
    const wrap = document.createElement('span');
    wrap.className = 'year';
    wrap.innerHTML = `Period ${i + 1} <input type="text" aria-label="Period ${i + 1} years">
      <button>Random</button> <b></b>`;
    const [input, btn, out] = [wrap.querySelector('input'), wrap.querySelector('button'), wrap.querySelector('b')];
    input.value = pool;
    out.textContent = state.picked[i] ?? '–';
    input.onchange = () => { state.pools[i] = input.value; S.save(); };
    btn.onclick = () => {
      const ys = parseYears(input.value);
      if (!ys.length) return status(`Period ${i + 1} has no valid years.`);
      state.picked[i] = ys[Math.floor(Math.random() * ys.length)];
      out.textContent = state.picked[i];
      S.save();
    };
    $('years').append(wrap);
  });
}

// ---- Templates ----
function drawTemplates() {
  const sel = $('tplSelect');
  sel.length = 1;
  for (const name of Object.keys(state.templates).sort()) sel.add(new Option(name, name));
}
$('tplSave').onclick = () => {
  const name = prompt('Template name:', $('tplSelect').value || '');
  if (!name) return;
  state.templates[name] = [...state.pools];
  S.save(); drawTemplates(); $('tplSelect').value = name;
};
$('tplLoad').onclick = () => {
  const t = state.templates[$('tplSelect').value];
  if (!t) return;
  state.pools = [...t];
  S.save(); drawYears();
};
$('tplDelete').onclick = () => {
  const name = $('tplSelect').value;
  if (!name || !confirm(`Delete template "${name}"?`)) return;
  delete state.templates[name];
  S.save(); drawTemplates();
};

// ---- Fetch ----
// Fetch all: builds the catalogue of every PD card once, then only adds what is new.
$('fetchAllBtn').onclick = async () => {
  $('fetchAllBtn').disabled = $('fetchBtn').disabled = true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (!S.allCards.length) {
      S.setAllCards(await buildCatalog(status));
      status(`Catalogue built: ${S.allCards.length} cards.`);
    } else {
      const since = state.allChecked && new Date(Date.parse(state.allChecked) - 7 * 864e5).toISOString().slice(0, 10);
      const r = await updateCatalog(S.allCards, since, status);
      S.setAllCards(r.catalog);
      status(`Catalogue updated: ${r.added} new, ${r.removed} removed, ${S.allCards.length} cards.`);
    }
    state.allChecked = today;
    S.save();
    await S.saveAllCards();
  } catch (e) {
    status(`Fetch all failed: ${e.message}`);
  } finally {
    $('fetchAllBtn').disabled = $('fetchBtn').disabled = false;
  }
};

$('fetchBtn').onclick = async () => {
  const years = state.picked.filter(y => y);
  if (!years.length) return status('Pick at least one year first.');
  $('fetchBtn').disabled = true;
  try {
    let list;
    if (S.allCards.length) list = deriveCards(S.allCards, years);   // from the catalogue, no Scryfall call
    else {
      status('Searching Scryfall…');
      const raw = await search(`f:pd (${yearClause(years)} or t:land)`, (n, t) => status(`Searching… ${n} / ${t}`));
      list = raw.map(slim);
      status('Fetching printings…');
      const prints = await printings(`f:pd ${yearClause(years)}`, (n, t) => status(`Printings… ${n} / ${t}`));
      // Lands from other years have no printing in the picked years; they keep their own printing.
      list.forEach(c => { c.prints = prints.get(c.oracle_id) || [[c.rarity, c.set, c.artist || '']]; });
    }
    list.forEach(classify);
    S.setCards(list);
    state.fetchedYears = years;
    state.searchHits = null;
    state.search = '';
    $('search').value = '';
    await S.saveCards();
    changed();
    await downloadImages();
    status(`Fetched ${list.length} cards.`);
  } catch (e) {
    status(`Fetch failed: ${e.message}`);
  } finally {
    $('fetchBtn').disabled = false;
  }
};

async function downloadImages() {
  forgetImages();
  await syncImages([...S.cards, ...S.bannedCards, ...S.landCards], (d, t) => status(`Images ${d} / ${t}`));
  draw();
}

// ---- Search ----
// Searches the cards already fetched. Returns false when the query needs Scryfall instead.
function searchLocally(q) {
  if (!S.cards.length) return false;
  if (!hasSearchData(S.cards, true)) { status('Re-fetch cards to enable instant search; using Scryfall.'); return false; }
  // Banned/land cards saved before v2.2 lack text; leave them out rather than falling back to Scryfall.
  const extra = [...S.bannedCards, ...S.landCards];
  const ok = extra.filter(c => hasSearchData([c]));
  const hits = localSearch(q, [...S.cards, ...ok]);
  if (!hits) return false;
  state.searchHits = hits;
  status(`Search: ${hits.length} matches.` + (ok.length < extra.length ? ' (Re-fetch banned/lands for full results.)' : ''));
  changed();
  return true;
}

$('search').onkeydown = async e => {
  if (e.key !== 'Enter') return;
  const q = $('search').value.trim();
  state.search = q;
  if (!q) { state.searchHits = null; status(''); return changed(); }
  if (searchLocally(q)) return;
  const years = state.fetchedYears || state.picked.filter(y => y);
  if (!years.length) return status('Fetch cards first.');
  try {
    status('Searching…');
    const res = await search(`(${q}) f:pd ${yearClause(years)}`);
    state.searchHits = res.map(c => c.oracle_id);
    status(`Search: ${res.length} matches.`);
    changed();
  } catch (err) {
    status(`Search failed: ${err.message}`);
  }
};

// ---- Filters ----
const FILTER_BTNS = [
  ['W', 'ms-w', 'White'], ['U', 'ms-u', 'Blue'], ['G', 'ms-g', 'Green'], ['R', 'ms-r', 'Red'], ['B', 'ms-b', 'Black'],
  ['multi', 'ms-multicolor', 'Multicolor'], ['colorless', 'ms-c', 'Colorless'], ['lands', 'ms-land', 'Lands'], ['banned', null, 'Banned only'],
];
function drawFilters() {
  $('colorBtns').innerHTML = '';
  for (const [key, icon, label] of FILTER_BTNS) {
    const b = document.createElement('button');
    b.className = 'cbtn';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = BIT[key] ? `<i class="ms ${icon} ms-cost ms-shadow"></i>`
      : icon ? `<i class="ms ${icon}"></i>` : '<span class="ban">⊘ Banned</span>';
    const isOn = () => (BIT[key] ? !!(state.filters.colors & BIT[key]) : state.filters[key]);
    const paint = () => { b.classList.toggle('on', isOn()); b.setAttribute('aria-pressed', isOn()); };
    b.onclick = () => {
      if (BIT[key]) state.filters.colors ^= BIT[key];
      else state.filters[key] = !state.filters[key];
      paint(); changed();
      if (key === 'banned' && state.filters.banned) loadBannedCards();
      if (key === 'lands' && state.filters.lands) loadLands();
    };
    paint();
    $('colorBtns').append(b);
  }
}

for (const [k, label] of Object.entries(SORTS)) $('sort').add(new Option(label, k));
$('sort').onchange = () => { state.sort = $('sort').value; changed(); };
$('sortDir').onclick = () => { state.sortDesc = !state.sortDesc; $('sortDir').textContent = state.sortDesc ? '↓' : '↑'; changed(); };
$('selOnly').onchange = () => { state.selOnly = $('selOnly').checked; changed(); };
$('hideBanned').onchange = () => { state.hideBanned = $('hideBanned').checked; changed(); };
$('size').oninput = () => {
  state.size = +$('size').value;
  document.documentElement.style.setProperty('--cw', state.size + 'px');
  S.save();
};

// Fetches all PD-legal lands, so Lands works without (or beyond) a year fetch.
async function loadLands() {
  try {
    status('Fetching lands…');
    const list = (await search('f:pd t:land', (n, t) => status(`Lands ${n} / ${t}`))).map(slim);
    list.forEach(classify);
    S.setLandCards(list);
    await S.saveLandCards();
    changed();
    await downloadImages();
    status(`${list.length} lands.`);
  } catch (e) {
    status(`Land fetch failed: ${e.message}`);
  }
}

// Looks up banned cards that aren't loaded yet, so "Banned only" works without a fetch.
let bannedLookup = null;  // one lookup at a time, so cards are never added twice
function loadBannedCards() {
  bannedLookup = (bannedLookup || Promise.resolve()).then(lookUpBanned);
  return bannedLookup;
}
async function lookUpBanned() {
  const loaded = [...S.cards, ...S.bannedCards];
  const missing = state.banned.filter(n => !loaded.some(c => isBanned(bannedSet([n]), c)));
  if (!missing.length) return;
  try {
    status('Looking up banned cards…');
    const { found, notFound } = await byNames(missing.map(n => n.split(' // ')[0]), (n, t) => status(`Banned cards ${n} / ${t}`));
    const list = found.map(slim);
    list.forEach(classify);
    const lands = list.filter(allLand);
    state.banned = state.banned.filter(n => !lands.some(c => isBanned(bannedSet([n]), c)));
    S.setBannedCards([...S.bannedCards, ...list.filter(c => !allLand(c))]);
    await S.saveBannedCards();
    report(lands.map(c => c.name), [], notFound);
    changed();
    await downloadImages();
    status('');
  } catch (e) {
    status(`Banned lookup failed: ${e.message}`);
  }
}

// ---- Selection ----
grid.onclick = e => {
  const el = e.target.closest('.card');
  if (!el) return;
  const id = el.dataset.oid;
  const i = state.selected.indexOf(id);
  if (i >= 0) state.selected.splice(i, 1); else state.selected.push(id);
  if (state.selOnly && i >= 0) return changed();
  el.classList.toggle('sel', i < 0);
  S.save();
};

// ---- Banned list ----
let bannedMode = 'add';
$('bannedAdd').onclick = () => { bannedMode = 'add'; $('bannedFile').click(); };
$('bannedReplace').onclick = () => { bannedMode = 'replace'; $('bannedFile').click(); };
$('bannedClear').onclick = () => {
  if (!state.banned.length || !confirm(`Clear all ${state.banned.length} banned cards?`)) return;
  state.banned = []; state.report = { files: [], lands: [], zero: [], notFound: [] }; notice(''); drawInfo(); changed();
};
$('bannedFile').onchange = async () => {
  const files = [...$('bannedFile').files];
  $('bannedFile').value = '';
  if (!files.length) return;
  const names = [];
  const perFile = [];
  const zeros = [];
  for (const f of files) {
    const { names: rows, zero } = parseList(await readText(f));
    names.push(...rows);
    perFile.push(`${f.name}: ${rows.length} rows`);
    zeros.push(...zero);
  }
  const before = bannedMode === 'add' ? state.banned.length : 0;
  const { list, lands } = applyList(names, S.cards, state.banned, bannedMode);
  state.banned = list;
  if (bannedMode === 'replace') state.report = { files: [], lands: [], zero: [], notFound: [] };
  state.report.files.push(...perFile);
  notice(`Banned list now ${list.length} cards (${list.length - before} new).`);
  report(lands, zeros, []);
  changed();
  loadBannedCards();
};

// ---- Banned info ----
const uniq = a => [...new Set(a)].sort((x, y) => x.localeCompare(y));
function report(lands, zero, notFound) {
  const r = state.report;
  r.lands = uniq([...r.lands, ...lands]);
  r.zero = uniq([...r.zero, ...zero]);
  r.notFound = uniq([...r.notFound, ...notFound]);
  drawInfo();
  S.save();
}
// One summary line; each count opens its list. Not-found names start open.
const infoOpen = { notFound: true };
function drawInfo() {
  const r = state.report;
  const box = $('info');
  box.replaceChildren();
  const line = document.createElement('p');
  line.className = 'summary';
  const lists = [];
  const part = (key, label, items, warn, clickable = true) => {
    if (line.childNodes.length) line.append(' · ');
    if (!items.length) { line.append(`0 ${label}`); return; }
    const t = document.createElement('button');
    const open = !!infoOpen[key];
    t.className = 'toggle' + (warn ? ' warn' : '');
    t.dataset.key = key;
    t.setAttribute('aria-expanded', open);
    t.textContent = `${items.length} ${label} ${open ? '▾' : '▸'}`;
    line.append(t);
    if (!open) return;
    const ul = document.createElement('ul');
    for (const n of items) {
      const li = document.createElement('li');
      if (clickable) {
        const b = document.createElement('button');
        b.className = 'link'; b.textContent = n; b.dataset.name = n;
        li.append(b);
      } else li.textContent = n;
      ul.append(li);
    }
    lists.push(ul);
  };
  part('files', 'files read', r.files, false, false);
  part('notFound', 'not found', r.notFound, true);
  part('lands', 'lands ignored', r.lands);
  part('zero', 'with count 0', r.zero);
  box.append(line, ...lists);
}
$('info').onclick = e => {
  const t = e.target.closest('button.toggle');
  if (t) { infoOpen[t.dataset.key] = !infoOpen[t.dataset.key]; drawInfo(); return; }
  const b = e.target.closest('button.link');
  if (!b) return;
  const img = $('viewer').firstElementChild;
  img.alt = b.dataset.name;
  img.src = `https://api.scryfall.com/cards/named?format=image&version=normal&exact=${encodeURIComponent(b.dataset.name)}`;
  $('viewer').hidden = false;
};
$('viewer').onclick = () => { $('viewer').hidden = true; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('viewer').hidden = true; });

// ---- Export / import ----
$('exportBtn').onclick = () => S.exportFile();
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async () => {
  const file = $('importFile').files[0];
  $('importFile').value = '';
  if (!file) return;
  try {
    await S.importFile(file);
    [...S.cards, ...S.bannedCards, ...S.landCards].forEach(classify);
    applyStateToUi();
    await downloadImages();
    status('Imported.');
  } catch (e) {
    status(`Import failed: ${e.message}`);
  }
};

function applyStateToUi() {
  drawInfo();
  drawYears(); drawTemplates(); drawFilters();
  $('sort').value = state.sort;
  $('sortDir').textContent = state.sortDesc ? '↓' : '↑';
  $('selOnly').checked = state.selOnly;
  $('hideBanned').checked = state.hideBanned;
  $('search').value = state.search;
  $('size').value = state.size;
  document.documentElement.style.setProperty('--cw', state.size + 'px');
  draw();
}

await S.load();
[...S.cards, ...S.bannedCards, ...S.landCards].forEach(classify);
drawInfo();
$('version').textContent = 'v' + VERSION;
applyStateToUi();
if (state.filters.banned) loadBannedCards();
