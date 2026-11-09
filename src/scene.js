import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MM_PER_UNIT = 0.02; // 50mm of build volume = 1 world unit
const GAP_MM = 45;

// Which bottom corner of every box is pinned to the shared origin in overlay
// mode. The camera sits at (+x, +y, +z), so +z is the face nearest the viewer
// ("front"), -z is "back", -x is screen-left and +x is screen-right. The signs
// are the direction the box *extends* away from the pinned corner.
const ANCHOR_SIGNS = {
  'front-left':  { x: 1,  z: -1 },
  'front-right': { x: -1, z: -1 },
  'back-left':   { x: 1,  z: 1 },
  'back-right':  { x: -1, z: 1 },
};

function makeLabel(text, color) {
  const pad = 10;
  const fontSize = 34;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = fontSize + pad * 2;
  canvas.width = w;
  canvas.height = h;

  const c = canvas.getContext('2d');
  c.font = `600 ${fontSize}px system-ui, sans-serif`;
  c.fillStyle = 'rgba(8,10,14,0.72)';
  c.beginPath();
  c.roundRect(0, 0, w, h, 12);
  c.fill();
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.stroke();
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, w / 2, h / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }));
  const scale = 0.011;
  sprite.scale.set(w * scale, h * scale, 1);
  sprite.renderOrder = 10;
  return sprite;
}

class VolumeBox {
  constructor(printer, index) {
    this.printer = printer;
    this.index = index;

    const w = printer.x * MM_PER_UNIT;
    const d = printer.y * MM_PER_UNIT;
    const h = printer.z * MM_PER_UNIT;
    const geo = new THREE.BoxGeometry(w, h, d);

    const color = new THREE.Color(printer.color);

    // Translucent interior fill. depthWrite is off so the wireframe on the far
    // side stays visible through the box and the outline reads cleanly.
    this.fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
    }));

    // Additive inner glow, slightly inset, so the colour reads as coming from inside.
    this.glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    }));
    this.glow.scale.setScalar(0.985);

    const edges = new THREE.EdgesGeometry(geo);
    // Back edges first, dimmed, then full-strength front edges. Both are drawn
    // with depthTest off so the outline always shows through the fill.
    this.backEdges = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      depthTest: false,
      depthWrite: false,
    }));
    this.frontEdges = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      linewidth: 2,
      depthTest: false,
      depthWrite: false,
    }));

    this.fill.renderOrder = index * 10 + 1;
    this.glow.renderOrder = index * 10 + 2;
    this.backEdges.renderOrder = index * 10 + 3;
    this.frontEdges.renderOrder = index * 10 + 4;

    this.group = new THREE.Group();
    this.group.add(this.fill, this.glow, this.backEdges, this.frontEdges);

    // Box sits on the build plate plane (y = 0 in world space).
    for (const child of this.group.children) child.position.y = h / 2;

    this.label = makeLabel(printer.name, printer.color);
    this.label.position.y = h + 0.42;
    this.label.renderOrder = index * 10 + 5;
    this.group.add(this.label);

    this.dimensions = { w, d, h };
    this.targetPos = new THREE.Vector3();
    // Base fill opacity, lowered in overlay mode so stacked volumes don't go muddy.
    this.baseFill = 0.13;
    this._focused = null;
  }

  setFillScale(opacity) {
    this.baseFill = opacity;
    this.setFocus(this._focused);
  }

  setVisible(v) {
    this.group.visible = v;
  }

  setFocus(focused) {
    this._focused = focused;
    const fillOpacity = focused === null ? this.baseFill : (focused ? this.baseFill * 2 : this.baseFill * 0.25);
    const glowOpacity = focused === null ? 0.1 : (focused ? 0.18 : 0.02);
    const edgeOpacity = focused === null ? 1 : (focused ? 1 : 0.18);
    const backOpacity = focused === null ? 0.4 : (focused ? 0.55 : 0.08);

    this.fill.material.opacity = fillOpacity;
    this.glow.material.opacity = glowOpacity;
    this.frontEdges.material.opacity = edgeOpacity;
    this.backEdges.material.opacity = backOpacity;
    this.label.material.opacity = focused === null ? 1 : (focused ? 1 : 0.25);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
}

