/* Vesna — автосохранение проекта и медиафайлов в IndexedDB (только на устройстве) */
'use strict';

V.storage = (() => {
  let dbp = null;
  const open = () => dbp ||= new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('no idb'));
    const r = indexedDB.open('vesna', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

  const tx = async (store, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  };

  const safe = (p) => p.catch(err => { console.warn('[Vesna storage]', err); return undefined; });

  return {
    putMedia: (rec) => safe(tx('media', 'readwrite', s => s.put(rec))),
    deleteMedia: (id) => safe(tx('media', 'readwrite', s => s.delete(id))),
    allMedia: () => safe(tx('media', 'readonly', s => s.getAll())).then(r => r || []),
    clearMedia: () => safe(tx('media', 'readwrite', s => s.clear())),
    setKV: (k, v) => safe(tx('kv', 'readwrite', s => s.put(v, k))),
    getKV: (k) => safe(tx('kv', 'readonly', s => s.get(k))),
  };
})();
