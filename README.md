# cytoscape-polygon-reshape

A [Cytoscape.js](https://js.cytoscape.org) plugin for interactive node resizing and polygon vertex editing.

- **8-directional resize handles** for single & multi-selected nodes
- **Directional resize** — dragged edge moves, opposite edge stays fixed
- **Shift + drag** to constrain aspect ratio during resize
- **Polygon vertex editing** with real-time SVG overlay during drag
- **Zero dependencies** — only requires Cytoscape.js as a peer dependency
- Highly configurable: handle appearance, outline style, size constraints, snap grid, callbacks, and more

## Installation

```bash
npm install cytoscape-polygon-reshape
```

## Usage

```js
import cytoscape from 'cytoscape';
import nodeReshape from 'cytoscape-polygon-reshape';

cytoscape.use(nodeReshape);

const cy = cytoscape({ /* ... */ });

const api = cy.nodeReshape({
  handleSize: 6,
  handleColor: '#4a90e2',
  // ... see options below
});

// Hide handles (e.g. when entering pan mode)
api.setInteractive(false);
```

### Manual vertex editing (via API)

By default, selecting a single polygon node automatically enters vertex editing mode. To disable this and control it manually:

```js
const api = cy.nodeReshape({
  polygonVertexEditOnSelect: false, // polygon nodes show rectangle handles by default
});

// Enter vertex editing mode programmatically
api.editVertices(polygonNode);

// Exit vertex editing mode
api.exitVertexEdit();
```

When `polygonVertexEditOnSelect` is `false`:
- Polygon nodes display rectangle resize handles like normal nodes
- Use `api.editVertices(node)` to switch to vertex editing mode
- Deselecting the node automatically exits vertex editing mode

## Options

### Handle Appearance

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `handleSize` | `number` | `6` | Base handle size in px |
| `handleColor` | `string` | `'#4a90e2'` | Handle background color |
| `handleBorder` | `string` | `'none'` | CSS border shorthand |
| `handleBorderRadius` | `string` | `'0'` | CSS border-radius |
| `handleOpacity` | `number` | `1` | Handle opacity (0–1) |
| `handleHoverColor` | `string\|null` | `null` | Color on mouse hover (`null` to disable) |

### Handle Scaling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoScaleHandles` | `boolean` | `true` | Scale handles with zoom level and node size |
| `handleSizeMin` | `number` | `4` | Minimum handle size when auto-scaling |
| `handleSizeMax` | `number` | `Infinity` | Maximum handle size when auto-scaling |

### Outline

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outlineColor` | `string` | `'#4a90e2'` | Bounding outline stroke color |
| `outlineWidth` | `number` | `1` | Stroke width |
| `outlineDash` | `number[]` | `[4, 4]` | Stroke dash pattern |
| `outlineOpacity` | `number` | `1` | Stroke opacity (0–1) |
| `outlineFill` | `string` | `'none'` | Fill color inside outline |
| `outlineFillOpacity` | `number` | `0` | Fill opacity |
| `outlineLineCap` | `string\|null` | `null` | `'butt'`, `'round'`, or `'square'` |
| `padding` | `number` | `5` | Gap between node edge and outline (px) |

### Resize Constraints

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `minWidth` | `number` | `5` | Minimum node width |
| `minHeight` | `number` | `5` | Minimum node height |
| `maxWidth` | `number` | `Infinity` | Maximum node width |
| `maxHeight` | `number` | `Infinity` | Maximum node height |
| `aspectRatioLocked` | `boolean` | `false` | Always lock aspect ratio during resize (same as holding Shift) |
| `snapGrid` | `number` | `0` | Snap to grid interval (`0` to disable) |

### Shift Key Constraint

Hold **Shift** while dragging a resize handle to temporarily lock the aspect ratio. This works with all handle directions:

- **Corner handles** (nw, ne, se, sw) — the larger axis drives, the other follows proportionally
- **Edge handles** (n, s, e, w) — the dragged axis drives, the perpendicular axis follows proportionally

To always lock the ratio without requiring Shift, set `aspectRatioLocked: true`.

### Directions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `directions` | `string[]\|null` | `null` | Subset of `['nw','n','ne','e','se','s','sw','w']`. `null` = all 8 directions |

### Polygon Behavior

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `polygonVertexEditOnSelect` | `boolean` | `true` | `true` = auto vertex editing on single polygon select. `false` = polygon shows rectangle handles, use `api.editVertices()` manually |

### Polygon Vertex Overlay

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `vertexHandleCursor` | `string` | `'move'` | CSS cursor for vertex drag handles |
| `overlayFill` | `string\|null` | `null` | SVG overlay fill color (`null` = use node's own style) |
| `overlayFillOpacity` | `number` | `0.5` | Overlay fill opacity |
| `overlayStroke` | `string\|null` | `null` | Overlay stroke color (`null` = use outlineColor) |
| `overlayStrokeWidth` | `number` | `1` | Overlay stroke width (before zoom scaling) |

### Filtering & Layout

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `nodeFilter` | `(node) => boolean \| null` | `null` | Return `false` to skip adding handles for a node |
| `containerZIndex` | `number` | `1000` | z-index of the handle overlay container |

### Callbacks

| Option | Type | Description |
|--------|------|-------------|
| `onResizeStart` | `(node, dirName) => void` | Fired when a resize drag begins |
| `onResize` | `(node, w, h) => void` | Fired on each resize frame |
| `onResizeEnd` | `(node) => void` | Fired when a resize drag ends |
| `onVertexDragStart` | `(node, vertexIndex) => void` | Fired when a polygon vertex drag begins |
| `onVertexDrag` | `(node, vertexIndex, {x, y}) => void` | Fired on each vertex drag frame |
| `onVertexDragEnd` | `(node, vertexIndex) => void` | Fired when a polygon vertex drag ends |

## API

`cy.nodeReshape(options)` returns an API object:

```js
const api = cy.nodeReshape({ /* options */ });
```

| Method | Description |
|--------|-------------|
| `api.setInteractive(enabled)` | Show/hide all handles and polygon vertex editors |
| `api.refresh()` | Force redraw of all handle positions |
| `api.editVertices(node)` | Enter polygon vertex editing mode for a node |
| `api.exitVertexEdit()` | Exit polygon vertex editing mode and restore resize handles |
| `api.clearAll()` | Remove all handles from the canvas |
| `api.setOptions(patch)` | Merge partial options at runtime |

The API is also accessible via `cy.scratch('nodeReshape')`.

## Events

All events are namespaced under `nodereshape.`:

| Event | Extra args | Description |
|-------|-----------|-------------|
| `nodereshape.resizestart` | `[node, dirName]` or `['polygon-vertex', node]` | Resize/vertex drag started |
| `nodereshape.resizeend` | `[node]` or `['polygon-vertex', node]` | Resize/vertex drag ended |
| `nodereshape.drag` | `['polygon-vertex', node]` | Polygon vertex being dragged |

```js
cy.on('nodereshape.resizeend', (evt, node) => {
  console.log('Resized:', node.id(), node.width(), node.height());
});
```

## Polygon Nodes

Polygon nodes require:
- CSS class `polygon-node`
- Data field `polygonPoints`: flat array `[x0, y0, x1, y1, ...]` in **[0, 1] top-left origin** coordinates

The plugin converts to Cytoscape's `[-1, 1]` center-origin format internally via `v * 2 - 1`.

### `forcePolygonPoints(cy, node, points)`

Utility export to programmatically set polygon points (useful for undo/redo):

```js
import { forcePolygonPoints } from 'cytoscape-polygon-reshape';

forcePolygonPoints(cy, node, [0, 0, 1, 0, 1, 1, 0, 1]);
```

## License

MIT
