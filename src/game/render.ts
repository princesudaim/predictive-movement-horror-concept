import { COLS, Game, ROWS } from "./engine";
import { DX, DY, legalDirs } from "./grid";

export const TILE = 26;
export const W = COLS * TILE;
export const H = ROWS * TILE;

function makeNoise(size: number) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 120 + Math.random() * 135;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** A small hooded silhouette — used for you and for the copy of you. */
function drawFigure(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  bob: number,
  scale: number,
  fill: string,
  alpha: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y + Math.sin(bob) * 1.4 * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = fill;
  // cloak
  ctx.beginPath();
  ctx.moveTo(-5.5, 6);
  ctx.quadraticCurveTo(-7.5, -1, -4.5, -5.5);
  ctx.lineTo(4.5, -5.5);
  ctx.quadraticCurveTo(7.5, -1, 5.5, 6);
  ctx.closePath();
  ctx.fill();
  // head
  ctx.beginPath();
  ctx.ellipse(0, -7.6, 3.9, 4.3, 0, 0, Math.PI * 2);
  ctx.fill();
  // hood shadow
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.ellipse(dir === 1 ? -1.4 : dir === 3 ? 1.4 : 0, -7.6, 2.4, 2.9, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = fill;
  ctx.lineWidth = 1.9;
  const swing = Math.sin(bob) * 2.6;
  ctx.beginPath();
  ctx.moveTo(-2, 5.4);
  ctx.lineTo(-2 + swing * 0.6, 9.6);
  ctx.moveTo(2, 5.4);
  ctx.lineTo(2 - swing * 0.6, 9.6);
  ctx.stroke();
  ctx.restore();
}

function drawCreature(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, alpha: number, state: string) {
  ctx.save();
  ctx.translate(x, y);
  const wob = Math.sin(t * 5.2) * 1.1;
  ctx.globalAlpha = alpha;

  // trailing limbs
  ctx.strokeStyle = "rgba(8,6,10,0.85)";
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + t * 0.7;
    const len = 12 + Math.sin(t * 3 + i) * 5;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.quadraticCurveTo(Math.cos(a) * len * 0.7, Math.sin(a) * len * 0.5 - 4, Math.cos(a) * len, Math.sin(a) * len * 0.7 - 2);
    ctx.stroke();
  }

  // tall body
  ctx.fillStyle = "rgba(6,5,9,0.96)";
  ctx.beginPath();
  ctx.moveTo(-7 + wob * 0.4, 10);
  ctx.quadraticCurveTo(-9, -6, -3.5, -14);
  ctx.lineTo(3.5, -14);
  ctx.quadraticCurveTo(9, -6, 7 + wob * 0.4, 10);
  ctx.closePath();
  ctx.fill();

  // rim light
  ctx.strokeStyle = "rgba(190,90,120,0.5)";
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // eyes
  const blink = state === "search" ? 0.35 + Math.abs(Math.sin(t * 2)) * 0.4 : 1;
  ctx.globalAlpha = alpha * blink;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i === 1 ? "rgba(255,235,240,0.95)" : "rgba(255,120,140,0.8)";
    ctx.beginPath();
    ctx.arc(-3.4 + i * 2.3, -11 + (i % 2) * 1.6, i === 1 ? 1.5 : 1.0, 0, Math.PI * 2);
    ctx.fill();
  }

  // listening ripples
  if (state === "search" || state === "listen") {
    ctx.globalAlpha = alpha * 0.35;
    ctx.strokeStyle = "rgba(255,140,160,0.6)";
    for (let i = 0; i < 3; i++) {
      const r = ((t * 26 + i * 14) % 42) + 6;
      ctx.beginPath();
      ctx.arc(0, -8, r, 0, Math.PI * 2);
      ctx.lineWidth = 1.4 * (1 - r / 48);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function createRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const dark = document.createElement("canvas");
  dark.width = W;
  dark.height = H;
  const dctx = dark.getContext("2d")!;
  const noise = makeNoise(128);

  const floorVar = new Float32Array(COLS * ROWS);
  for (let i = 0; i < floorVar.length; i++) floorVar[i] = Math.random();

  function hole(x: number, y: number, r: number, a: number) {
    const grd = dctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(0,0,0,${a})`);
    grd.addColorStop(0.55, `rgba(0,0,0,${a * 0.55})`);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    dctx.fillStyle = grd;
    dctx.beginPath();
    dctx.arc(x, y, r, 0, Math.PI * 2);
    dctx.fill();
  }

  function beam(x: number, y: number, dir: number, len: number, spread: number, a: number) {
    const ex = x + DX[dir] * len;
    const ey = y + DY[dir] * len;
    const perp = dir === 0 || dir === 2 ? { x: 1, y: 0 } : { x: 0, y: 1 };
    dctx.save();
    dctx.beginPath();
    dctx.moveTo(x, y);
    dctx.lineTo(ex + perp.x * spread, ey + perp.y * spread);
    dctx.lineTo(ex - perp.x * spread, ey - perp.y * spread);
    dctx.closePath();
    const grd = dctx.createRadialGradient(x, y, 0, x, y, len);
    grd.addColorStop(0, `rgba(0,0,0,${a})`);
    grd.addColorStop(0.6, `rgba(0,0,0,${a * 0.5})`);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    dctx.fillStyle = grd;
    dctx.fill();
    dctx.restore();
  }

  function draw(g: Game, dt: number) {
    const t = g.time;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#04050a";
    ctx.fillRect(0, 0, W, H);

    if (g.shake > 0.001) {
      const s = g.shake * 7;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    // ---- floors & walls ----
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const wall = g.grid.cells[y * COLS + x] === 1;
        const px = x * TILE;
        const py = y * TILE;
        if (wall) {
          ctx.fillStyle = "#0c0e15";
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = "#161a25";
          ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
          if (y + 1 < ROWS && g.grid.cells[(y + 1) * COLS + x] === 0) {
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(px, py + TILE - 5, TILE, 5);
          }
          if (y - 1 >= 0 && g.grid.cells[(y - 1) * COLS + x] === 0) {
            ctx.fillStyle = "rgba(120,140,180,0.07)";
            ctx.fillRect(px, py, TILE, 2);
          }
        } else {
          const v = floorVar[y * COLS + x];
          const base = 22 + v * 12;
          ctx.fillStyle = `rgb(${base | 0},${(base + 3) | 0},${(base + 9) | 0})`;
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = "rgba(0,0,0,0.28)";
          ctx.fillRect(px, py, TILE, 1);
          ctx.fillRect(px, py, 1, TILE);
          if (v > 0.93) {
            ctx.fillStyle = "rgba(150,170,200,0.05)";
            ctx.fillRect(px + 6, py + 8, 5, 3);
          }
        }
      }
    }

    // ---- exit gate ----
    const ex = (g.exit.x + 0.5) * TILE;
    const ey = (g.exit.y + 0.5) * TILE;
    ctx.save();
    const pulse = 0.5 + Math.sin(t * 3) * 0.5;
    ctx.globalAlpha = g.gateOpen ? 0.85 : 0.28;
    const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, TILE * 1.4);
    eg.addColorStop(0, g.gateOpen ? "rgba(150,255,210,0.85)" : "rgba(90,110,140,0.35)");
    eg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = eg;
    ctx.fillRect(ex - TILE * 1.5, ey - TILE * 1.5, TILE * 3, TILE * 3);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = g.gateOpen ? `rgba(170,255,215,${0.6 + pulse * 0.4})` : "rgba(120,140,170,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(ex - 8, ey - 11, 16, 22);
    ctx.fillStyle = g.gateOpen ? "rgba(140,255,205,0.25)" : "rgba(60,70,90,0.3)";
    ctx.fillRect(ex - 7, ey - 10, 14, 20);
    ctx.restore();

    // ---- relays ----
    for (const f of g.fuses) {
      if (f.taken) continue;
      const fx = (f.x + 0.5) * TILE;
      const fy = (f.y + 0.5) * TILE;
      const p = 0.5 + Math.sin(t * 2.6 + f.phase) * 0.5;
      ctx.save();
      const rg = ctx.createRadialGradient(fx, fy, 0, fx, fy, TILE * 1.1);
      rg.addColorStop(0, `rgba(255,205,120,${0.5 + p * 0.35})`);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(fx - TILE * 1.2, fy - TILE * 1.2, TILE * 2.4, TILE * 2.4);
      ctx.fillStyle = "#ffd79a";
      ctx.beginPath();
      ctx.arc(fx, fy, 3.4 + p * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,220,160,0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(fx, fy, 7 + p * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ---- the guess: dotted route + pale copy ----
    const gh = g.ghost;
    ctx.save();
    let rx = (gh.anchor.x + 0.5) * TILE;
    let ry = (gh.anchor.y + 0.5) * TILE;
    const routePts: { x: number; y: number; d: number; i: number }[] = [];
    for (let i = 0; i < gh.route.length; i++) {
      const s = gh.route[i];
      routePts.push({ x: (s.x + 0.5) * TILE, y: (s.y + 0.5) * TILE, d: s.d, i });
    }
    ctx.lineCap = "round";
    for (const p of routePts) {
      const fade = 1 - p.i / (routePts.length + 2);
      ctx.globalAlpha = 0.1 + fade * 0.4;
      ctx.strokeStyle = "rgba(150,235,255,1)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
      rx = p.x;
      ry = p.y;
    }
    // direction chevrons
    for (const p of routePts) {
      if (p.i % 2 !== 0) continue;
      const fade = 1 - p.i / (routePts.length + 2);
      ctx.globalAlpha = 0.12 + fade * 0.4;
      ctx.strokeStyle = "rgba(170,245,255,1)";
      ctx.lineWidth = 1.5;
      const ang = Math.atan2(DY[p.d], DX[p.d]);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-2.5, -3);
      ctx.lineTo(2.5, 0);
      ctx.lineTo(-2.5, 3);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // ghost figure with static halo
    ctx.save();
    const gx = gh.fx * TILE;
    const gy = gh.fy * TILE;
    const ghAlpha = gh.opacity * (0.7 + g.ghostFlash * 0.5);
    const sg = ctx.createRadialGradient(gx, gy, 0, gx, gy, TILE * 2.2);
    sg.addColorStop(0, `rgba(140,225,255,${0.22 * ghAlpha})`);
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(gx - TILE * 2.3, gy - TILE * 2.3, TILE * 4.6, TILE * 4.6);
    // scanline flicker
    ctx.globalAlpha = 0.18 * ghAlpha;
    ctx.fillStyle = "#9fe8ff";
    for (let i = 0; i < 5; i++) {
      const yy = gy - 14 + ((t * 40 + i * 7) % 28);
      ctx.fillRect(gx - 7, yy, 14, 1);
    }
    ctx.restore();
    // The copy turns from cold cyan to hot white-red when it is standing on you.
    const onYou = Math.hypot(gh.fx - g.player.fx, gh.fy - g.player.fy) < 2.1;
    const hot = Math.max(0, Math.min(1, (g.conviction - 0.45) / 0.4)) * (onYou ? 1 : 0.35);
    const ghostColor = `rgb(${Math.round(189 + hot * 60)},${Math.round(240 - hot * 100)},${Math.round(255 - hot * 150)})`;
    drawFigure(ctx, gx, gy, 1, t * 9, 1.05, ghostColor, ghAlpha);
    if (hot > 0.35) {
      ctx.save();
      ctx.globalAlpha = (hot - 0.3) * 0.7;
      ctx.strokeStyle = "rgba(255,120,140,0.9)";
      ctx.lineWidth = 1.4;
      const rr = 12 + ((t * 30) % 16);
      ctx.beginPath();
      ctx.arc(gx, gy, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (gh.snapT < 1) {
      ctx.save();
      ctx.globalAlpha = (1 - gh.snapT) * 0.5;
      ctx.strokeStyle = "#dffaff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(gx, gy, 6 + (1 - gh.snapT) * 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ---- It ----
    const cx = g.creature.fx * TILE;
    const cy = g.creature.fy * TILE;
    // faint tether showing what it is actually chasing
    ctx.save();
    ctx.globalAlpha = 0.06 + g.conviction * 0.22;
    ctx.strokeStyle = "rgba(255,110,140,1)";
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(gx, gy);
    ctx.stroke();
    ctx.restore();

    const cAlpha = 0.55 + g.proximity * 0.45;
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, TILE * 2);
    cg.addColorStop(0, `rgba(120,20,45,${0.14 + g.conviction * 0.22})`);
    cg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cg;
    ctx.fillRect(cx - TILE * 2, cy - TILE * 2, TILE * 4, TILE * 4);
    drawCreature(ctx, cx, cy, t, cAlpha, g.creature.state);

    // ---- you ----
    const px = g.player.fx * TILE;
    const py = g.player.fy * TILE;
    // flashlight cone in the scene
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const fl = ctx.createRadialGradient(px, py, 0, px, py, TILE * 6.5);
    fl.addColorStop(0, "rgba(255,240,205,0.16)");
    fl.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fl;
    ctx.beginPath();
    ctx.moveTo(px, py);
    const dir = g.player.dir;
    const exx = px + DX[dir] * TILE * 6.5;
    const eyy = py + DY[dir] * TILE * 6.5;
    const perp = dir === 0 || dir === 2 ? { x: 1, y: 0 } : { x: 0, y: 1 };
    ctx.lineTo(exx + perp.x * TILE * 2.6, eyy + perp.y * TILE * 2.6);
    ctx.lineTo(exx - perp.x * TILE * 2.6, eyy - perp.y * TILE * 2.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    drawFigure(ctx, px, py, g.player.dir, g.player.bob, 1, "#e8eef7", 1);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#fff6e0";
    ctx.beginPath();
    ctx.arc(px, py - 2, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ---- darkness ----
    dctx.clearRect(0, 0, W, H);
    dctx.globalCompositeOperation = "source-over";
    dctx.fillStyle = `rgba(3,4,9,${0.86 - g.proximity * 0.06})`;
    dctx.fillRect(0, 0, W, H);
    dctx.globalCompositeOperation = "destination-out";
    hole(px, py, TILE * 3.1, 0.98);
    beam(px, py, g.player.dir, TILE * 7.2, TILE * 2.4, 0.92);
    hole(gx, gy, TILE * 2.6, 0.8);
    hole(cx, cy, TILE * 2.4, 0.72);
    for (const f of g.fuses) {
      if (f.taken) continue;
      hole((f.x + 0.5) * TILE, (f.y + 0.5) * TILE, TILE * 2.1, 0.8);
    }
    hole(ex, ey, TILE * (g.gateOpen ? 2.6 : 1.7), g.gateOpen ? 0.85 : 0.45);
    dctx.globalCompositeOperation = "source-over";
    ctx.drawImage(dark, 0, 0);

    // ---- grain, vignette, flashes ----
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.globalCompositeOperation = "overlay";
    const ox = Math.floor(Math.random() * 128);
    const oy = Math.floor(Math.random() * 128);
    for (let y = -oy; y < H; y += 128) for (let x = -ox; x < W; x += 128) ctx.drawImage(noise, x, y);
    ctx.restore();

    ctx.save();
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.82);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, `rgba(0,0,0,${0.72 + g.proximity * 0.2})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    if (g.proximity > 0.4) {
      ctx.fillStyle = `rgba(120,10,25,${(g.proximity - 0.4) * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (g.redFlash > 0) {
      ctx.fillStyle = `rgba(150,15,30,${g.redFlash * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (g.flash > 0) {
      ctx.fillStyle = `rgba(220,240,255,${g.flash * 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }
    // ---- the choice it has already made for you ----
    const ptile = { x: Math.floor(g.player.fx), y: Math.floor(g.player.fy) };
    const expectedHere = g.habit.predictDir(g.grid, ptile.x, ptile.y, g.habit.lastDir);
    ctx.save();
    for (const d of legalDirs(g.grid, ptile.x, ptile.y)) {
      const isExp = d === expectedHere;
      const cxp = (ptile.x + 0.5 + DX[d] * 0.82) * TILE;
      const cyp = (ptile.y + 0.5 + DY[d] * 0.82) * TILE;
      const ang = Math.atan2(DY[d], DX[d]);
      ctx.save();
      ctx.translate(cxp, cyp);
      ctx.rotate(ang);
      ctx.globalAlpha = isExp ? 0.9 : 0.16;
      ctx.strokeStyle = isExp ? "rgba(255,186,110,1)" : "rgba(200,210,230,1)";
      ctx.lineWidth = isExp ? 2.2 : 1.2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(-3.2, -4.2);
      ctx.lineTo(3.4, 0);
      ctx.lineTo(-3.2, 4.2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // ---- floating verdicts ----
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "600 9px ui-monospace, monospace";
    for (const p of g.pops) {
      const a = Math.max(0, 1 - p.t / 1.2);
      ctx.globalAlpha = a * 0.95;
      ctx.fillStyle = p.good ? "rgba(150,255,205,1)" : "rgba(255,140,160,1)";
      ctx.fillText(p.text, p.x * TILE, p.y * TILE - 20 - p.t * 16);
    }
    ctx.restore();

    ctx.restore();
    void dt;
  }

  return { draw };
}
