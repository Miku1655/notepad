/**
 * app.js — N-Pane Draft Workspace
 */

import {
  saveHandle, getHandle,
  saveWorkspaceLS, loadWorkspaceLS,
  listLocalPresets, saveLocalPreset, loadLocalPreset, deleteLocalPreset,
  savePresetToFolder, deletePresetFromFolder, loadPresetsFromFolder,
  listProjects, saveProject, loadProject, deleteProject,
} from './storage.js';

import {
  DEFAULTS, FONT_OPTIONS,
  applySetting, applyAllSettings, refreshUIPalette,
  collectVisualSettings, collectAllSettings,
} from './settings.js';

// ── DOM refs ───────────────────────────────────────

const titleEl        = document.getElementById('app-title');
const controlsWrap   = document.getElementById('controls-wrapper');
const toggleBtn      = document.getElementById('controls-toggle');
const padGrid        = document.getElementById('pad-grid');
const statusSaved    = document.getElementById('status-saved');
const statusWords    = document.getElementById('status-words');
const toastContainer = document.getElementById('toast-container');
const sidebar        = document.getElementById('sidebar');
const sidebarToggle  = document.getElementById('sidebar-toggle');
const projectListEl  = document.getElementById('project-list');
const btnNewProject  = document.getElementById('btn-new-project');
const btnSaveProject = document.getElementById('btn-save-project');
const findBar        = document.getElementById('find-bar');
const findInput      = document.getElementById('find-input');
const replaceInput   = document.getElementById('replace-input');
const btnReplaceOne  = document.getElementById('btn-replace-one');
const btnReplaceAll  = document.getElementById('btn-replace-all');
const findCount      = document.getElementById('find-count');
const btnFindClose   = document.getElementById('btn-find-close');
const btnFind        = document.getElementById('btn-find');

const ctrl = {
  font:        document.getElementById('ctrl-font'),
  fontSize:    document.getElementById('ctrl-fontSize'),
  textColor:   document.getElementById('ctrl-textColor'),
  bgColor:     document.getElementById('ctrl-bgColor'),
  paperColor:  document.getElementById('ctrl-paperColor'),
  borderColor: document.getElementById('ctrl-borderColor'),
  borderWidth: document.getElementById('ctrl-borderWidth'),
  radius:      document.getElementById('ctrl-radius'),
  padding:     document.getElementById('ctrl-padding'),
  height:      document.getElementById('ctrl-height'),
  columns:     document.getElementById('ctrl-columns'),
  pads:        document.getElementById('ctrl-pads'),
};

const presetNameInput = document.getElementById('preset-name');
const presetList      = document.getElementById('preset-list');
const btnSavePreset   = document.getElementById('btn-save-preset');
const btnLoadPreset   = document.getElementById('btn-load-preset');
const btnDeletePreset = document.getElementById('btn-delete-preset');
const btnExportWS     = document.getElementById('btn-export-ws');
const btnImportWS     = document.getElementById('btn-import-ws');
const fileImportWS    = document.getElementById('file-import-ws');
const btnExportVisual = document.getElementById('btn-export-visual');
const btnImportVisual = document.getElementById('btn-import-visual');
const fileImportVisual= document.getElementById('file-import-visual');
const btnSelectFolder = document.getElementById('btn-select-folder');
const btnResetAll     = document.getElementById('btn-reset-all');
const layoutChips     = document.querySelectorAll('[data-layout]');

// ── State ──────────────────────────────────────────

let focusMode       = false;
let focusPad        = null;
let saveTimer       = null;
let syncScrolling   = false;   // prevent re-entrant scroll sync
let currentProjectId = null;   // null = unsaved / new workspace

// ── Toast ──────────────────────────────────────────

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  toastContainer.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2500);
}

// ── Save ───────────────────────────────────────────

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 400);
}

function doSave() {
  const ws = collectWorkspace();
  saveWorkspaceLS(ws);
  // Auto-update project if one is open
  if (currentProjectId) {
    saveProject({ ...ws, id: currentProjectId });
    renderProjectList();
  }
  const t = new Date();
  if (statusSaved) statusSaved.textContent = 'Saved ' + t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  updateWordCount();
}

