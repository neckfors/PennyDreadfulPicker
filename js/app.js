// Wiring: years, templates, fetch, search, filters, banned list, export/import.
import * as S from './state.js';
import { state } from './state.js';
import { classify, BIT } from './mana.js';
import { search, byNames, slim, syncImages, yearClause } from './scryfall.js';
import { readText, parseList, applyList, bannedSet, isBanned, allLand } from './banned.js';
import { render, forgetImages, SORTS } from './grid.js';
import { VERSION } from './version.js';

const $ = id => document.getElementById(id);
const grid = $('grid');
// Banned info is only offered while "Banned only" is on.
const draw = () => {
  const on = state.filters.banned;
  $('infoBtn').hidden = !on;
  if (!on) { $('info').hidden = true; $('infoBtn').setAttribute('aria-expanded', false); }
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
$('fetchBtn').onclick = async () => {
  const years = state.picked.filter(y => y);
  if (!years.length) return status('Pick at least one year first.');
  $('fetchBtn').disabled = true;
  try {
    status('Searching Scryfall…');
    const raw = await search(`f:pd (${yearClause(years)} or t:land)`, (n, t) => status(`Searching… ${n} / ${t}`));
    const list = raw.map(slim);
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
$('search').onkeydown = async e => {
  if (e.key !== 'Enter') return;
  const q = $('search').value.trim();
  state.search = q;
  if (!q) { state.searchHits = null; status(''); return changed(); }
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
function drawInfo() {
  const r = state.report;
  const problems = r.notFound.length;
  $('infoBtn').textContent = problems ? `Banned info (${problems})` : 'Banned info';
  const box = $('info');
  box.replaceChildren();
  const section = (title, items, ok, clickable = true) => {
    const div = document.createElement('div');
    const h = document.createElement('h3');
    h.textContent = `${title} (${items.length})`;
    if (ok) h.className = 'ok';
    const ul = document.createElement('ul');
    for (const t of items.length ? items : ['None']) {
      const li = document.createElement('li');
      if (clickable && items.length) {
        const b = document.createElement('button');
        b.className = 'link'; b.textContent = t; b.dataset.name = t;
        li.append(b);
      } else li.textContent = t;
      ul.append(li);
    }
    div.append(h, ul);
    box.append(div);
  };
  section('Files read', r.files, true, false);
  section('Not found on Scryfall', r.notFound, !r.notFound.length);
  section('Ignored: all faces are lands', r.lands, true);
  section('Ignored: count 0', r.zero, true);
}
$('infoBtn').onclick = () => {
  const open = $('info').hidden;
  $('info').hidden = !open;
  $('infoBtn').setAttribute('aria-expanded', open);
};
$('info').onclick = e => {
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
