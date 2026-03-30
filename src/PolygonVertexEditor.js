/**
 * cytoscape-node-reshape — polygon vertex drag editor
 *
 * During drag: real-time SVG overlay (canvas node is hidden).
 * On mouseup: final state applied to cytoscape.
 */

import {
  isPolygonNode, getCyOffset, modelToRendered,
  expandPolygon, getRenderedVertices, calcHandleSize,
  ensureContainer, buildHandleStyle, bindHandleHover,
  applyOutlineAttrs,
} from './utils.js';

export default class PolygonVertexEditor {
  constructor(cy, opts, emitEvent) {
    this.cy = cy;
    this.opts = opts;
    this._emit = emitEvent;
    this.node = null;
    this.handles = [];
    this._outline = null;
    this._container = null;
    this._overlaySvg = null;
    this._drag = null;
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  // ── public ──

  show(node) {
    this.hide();
    if (!isPolygonNode(node)) return;
    if (!this._container) {
      this._container = ensureContainer(this.cy, 'cy-reshape-polygon', this.opts.containerZIndex + 1);
    }
    this.node = node;

    const verts = getRenderedVertices(node, this.cy);
    if (verts.length < 3) return;
    const pad = (this.opts.padding * Math.max(1, this.cy.zoom())) / 2;
    const bVerts = expandPolygon(verts, pad);

    // dashed outline (polygon shape)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(svg.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      pointerEvents: 'none', overflow: 'visible',
    });
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', bVerts.map(v => `${v.x},${v.y}`).join(' '));
    applyOutlineAttrs(poly, this.opts);
    svg.appendChild(poly);
    this._container.appendChild(svg);
    this._outline = svg;