// ── Word count ─────────────────────────────────────

function updateWordCount() {
  const total = [...padGrid.querySelectorAll('textarea')]
    .reduce((n, ta) => n + (ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0), 0);
  if (statusWords) statusWords.textContent = total.toLocaleString() + ' words';
}

// ── Pads ───────────────────────────────────────────

function createPad(index, content = '', labelText = '') {
  const wrap = document.createElement('div');
  wrap.className = 'pad';
  wrap.dataset.index = index;

  const header = document.createElement('div');
  header.className = 'pad-header';

  const labelSpan = document.createElement('span');
  labelSpan.className = 'pad-label-text';
  labelSpan.contentEditable = 'true';
  labelSpan.dataset.placeholder = `Pad ${index + 1}`;
  labelSpan.textContent = labelText || '';
  labelSpan.title = 'Click to rename';
  labelSpan.addEventListener('blur', scheduleSave);
  labelSpan.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); labelSpan.blur(); } });

  const wordCount = document.createElement('span');
  wordCount.className = 'pad-wordcount';

  const actions = document.createElement('div');
  actions.className = 'pad-actions';

  // Sync scroll toggle
  const syncBtn = document.createElement('button');
  syncBtn.className = 'pad-btn';
  syncBtn.title = 'Toggle sync scroll with other pads';
  syncBtn.innerHTML = '⇅';
  syncBtn.addEventListener('click', () => {
    syncBtn.classList.toggle('active');
    wrap.dataset.syncScroll = syncBtn.classList.contains('active') ? '1' : '';
    const any = [...padGrid.querySelectorAll('.pad')].some(p => p.dataset.syncScroll);
    wrap.classList.toggle('sync-scroll-active', !!wrap.dataset.syncScroll);
  });

  // Focus mode
  const focusBtn = document.createElement('button');
  focusBtn.className = 'pad-btn';
  focusBtn.title = 'Focus mode (Ctrl+Shift+F)';
  focusBtn.innerHTML = '⛶';
  focusBtn.addEventListener('click', () => enterFocusMode(wrap));

  // Clear
  const clearBtn = document.createElement('button');
  clearBtn.className = 'pad-btn';
  clearBtn.title = 'Clear pad';
  clearBtn.innerHTML = '✕';
  clearBtn.addEventListener('click', () => {
    const ta = wrap.querySelector('textarea');
    if (!ta.value || confirm('Clear this pad?')) {
      ta.value = '';
      scheduleSave();
      updatePadWordCount(wrap);
    }
  });

  actions.append(syncBtn, focusBtn, clearBtn);
  header.append(labelSpan, wordCount, actions);

  const ta = document.createElement('textarea');
  ta.value = content;
  ta.spellcheck = true;

  ta.addEventListener('input', () => {
    scheduleSave();
    updatePadWordCount(wrap);
  });

  // Sync scroll
  ta.addEventListener('scroll', () => {
    if (syncScrolling) return;
    if (!wrap.dataset.syncScroll) return;
    const ratio = ta.scrollTop / (ta.scrollHeight - ta.clientHeight || 1);
    syncScrolling = true;
    [...padGrid.querySelectorAll('.pad[data-sync-scroll="1"] textarea')].forEach(other => {
      if (other === ta) return;
      other.scrollTop = ratio * (other.scrollHeight - other.clientHeight);
    });
    syncScrolling = false;
  });

  wrap.append(header, ta);
  return wrap;
}

function updatePadWordCount(padEl) {
  const ta  = padEl.querySelector('textarea');
  const wc  = padEl.querySelector('.pad-wordcount');
  const cnt = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
  wc.textContent = cnt ? cnt.toLocaleString() + ' w' : '';
}

function buildPads(count, contents = [], labels = []) {
  padGrid.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const pad = createPad(i, contents[i] || '', labels[i] || '');
    padGrid.appendChild(pad);
    setTimeout(() => pad.classList.add('show'), i * 30);
  }
  updateWordCount();
}

