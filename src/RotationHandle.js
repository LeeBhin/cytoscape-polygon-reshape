/**
 * cytoscape-node-reshape — rotation handle
 *
 * Circular handle above the selected node, connected by a dashed line.
 * Dragging rotates the node (polygon points + stored angle).
 */

import {
  ensureContainer, calcHandleSize,
  angleBetween, rotatePolygonPoints, isPolygonNode,
  getCyOffset,
} from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export default class RotationHandle {
  constructor(cy, opts, emitEvent) {
    this.cy = cy;
    this.opts = opts;
    this._emit = emitEvent;
    this._container = null;
    this._instances = new Map();
    this._dragState = null;
    this._rafId = null;
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  // ── public ──

  sync(nodes) {
    if (!this.opts.rotationEnabled) { this.clear(); return; }
    const selected = nodes || this.cy.nodes(':selected');
    const ids = new Set(selected.map(n => n.id()));
    const stale = [];
    this._instances.forEach((_, id) => { if (!ids.has(id)) stale.push(id); });
    stale.forEach(id => this._remove(id));
    selected.forEach(n => {
      if (this.opts.nodeFilter && !this.opts.nodeFilter(n)) return;
      if (!this._instances.has(n.id())) this._add(n);
    });
  }

  clear() {
    this._instances.forEach(inst => this._removeInst(inst));
    this._instances.clear();
  }

  remove(nodeId) { this._remove(nodeId); }

  scheduleUpdate() {
    if (this._rafId) return;
    this._rafId = requestAnimationFrame(() => { this._rafId = null; this._batchUpdate(); });
  }

  update() { this.scheduleUpdate(); }

  setInteractive(enabled) {
    if (this._container) this._container.style.visibility = enabled ? '' : 'hidden';
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
    this.clear();
    if (this._container) { this._container.remove(); this._container = null; }
  }

  // ── internal ──

  _ensureContainer() {
    if (!this._container) {
      this._container = ensureContainer(this.cy, 'cy-reshape-rotation', this.opts.containerZIndex + 2);
    }
  }

  _add(node) {
    this._ensureContainer();
    if (this._instances.has(node.id())) return;

    // SVG for connecting line
    const svg = document.createElementNS(SVG_NS, 'svg');
    Object.assign(svg.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      pointerEvents: 'none', overflow: 'visible',
    });
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('stroke', this.opts.rotationLineColor || this.opts.outlineColor);
    line.setAttribute('stroke-width', String(this.opts.rotationLineWidth ?? 1));
    line.setAttribute('stroke-dasharray', (this.opts.rotationLineDash || [3, 3]).join(' '));
    svg.appendChild(line);
    this._container.appendChild(svg);

    // circular handle
    const handle = document.createElement('div');
    const size = this._getHandleSize(node);
    Object.assign(handle.style, {
      position: 'absolute',
      boxSizing: 'border-box',
      pointerEvents: 'auto',
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      background: this.opts.rotationHandleColor || this.opts.handleColor,
      border: this.opts.rotationHandleBorder || this.opts.handleBorder,
      opacity: String(this.opts.handleOpacity),
      cursor: this.opts.rotationCursor || 'crosshair',
      zIndex: '1002',
      transition: this.opts.handleHoverColor ? 'background 0.1s' : 'none',
    });

    if (this.opts.handleHoverColor) {
      const hoverColor = this.opts.rotationHandleHoverColor || this.opts.handleHoverColor;
      const normalColor = this.opts.rotationHandleColor || this.opts.handleColor;
      handle.addEventListener('mouseenter', () => { handle.style.background = hoverColor; });
      handle.addEventListener('mouseleave', () => { handle.style.background = normalColor; });
    }

    handle.addEventListener('mousedown', (e) => this._onHandleDown(e, node));
    this._container.appendChild(handle);

    const inst = { handle, svgLine: svg, line, node };
    this._instances.set(node.id(), inst);
    this._updateOne(node.id());
  }

  _remove(nodeId) {
    const inst = this._instances.get(nodeId);
    if (!inst) return;
    this._removeInst(inst);
    this._instances.delete(nodeId);
  }

  _removeInst(inst) {
    inst.handle.remove();
    inst.svgLine.remove();
  }

  _getHandleSize(node) {
    return calcHandleSize(this.cy, node, this.opts);
  }

  _metrics(node) {
    const pos = node.renderedPosition();
    const zoom = this.cy.zoom();
    const w = (node.data('w') || node.width()) * zoom;
    const h = (node.data('h') || node.height()) * zoom;
    const pad = this.opts.padding * Math.max(1, zoom);
    return { cx: pos.x, cy: pos.y, w: w + pad, h: h + pad };
  }

  _updateOne(nodeId) {
    const inst = this._instances.get(nodeId);
    if (!inst || !inst.node || inst.node.removed()) return false;

    const offset = getCyOffset(this.cy);
    const m = this._metrics(inst.node);
    const gs = this._getHandleSize(inst.node);
    const hs = gs / 2;

    const lineLen = this.opts.rotationHandleOffset ?? 25;
    const zoomAdjustedLen = lineLen * Math.max(1, this.cy.zoom());

    const topX = offset.x + m.cx;
    const topY = offset.y + m.cy - m.h / 2;
    const handleX = topX;
    const handleY = topY - zoomAdjustedLen;

    Object.assign(inst.handle.style, {
      left: `${handleX - hs}px`,
      top: `${handleY - hs}px`,
      width: `${gs}px`,
      height: `${gs}px`,
    });

    inst.line.setAttribute('x1', String(topX));
    inst.line.setAttribute('y1', String(topY));
    inst.line.setAttribute('x2', String(handleX));
    inst.line.setAttribute('y2', String(handleY));

    return true;
  }

  _batchUpdate() {
    if (!this._container || this._instances.size === 0) return;
    const stale = [];
    this._instances.forEach((_, id) => { if (!this._updateOne(id)) stale.push(id); });
    stale.forEach(id => this._remove(id));
  }

  // ── rotation drag ──

  _onHandleDown(e, node) {
    e.preventDefault();
    e.stopPropagation();

    const cyContainer = this.cy.container();
    const parent = cyContainer.parentElement || cyContainer;
    const parentRect = parent.getBoundingClientRect();
    const offset = getCyOffset(this.cy);
    const m = this._metrics(node);
    const centerX = parentRect.left + offset.x + m.cx;
    const centerY = parentRect.top + offset.y + m.cy;

    const startAngle = angleBetween(centerX, centerY, e.clientX, e.clientY);
    const currentRotation = Number(node.data('rotation') || 0);

    let origPts = null;
    if (isPolygonNode(node)) {
      origPts = node.data('polygonPoints')?.slice() || null;
    }

    this._dragState = {
      node, centerX, centerY, startAngle,
      startRotation: currentRotation, origPts,
    };

    this.cy.panningEnabled(false);
    this.cy.boxSelectionEnabled(false);
    this.cy.autounselectify(true);
    this.cy.autoungrabify(true);

    this._emit('rotatestart', [node, currentRotation]);
    if (this.opts.onRotateStart) this.opts.onRotateStart(node, currentRotation);

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
  }

  _onMouseMove(e) {
    const ds = this._dragState;
    if (!ds) return;

    const currentAngle = angleBetween(ds.centerX, ds.centerY, e.clientX, e.clientY);
    let deltaDeg = ((currentAngle - ds.startAngle) * 180) / Math.PI;

    if (e.shiftKey) {
      const snap = this.opts.rotationSnapAngle || 15;
      deltaDeg = Math.round(deltaDeg / snap) * snap;
    }

    const newRotation = ds.startRotation + deltaDeg;
    const node = ds.node;
    const cy = this.cy;

    cy.batch(() => {
      node.data('rotation', newRotation);
      const props = { ...(node.data('properties') || {}) };
      props.rotation = newRotation;
      node.data('properties', props);

      if (ds.origPts && isPolygonNode(node)) {
        const rotated = rotatePolygonPoints(ds.origPts, deltaDeg);
        node.data('polygonPoints', rotated);
        node.style('shape-polygon-points', rotated.map(v => v * 2 - 1).join(' '));
        const r = cy.renderer();
        if (r) {
          r.nodePathCache = null;
          if (node._private.rscratch) node._private.rscratch.pathCache = null;
        }
      }
    });

    this._emit('rotate', [node, newRotation]);
    if (this.opts.onRotate) this.opts.onRotate(node, newRotation, deltaDeg);
  }

  _onMouseUp() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);

    const ds = this._dragState;
    if (ds) {
      const node = ds.node;
      const rotation = Number(node.data('rotation') || 0);

      this.cy.panningEnabled(true);
      this.cy.boxSelectionEnabled(true);
      setTimeout(() => { this.cy.autounselectify(false); this.cy.autoungrabify(false); }, 0);

      this._emit('rotateend', [node, rotation]);
      if (this.opts.onRotateEnd) this.opts.onRotateEnd(node, rotation);
    }
    this._dragState = null;
    this.scheduleUpdate();
  }
}
