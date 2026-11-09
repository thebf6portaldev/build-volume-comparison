import { MAX_VOLUMES, PALETTE } from './data.js';
import { clearStorage, loadPrinters, loadView, nextColor, savePrinters, saveView } from './storage.js';
import { createScene } from './scene.js';

let printers = loadPrinters();
let view = loadView();
let editingId = null;

const scene3d = createScene(document.getElementById('scene'));

const el = {
  tbody: document.getElementById('tbody'),
  count: document.getElementById('count'),
  empty: document.getElementById('empty'),
  form: document.getElementById('printerForm'),
  formTitle: document.getElementById('formTitle'),
  formError: document.getElementById('formError'),
  submitBtn: document.getElementById('submitBtn'),
  cancelEdit: document.getElementById('cancelEdit'),
  labelsToggle: document.getElementById('labelsToggle'),
  gridToggle: document.getElementById('gridToggle'),
  overlayToggle: document.getElementById('overlayToggle'),
  anchorWrap: document.getElementById('anchorWrap'),
  anchorSelect: document.getElementById('anchorSelect'),
  resetView: document.getElementById('resetView'),
  showAll: document.getElementById('showAll'),
  hideAll: document.getElementById('hideAll'),
  resetDefaults: document.getElementById('resetDefaults'),
  clearAll: document.getElementById('clearAll'),
};

const fields = {
  name: document.getElementById('f-name'),
  brand: document.getElementById('f-brand'),
  tech: document.getElementById('f-tech'),
  x: document.getElementById('f-x'),
  y: document.getElementById('f-y'),
  z: document.getElementById('f-z'),
  resX: document.getElementById('f-resx'),
  resY: document.getElementById('f-resy'),
  resClass: document.getElementById('f-resclass'),
  pixelX: document.getElementById('f-px'),
  pixelY: document.getElementById('f-py'),
  layerMin: document.getElementById('f-lmin'),
  layerOpt: document.getElementById('f-lopt'),
  layerMax: document.getElementById('f-lmax'),
  color: document.getElementById('f-color'),
  note: document.getElementById('f-note'),
};

/* ---------- formatting ---------- */

const DASH = '—';

const num = (v) => (v === null || v === undefined ? null : Number(v));