function reconcilePads(targetCount, existingContents, existingLabels) {
  const currentPads = [...padGrid.children];
  const count       = currentPads.length;

  if (targetCount < count) {
    const toRemove = currentPads.slice(targetCount);
    if (toRemove.some(p => p.querySelector('textarea').value.trim()) &&
        !confirm('Reducing pads will remove text. Continue?')) {
      ctrl.pads.value = count;
      return;
    }
    toRemove.forEach(p => p.remove());
  } else {
    for (let i = count; i < targetCount; i++) {
      const pad = createPad(i, existingContents[i] || '', existingLabels[i] || '');
      padGrid.appendChild(pad);
      setTimeout(() => pad.classList.add('show'), (i - count) * 30);
    }
  }
  updateWordCount();
}

// ── Workspace collect / apply ──────────────────────

function collectWorkspace() {
  const pads = [...padGrid.querySelectorAll('.pad')];
  return {
    title:    titleEl.textContent.trim(),
    settings: collectAllSettings(ctrl),
    pads:     pads.map(p => p.querySelector('textarea').value),
    labels:   pads.map(p => (p.querySelector('.pad-label-text')?.textContent.trim() || '')),
    id:       currentProjectId || undefined,
  };
}

function applyWorkspace(ws, { applyVisuals = true } = {}) {
  titleEl.textContent = ws.title || 'N-Pane Draft Workspace';
  currentProjectId = ws.id || null;

  const settings = { ...DEFAULTS, ...(ws.settings || {}) };
  for (const [k, v] of Object.entries(settings)) {
    if (ctrl[k]) ctrl[k].value = v;
  }

  applySetting('height', Number(ctrl.height.value));
  buildPads(Number(ctrl.pads.value), ws.pads || [], ws.labels || []);
  applySetting('columns', Number(ctrl.columns.value));

  if (applyVisuals) applyAllSettings(settings);

  updateLayoutChips();
}

// ── Layout quick-picks ─────────────────────────────

const LAYOUTS = {
  'translate-2': { columns: 2, pads: 2, labels: ['Translation', 'Original'] },
  'translate-3': { columns: 3, pads: 3, labels: ['Translation', 'Original', 'Notes'] },
  'quad':        { columns: 2, pads: 4, labels: [] },
  'free':        { columns: 3, pads: 6, labels: [] },
};

function updateLayoutChips() {
  const cols = Number(ctrl.columns.value);
  const pads = Number(ctrl.pads.value);
  layoutChips.forEach(chip => {
    const layout = LAYOUTS[chip.dataset.layout];
    chip.classList.toggle('active', !!layout && layout.columns === cols && layout.pads === pads);
  });
}

function applyLayout(key) {
  const layout = LAYOUTS[key];
  if (!layout) return;
  const currentContent = [...padGrid.children].map(p => p.querySelector('textarea').value);
  ctrl.columns.value = layout.columns;
  ctrl.pads.value    = layout.pads;
  applySetting('columns', layout.columns);
  buildPads(layout.pads, currentContent, layout.labels);
  updateLayoutChips();
  scheduleSave();
}

layoutChips.forEach(chip => chip.addEventListener('click', () => applyLayout(chip.dataset.layout)));

// ── Visual preset apply ────────────────────────────

function applyVisualPreset(preset) {
  if (!preset?.settings) return;
  for (const [k, v] of Object.entries(preset.settings)) {
    if (ctrl[k]) ctrl[k].value = v;
  }
  applyAllSettings(preset.settings);
  scheduleSave();
}

// ── Preset list ────────────────────────────────────

function refreshPresetList() {
  const names = listLocalPresets();
  presetList.innerHTML = names.length
    ? names.map(n => `<option value="${n}">${n}</option>`).join('')
    : '<option value="" disabled>No presets saved</option>';
}

