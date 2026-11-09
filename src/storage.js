import { DEFAULT_PRINTERS, MAX_VOLUMES, PALETTE } from './data.js';

const KEY = 'build-volume-comparison:v1';
const VIEW_KEY = 'build-volume-comparison:view:v1';

export const VIEW_DEFAULTS = { overlay: false, anchor: 'front-left', labels: true, grid: true };

function isValid(p) {
  return p && typeof p === 'object'
    && typeof p.name === 'string' && p.name.trim() !== ''
    && [p.x, p.y, p.z].every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
}

function normalize(p, i) {
  const color = typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color)
    ? p.color.toLowerCase()
    : PALETTE[i % PALETTE.length].hex;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    id: typeof p.id === 'string' && p.id ? p.id : `custom-${i}-${Math.random().toString(36).slice(2, 8)}`,
    name: p.name.trim(),
    brand: typeof p.brand === 'string' ? p.brand.trim() : '',
    tech: typeof p.tech === 'string' ? p.tech.trim() : '',
    x: p.x, y: p.y, z: p.z,
    resX: num(p.resX), resY: num(p.resY),
    resClass: typeof p.resClass === 'string' ? p.resClass.trim() : '',
    pixelX: num(p.pixelX), pixelY: num(p.pixelY),
    layerMin: num(p.layerMin), layerOpt: num(p.layerOpt), layerMax: num(p.layerMax),
    color,
    custom: Boolean(p.custom),
    visible: p.visible !== false,
    note: typeof p.note === 'string' ? p.note : '',
  };
}

export function loadPrinters() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // localStorage unavailable (private mode, file:// restrictions) — fall back to defaults.
  }
  if (!raw) return DEFAULT_PRINTERS.map((p, i) => normalize(p, i));

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const clean = parsed.filter(isValid).slice(0, MAX_VOLUMES).map((p, i) => normalize(p, i));
      if (clean.length) return clean;
    }
  } catch {
    // Corrupt payload — reset to defaults below.
  }
  return DEFAULT_PRINTERS.map((p, i) => normalize(p, i));
}

export function savePrinters(printers) {
  try {
    localStorage.setItem(KEY, JSON.stringify(printers.slice(0, MAX_VOLUMES)));
    return true;
  } catch {
    return false;
  }
}

export function clearStorage() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(VIEW_KEY);
  } catch {
    /* ignore */
  }
}

const ANCHORS = ['front-left', 'front-right', 'back-left', 'back-right'];

export function loadView() {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return { ...VIEW_DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      overlay: Boolean(parsed.overlay),
      anchor: ANCHORS.includes(parsed.anchor) ? parsed.anchor : VIEW_DEFAULTS.anchor,
      labels: parsed.labels !== false,
      grid: parsed.grid !== false,
    };
  } catch {
    return { ...VIEW_DEFAULTS };
  }
}

export function saveView(view) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    /* ignore */
  }
}

export function nextColor(printers) {
  const used = new Set(printers.map((p) => p.color.toLowerCase()));
  const free = PALETTE.find((c) => !used.has(c.hex));
  return (free ?? PALETTE[printers.length % PALETTE.length]).hex;
}
