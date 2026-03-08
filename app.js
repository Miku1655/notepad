/**
 * app.js — N-Pane Draft Workspace
 * Main application logic
 */

import {
  saveHandle, getHandle, hasFolderHandle,
  saveWorkspaceLS, loadWorkspaceLS,
  listLocalPresets, saveLocalPreset, loadLocalPreset, deleteLocalPreset,
  savePresetToFolder, deletePresetFromFolder, loadPresetsFromFolder,
  PRESET_PREFIX,
} from './storage.js';

import {
  DEFAULTS, SCHEMA, FONT_OPTIONS,
  applySetting, applyAllSettings, collectVisualSettings, collectAllSettings,
} from './settings.js';

// ── DOM refs ───────────────────────────────────────

const titleEl        = document.getElementById('app-title');
const controlsWrap   = document.getElementById('controls-wrapper');
const toggleBtn      = document.getElementById('controls-toggle');
const padGrid        = document.getElementById('pad-grid');
const statusSaved    = document.getElementById('status-saved');
const statusWords    = document.getElementById('status-words');
const toastContainer = document.getElementById('toast-container');

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

// Preset controls
const presetNameInput = document.getElementById('preset-name');
const presetList      = document.getElementById('preset-list');
const btnSavePreset   = document.getElementById('btn-save-preset');
const btnLoadPreset   = document.getElementById('btn-load-preset');
const btnDeletePreset = document.getElementById('btn-delete-preset');

// Import/export
const btnExportWS       = document.getElementById('btn-export-ws');
const btnImportWS       = document.getElementById('btn-import-ws');
const fileImportWS      = document.getElementById('file-import-ws');
const btnExportVisual   = document.getElementById('btn-export-visual');
const btnImportVisual   = document.getElementById('btn-import-visual');
const fileImportVisual  = document.getElementById('file-import-visual');
const btnSelectFolder   = document.getElementById('btn-select-folder');
const btnResetAll       = document.getElementById('btn-reset-all');

// Layout chips
const layoutChips = document.querySelectorAll('[data-layout]');

// ── State ──────────────────────────────────────────

let focusMode     = false;
let focusPad      = null;
let saveTimer     = null;
let lastSaveTime  = null;

// ── Toast ──────────────────────────────────────────

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  toastContainer.appendChild(el);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('show'));
  });
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 2500);
}

// ── Save ───────────────────────────────────────────

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 400);
}

