/**
 * storage.js — IndexedDB handle persistence + localStorage workspace/preset/project helpers
 */

const DB_NAME    = 'npane-db';
const STORE_NAME = 'handles';
const WS_KEY     = 'npane-workspace';
export const PRESET_PREFIX  = 'npane-preset-';
export const PROJECT_PREFIX = 'npane-project-';
export const PROJECT_INDEX  = 'npane-project-index';

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

// ── Workspace (current session) ───────────────────

export function saveWorkspaceLS(data) {
  localStorage.setItem(WS_KEY, JSON.stringify(data));
}

export function loadWorkspaceLS() {
  const raw = localStorage.getItem(WS_KEY);
  return raw ? JSON.parse(raw) : null;
}

// ── Presets (visual) ──────────────────────────────

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

// ── Project history ───────────────────────────────
// Each project: { id, title, savedAt, ...workspace }
// Index: array of { id, title, savedAt }

function getProjectIndex() {
  const raw = localStorage.getItem(PROJECT_INDEX);
  return raw ? JSON.parse(raw) : [];
}

function setProjectIndex(index) {
  localStorage.setItem(PROJECT_INDEX, JSON.stringify(index));
}

export function listProjects() {
  return getProjectIndex().sort((a, b) => b.savedAt - a.savedAt);
}

export function saveProject(workspaceData) {
  const index = getProjectIndex();
  const id    = workspaceData.id || ('proj-' + Date.now());
  const entry = { id, title: workspaceData.title || 'Untitled', savedAt: Date.now() };

  const existing = index.findIndex(p => p.id === id);
  if (existing >= 0) index[existing] = entry;
  else index.push(entry);
  setProjectIndex(index);

  localStorage.setItem(PROJECT_PREFIX + id, JSON.stringify({ ...workspaceData, id, savedAt: Date.now() }));
  return id;
}

export function loadProject(id) {
  const raw = localStorage.getItem(PROJECT_PREFIX + id);
  return raw ? JSON.parse(raw) : null;
}

export function deleteProject(id) {
  const index = getProjectIndex().filter(p => p.id !== id);
  setProjectIndex(index);
  localStorage.removeItem(PROJECT_PREFIX + id);
}

export function renameProject(id, newTitle) {
  const index = getProjectIndex();
  const entry = index.find(p => p.id === id);
  if (entry) {
    entry.title = newTitle;
    setProjectIndex(index);
    const data = loadProject(id);
    if (data) {
      data.title = newTitle;
      localStorage.setItem(PROJECT_PREFIX + id, JSON.stringify(data));
    }
  }
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
