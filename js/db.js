// Small IndexedDB wrapper: "kv" holds state and card list, "images" holds image blobs.
const DB_NAME = 'pd-picker';
let dbp;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('kv');
        req.result.createObjectStore('images');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const get = (store, key) => run(store, 'readonly', s => s.get(key));
export const put = (store, key, val) => run(store, 'readwrite', s => s.put(val, key));
export const del = (store, key) => run(store, 'readwrite', s => s.delete(key));
export const keys = store => run(store, 'readonly', s => s.getAllKeys());