    // vertex handles
    const gs = calcHandleSize(this.cy, node, this.opts);
    const hs = gs / 2;
    const cursor = this.opts.vertexHandleCursor || 'move';
    for (let i = 0; i < bVerts.length; i++) {
      const bv = bVerts[i];
      const h = document.createElement('div');
      Object.assign(h.style, {
        ...buildHandleStyle(this.opts, cursor),
        width: `${gs}px`, height: `${gs}px`,
        left: `${bv.x - hs}px`, top: `${bv.y - hs}px`,
      });
      bindHandleHover(h, this.opts);
      h.addEventListener('mousedown', (e) => this._onHandleDown(e, i));
      this._container.appendChild(h);
      this.handles.push(h);
    }
  }

  hide() {
    if (this._outline) { this._outline.remove(); this._outline = null; }
    if (this._overlaySvg) { this._overlaySvg.remove(); this._overlaySvg = null; }
    for (const h of this.handles) h.remove();
    this.handles = [];
    this.node = null;
  }

  update() {
    if (!this.node || this.node.removed()) { this.hide(); return; }
    const verts = getRenderedVertices(this.node, this.cy);
    if (verts.length < 3) { this.hide(); return; }

    const pad = (this.opts.padding * Math.max(1, this.cy.zoom())) / 2;
    const bVerts = expandPolygon(verts, pad);

    if (this._outline) {
      const p = this._outline.querySelector('polygon');
      if (p) p.setAttribute('points', bVerts.map(v => `${v.x},${v.y}`).join(' '));
    }

    const gs = calcHandleSize(this.cy, this.node, this.opts);
    const hs = gs / 2;
    for (let i = 0; i < this.handles.length && i < bVerts.length; i++) {
      Object.assign(this.handles[i].style, {
        left: `${bVerts[i].x - hs}px`, top: `${bVerts[i].y - hs}px`,
        width: `${gs}px`, height: `${gs}px`,
      });
    }
  }

  setInteractive(enabled) {
    if (this._container) this._container.style.visibility = enabled ? '' : 'hidden';
  }

  destroy() {
    this.hide();
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
    if (this._container) { this._container.remove(); this._container = null; }
  }

  // ── drag overlay (SVG) ──

  _updateOverlay(modelPts) {
    const cy = this.cy;
    const offset = getCyOffset(cy);
    const rVerts = modelPts.map(p => {
      const r = modelToRendered(cy, p.x, p.y);
      return { x: r.x + offset.x, y: r.y + offset.y };
    });

    if (!this._overlaySvg) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      Object.assign(svg.style, {
        position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
        pointerEvents: 'none', overflow: 'visible', zIndex: String(this.opts.containerZIndex),
      });
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const node = this._drag?.node;

      if (this.opts.overlayFill != null) {
        poly.setAttribute('fill', this.opts.overlayFill);
        poly.setAttribute('fill-opacity', String(this.opts.overlayFillOpacity ?? 0.5));
        poly.setAttribute('stroke', this.opts.overlayStroke ?? this.opts.outlineColor);
        poly.setAttribute('stroke-width', String((this.opts.overlayStrokeWidth ?? 1) * cy.zoom()));
      } else if (node) {
        poly.setAttribute('fill', node.pstyle('background-color').strValue);
        poly.setAttribute('fill-opacity', String(node.pstyle('background-opacity').value));
        poly.setAttribute('stroke', node.pstyle('border-color').strValue);
        poly.setAttribute('stroke-width', String(node.pstyle('border-width').pfValue * cy.zoom()));
      }

      svg.appendChild(poly);
      this._container.appendChild(svg);
      this._overlaySvg = svg;
    }

    const poly = this._overlaySvg.querySelector('polygon');
    if (poly) poly.setAttribute('points', rVerts.map(v => `${v.x},${v.y}`).join(' '));

    const pad = (this.opts.padding * Math.max(1, cy.zoom())) / 2;
    const bVerts = expandPolygon(rVerts, pad);

    if (this._outline) {
      const p = this._outline.querySelector('polygon');
      if (p) p.setAttribute('points', bVerts.map(v => `${v.x},${v.y}`).join(' '));
    }

    const gs = calcHandleSize(cy, this.node, this.opts);
    const hs = gs / 2;
    for (let i = 0; i < this.handles.length && i < bVerts.length; i++) {
      Object.assign(this.handles[i].style, {
        left: `${bVerts[i].x - hs}px`, top: `${bVerts[i].y - hs}px`,
      });
    }
  }

  // ── vertex drag ──

  _onHandleDown(e, idx) {
    e.preventDefault(); e.stopPropagation();
    const node = this.node; if (!node) return;
    const pts = node.data('polygonPoints');
    if (!pts || pts.length < 6) return;

    const pos = node.position();
    const w = node.data('w') || node.width();
    const h = node.data('h') || node.height();
    const hw = w / 2, hh = h / 2;

    const origModel = [];
    for (let i = 0; i < pts.length; i += 2) {
      origModel.push({ x: pos.x - hw + pts[i] * w, y: pos.y - hh + pts[i + 1] * h });
    }

    this._drag = { idx, node, origModel, origPts: pts.slice(), origW: w, origH: h, startClientX: e.clientX, startClientY: e.clientY };

    this._updateOverlay(origModel);
    node.style('visibility', 'hidden');

    this.cy.panningEnabled(false);
    this.cy.boxSelectionEnabled(false);
    this.cy.autounselectify(true);
    this.cy.autoungrabify(true);

    this._emit('resizestart', ['polygon-vertex', node]);
    if (this.opts.onVertexDragStart) this.opts.onVertexDragStart(node, idx);

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
  }

  _onMouseMove(e) {
    const d = this._drag; if (!d) return;
    const cy = this.cy;
    const rect = cy.container().getBoundingClientRect();
    const zoom = cy.zoom(), pan = cy.pan();
    let mx = (e.clientX - rect.left - pan.x) / zoom;
    let my = (e.clientY - rect.top  - pan.y) / zoom;

    if (this.opts.snapGrid > 0) {
      mx = Math.round(mx / this.opts.snapGrid) * this.opts.snapGrid;
      my = Math.round(my / this.opts.snapGrid) * this.opts.snapGrid;
    }

    const pts = d.origModel.map(p => ({ ...p }));
    const zoom2 = cy.zoom();
    pts[d.idx] = {
      x: d.origModel[d.idx].x + (e.clientX - d.startClientX) / zoom2,
      y: d.origModel[d.idx].y + (e.clientY - d.startClientY) / zoom2,
    };
    this._updateOverlay(pts);
    d.currentPts = pts;

    cy.trigger('nodereshape.drag', ['polygon-vertex', d.node]);
    if (this.opts.onVertexDrag) this.opts.onVertexDrag(d.node, d.idx, { x: mx, y: my });
  }

  _onMouseUp() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);

    const cy = this.cy;
    const d = this._drag;
    const node = d?.node;

    if (this._overlaySvg) { this._overlaySvg.remove(); this._overlaySvg = null; }

    if (node && d.currentPts) {
      const mp = d.currentPts;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of mp) {
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
      }
      const nw = Math.max(this.opts.minWidth, maxX - minX);
      const nh = Math.max(this.opts.minHeight, maxY - minY);
      const cx = (minX + maxX) / 2, cy_ = (minY + maxY) / 2;

      const norm = [];
      for (const p of mp) {
        norm.push(Math.max(0, Math.min(1, (p.x - minX) / nw)));
        norm.push(Math.max(0, Math.min(1, (p.y - minY) / nh)));
      }

      try {
        cy.batch(() => {
          node.position({ x: cx, y: cy_ });
          node.data('w', nw); node.data('h', nh);
          node.style('width', nw); node.style('height', nh);
          node.data('polygonPoints', norm);
          node.style('shape-polygon-points', norm.map(v => v * 2 - 1).join(' '));
          const props = { ...(node.data('properties') || {}) };
          props.polygonPoints = norm;
          node.data('properties', props);
        });
      } finally {
        node.style('visibility', 'visible');
      }

      const r = cy.renderer();
      if (r) { r.nodePathCache = null; if (node._private.rscratch) node._private.rscratch.pathCache = null; }
      this._emit('resizeend', ['polygon-vertex', node]);
      if (this.opts.onVertexDragEnd) this.opts.onVertexDragEnd(node, d.idx);
    } else if (node) {
      node.style('visibility', 'visible');
    }

    cy.panningEnabled(true);
    cy.boxSelectionEnabled(true);
    setTimeout(() => { cy.autounselectify(false); cy.autoungrabify(false); }, 0);
    this._drag = null;

    if (node && !node.removed()) this.show(node);
  }
}
