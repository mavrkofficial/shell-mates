/**
 * Retro pixel lobster — front-facing portrait (PFP style).
 * Symmetric face + big side pincers so "claws" read at a glance.
 */

function hex(hex) {
  const h = hex.replace("#", "");
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 };
}

function set(buf, w, x, y, c) {
  if (x < 0 || y < 0 || x >= w || y >= w) return;
  const i = (y * w + x) * 4;
  buf[i] = c.r;
  buf[i + 1] = c.g;
  buf[i + 2] = c.b;
  buf[i + 3] = c.a;
}

function fillCircle(buf, w, cx, cy, r, c) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r + 0.5) set(buf, w, cx + x, cy + y, c);
    }
  }
}

function strokeCircle(buf, w, cx, cy, r, c) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d > r - 1.1 && d <= r + 0.6) set(buf, w, cx + x, cy + y, c);
    }
  }
}

function fillRect(buf, w, x, y, rw, rh, c) {
  for (let j = 0; j < rh; j++) {
    for (let i = 0; i < rw; i++) set(buf, w, x + i, y + j, c);
  }
}

function line(buf, w, x0, y0, x1, y1, c) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (;;) {
    set(buf, w, x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Big cartoon pincer: two "fingers" opening toward center (front view).
 * side: -1 = left claw (points left), +1 = right claw (points right)
 */
function drawPincer(buf, w, cx, cy, side, scale, body, out, bg) {
  const s = Math.max(0.65, Math.min(1.55, scale));
  const ox = Math.floor(10 * s);
  const py = cy + Math.floor(1 * s);
  const dir = side;

  // Thick "arm" from body out
  const armLen = Math.floor(5 * s);
  const armTh = Math.max(2, Math.floor(3 * s));
  for (let t = 0; t < armLen; t++) {
    for (let d = 0; d < armTh; d++) {
      set(buf, w, cx + dir * (7 + t), py + d - 1, body);
    }
  }
  // outline arm outer edge
  for (let t = 0; t < armLen; t++) {
    set(buf, w, cx + dir * (7 + t), py - 2, out);
    set(buf, w, cx + dir * (7 + t), py + armTh - 2, out);
  }

  const tipX = cx + dir * (7 + armLen);
  const tipY = py + Math.floor(armTh / 2) - 1;

  // Upper fixed finger (chunky)
  const uw = Math.max(3, Math.floor(4 * s));
  const uh = Math.max(2, Math.floor(3 * s));
  for (let u = 0; u < uw; u++) {
    for (let v = 0; v < uh; v++) {
      set(buf, w, tipX + dir * u, tipY - 2 + v, body);
    }
  }
  // Lower movable finger
  const lw = Math.max(3, Math.floor(4 * s));
  const lh = Math.max(2, Math.floor(3 * s));
  for (let u = 0; u < lw; u++) {
    for (let v = 0; v < lh; v++) {
      set(buf, w, tipX + dir * u, tipY + 1 + v, body);
    }
  }
  // Gap between fingers (pincer bite) — show background
  for (let u = 0; u < Math.floor(2 * s) + 1; u++) {
    set(buf, w, tipX + dir * (uw - 1 - u), tipY, bg);
    set(buf, w, tipX + dir * (uw - 1 - u), tipY + 1, bg);
  }
  // Outline pincer
  for (let u = 0; u <= uw; u++) {
    set(buf, w, tipX + dir * u, tipY - 3, out);
    set(buf, w, tipX + dir * u, tipY + lh + 2, out);
  }
  set(buf, w, tipX + dir * uw, tipY - 2, out);
  set(buf, w, tipX + dir * uw, tipY + lh + 1, out);
}

export function renderLobsterBuffer(o) {
  const { size, background, colors, bow, clawScale, bodyScale, bobDy = 0 } = o;
  const bg = hex(background);
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = bg.r;
    buf[i * 4 + 1] = bg.g;
    buf[i * 4 + 2] = bg.b;
    buf[i * 4 + 3] = bg.a;
  }

  const body = hex(colors.body);
  const shell = hex(colors.shell);
  const belly = hex(colors.belly);
  const out = hex(colors.outline);
  const ew = hex(colors.eyeWhite);
  const ep = hex(colors.eyePupil);
  const bowC = colors.bow ? hex(colors.bow) : null;

  const cx = (size / 2) | 0;
  // Center mass a bit lower = portrait framing (bobDy = logical-pixel offset for idle GIF frames)
  const cy = Math.floor(size * 0.52) + Math.round(Number.isFinite(bobDy) ? bobDy : 0);
  const bs = bodyScale;
  const br = Math.max(5, Math.floor(8 * bs));

  // Main body (front of cephalothorax)
  fillCircle(buf, size, cx, cy + 2, br, body);
  strokeCircle(buf, size, cx, cy + 2, br, out);

  // Belly (lighter oval, bottom)
  for (let y = 0; y < 5; y++) {
    for (let x = -5; x <= 5; x++) {
      if (x * x * 2 + (y - 2) * (y - 2) < 28) set(buf, size, cx + x, cy + 4 + y, belly);
    }
  }

  // Carapace / shell cap (top)
  fillCircle(buf, size, cx, cy - 4, Math.floor(7 * bs), shell);
  strokeCircle(buf, size, cx, cy - 4, Math.floor(7 * bs), out);
  // ridge
  line(buf, size, cx - 5, cy - 8, cx + 5, cy - 8, out);

  // --- Claws: big side pincers (symmetric, front-facing) ---
  drawPincer(buf, size, cx, cy, -1, clawScale, body, out, bg);
  drawPincer(buf, size, cx, cy, 1, clawScale, body, out, bg);

  // Eye stalks + eyes (wide-set, looking at camera)
  line(buf, size, cx - 4, cy - 4, cx - 5, cy - 8, out);
  line(buf, size, cx + 4, cy - 4, cx + 5, cy - 8, out);
  fillCircle(buf, size, cx - 5, cy - 9, 2, ew);
  fillCircle(buf, size, cx + 5, cy - 9, 2, ew);
  fillCircle(buf, size, cx - 5, cy - 9, 1, ep);
  fillCircle(buf, size, cx + 5, cy - 9, 1, ep);

  // Tiny antennae
  line(buf, size, cx - 2, cy - 10, cx - 3, cy - 13, out);
  line(buf, size, cx + 2, cy - 10, cx + 3, cy - 13, out);

  // Little walking legs hint (bottom, symmetric)
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      set(buf, size, cx + side * (4 + k * 2), cy + br + 1, out);
    }
  }

  if (bow && bowC) {
    const by = cy - 12;
    fillRect(buf, size, cx - 4, by, 8, 2, bowC);
    fillRect(buf, size, cx - 5, by - 1, 2, 2, bowC);
    fillRect(buf, size, cx + 3, by - 1, 2, 2, bowC);
    line(buf, size, cx - 1, by + 2, cx + 1, by + 2, out);
  }

  return buf;
}