// ── Project sidebar ────────────────────────────────

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderProjectList() {
  const projects = listProjects();
  projectListEl.innerHTML = '';

  if (!projects.length) {
    projectListEl.innerHTML = '<div style="font-size:11px;color:var(--text-label);padding:10px 8px;">No saved projects yet.<br>Hit ↑ to save the current workspace.</div>';
    return;
  }

  projects.forEach(p => {
    const item = document.createElement('div');
    item.className = 'project-item' + (p.id === currentProjectId ? ' active' : '');
    item.title = p.title;

    const icon = document.createElement('span');
    icon.className = 'project-icon';
    icon.textContent = '◻';

    const info = document.createElement('div');
    info.className = 'project-info';

    const name = document.createElement('span');
    name.className = 'project-name';
    name.textContent = p.title;

    const date = document.createElement('span');
    date.className = 'project-date';
    date.textContent = formatDate(p.savedAt);

    const del = document.createElement('button');
    del.className = 'project-delete';
    del.title = 'Delete project';
    del.textContent = '✕';
    del.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`Delete "${p.title}"?`)) {
        deleteProject(p.id);
        if (currentProjectId === p.id) currentProjectId = null;
        renderProjectList();
        toast(`"${p.title}" deleted`);
      }
    });

    info.append(name, date);
    item.append(icon, info, del);
    item.addEventListener('click', () => openProject(p.id));
    projectListEl.appendChild(item);
  });
}

function openProject(id) {
  const data = loadProject(id);
  if (!data) { toast('Project not found', 'error'); return; }
  // Save current state before switching
  if (currentProjectId) doSave();
  applyWorkspace(data, { applyVisuals: true });
  currentProjectId = id;
  saveWorkspaceLS(collectWorkspace());
  renderProjectList();
  toast(`Opened "${data.title}"`);
}

btnSaveProject.addEventListener('click', () => {
  const ws = collectWorkspace();
  const id = saveProject({ ...ws, id: currentProjectId });
  currentProjectId = id;
  renderProjectList();
  toast(`Saved "${ws.title}"`);
});

btnNewProject.addEventListener('click', () => {
  // Save current first
  if (currentProjectId) doSave();
  // Start fresh
  currentProjectId = null;
  titleEl.textContent = 'New Project';
  applyAllSettings(DEFAULTS);
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (ctrl[k]) ctrl[k].value = v;
  }
  buildPads(2, [], ['Translation', 'Original']);
  applySetting('columns', 2);
  ctrl.columns.value = 2;
  updateLayoutChips();
  saveWorkspaceLS(collectWorkspace());
  renderProjectList();
  toast('New project started');
});

// ── Sidebar toggle ─────────────────────────────────

function setSidebarOpen(open) {
  sidebar.classList.toggle('collapsed', !open);
  localStorage.setItem('npane-sidebar-hidden', open ? '' : '1');
}

sidebarToggle.addEventListener('click', () => {
  setSidebarOpen(sidebar.classList.contains('collapsed'));
});

// ── Controls panel toggle ──────────────────────────

toggleBtn.addEventListener('click', () => {
  const collapsed = controlsWrap.classList.contains('collapsed');
  controlsWrap.classList.toggle('collapsed', !collapsed);
  toggleBtn.setAttribute('aria-expanded', collapsed);
  localStorage.setItem('npane-controls-hidden', collapsed ? '' : '1');
});

// ── Focus mode ─────────────────────────────────────

function enterFocusMode(padEl) {
  focusMode = true;
  focusPad  = padEl;
  padEl.classList.add('focus-active');
  document.body.classList.add('focus-mode');
  padEl.querySelector('textarea').focus();
}

function exitFocusMode() {
  if (!focusMode) return;
  focusMode = false;
  document.body.classList.remove('focus-mode');
  focusPad?.classList.remove('focus-active');
  focusPad = null;
}

// ── Find & Replace ─────────────────────────────────

function openFindBar() {
  findBar.classList.remove('hidden');
  findInput.focus();
  findInput.select();
  updateFindCount();
}

function closeFindBar() {
  findBar.classList.add('hidden');
}

function getAllTextareas() {
  return [...padGrid.querySelectorAll('textarea')];
}

function updateFindCount() {
  const term = findInput.value;
  if (!term) { findCount.textContent = ''; return; }
  let total = 0;
  getAllTextareas().forEach(ta => {
    const matches = ta.value.split(term).length - 1;
    total += matches;
  });
  findCount.textContent = total ? `${total} match${total === 1 ? '' : 'es'}` : 'no matches';
}