function doSave() {
  saveWorkspaceLS(collectWorkspace());
  lastSaveTime = new Date();
  if (statusSaved) {
    statusSaved.textContent = 'Saved ' + lastSaveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  updateWordCount();
}

// ── Word count ─────────────────────────────────────

function updateWordCount() {
  const total = [...padGrid.querySelectorAll('textarea')]
    .reduce((acc, ta) => acc + (ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0), 0);
  if (statusWords) statusWords.textContent = total.toLocaleString() + ' words';
}

// ── Pads ───────────────────────────────────────────

function createPad(index, content = '', labelText = '') {
  const wrap = document.createElement('div');
  wrap.className = 'pad';
  wrap.dataset.index = index;

  const header  = document.createElement('div');
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

  // Focus mode button
  const focusBtn = document.createElement('button');
  focusBtn.className = 'pad-btn';
  focusBtn.title = 'Focus mode (Ctrl+Shift+F)';
  focusBtn.innerHTML = '⛶';
  focusBtn.addEventListener('click', () => enterFocusMode(wrap));

  // Clear button
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

  actions.append(focusBtn, clearBtn);
  header.append(labelSpan, wordCount, actions);

  const ta = document.createElement('textarea');
  ta.value   = content;
  ta.spellcheck = true;
  ta.addEventListener('input', () => {
    scheduleSave();
    updatePadWordCount(wrap);
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
    // stagger entrance
    setTimeout(() => pad.classList.add('show'), i * 30);
  }
  updateWordCount();
}

function reconcilePads(targetCount, existingContents, existingLabels) {
  const currentPads = [...padGrid.children];
  const count       = currentPads.length;

  if (targetCount < count) {
    const toRemove = currentPads.slice(targetCount);
    const hasText  = toRemove.some(p => p.querySelector('textarea').value.trim());
    if (hasText && !confirm('Reducing pads will remove text. Continue?')) {
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
  const pads   = [...padGrid.querySelectorAll('.pad')];
  return {
    title:    titleEl.textContent.trim(),
    settings: collectAllSettings(ctrl),
    pads:     pads.map(p => p.querySelector('textarea').value),
    labels:   pads.map(p => {
      const l = p.querySelector('.pad-label-text');
      return l ? l.textContent.trim() : '';
    }),
  };
}

function applyWorkspace(ws, { applyVisuals = true } = {}) {
  titleEl.textContent = ws.title || 'N-Pane Draft Workspace';

  const settings = { ...DEFAULTS, ...(ws.settings || {}) };
  for (const [k, v] of Object.entries(settings)) {
    if (ctrl[k]) ctrl[k].value = v;
  }

  applySetting('height', Number(ctrl.height.value));
  buildPads(Number(ctrl.pads.value), ws.pads || [], ws.labels || []);
  applySetting('columns', Number(ctrl.columns.value));

  if (applyVisuals) {
    applyAllSettings(settings);
  }

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
    const key    = chip.dataset.layout;
    const layout = LAYOUTS[key];
    if (!layout) return;
    chip.classList.toggle('active', layout.columns === cols && layout.pads === pads);
  });
}

function applyLayout(key) {
  const layout = LAYOUTS[key];
  if (!layout) return;

  const currentPads    = [...padGrid.children];
  const currentContent = currentPads.map(p => p.querySelector('textarea').value);

  ctrl.columns.value = layout.columns;
  ctrl.pads.value    = layout.pads;
  applySetting('columns', layout.columns);

  buildPads(layout.pads, currentContent, layout.labels);
  updateLayoutChips();
  scheduleSave();
}

layoutChips.forEach(chip => {
  chip.addEventListener('click', () => applyLayout(chip.dataset.layout));
});

// ── Visual preset apply ────────────────────────────

function applyVisualPreset(preset) {
  if (!preset?.settings) return;
  for (const [k, v] of Object.entries(preset.settings)) {
    if (ctrl[k]) ctrl[k].value = v;
  }
  applyAllSettings(preset.settings);
  scheduleSave();
}

// ── Presets list ───────────────────────────────────

function refreshPresetList() {
  const names = listLocalPresets();
  presetList.innerHTML = names.length
    ? names.map(n => `<option value="${n}">${n}</option>`).join('')
    : '<option value="" disabled>No presets saved</option>';
}

// ── Controls panel toggle ──────────────────────────

function setControlsVisible(visible) {
  controlsWrap.classList.toggle('collapsed', !visible);
  toggleBtn.setAttribute('aria-expanded', visible);
  toggleBtn.title = visible ? 'Hide settings' : 'Show settings';
  localStorage.setItem('npane-controls-hidden', visible ? '' : '1');
}

toggleBtn.addEventListener('click', () => {
  const isCollapsed = controlsWrap.classList.contains('collapsed');
  setControlsVisible(isCollapsed);
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
  if (focusPad) {
    focusPad.classList.remove('focus-active');
    focusPad = null;
  }
}

document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    if (focusMode) {
      exitFocusMode();
    } else {
      const active = document.activeElement;
      const pad    = active?.closest?.('.pad');
      if (pad) enterFocusMode(pad);
    }
  }
  if (e.key === 'Escape' && focusMode) {
    exitFocusMode();
  }
});

// ── Live control wiring ────────────────────────────