function makeGrid(size) {
  const g = new THREE.GridHelper(size, size, 0x3a4552, 0x1e252e);
  g.material.transparent = true;
  g.material.opacity = 0.5;
  g.userData.size = size;
  return g;
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1;
  controls.maxDistance = 200;
  controls.maxPolarAngle = Math.PI * 0.52;

  let grid = makeGrid(120);
  let gridVisible = true;
  scene.add(grid);

  const boxes = new Map();
  let focusedId = null;
  let labelsVisible = true;
  let overlay = false;
  let anchor = 'front-left';
  let currentPrinters = [];

  // Structural fingerprint: rebuilding is only needed when a box's shape,
  // label or colour changes — never for plain visibility flips.
  function fingerprint(list) {
    return list.map((p) => [p.id, p.name, p.x, p.y, p.z, p.color].join('|')).join(';');
  }
  let lastFingerprint = '';

  function rebuild(printers) {
    lastFingerprint = fingerprint(printers);

    for (const box of boxes.values()) {
      scene.remove(box.group);
      box.dispose();
    }
    boxes.clear();

    printers.forEach((p, i) => {
      const box = new VolumeBox(p, i);
      box.targetPos.set(0, 0, 0);
      boxes.set(p.id, box);
      scene.add(box.group);
    });
  }

  // Assign target positions. Runs on every layout, so hiding a printer closes
  // the gap and the remaining boxes slide together.
  function assignPositions(printers) {
    const visible = printers
      .filter((p) => p.visible && boxes.has(p.id))
      .map((p) => boxes.get(p.id));

    if (overlay) {
      const a = ANCHOR_SIGNS[anchor] ?? ANCHOR_SIGNS['front-left'];
      const maxH = Math.max(0, ...visible.map((b) => b.dimensions.h));

      visible.forEach((box, i) => {
        box.targetPos.set(
          a.x * box.dimensions.w / 2,
          0,
          a.z * box.dimensions.d / 2,
        );
        // Labels are children of the group, so offset them back to the shared
        // corner and stack them above the tallest box to keep them legible.
        box.label.position.set(
          -a.x * box.dimensions.w / 2,
          maxH + 0.8 + i * 0.78,
          -a.z * box.dimensions.d / 2,
        );
        box.setFillScale(0.07);
      });

      const widest = Math.max(0, ...visible.map((b) => Math.max(b.dimensions.w, b.dimensions.d)));
      resizeGrid(widest * 2.6);
      return visible;
    }

    // Side-by-side: a roughly 3:2 grid of uniform cells, packed in list order.
    const n = visible.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.5)));
    const rows = Math.ceil(n / cols);
    const cellW = Math.max(0, ...visible.map((b) => b.dimensions.w)) + GAP_MM * MM_PER_UNIT;
    const cellD = Math.max(0, ...visible.map((b) => b.dimensions.d)) + GAP_MM * MM_PER_UNIT;

    visible.forEach((box, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      box.targetPos.set(
        (col - (cols - 1) / 2) * cellW,
        0,
        (row - (rows - 1) / 2) * cellD,
      );
      box.label.position.set(0, box.dimensions.h + 0.42, 0);
      box.setFillScale(0.13);
    });

    resizeGrid(Math.max(cols * cellW, rows * cellD) * 1.35);
    return visible;
  }

  function resizeGrid(extent) {
    const size = Math.max(20, Math.ceil(extent));
    if (size === grid.userData.size) return;
    scene.remove(grid);
    grid.geometry.dispose();
    grid.material.dispose();
    grid = makeGrid(size);
    grid.userData.size = size;
    grid.visible = gridVisible;
    scene.add(grid);
  }

  function layout(printers) {
    currentPrinters = printers;
    if (fingerprint(printers) !== lastFingerprint) rebuild(printers);

    const visible = assignPositions(printers);

    for (const [id, box] of boxes) {
      const p = printers.find((x) => x.id === id);
      box.setVisible(Boolean(p && p.visible));
    }
    for (const box of boxes.values()) box.label.visible = labelsVisible;
    if (focusedId) {
      for (const [id, box] of boxes) box.setFocus(id === focusedId);
    }

    frameAll(visible);
  }

  function frameAll(visible) {
    const list = visible ?? [...boxes.values()].filter((b) => b.group.visible);
    if (!list.length) return;

    const bbox = new THREE.Box3();
    for (const b of list) {
      // Fit against where the box is *heading*, not where it currently sits, so
      // the camera frames the final arrangement rather than the mid-animation one.
      const { w, d, h } = b.dimensions;
      const p = b.targetPos;
      bbox.expandByPoint(new THREE.Vector3(p.x - w / 2, 0, p.z - d / 2));
      bbox.expandByPoint(new THREE.Vector3(p.x + w / 2, h, p.z + d / 2));
    }
    // Sprites always face the camera and their geometry isn't reflected in the
    // box, so reserve headroom for the label height manually.
    if (labelsVisible) {
      for (const b of list) {
        const p = b.targetPos;
        bbox.expandByPoint(new THREE.Vector3(p.x, b.label.position.y, p.z));
      }
    }

    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;

    const dir = new THREE.Vector3(0.7, 0.42, 1).normalize();
    controls.target.copy(center);

    // Seed a distance, measure how much of the frustum the bounding box actually
    // fills, then scale the distance linearly. Perspective extent is inversely
    // proportional to distance, so one correction pass lands it accurately.
    let dist = radius * 3;
    for (let i = 0; i < 3; i++) {
      camera.position.copy(center).addScaledVector(dir, dist);
      camera.near = Math.max(0.02, dist / 800);
      camera.far = dist * 100;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);

      const ndc = cornerExtents(bbox, camera);
      const fill = Math.max(ndc.x, ndc.y);
      if (fill <= 0) break;
      dist = dist * fill / 0.86; // leave ~14% margin
    }

    camera.position.copy(center).addScaledVector(dir, dist);
    camera.near = Math.max(0.02, dist / 800);
    camera.far = dist * 100;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    controls.minDistance = radius * 0.3;
    controls.maxDistance = dist * 6;
    controls.update();
  }

  // Largest half-extent of the box's corners in NDC space (-1..1) on each axis.
  function cornerExtents(bbox, cam) {
    const pts = [
      new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.min.z),
      new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.max.z),
      new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.min.z),
      new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.max.z),
      new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.min.z),
      new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.max.z),
      new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.min.z),
      new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.max.z),
    ];
    let x = 0; let y = 0;
    for (const p of pts) {
      p.project(cam);
      x = Math.max(x, Math.abs(p.x));
      y = Math.max(y, Math.abs(p.y));
    }
    return { x, y };
  }

  function setFocus(id) {
    focusedId = id;
    if (!boxes.size) return;
    for (const [pid, box] of boxes) box.setFocus(id === null ? null : pid === id);
  }

  function setLabels(show) {
    for (const box of boxes.values()) box.label.visible = show;
  }

  function setGrid(show) {
    gridVisible = show;
    grid.visible = show;
  }

  function setOverlay(v) {
    overlay = v;
    if (currentPrinters.length) layout(currentPrinters);
  }

  function setAnchor(value) {
    anchor = ANCHOR_SIGNS[value] ? value : 'front-left';
    if (overlay && currentPrinters.length) layout(currentPrinters);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function render() {
    // Slide boxes toward their target positions so deselecting one closes the
    // gap smoothly instead of the rest snapping across.
    for (const box of boxes.values()) {
      const g = box.group;
      if (g.position.distanceToSquared(box.targetPos) > 1e-6) {
        g.position.lerp(box.targetPos, 0.16);
        if (g.position.distanceToSquared(box.targetPos) < 1e-6) g.position.copy(box.targetPos);
      }
    }
    controls.update();
    renderer.render(scene, camera);
  }

  return {
    renderer, scene, camera, controls,
    layout, frameAll, setFocus, setLabels, setGrid, setOverlay, setAnchor, resize, render,
    boxes, MM_PER_UNIT,
  };
}
