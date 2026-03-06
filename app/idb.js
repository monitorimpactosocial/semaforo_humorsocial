// Minimal IndexedDB helper (no external deps)
const IDB = (() => {
  const DB_NAME = 'paracel_hs_db';
  const DB_VERSION = 1;
  const STORE_PENDING = 'pending';
  const STORE_CACHE = 'cache';

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_PENDING)) {
          const st = db.createObjectStore(STORE_PENDING, { keyPath: 'local_id' });
          st.createIndex('status', 'status', { unique: false });
          st.createIndex('created_at', 'created_at', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_CACHE)) {
          db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
    });
  }

  async function put(store, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.objectStore(store).put(value);
    });
  }

  async function get(store, key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function del(store, key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function listPending(limit=500) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PENDING, 'readonly');
      const st = tx.objectStore(STORE_PENDING);
      const out = [];
      const req = st.openCursor();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        out.push(cur.value);
        if (out.length >= limit) return resolve(out);
        cur.continue();
      };
    });
  }

  return {
    STORE_PENDING, STORE_CACHE,
    put, get, del, listPending
  };
})();