function fmt(v, digits = 2) {
  const n = num(v);
  if (n === null) return null;
  return Number(n.toFixed(digits)).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function mm(v) {
  const s = fmt(v);
  return s === null ? DASH : `${s} mm`;
}

function um(v) {
  const s = fmt(v);
  return s === null ? DASH : `${s} µm`;
}

function volumeText(p) {
  const s = `${fmt(p.x)} × ${fmt(p.y)} × ${fmt(p.z)}`;
  return s.includes(null) ? DASH : `${s} mm`;
}

function litres(p) {
  const x = num(p.x); const y = num(p.y); const z = num(p.z);
  if (x === null || y === null || z === null) return DASH;
  return `${(x * y * z / 1e6).toFixed(2)} L`;
}

function resolutionText(p) {
  const rx = num(p.resX); const ry = num(p.resY);
  const px = rx !== null && ry !== null ? `${rx.toLocaleString()} × ${ry.toLocaleString()}` : null;
  const cls = p.resClass || null;
  if (!px && !cls) return DASH;
  if (px && cls) return `${px} (${cls})`;
  return px ?? cls;
}

// If the voxel size is not published, derive it from resolution and build width.
function effectiveVoxel(p) {
  const px = num(p.pixelX); const py = num(p.pixelY);
  if (px !== null) return { x: px, y: py ?? px, derived: false };
  const rx = num(p.resX); const ry = num(p.resY);
  const bx = num(p.x); const by = num(p.y);
  if (rx && ry && bx && by) return { x: (bx * 1000) / rx, y: (by * 1000) / ry, derived: true };
  return null;
}

function voxelText(p) {
  const v = effectiveVoxel(p);
  if (!v) return { text: DASH, title: 'No voxel size published and not enough data to derive one.' };
  const a = fmt(v.x, 2); const b = fmt(v.y, 2);
  const text = a === b ? `${a} µm` : `${a} × ${b} µm`;
  if (v.derived) {
    return {
      text: `${text} *`,
      title: `Derived: ${p.x} mm × 1000 ÷ ${p.resX} px = ${a} µm. Not stated by the manufacturer.`,
    };
  }
  return { text, title: 'Manufacturer-stated XY pixel (spot) size.' };
}

function resolutionCell(p) {
  const text = resolutionText(p);
  if (text !== DASH) return { text, title: '' };
  return { text: DASH, title: 'Screen resolution not published by the manufacturer.' };
}

function layerText(p, key) {
  return um(p[key]);
}

/* ---------- rendering ---------- */

function render() {
  renderTable();
  renderScene();
}

function renderTable() {
  el.tbody.innerHTML = '';

  for (const p of printers) {
    const tr = document.createElement('tr');
    if (!p.visible) tr.classList.add('off');

    // visibility
    const tdVis = document.createElement('td');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = p.visible;
    cb.title = p.visible ? 'Hide in 3D view' : 'Show in 3D view';
    cb.addEventListener('change', () => { p.visible = cb.checked; commit(); });
    tdVis.appendChild(cb);
    tr.appendChild(tdVis);

    // colour
    const tdColor = document.createElement('td');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = p.color;
    sw.title = p.color;
    tdColor.appendChild(sw);
    tr.appendChild(tdColor);

    // name
    const tdName = document.createElement('td');
    const nameWrap = document.createElement('div');
    nameWrap.className = 'name-cell';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name;
    nameWrap.appendChild(nameSpan);
    if (p.custom) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'custom';
      nameWrap.appendChild(badge);
    }
    tdName.appendChild(nameWrap);
    if (p.note) tdName.title = p.note;
    tr.appendChild(tdName);

    tr.appendChild(cell(p.brand || DASH, 'dim'));
    tr.appendChild(cell(volumeText(p), 'num'));
    tr.appendChild(cell(litres(p), 'num'));

    const res = resolutionCell(p);
    const resTd = cell(res.text, 'num');
    if (res.title) resTd.title = res.title;
    tr.appendChild(resTd);

    const vox = voxelText(p);
    const voxTd = cell(vox.text, 'num');
    voxTd.title = vox.title;
    tr.appendChild(voxTd);

    for (const key of ['layerMin', 'layerOpt', 'layerMax']) {
      const td = cell(layerText(p, key), 'num');
      if (p[key] === null || p[key] === undefined) {
        td.title = key === 'layerOpt'
          ? 'No manufacturer-recommended layer height published.'
          : 'Layer height range not published by the manufacturer.';
      }
      tr.appendChild(td);
    }

    // actions
    const tdAct = document.createElement('td');
    const editBtn = document.createElement('button');
    editBtn.className = 'link';
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => startEdit(p.id));
    const delBtn = document.createElement('button');
    delBtn.className = 'link danger';
    delBtn.type = 'button';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => removePrinter(p.id));
    tdAct.append(editBtn, delBtn);
    tr.appendChild(tdAct);

    // hover in the table highlights the matching box in the 3D view
    tr.addEventListener('mouseenter', () => scene3d.setFocus(p.id));
    tr.addEventListener('mouseleave', () => scene3d.setFocus(null));

    el.tbody.appendChild(tr);
  }

  const shown = printers.filter((p) => p.visible).length;
  el.count.textContent = `${printers.length} printer${printers.length === 1 ? '' : 's'} · ${shown} shown · max ${MAX_VOLUMES}`;
  el.empty.classList.toggle('hidden', shown > 0);
}

function cell(text, cls) {
  const td = document.createElement('td');
  td.textContent = text;
  if (cls) td.className = cls;
  return td;
}

function renderScene() {
  scene3d.layout(printers);
}

function commit() {
  savePrinters(printers);
  render();
}

/* ---------- form ---------- */

function readForm() {
  const val = (input) => input.value.trim();
  const nval = (input) => {
    const s = input.value.trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  };

  return {
    name: val(fields.name),
    brand: val(fields.brand),
    tech: val(fields.tech),
    x: nval(fields.x),
    y: nval(fields.y),
    z: nval(fields.z),
    resX: nval(fields.resX),
    resY: nval(fields.resY),
    resClass: val(fields.resClass),
    pixelX: nval(fields.pixelX),
    pixelY: nval(fields.pixelY),
    layerMin: nval(fields.layerMin),
    layerOpt: nval(fields.layerOpt),
    layerMax: nval(fields.layerMax),
    color: fields.color.value,
    note: val(fields.note),
  };
}

function validate(v) {
  if (!v.name) return 'Name is required.';
  for (const key of ['x', 'y', 'z']) {
    if (typeof v[key] !== 'number' || Number.isNaN(v[key])) return 'X, Y and Z build dimensions (mm) are required.';
    if (v[key] <= 0) return 'X, Y and Z must be greater than zero.';
  }
  for (const key of ['resX', 'resY', 'pixelX', 'pixelY', 'layerMin', 'layerOpt', 'layerMax']) {
    if (typeof v[key] === 'number' && Number.isNaN(v[key])) return 'Numeric fields must be valid numbers.';
    if (typeof v[key] === 'number' && v[key] < 0) return 'Numeric fields cannot be negative.';
  }
  return null;
}