btnReplaceOne.addEventListener('click', () => {
  const term = findInput.value;
  const rep  = replaceInput.value;
  if (!term) return;
  for (const ta of getAllTextareas()) {
    const idx = ta.value.indexOf(term);
    if (idx >= 0) {
      ta.value = ta.value.slice(0, idx) + rep + ta.value.slice(idx + term.length);
      scheduleSave();
      updateFindCount();
      return;
    }
  }
  toast('No match found');
});

btnReplaceAll.addEventListener('click', () => {
  const term = findInput.value;
  const rep  = replaceInput.value;
  if (!term) return;
  let count = 0;
  getAllTextareas().forEach(ta => {
    const parts = ta.value.split(term);
    if (parts.length > 1) {
      count += parts.length - 1;
      ta.value = parts.join(rep);
    }
  });
  if (count) {
    scheduleSave();
    toast(`Replaced ${count} occurrence${count === 1 ? '' : 's'}`);
  } else {
    toast('No matches found');
  }
  updateFindCount();
});

findInput.addEventListener('input', updateFindCount);
btnFindClose.addEventListener('click', closeFindBar);
btnFind.addEventListener('click', () => {
  findBar.classList.contains('hidden') ? openFindBar() : closeFindBar();
});

// ── Keyboard shortcuts ─────────────────────────────

document.addEventListener('keydown', e => {
  // Focus mode toggle
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    if (focusMode) exitFocusMode();
    else {
      const pad = document.activeElement?.closest?.('.pad');
      if (pad) enterFocusMode(pad);
    }
    return;
  }

  // Escape
  if (e.key === 'Escape') {
    if (focusMode) { exitFocusMode(); return; }
    if (!findBar.classList.contains('hidden')) { closeFindBar(); return; }
  }

  // Find & replace
  if (e.ctrlKey && e.key.toLowerCase() === 'h') {
    e.preventDefault();
    findBar.classList.contains('hidden') ? openFindBar() : closeFindBar();
    return;
  }

  // Jump between pads: Ctrl+Arrow
  if (e.ctrlKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const pads = [...padGrid.querySelectorAll('.pad')];
    const current = document.activeElement?.closest?.('.pad');
    if (!current) return;
    const idx = pads.indexOf(current);
    const next = e.key === 'ArrowRight'
      ? pads[idx + 1] || pads[0]
      : pads[idx - 1] || pads[pads.length - 1];
    next?.querySelector('textarea')?.focus();
    e.preventDefault();
  }
});

// ── Live control wiring ────────────────────────────

Object.entries(ctrl).forEach(([key, el]) => {
  if (!el) return;
  el.addEventListener('input', () => {
    applySetting(key, el.value);

    // Re-derive full UI palette whenever a color or bg changes
    if (['bgColor', 'paperColor', 'textColor', 'borderColor'].includes(key)) {
      refreshUIPalette(ctrl.bgColor.value, ctrl.paperColor.value, ctrl.textColor.value, ctrl.borderColor.value);
    }

    if (key === 'pads') {
      const ws = collectWorkspace();
      reconcilePads(Number(el.value), ws.pads, ws.labels);
    }
    if (key === 'columns') updateLayoutChips();
    scheduleSave();
  });
});

titleEl.addEventListener('blur', scheduleSave);

// ── Save/Load preset ───────────────────────────────

btnSavePreset.addEventListener('click', async () => {
  const name = presetNameInput.value.trim();
  if (!name) { toast('Enter a preset name first', 'error'); return; }
  const data = { settings: collectVisualSettings(ctrl) };
  saveLocalPreset(name, data);
  const dirHandle = await getHandle('presetsFolder');
  if (dirHandle) {
    try { await savePresetToFolder(dirHandle, name, data); }
    catch { toast('Saved locally (folder write failed)', 'error'); }
  }
  refreshPresetList();
  toast(`Preset "${name}" saved`);
});

btnLoadPreset.addEventListener('click', () => {
  const name = presetList.value;
  if (!name) return;
  const preset = loadLocalPreset(name);
  if (!preset) { toast('Preset not found', 'error'); return; }
  applyVisualPreset(preset);
  toast(`Preset "${name}" applied`);
});

