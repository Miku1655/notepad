/**
 * settings.js — Schema, defaults, and CSS variable applier
 */

export const DEFAULTS = {
  font:        'lora',
  fontSize:    15,
  textColor:   '#2a2520',
  bgColor:     '#f0ede8',
  paperColor:  '#faf9f7',
  borderColor: '#ddd9d2',
  borderWidth: 1,
  radius:      10,
  padding:     18,
  height:      280,
  columns:     2,
  pads:        4,
};

// kind: 'visual' = exported in visual presets; 'structural' = layout only
export const SCHEMA = {
  font:        { css: '--pad-font',          unit: '',   kind: 'visual',     map: fontMap },
  fontSize:    { css: '--pad-font-size',     unit: 'px', kind: 'visual' },
  textColor:   { css: '--pad-text',          unit: '',   kind: 'visual' },
  bgColor:     { css: '--page-bg',           unit: '',   kind: 'visual' },
  paperColor:  { css: '--pad-bg',            unit: '',   kind: 'visual' },
  borderColor: { css: '--pad-border',        unit: '',   kind: 'visual' },
  borderWidth: { css: '--pad-border-width',  unit: 'px', kind: 'visual' },
  radius:      { css: '--pad-radius',        unit: 'px', kind: 'visual' },
  padding:     { css: '--pad-padding',       unit: 'px', kind: 'visual' },
  height:      { css: '--pad-height',        unit: 'px', kind: 'structural' },
  columns:     { kind: 'structural' },
  pads:        { kind: 'structural' },
};

export const FONT_OPTIONS = [
  { value: 'lora',       label: 'Lora (serif)',    css: "'Lora', Georgia, serif" },
  { value: 'dm-sans',    label: 'DM Sans',         css: "'DM Sans', sans-serif" },
  { value: 'jetbrains',  label: 'Mono',            css: "'JetBrains Mono', monospace" },
  { value: 'georgia',    label: 'Georgia',         css: 'Georgia, serif' },
  { value: 'times',      label: 'Times',           css: "'Times New Roman', serif" },
  { value: 'system',     label: 'System',          css: 'system-ui, sans-serif' },
];

function fontMap(value) {
  return FONT_OPTIONS.find(f => f.value === value)?.css ?? value;
}

// Note: SCHEMA is defined after FONT_OPTIONS / fontMap so the reference is valid.

const root = document.documentElement;

export function applySetting(key, rawValue) {
  const def = SCHEMA[key];
  if (!def) return;

  const value = def.map ? def.map(rawValue) : rawValue;

  if (def.css) {
    root.style.setProperty(def.css, value + (def.unit || ''));
  }

  if (key === 'columns') {
    root.style.setProperty('--grid-cols', Math.max(1, Number(rawValue)));
  }
}

export function applyAllSettings(settings) {
  for (const [k, v] of Object.entries(settings)) {
    applySetting(k, v);
  }
}

export function collectVisualSettings(controls) {
  return Object.fromEntries(
    Object.entries(SCHEMA)
      .filter(([, def]) => def.kind === 'visual')
      .map(([k]) => [k, controls[k]?.value ?? DEFAULTS[k]])
  );
}

export function collectAllSettings(controls) {
  return Object.fromEntries(
    Object.keys(SCHEMA).map(k => [k, controls[k]?.value ?? DEFAULTS[k]])
  );
}
