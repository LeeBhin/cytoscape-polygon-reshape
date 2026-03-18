/**
 * cytoscape-node-reshape
 *
 * Cytoscape.js plugin — node resize (single / multi) + polygon vertex editing
 * Zero dependencies.
 *
 * Usage:
 *   import cytoscape from 'cytoscape';
 *   import nodeReshape from 'cytoscape-node-reshape';
 *   cytoscape.use(nodeReshape);
 *
 *   const api = cy.nodeReshape({ handleSize: 8, handleColor: '#f00', … });
 *   api.setInteractive(false);
 */

import ResizeHandles from './ResizeHandles.js';
import PolygonVertexEditor from './PolygonVertexEditor.js';
import { isPolygonNode } from './utils.js';

export { forcePolygonPoints } from './utils.js';

const DEFAULTS = {
  // handle appearance
  handleSize:          6,
  handleColor:         '#4a90e2',
  handleBorder:        'none',
  handleBorderRadius:  '0',
  handleOpacity:       1,
  handleHoverColor:    null,

  // handle scaling
  autoScaleHandles:    true,
  handleSizeMin:       4,
  handleSizeMax:       Infinity,

  // outline
  outlineColor:        '#4a90e2',
  outlineWidth:        1,
  outlineDash:         [4, 4],
  outlineOpacity:      1,
  outlineFill:         'none',
  outlineFillOpacity:  0,
  outlineLineCap:      null,
  padding:             5,

  // resize constraints
  minWidth:            5,
  minHeight:           5,
  maxWidth:            Infinity,
  maxHeight:           Infinity,
  aspectRatioLocked:   false,
  snapGrid:            0,

  // directions
  directions:          null,

  // polygon behavior
  polygonVertexEditOnSelect: true,   // false → polygon도 사각형 핸들, API로만 vertex 편집

  // polygon overlay
  vertexHandleCursor:  'move',
  overlayFill:         null,
  overlayFillOpacity:  0.5,
  overlayStroke:       null,
  overlayStrokeWidth:  1,

  // filtering
  nodeFilter:          null,

  // layout
  containerZIndex:     1000,

  // callbacks
  onResizeStart:       null,
  onResize:            null,
  onResizeEnd:         null,
  onVertexDragStart:   null,
  onVertexDrag:        null,
  onVertexDragEnd:     null,
};

function register(cytoscape) {
  if (!cytoscape) return;

  cytoscape('core', 'nodeReshape', function (userOpts) {
    const cy = this;
    const opts = { ...DEFAULTS, ...userOpts };

    const emit = (name, extra) => cy.trigger(`nodereshape.${name}`, extra);

    cy.on('nodereshape.resizestart', () => cy.scratch('_isResizing', true));
    cy.on('nodereshape.resizeend',   () => cy.scratch('_isResizing', false));

    const resizer = new ResizeHandles(cy, opts, emit);
    const polygonEditor = new PolygonVertexEditor(cy, opts, emit);

    // ── selection sync ──
    let scheduled = false;
    const scheduleSync = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const selected = cy.nodes(':selected');

        if (opts.polygonVertexEditOnSelect && selected.length === 1 && isPolygonNode(selected[0])) {
          polygonEditor.show(selected[0]);
        } else if (!polygonEditor._drag) {
          // vertex 드래그 중이 아닐 때만 hide (API editVertices 포함)
          // 선택 해제 시 vertex 편집 모드도 해제
          if (polygonEditor.node) {
            const editingId = polygonEditor.node.id();
            const stillSelected = selected.some(n => n.id() === editingId);
            if (!stillSelected) polygonEditor.hide();
          }
        }

        // polygonVertexEditOnSelect === true:
        //   polygon 단독 선택 → vertex editor만 (resize 핸들 없음)
        //   다중 선택 → polygon 포함 모든 노드에 resize 핸들
        // polygonVertexEditOnSelect === false:
        //   polygon도 항상 사각형 resize 핸들
        const singlePolygonVertex = opts.polygonVertexEditOnSelect
          && selected.length === 1 && isPolygonNode(selected[0]);
        const resizeTargets = singlePolygonVertex
          ? selected.filter(() => false)   // empty
          : selected;

        if (resizeTargets.length >= 1) {
          resizer.sync(resizeTargets);
        } else {
          resizer.clear();
        }
      });
    };

    cy.on('select unselect', 'node', scheduleSync);

    cy.on('remove', 'node', (e) => {
      if (polygonEditor.node && e.target.id() === polygonEditor.node.id()) polygonEditor.hide();
      resizer.remove(e.target.id());
    });

    cy.on('position', 'node', (e) => {
      if (polygonEditor.node && e.target.id() === polygonEditor.node.id() && !polygonEditor._drag) {
        polygonEditor.update();
      }
      if (e.target.selected()) resizer.update();
    });

    cy.on('zoom pan', () => {
      if (polygonEditor.node) polygonEditor.update();
      if (cy.nodes(':selected').length >= 1) resizer.scheduleUpdate();
    });

    cy.on('grab', 'node', () => {
      if (cy.nodes(':selected').length >= 1) resizer.setDragging(true);
    });
    cy.on('free', 'node', () => resizer.setDragging(false));

    const origDestroy = cy.destroy.bind(cy);
    cy.destroy = () => { polygonEditor.destroy(); resizer.destroy(); origDestroy(); };

    // ── public API ──
    const api = {
      setInteractive(enabled) {
        resizer.setInteractive(enabled);
        polygonEditor.setInteractive(enabled);
      },
      refresh() {
        resizer.scheduleUpdate();
        if (polygonEditor.node) polygonEditor.update();
      },
      editVertices(node) {
        if (!node || !isPolygonNode(node)) return;
        resizer.clear();
        polygonEditor.show(node);
      },
      exitVertexEdit() {
        polygonEditor.hide();
        scheduleSync();
      },
      clearAll() {
        resizer.clear();
        polygonEditor.hide();
      },
      setOptions(patch) {
        Object.assign(opts, patch);
      },
    };

    cy.scratch('nodeReshape', api);
    return api;
  });
}

if (typeof cytoscape !== 'undefined') {
  // eslint-disable-next-line no-undef
  register(cytoscape);
}

export default register;
