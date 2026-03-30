/**
 * cytoscape-node-reshape — shared utilities
 */

export const isPolygonNode = (node) =>
  node.hasClass('polygon-node') && Array.isArray(node.data('polygonPoints'));

// ── throttle (inline, zero-dep) ──

export function throttle(fn, wait) {
  let last = 0, timer = null, lastArgs = null;
  function throttled(...args) {
    const now = Date.now();
    const remaining = wait - (now - last);
    lastArgs = args;
    if (remaining <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      last = now;
      fn(...lastArgs);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...lastArgs);
      }, remaining);
    }
  }
  throttled.cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return throttled;
}

// ── coordinate helpers ──

export function getCyOffset(cy) {
  const container = cy.container();
  const parent = container.parentElement || container;
  const cRect = container.getBoundingClientRect();
  const pRect = parent.getBoundingClientRect();
  return { x: cRect.left - pRect.left, y: cRect.top - pRect.top };
}

export function modelToRendered(cy, mx, my) {
  const zoom = cy.zoom();
  const pan = cy.pan();
  return { x: mx * zoom + pan.x, y: my * zoom + pan.y };
}

// ── polygon helpers ──

export function expandPolygon(verts, padding) {
  const n = verts.length;
  if (n < 3 || padding <= 0) return verts;

  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += (verts[j].x - verts[i].x) * (verts[j].y + verts[i].y);
  }
  const sign = area > 0 ? -1 : 1;

  const edges = [];
  for (let i = 0; i < n; i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = sign * dy / len, ny = sign * -dx / len;
    edges.push({ px: a.x + nx * padding, py: a.y + ny * padding, dx, dy });
  }

  const result = [];
  for (let i = 0; i < n; i++) {
    const e1 = edges[(i - 1 + n) % n], e2 = edges[i];
    const cross = e1.dx * e2.dy - e1.dy * e2.dx;
    if (Math.abs(cross) < 1e-10) {
      result.push({ x: e2.px, y: e2.py });
    } else {
      const t = ((e2.px - e1.px) * e2.dy - (e2.py - e1.py) * e2.dx) / cross;
      result.push({ x: e1.px + e1.dx * t, y: e1.py + e1.dy * t });
    }
  }
  return result;
}

export function getRenderedVertices(node, cy) {
  const points = node.data('polygonPoints');
  if (!points || points.length < 6) return [];
  const pos = node.renderedPosition();
  const zoom = cy.zoom();
  const w = (node.data('w') || node.width()) * zoom;
  const h = (node.data('h') || node.height()) * zoom;
  const offset = getCyOffset(cy);
  const verts = [];
  for (let i = 0; i < points.length; i += 2) {
    verts.push({
      x: offset.x + pos.x - w / 2 + points[i] * w,
      y: offset.y + pos.y - h / 2 + points[i + 1] * h,
    });
  }
  return verts;
}

export function forcePolygonPoints(cy, node, points) {
  node.data('polygonPoints', points);
  const props = { ...(node.data('properties') || {}) };
  props.polygonPoints = points;
  node.data('properties', props);

  node.style('shape-polygon-points', points.map(v => v * 2 - 1).join(' '));

  const r = cy.renderer();
  if (r) {
    r.nodePathCache = null;
    if (node._private.rscratch) node._private.rscratch.pathCache = null;
  }
}

// ── DOM helpers ──

export function ensureContainer(cy, id, zIndex) {
  const cyContainer = cy.container();
  const parent = cyContainer.parentElement || cyContainer;
  const existing = parent.querySelector(`#${id}`);
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = id;
  Object.assign(el.style, {
    position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: String(zIndex),
  });
  parent.appendChild(el);
  return el;
}

export function calcHandleSize(cy, node, opts) {
  const base = opts.handleSize || 8;
  if (!opts.autoScaleHandles) return base;
  const zoom = Math.max(1, cy.zoom());
  if (!node) return base;
  const factor = Math.min(node.width() / 25, node.height() / 25, 1);
  const raw = zoom * base * factor;
  const min = opts.handleSizeMin ?? 0;
  const max = opts.handleSizeMax ?? Infinity;
  return Math.max(min, Math.min(max, raw));
}

export function buildHandleStyle(opts, cursorOverride) {
  return {
    position: 'absolute',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    background: opts.handleColor,
    border: opts.handleBorder,
    borderRadius: opts.handleBorderRadius,
    opacity: String(opts.handleOpacity),
    cursor: cursorOverride || 'default',
    zIndex: '1001',
    transition: opts.handleHoverColor ? 'background 0.1s' : 'none',
  };
}

export function bindHandleHover(el, opts) {
  if (!opts.handleHoverColor) return;
  el.addEventListener('mouseenter', () => { el.style.background = opts.handleHoverColor; });
  el.addEventListener('mouseleave', () => { el.style.background = opts.handleColor; });
}

export function applyOutlineAttrs(svgShape, opts) {
  svgShape.setAttribute('fill', opts.outlineFill);
  svgShape.setAttribute('fill-opacity', String(opts.outlineFillOpacity));
  svgShape.setAttribute('stroke', opts.outlineColor);
  svgShape.setAttribute('stroke-width', String(opts.outlineWidth));
  svgShape.setAttribute('stroke-opacity', String(opts.outlineOpacity));
  if (opts.outlineDash.length > 0) {
    svgShape.setAttribute('stroke-dasharray', opts.outlineDash.join(' '));
  }
  if (opts.outlineLineCap) {
    svgShape.setAttribute('stroke-linecap', opts.outlineLineCap);
  }
}

// ── rotation helpers ──

export function rotatePoint(px, py, cx, cy, rad) {
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

export function angleBetween(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function rotatePolygonPoints(pts, angleDeg) {
  if (!pts || pts.length < 6 || !angleDeg) return pts;
  const rad = (angleDeg * Math.PI) / 180;
  const n = pts.length / 2;
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cy += pts[i + 1]; }
  cx /= n; cy /= n;
  const result = [];
  for (let i = 0; i < pts.length; i += 2) {
    const r = rotatePoint(pts[i], pts[i + 1], cx, cy, rad);
    result.push(r.x, r.y);
  }
  return result;
}

export function clampSize(w, h, opts, origW, origH) {
  let cw = w, ch = h;
  cw = Math.max(opts.minWidth, Math.min(opts.maxWidth, cw));
  ch = Math.max(opts.minHeight, Math.min(opts.maxHeight, ch));

  if (opts.aspectRatioLocked && origW > 0 && origH > 0) {
    const rw = cw / origW, rh = ch / origH;
    const r = (Math.abs(rw - 1) < Math.abs(rh - 1)) ? rh : rw;
    cw = origW * r;
    ch = origH * r;
    cw = Math.max(opts.minWidth, Math.min(opts.maxWidth, cw));
    ch = Math.max(opts.minHeight, Math.min(opts.maxHeight, ch));
  }

  if (opts.snapGrid > 0) {
    cw = Math.round(cw / opts.snapGrid) * opts.snapGrid;
    ch = Math.round(ch / opts.snapGrid) * opts.snapGrid;
  }
  return { w: cw, h: ch };
}
