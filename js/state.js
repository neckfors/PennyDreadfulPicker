// App state, browser save (IndexedDB) and file export/import.
import * as db from './db.js';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i).join(', ');

export const state = {
  pools: [range(2003, 2009), range(2010, 2018), range(2019, 2025)],
  picked: [null, null, null],
  allImages: false,    // true once "Fetch all" has downloaded every catalogue image
  catalogVersion: null, // CATALOG_VERSION the catalogue was built with (null = built before versions existed)
  allChecked: null,    // date (YYYY-MM-DD) the catalogue was last built or updated
  fetchedYears: null,  // years used by the last fetch, also used by the search box
  templates: {},
  selected: [],        // oracle ids
  banned: [],          // card names
  report: { files: [], lands: [], zero: [], notFound: [] },  // what the last banned upload skipped and why
  filters: { colors: 0, multi: false, colorless: false, lands: false, banned: false },
  sort: 'cmc',
  sortDesc: false,
  search: '',
  searchHits: null,    // oracle ids from the last search, or null
  size: 180,
  hideBanned: false,
  selOnly: false,
};
export let cards = [];
export let bannedCards = [];  // banned cards looked up by name, for "Banned only" without a fetch

export function setCards(list) { cards = list; }
export let allCards = [];     // catalogue of every PD card (see catalog.js), empty until "Fetch all"
export function setAllCards(list) { allCards = list; }
export let landCards = [];    // all PD-legal lands, fetched when the Lands button is turned on
export function setLandCards(list) { landCards = list; }
export function setBannedCards(list) {
  const seen = new Set();
  bannedCards = list.filter(c => !seen.has(c.oracle_id) && seen.add(c.oracle_id));
}

export async function load() {
  const s = await db.get('kv', 'state');
  if (s) Object.assign(state, s);
  cards = (await db.get('kv', 'cards')) || [];
  setBannedCards((await db.get('kv', 'bannedCards')) || []);
  landCards = (await db.get('kv', 'landCards')) || [];
  allCards = (await db.get('kv', 'allCards')) || [];
}

let timer;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => db.put('kv', 'state', { ...state }), 300);
}
export const saveCards = () => db.put('kv', 'cards', cards);
export const saveAllCards = () => db.put('kv', 'allCards', allCards);
export const saveLandCards = () => db.put('kv', 'landCards', landCards);
export const saveBannedCards = () => db.put('kv', 'bannedCards', bannedCards);

export function exportFile() {
  const blob = new Blob([JSON.stringify({ app: 'pd-picker', version: 1, state, cards, bannedCards, landCards })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pd-picker-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importFile(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'pd-picker') throw new Error('Not a Penny Dreadful Card Picker file.');
  Object.assign(state, data.state);
  cards = data.cards || [];
  bannedCards = data.bannedCards || [];
  landCards = data.landCards || [];
  await db.put('kv', 'state', { ...state });
  await saveCards();
  await saveBannedCards();
  await saveLandCards();
}
