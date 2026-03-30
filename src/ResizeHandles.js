/**
 * cytoscape-node-reshape — 8-directional resize handles (single & multi select)
 */

import {
  throttle, calcHandleSize, buildHandleStyle,
  bindHandleHover, applyOutlineAttrs, clampSize,
} from './utils.js';

const ALL_DIRECTIONS = [
  { name: 'nw', cursor: 'nw-resize', dx: -1, dy: -1 },
  { name: 'n',  cursor: 'n-resize',  dx:  0, dy: -1 },
  { name: 'ne', cursor: 'ne-resize', dx:  1, dy: -1 },
  { name: 'e',  cursor: 'e-resize',  dx:  1, dy:  0 },
  { name: 'se', cursor: 'se-resize', dx:  1, dy:  1 },
  { name: 's',  cursor: 's-resize',  dx:  0, dy:  1 },
  { name: 'sw', cursor: 'sw-resize', dx: -1, dy:  1 },
  { name: 'w',  cursor: 'w-resize',  dx: -1, dy:  0 },
];

export default class ResizeHandles {
  constructor(cy, opts, emitEvent) {
    this.cy = cy;
    this.opts = opts;
    this._emit = emitEvent;
    this._instances = new Map();
    this._container = null;
    this._ready = false;
    this._dragging = false;
    this._pending = false;
    this._rafId = null;
    this._resizeRafId = null;
    this._throttledUpdate = throttle(() => this._batchUpdate(), 16);
    this._resizeState = null;
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);

