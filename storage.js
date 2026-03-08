/**
 * storage.js — IndexedDB handle persistence + localStorage workspace/preset helpers
 */

const DB_NAME    = 'npane-db';
const STORE_NAME = 'handles';
const WS_KEY     = 'npane-workspace';
export const PRESET_PREFIX = 'npane-preset-';

// ── IndexedDB ──────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      if (!e.target.result.objectStoreNames.contains(STORE_NAME))
        e.target.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

export async function saveHandle(name, handle) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, name).onsuccess = resolve;
    tx.onerror = reject;
  });
}

export async function getHandle(name) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(name);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = reject;
  });
}

export async function hasFolderHandle() {
  return !!(await getHandle('presetsFolder'));
}

// ── Workspace ─────────────────────────────────────

export function saveWorkspaceLS(data) {
  localStorage.setItem(WS_KEY, JSON.stringify(data));
}

export function loadWorkspaceLS() {
  const raw = localStorage.getItem(WS_KEY);
  return raw ? JSON.parse(raw) : null;
}

// ── Presets (localStorage) ─────────────────────────

export function listLocalPresets() {
  return Object.keys(localStorage)
    .filter(k => k.startsWith(PRESET_PREFIX))
    .map(k => k.slice(PRESET_PREFIX.length));
}

export function saveLocalPreset(name, data) {
  localStorage.setItem(PRESET_PREFIX + name, JSON.stringify(data));
}

export function loadLocalPreset(name) {
  const raw = localStorage.getItem(PRESET_PREFIX + name);
  return raw ? JSON.parse(raw) : null;
}

export function deleteLocalPreset(name) {
  localStorage.removeItem(PRESET_PREFIX + name);
}

// ── Folder-based presets ───────────────────────────

export async function savePresetToFolder(dirHandle, name, data) {
  let perm = await dirHandle.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') perm = await dirHandle.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') throw new Error('Write permission denied');
  const fh       = await dirHandle.getFileHandle(name + '.json', { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

export async function deletePresetFromFolder(dirHandle, name) {
  await dirHandle.removeEntry(name + '.json');
}

export async function loadPresetsFromFolder(dirHandle) {
  let perm = await dirHandle.queryPermission({ mode: 'read' });
  if (perm !== 'granted') perm = await dirHandle.requestPermission({ mode: 'read' });
  if (perm !== 'granted') throw new Error('Read permission denied');

  // Clear stale
  listLocalPresets().forEach(n => deleteLocalPreset(n));

  const loaded = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
    try {
      const file = await (await dirHandle.getFileHandle(entry.name)).getFile();
      const data = JSON.parse(await file.text());
      const name = entry.name.replace(/\.json$/, '');
      saveLocalPreset(name, data);
      loaded.push(name);
    } catch { /* skip corrupt files */ }
  }
  return loaded;
}