btnDeletePreset.addEventListener('click', async () => {
  const name = presetList.value;
  if (!name || !confirm(`Delete preset "${name}"?`)) return;
  deleteLocalPreset(name);
  const dirHandle = await getHandle('presetsFolder');
  if (dirHandle) { try { await deletePresetFromFolder(dirHandle, name); } catch {} }
  refreshPresetList();
  toast(`Preset "${name}" deleted`);
});

// ── Export / Import workspace ──────────────────────

btnExportWS.addEventListener('click', () => {
  const data = collectWorkspace();
  const filename = prompt('Filename:', data.title || 'npane-workspace') || 'npane-workspace';
  download(filename + '.json', JSON.stringify(data, null, 2));
});

btnImportWS.addEventListener('click', () => fileImportWS.click());
fileImportWS.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  readJSON(file, data => {
    data.title = data.title || file.name.replace(/\.json$/i, '');
    applyWorkspace(data, { applyVisuals: false });
    doSave();
    toast('Workspace imported');
  });
});

// ── Export / Import visual preset ─────────────────

btnExportVisual.addEventListener('click', async () => {
  const data = { settings: collectVisualSettings(ctrl) };
  const name = presetNameInput.value.trim() || 'visual-preset';
  const dirHandle = await getHandle('presetsFolder');
  if (dirHandle) {
    try {
      await savePresetToFolder(dirHandle, name, data);
      await loadPresetsFromFolder(dirHandle);
      refreshPresetList();
      toast(`Visual preset "${name}" saved to folder`);
      return;
    } catch {}
  }
  download(name + '.json', JSON.stringify(data, null, 2));
  toast('Visual preset downloaded');
});

btnImportVisual.addEventListener('click', () => fileImportVisual.click());
fileImportVisual.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  readJSON(file, data => { applyVisualPreset(data); toast('Visual preset applied'); });
});

// ── Select folder ──────────────────────────────────

btnSelectFolder.addEventListener('click', async () => {
  if (!window.showDirectoryPicker) { toast('File System API not supported (Chrome/Edge)', 'error'); return; }
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveHandle('presetsFolder', dirHandle);
    await loadPresetsFromFolder(dirHandle);
    refreshPresetList();
    toast('Presets folder linked');
  } catch (err) {
    if (err.name !== 'AbortError') toast('Could not access folder', 'error');
  }
});

// ── Reset all ──────────────────────────────────────

btnResetAll.addEventListener('click', () => {
  if (!confirm('Reset everything to defaults?')) return;
  titleEl.textContent = 'N-Pane Draft Workspace';
  currentProjectId = null;
  for (const [k, v] of Object.entries(DEFAULTS)) { if (ctrl[k]) ctrl[k].value = v; }
  applyAllSettings(DEFAULTS);
  buildPads(DEFAULTS.pads, [], []);
  updateLayoutChips();
  doSave();
  toast('Reset to defaults');
});

// ── Utilities ──────────────────────────────────────

function download(filename, text) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([text], { type: 'application/json' })),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function readJSON(file, cb) {
  const reader = new FileReader();
  reader.onload = ev => { try { cb(JSON.parse(ev.target.result)); } catch { toast('Invalid JSON', 'error'); } };
  reader.readAsText(file);
}

// ── Boot ───────────────────────────────────────────

async function init() {
  // Restore sidebar visibility
  if (localStorage.getItem('npane-sidebar-hidden') === '1') {
    sidebar.classList.add('collapsed');
  }

  // Restore controls visibility
  if (localStorage.getItem('npane-controls-hidden') === '1') {
    controlsWrap.classList.add('collapsed');
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  // Load workspace
  const saved = loadWorkspaceLS();
  if (saved) {
    applyWorkspace(saved, { applyVisuals: true });
  } else {
    applyAllSettings(DEFAULTS);
    ctrl.columns.value = 2;
    ctrl.pads.value    = 2;
    applySetting('columns', 2);
    buildPads(2, [], ['Translation', 'Original']);
    updateLayoutChips();
  }

  refreshPresetList();
  renderProjectList();

  // Auto-load presets from persisted folder
  try {
    const dirHandle = await getHandle('presetsFolder');
    if (dirHandle) {
      await loadPresetsFromFolder(dirHandle);
      refreshPresetList();
    }
  } catch {}
}

init();