    const enabled = opts.directions;
    this._dirs = enabled
      ? ALL_DIRECTIONS.filter(d => enabled.includes(d.name))
      : ALL_DIRECTIONS;
  }

  // ── public API ──

  sync(nodes) {
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
    this._instances.forEach(inst => {
      inst.outline.remove();
      inst.handles.forEach(h => h.remove());
    });
    this._instances.clear();
  }

  remove(nodeId) { this._remove(nodeId); }

  scheduleUpdate() {
    if (this._pending) return;
    this._pending = true;
    this._rafId = requestAnimationFrame(() => { this._pending = false; this._batchUpdate(); });
  }

  update() {
    this._dragging ? this._throttledUpdate() : this.scheduleUpdate();
  }

  setDragging(v) { this._dragging = v; if (!v) this.scheduleUpdate(); }

  setInteractive(enabled) {
    if (this._container) this._container.style.visibility = enabled ? '' : 'hidden';
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._throttledUpdate.cancel?.();
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
    this.clear();
    if (this._container) { this._container.remove(); this._container = null; }
    this._ready = false;
  }

  // ── internal ──

  _init() {
    if (this._ready) return;
    const parent = this.cy.container().parentElement || this.cy.container();
    const id = 'cy-reshape-handles';
    const prev = parent.querySelector(`#${id}`);
    if (prev) prev.remove();

    this._container = document.createElement('div');
    this._container.id = id;
    Object.assign(this._container.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: String(this.opts.containerZIndex),
    });
    parent.appendChild(this._container);
    this._ready = true;
  }

  _add(node) {
    if (!this._ready) this._init();
    if (this._instances.has(node.id())) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(svg.style, { position: 'absolute', pointerEvents: 'none', overflow: 'visible' });
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    applyOutlineAttrs(rect, this.opts);
    svg.appendChild(rect);
    this._container.appendChild(svg);

    const handles = this._dirs.map(dir => {
      const h = document.createElement('div');
      Object.assign(h.style, buildHandleStyle(this.opts, dir.cursor));
      bindHandleHover(h, this.opts);
      h.addEventListener('mousedown', (e) => this._onHandleDown(e, node, dir));
      this._container.appendChild(h);
      return h;
    });

    this._instances.set(node.id(), { outline: svg, handles, node });
    this._updateOne(node.id());
  }

  _remove(nodeId) {
    const inst = this._instances.get(nodeId);
    if (!inst) return;
    inst.outline.remove();
    inst.handles.forEach(h => h.remove());
    this._instances.delete(nodeId);
  }

  _metrics(node) {
    const pos = node.renderedPosition();
    const zoom = this.cy.zoom();
    const w = (node.data('w') || node.width()) * zoom;
    const h = (node.data('h') || node.height()) * zoom;
    const pad = this.opts.padding * Math.max(1, zoom);
    return { x: pos.x - (w + pad) / 2, y: pos.y - (h + pad) / 2, w: w + pad, h: h + pad };
  }

  _updateOne(nodeId) {
    const inst = this._instances.get(nodeId);
    if (!inst || !inst.node || inst.node.removed()) return false;

    const { x, y, w, h } = this._metrics(inst.node);
    const gs = calcHandleSize(this.cy, inst.node, this.opts);
    const hs = gs / 2;

    Object.assign(inst.outline.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    const svgRect = inst.outline.querySelector('rect');
    if (svgRect) { svgRect.setAttribute('width', String(w)); svgRect.setAttribute('height', String(h)); }

    const cx = x + w / 2, cy_ = y + h / 2;
    const posMap = {
      nw: [x - hs, y - hs],       n: [cx - hs, y - hs],       ne: [x + w - hs, y - hs],
      e:  [x + w - hs, cy_ - hs], se: [x + w - hs, y + h - hs], s: [cx - hs, y + h - hs],
      sw: [x - hs, y + h - hs],   w:  [x - hs, cy_ - hs],
    };

    inst.handles.forEach((handle, i) => {
      const p = posMap[this._dirs[i].name];
      Object.assign(handle.style, { left: `${p[0]}px`, top: `${p[1]}px`, width: `${gs}px`, height: `${gs}px` });
    });
    return true;
  }

  _batchUpdate() {
    if (!this._container || this._instances.size === 0) return;
    const stale = [];
    this._instances.forEach((_, id) => { if (!this._updateOne(id)) stale.push(id); });
    stale.forEach(id => this._remove(id));
  }

  // ── resize drag ──

  _onHandleDown(e, node, dir) {
    e.preventDefault(); e.stopPropagation();
    const selected = this.cy.nodes(':selected');
    const origins = new Map();
    selected.forEach(n => origins.set(n.id(), {
      w: n.data('w') || n.width(),
      h: n.data('h') || n.height(),
    }));

    this._emit('resizestart', [node, dir.name]);
    if (this.opts.onResizeStart) this.opts.onResizeStart(node, dir.name);

    const pos = node.position();
    this._resizeState = {
      node, dir, startX: e.clientX, startY: e.clientY, origins,
      startW: node.data('w') || node.width(),
      startH: node.data('h') || node.height(),
      startPos: { x: pos.x, y: pos.y },
    };
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
  }

  _onMouseMove(e) {
    const st = this._resizeState; if (!st) return;
    this._lastX = e.clientX; this._lastY = e.clientY;
    this._shiftKey = e.shiftKey;
    if (this._resizeRafId) return;
    this._resizeRafId = requestAnimationFrame(() => {
      this._resizeRafId = null; if (!this._resizeState) return;
      const zoom = this.cy.zoom();
      const dx = (this._lastX - st.startX) / zoom;
      const dy = (this._lastY - st.startY) / zoom;
      let nw = st.startW, nh = st.startH;
      if (st.dir.dx) nw = st.startW + dx * st.dir.dx;
      if (st.dir.dy) nh = st.startH + dy * st.dir.dy;

      // Shift 또는 aspectRatioLocked: 비율 고정
      const lockRatio = this._shiftKey || this.opts.aspectRatioLocked;
      if (lockRatio && st.startW > 0 && st.startH > 0) {
        const ratio = st.startW / st.startH;
        if (st.dir.dx && st.dir.dy) {
          // 코너 핸들: 큰 축 기준, 부호는 드래그 방향(dir) 고정
          const dw = nw - st.startW;
          const dh = nh - st.startH;
          if (Math.abs(dw) * st.startH >= Math.abs(dh) * st.startW) {
            nw = st.startW + dw;
            nh = st.startH + (Math.abs(dw) / ratio) * st.dir.dy * Math.sign(dw * st.dir.dx || 1);
          } else {
            nh = st.startH + dh;
            nw = st.startW + (Math.abs(dh) * ratio) * st.dir.dx * Math.sign(dh * st.dir.dy || 1);
          }
        } else if (st.dir.dx) {
          // 좌우 변 핸들: width 기준으로 height 따라감
          nh = nw / ratio;
        } else {
          // 상하 변 핸들: height 기준으로 width 따라감
          nw = nh * ratio;
        }
      }

      const clamped = clampSize(nw, nh, this.opts, st.startW, st.startH);
      nw = clamped.w; nh = clamped.h;

      const rw = st.startW > 0 ? nw / st.startW : 1;
      const rh = st.startH > 0 ? nh / st.startH : 1;

      // position 보정 — 비율 고정 시 양축 모두 보정 필요
      const dirX = lockRatio ? (st.dir.dx || 1) : st.dir.dx;
      const dirY = lockRatio ? (st.dir.dy || 1) : st.dir.dy;
      const posX = st.startPos.x + dirX * (nw - st.startW) / 2;
      const posY = st.startPos.y + dirY * (nh - st.startH) / 2;

      this.cy.batch(() => {
        st.node.data('w', nw); st.node.style('width', nw);
        st.node.data('h', nh); st.node.style('height', nh);
        st.node.position({ x: posX, y: posY });
        st.origins.forEach((o, id) => {
          if (id === st.node.id()) return;
          const other = this.cy.getElementById(id);
          if (!other.length) return;
          const ow = Math.max(this.opts.minWidth, o.w * rw);
          const oh = Math.max(this.opts.minHeight, o.h * rh);
          other.data('w', ow); other.style('width', ow);
          other.data('h', oh); other.style('height', oh);
        });
      });

      if (this.opts.onResize) this.opts.onResize(st.node, nw, nh);
      this.scheduleUpdate();
    });
  }

  _onMouseUp() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
    if (this._resizeRafId) { cancelAnimationFrame(this._resizeRafId); this._resizeRafId = null; }
    if (this._resizeState) {
      const node = this._resizeState.node;
      this._emit('resizeend', [node]);
      if (this.opts.onResizeEnd) this.opts.onResizeEnd(node);
      this._resizeState = null;
    }
    this.scheduleUpdate();
  }
}
