// js/storage.js - the ONLY file that talks to IndexedDB.
// One object store per record type (keyPath "id"), plus a "files" store for attachment blobs.
// Everything returns Promises. Other modules never see IndexedDB directly.

const DB_NAME = 'studentos';
const DB_VERSION = 1;

export const RECORD_STORES = [
  'semesters', 'courses', 'timetable', 'occurrences', 'assessments', 'deadlines',
  'resources', 'events', 'tasks', 'gradeSchemes', 'results', 'notifState',
];

let dbPromise = null;
let errorHandler = () => {};

/** app.js registers a handler so storage failures become visible toasts. */
export function setErrorHandler(fn) { errorHandler = fn; }
export function reportError(e) { errorHandler(e); }

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        [...RECORD_STORES, 'files'].forEach((name) => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/** Run one request inside its own transaction and resolve with the request result. */
function run(store, mode, makeRequest) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = makeRequest(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Storage transaction aborted (quota exceeded?)'));
  }));
}

export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const putRecord = (store, rec) => run(store, 'readwrite', (s) => s.put(rec));
export const deleteRecord = (store, id) => run(store, 'readwrite', (s) => s.delete(id));
export const clearStore = (store) => run(store, 'readwrite', (s) => s.clear());

export function putMany(store, records) {
  if (!records.length) return Promise.resolve();
  return run(store, 'readwrite', (s) => { records.forEach((r) => s.put(r)); return null; });
}

export async function loadAll() {
  const out = {};
  for (const store of RECORD_STORES) out[store] = await getAll(store);
  return out;
}

/* ---- attachments (Blob + metadata) ---- */
export const putFile = (rec) => run('files', 'readwrite', (s) => s.put(rec));
export const getFile = (id) => run('files', 'readonly', (s) => s.get(id));
export const deleteFile = (id) => deleteRecord('files', id);

export async function clearEverything() {
  for (const store of [...RECORD_STORES, 'files']) await clearStore(store);
}

/** Fire-and-forget writes: failures are reported instead of silently lost. */
export function persist(promise) {
  promise.catch((e) => errorHandler(e));
  return promise;
}