function resetForm() {
  el.form.reset();
  editingId = null;
  el.formTitle.textContent = 'Add a printer';
  el.submitBtn.textContent = 'Add printer';
  el.cancelEdit.classList.add('hidden');
  el.formError.textContent = '';
  fields.color.value = nextColor(printers);
}

function startEdit(id) {
  const p = printers.find((x) => x.id === id);
  if (!p) return;
  editingId = id;
  fields.name.value = p.name;
  fields.brand.value = p.brand;
  fields.tech.value = p.tech;
  fields.x.value = p.x;
  fields.y.value = p.y;
  fields.z.value = p.z;
  fields.resX.value = p.resX ?? '';
  fields.resY.value = p.resY ?? '';
  fields.resClass.value = p.resClass;
  fields.pixelX.value = p.pixelX ?? '';
  fields.pixelY.value = p.pixelY ?? '';
  fields.layerMin.value = p.layerMin ?? '';
  fields.layerOpt.value = p.layerOpt ?? '';
  fields.layerMax.value = p.layerMax ?? '';
  fields.color.value = p.color;
  fields.note.value = p.note;

  el.formTitle.textContent = `Edit “${p.name}”`;
  el.submitBtn.textContent = 'Save changes';
  el.cancelEdit.classList.remove('hidden');
  el.formError.textContent = '';
  fields.name.focus();
  el.form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function removePrinter(id) {
  const p = printers.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`Delete “${p.name}”?`)) return;
  printers = printers.filter((x) => x.id !== id);
  if (editingId === id) resetForm();
  commit();
}

el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = readForm();
  const err = validate(v);
  if (err) {
    el.formError.textContent = err;
    return;
  }

  if (editingId) {
    const p = printers.find((x) => x.id === editingId);
    if (p) Object.assign(p, v);
  } else {
    if (printers.length >= MAX_VOLUMES) {
      el.formError.textContent = `Maximum of ${MAX_VOLUMES} build volumes reached. Delete one first.`;
      return;
    }
    printers.push({
      ...v,
      id: `custom-${Date.now().toString(36)}`,
      custom: true,
      visible: true,
    });
  }
  resetForm();
  commit();
});

el.cancelEdit.addEventListener('click', resetForm);

/* ---------- toolbar ---------- */

el.labelsToggle.addEventListener('change', () => {
  view.labels = el.labelsToggle.checked;
  scene3d.setLabels(view.labels);
  scene3d.frameAll();
  saveView(view);
});
el.gridToggle.addEventListener('change', () => {
  view.grid = el.gridToggle.checked;
  scene3d.setGrid(view.grid);
  saveView(view);
});
el.overlayToggle.addEventListener('change', () => {
  view.overlay = el.overlayToggle.checked;
  applyOverlayControl();
  scene3d.setOverlay(view.overlay);
  saveView(view);
});
el.anchorSelect.addEventListener('change', () => {
  view.anchor = el.anchorSelect.value;
  scene3d.setAnchor(view.anchor);
  saveView(view);
});

function applyOverlayControl() {
  el.anchorWrap.hidden = !view.overlay;
  el.anchorSelect.value = view.anchor;
}

el.resetView.addEventListener('click', () => scene3d.frameAll());
el.showAll.addEventListener('click', () => { printers.forEach((p) => { p.visible = true; }); commit(); });
el.hideAll.addEventListener('click', () => { printers.forEach((p) => { p.visible = false; }); commit(); });

el.resetDefaults.addEventListener('click', () => {
  if (!confirm('Replace the current list with the default printers?')) return;
  clearStorage();
  printers = loadPrinters();
  view = loadView();
  applyView();
  resetForm();
  render();
});

el.clearAll.addEventListener('click', () => {
  if (!confirm('Remove all printers?')) return;
  printers = [];
  commit();
});

/* ---------- boot ---------- */

function applyView() {
  el.labelsToggle.checked = view.labels;
  el.gridToggle.checked = view.grid;
  el.overlayToggle.checked = view.overlay;
  applyOverlayControl();
  scene3d.setLabels(view.labels);
  scene3d.setGrid(view.grid);
  scene3d.setOverlay(view.overlay);
  scene3d.setAnchor(view.anchor);
}

fields.color.value = nextColor(printers);
applyView();
render();

const wrap = document.querySelector('.canvas-wrap');
new ResizeObserver(() => { scene3d.resize(); }).observe(wrap);
window.addEventListener('resize', () => scene3d.resize());
scene3d.resize();

(function loop() {
  scene3d.render();
  requestAnimationFrame(loop);
})();
