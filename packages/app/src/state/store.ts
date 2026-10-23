/**
 * Local-only persistence in IndexedDB. No account, no backend: history and
 * anchors live only in this browser. Failures are surfaced, never swallowed.
 */
const DB = 'mebae';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error(`IndexedDB unavailable: ${req.error?.message ?? 'unknown error'}`));
  });
}

let dbp: Promise<IDBDatabase> | null = null;
const db = () => (dbp ??= open());

export async function load<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(new Error(`Could not read ${key}: ${req.error?.message}`));
  });
}

export async function save<T>(key: string, value: T): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`Could not save ${key}: ${tx.error?.message}`));
  });
}