Object.entries(ctrl).forEach(([key, el]) => {
  if (!el) return;
  el.addEventListener('input', () => {
    applySetting(key, el.value);
    if (key === 'pads') {
      const ws = collectWorkspace();
      reconcilePads(Number(el.value), ws.pads, ws.labels);
    }
    if (key === 'columns') updateLayoutChips();
    scheduleSave();
  });
});

titleEl.addEventListener('blur', scheduleSave);

// ── Save / Load preset buttons ─────────────────────

btnSavePreset.addEventListener('click', async () => {
  const name = presetNameInput.value.trim();
  if (!name) { toast('Enter a preset name first', 'error'); return; }
  const data = { settings: collectVisualSettings(ctrl) };
  saveLocalPreset(name, data);

  const dirHandle = await getHandle('presetsFolder');
  if (dirHandle) {
    try { await savePresetToFolder(dirHandle, name, data); }
    catch (err) { toast('Saved locally (folder write failed)', 'error'); }
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
  if (dirHandle) {
    try { await deletePresetFromFolder(dirHandle, name); }
    catch { /* file may not exist */ }
  }
  refreshPresetList();
  toast(`Preset "${name}" deleted`);
});

// ── Export / Import workspace ──────────────────────

btnExportWS.addEventListener('click', () => {
  const data     = collectWorkspace();
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
  const data     = { settings: collectVisualSettings(ctrl) };
  const name     = presetNameInput.value.trim() || 'visual-preset';
  const dirHandle = await getHandle('presetsFolder');
  if (dirHandle) {
    try {
      await savePresetToFolder(dirHandle, name, data);
      await loadPresetsFromFolder(dirHandle);
      refreshPresetList();
      toast(`Visual preset "${name}" saved to folder`);
      return;
    } catch { /* fall through to download */ }
  }
  download(name + '.json', JSON.stringify(data, null, 2));
  toast('Visual preset downloaded');
});

btnImportVisual.addEventListener('click', () => fileImportVisual.click());
fileImportVisual.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  readJSON(file, data => {
    applyVisualPreset(data);
    toast('Visual preset applied');
  });
});

// ── Select folder ──────────────────────────────────

btnSelectFolder.addEventListener('click', async () => {
  if (!window.showDirectoryPicker) {
    toast('File System API not supported (use Chrome/Edge)', 'error');
    return;
  }
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
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (ctrl[k]) ctrl[k].value = v;
  }
  applyAllSettings(DEFAULTS);
  buildPads(DEFAULTS.pads, [], []);
  updateLayoutChips();
  doSave();
  toast('Reset to defaults');
});

// ── Utilities ──────────────────────────────────────

function download(filename, text) {
  const a   = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([text], { type: 'application/json' })),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function readJSON(file, cb) {
  const reader = new FileReader();
  reader.onload = ev => {
    try { cb(JSON.parse(ev.target.result)); }
    catch { toast('Invalid JSON file', 'error'); }
  };
  reader.readAsText(file);
}

// ── Boot ───────────────────────────────────────────

async function init() {
  // Restore controls visibility preference
  if (localStorage.getItem('npane-controls-hidden') === '1') {
    controlsWrap.classList.add('collapsed');
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  // Load workspace from localStorage
  const saved = loadWorkspaceLS();
  if (saved) {
    applyWorkspace(saved, { applyVisuals: true });
  } else {
    // First run — apply defaults and create a nice translation default
    applyAllSettings(DEFAULTS);
    ctrl.columns.value = 2;
    ctrl.pads.value    = 2;
    applySetting('columns', 2);
    buildPads(2, [], ['Translation', 'Original']);
    updateLayoutChips();
  }

  // Refresh preset list (localStorage)
  refreshPresetList();

  // Try to auto-load from persisted folder
  try {
    const dirHandle = await getHandle('presetsFolder');
    if (dirHandle) {
      await loadPresetsFromFolder(dirHandle);
      refreshPresetList();
    }
  } catch { /* silent — folder may have lost permission */ }
}

init();
