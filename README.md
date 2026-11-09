# Build Volume Comparison

A static Three.js site that renders resin 3D printer build volumes to real scale, side by side,
each in its own colour, with a comparison table underneath.

## Run it

The page uses ES modules and an import map, so it must be served over HTTP (not opened as `file://`).

```powershell
python -m http.server 5178
# then open http://127.0.0.1:5178/index.html
```

Any static server works (`npx serve`, VS Code Live Server, etc.).

## What it does

- Renders up to **10** build volumes at once, each in a distinct colour. Boxes are drawn as a
  translucent tinted interior plus a full-strength wireframe outline. The outline is rendered with
  depth testing disabled and the fill with depth-writing disabled, so the outline always shows
  through — including the edges on the far side of each box.
- Boxes sit on the grid plane (the build plate) and are laid out in a roughly 3:2 grid. The camera
  auto-fits the visible set.
- **Overlay** checkbox stacks every visible volume on top of the others, aligned at a shared bottom
  corner. The **Anchor** dropdown picks which corner that is (front/back × left/right, relative to the
  default camera). Labels lift above the tallest box and stack vertically so they stay readable, and
  the interior fill is dimmed so the stack doesn't go muddy.
- **Packing:** positions are recomputed on every selection change, so hiding a printer closes the gap
  and the remaining boxes slide together rather than leaving a hole. Boxes ease toward their target
  position each frame.
- Per-printer visibility checkboxes, label/grid toggles, and hover-to-highlight between the table
  and the 3D view.
- The printer list persists to `localStorage` under the key `build-volume-comparison:v1`. Add, edit
  and delete custom entries from the form; the list is capped at 10 volumes. The view settings
  (overlay, anchor, labels, grid) persist separately under `build-volume-comparison:view:v1`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell and the Three.js import map |
| `src/data.js` | Default printer dataset and the 10-colour palette |
| `src/storage.js` | `localStorage` load/save, validation, colour assignment |
| `src/scene.js` | Three.js scene, volume boxes, camera fitting |
| `src/main.js` | Table rendering, form handling, UI wiring |
| `vendor/three/` | Three.js r180 vendored locally so the site works offline |

## Notes on the data

`src/data.js` holds the default printers. Fields are build volume in millimetres
(`x` = width, `y` = depth, `z` = height), screen resolution in pixels, XY pixel size in micrometres,
and layer heights in micrometres. Use `null` for anything the manufacturer does not publish — the
table renders those as an em dash with an explanatory tooltip.

"Voxel size" is the XY pixel (spot) footprint. If a printer has a resolution but no published pixel
size, the site derives it as `build width (mm) × 1000 ÷ horizontal pixels` and marks the result with
an asterisk.

No manufacturer publishes an official "optimal" layer height, so `layerOpt` is only populated where a
vendor uses a reference layer height in its own exposure specs (UniFormation and Elegoo both use 50 µm).
