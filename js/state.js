// App state, browser save (IndexedDB) and file export/import.
import * as db from './db.js';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i).join(', ');

export const state = {
  pools: [range(2003, 2009), range(2010, 2018), range(2019, 2025)],
  picked: [null, null, null],
  fetchedYears: null,  // years used by the last fetch, also used by the search box
  templates: {},
  selected: [],        // oracle ids
  banned: [],          // card names
  filters: { colors: 0, multi: false, colorless: false, lands: false },
  sort: 'cmc',
  sortDesc: false,
  search: '',
  searchHits: null,    // oracle ids from the last search, or null
  size: 180,
  hideBanned: false,
  selOnly: false,
};
export let cards = [];

export function setCards(list) { cards = list; }

export async function load() {
  const s = await db.get('kv', 'state');
  if (s) Object.assign(state, s);
  cards = (await db.get('kv', 'cards')) || [];
}

let timer;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => db.put('kv', 'state', { ...state }), 300);
}
export const saveCards = () => db.put('kv', 'cards', cards);

export function exportFile() {
  const blob = new Blob([JSON.stringify({ app: 'pd-picker', version: 1, state, cards })], { type: 'application/json' });
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
  await db.put('kv', 'state', { ...state });
  await saveCards();
}
