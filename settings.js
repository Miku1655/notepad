/**
 * settings.js — Schema, defaults, and CSS variable applier.
 *
 * Key design: user color picks (bgColor, paperColor, textColor, borderColor)
 * update BOTH the pad-specific vars AND the UI chrome vars so the whole
 * interface (controls panel, sidebar, status bar, title) always matches.
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

export const FONT_OPTIONS = [
  { value: 'lora',      label: 'Lora (serif)',  css: "'Lora', Georgia, serif" },
  { value: 'dm-sans',   label: 'DM Sans',       css: "'DM Sans', sans-serif" },
  { value: 'jetbrains', label: 'Mono',          css: "'JetBrains Mono', monospace" },
  { value: 'georgia',   label: 'Georgia',       css: 'Georgia, serif' },
  { value: 'times',     label: 'Times',         css: "'Times New Roman', serif" },
  { value: 'system',    label: 'System',        css: 'system-ui, sans-serif' },
];

function fontMap(value) {
  return FONT_OPTIONS.find(f => f.value === value)?.css ?? value;
}

// kind: 'visual' = included in visual preset export; 'structural' = layout only
export const SCHEMA = {
  font:        { css: '--pad-font',         unit: '',   kind: 'visual', map: fontMap },
  fontSize:    { css: '--pad-font-size',    unit: 'px', kind: 'visual' },
  textColor:   { css: '--pad-text',         unit: '',   kind: 'visual' },
  bgColor:     { css: '--page-bg',          unit: '',   kind: 'visual' },
  paperColor:  { css: '--pad-bg',           unit: '',   kind: 'visual' },
  borderColor: { css: '--pad-border',       unit: '',   kind: 'visual' },
  borderWidth: { css: '--pad-border-width', unit: 'px', kind: 'visual' },
  radius:      { css: '--pad-radius',       unit: 'px', kind: 'visual' },
  padding:     { css: '--pad-padding',      unit: 'px', kind: 'visual' },
  height:      { css: '--pad-height',       unit: 'px', kind: 'structural' },
  columns:     {                                        kind: 'structural' },
  pads:        {                                        kind: 'structural' },
};

const root = document.documentElement;

/**
 * Given a hex color, return a version with adjusted lightness.
 * factor > 1 = lighter, factor < 1 = darker.
 * Works in oklch-ish approximation via simple blend.
 */
function blend(hex, targetHex, t) {
  const [r1,g1,b1] = hexToRgb(hex);
  const [r2,g2,b2] = hexToRgb(targetHex);
  return rgbToHex(
    Math.round(r1 + (r2 - r1) * t),
    Math.round(g1 + (g2 - g1) * t),
    Math.round(b1 + (b2 - b1) * t),
  );
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#',''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r,g,b) {
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function luminance(hex) {
  const [r,g,b] = hexToRgb(hex).map(v => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Derive the full UI palette from the four user-chosen colors.
 * This makes controls, sidebar, status bar, title all match the chosen theme.
 */
function deriveUIPalette(bgColor, paperColor, textColor, borderColor) {
  const white = '#ffffff';
  const black = '#000000';
  const isDark = luminance(bgColor) < 0.3;

  // Surface = slightly lighter/darker than bg
  const surface      = isDark ? blend(bgColor, white, 0.08) : blend(bgColor, white, 0.5);
  const surfaceHover = isDark ? blend(bgColor, white, 0.13) : blend(bgColor, white, 0.35);
  const borderFocus  = isDark ? blend(borderColor, white, 0.3) : blend(borderColor, black, 0.2);
  const textMuted    = isDark ? blend(textColor, black, 0.35)  : blend(textColor, white, 0.45);
  const textLabel    = isDark ? blend(textColor, black, 0.5)   : blend(textColor, white, 0.6);
  const accent       = isDark ? blend(textColor, white, 0.2)   : blend(textColor, white, 0.1);
  const accentLight  = isDark ? blend(bgColor, white, 0.15)    : blend(borderColor, white, 0.4);
  const sidebar      = isDark ? blend(bgColor, black, 0.15)    : blend(bgColor, black, 0.04);

  return { surface, surfaceHover, borderFocus, textMuted, textLabel, accent, accentLight, sidebar, isDark };
}

export function applySetting(key, rawValue) {
  const def = SCHEMA[key];
  if (!def) return;

  const value = def.map ? def.map(rawValue) : rawValue;
  if (def.css) root.style.setProperty(def.css, value + (def.unit || ''));

  if (key === 'columns') root.style.setProperty('--grid-cols', Math.max(1, Number(rawValue)));
}

/**
 * Apply all settings AND rederive the full UI palette.
 * Call this whenever any color setting changes.
 */
export function applyAllSettings(settings) {
  const s = { ...DEFAULTS, ...settings };

  for (const [k, v] of Object.entries(s)) {
    applySetting(k, v);
  }

  // Rederive UI palette from the four color settings
  refreshUIPalette(s.bgColor, s.paperColor, s.textColor, s.borderColor);
}

export function refreshUIPalette(bgColor, paperColor, textColor, borderColor) {
  const pal = deriveUIPalette(bgColor, paperColor, textColor, borderColor);
  root.style.setProperty('--bg',           bgColor);
  root.style.setProperty('--surface',      pal.surface);
  root.style.setProperty('--surface-hover',pal.surfaceHover);
  root.style.setProperty('--border',       borderColor);
  root.style.setProperty('--border-focus', pal.borderFocus);
  root.style.setProperty('--text',         textColor);
  root.style.setProperty('--text-muted',   pal.textMuted);
  root.style.setProperty('--text-label',   pal.textLabel);
  root.style.setProperty('--accent',       pal.accent);
  root.style.setProperty('--accent-light', pal.accentLight);
  root.style.setProperty('--sidebar-bg',   pal.sidebar);
  root.style.setProperty('--page-bg',      bgColor);

  // Danger stays fixed regardless of theme
  root.style.setProperty('--danger', '#c0675a');
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
