export interface Vec {
  x: number;
  y: number;
}

export interface Grid {
  cols: number;
  rows: number;
  cells: Uint8Array; // 1 = wall, 0 = floor
}

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const DIRNAME = ["N", "E", "S", "W"];
export const OPPOSITE = [2, 3, 0, 1];

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeGrid(cols: number, rows: number): Grid {
  return { cols, rows, cells: new Uint8Array(cols * rows).fill(1) };
}

export function inBounds(g: Grid, x: number, y: number) {
  return x >= 0 && y >= 0 && x < g.cols && y < g.rows;
}

export function isWall(g: Grid, x: number, y: number) {
  if (!inBounds(g, x, y)) return true;
  return g.cells[y * g.cols + x] === 1;
}

export function isFloor(g: Grid, x: number, y: number) {
  return !isWall(g, x, y);
}

export function carve(g: Grid, x: number, y: number) {
  if (inBounds(g, x, y)) g.cells[y * g.cols + x] = 0;
}

export function legalDirs(g: Grid, x: number, y: number): number[] {
  const out: number[] = [];
  for (let d = 0; d < 4; d++) {
    if (isFloor(g, x + DX[d], y + DY[d])) out.push(d);
  }
  return out;
}

/** Real choices: legal moves that aren't simply walking back the way you came. */
export function realChoices(g: Grid, x: number, y: number, lastDir: number | null): number[] {
  const legal = legalDirs(g, x, y);
  if (lastDir === null) return legal;
  const back = OPPOSITE[lastDir];
  const filtered = legal.filter((d) => d !== back);
  return filtered.length > 0 ? filtered : legal;
}

export function dist(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Breadth-first distance field from a tile. -1 = unreachable. */
export function distanceField(g: Grid, from: Vec): Int32Array {
  const n = g.cols * g.rows;
  const d = new Int32Array(n).fill(-1);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const s = from.y * g.cols + from.x;
  d[s] = 0;
  q[tail++] = s;
  while (head < tail) {
    const cur = q[head++];
    const cx = cur % g.cols;
    const cy = (cur - cx) / g.cols;
    const cd = d[cur];
    for (let k = 0; k < 4; k++) {
      const nx = cx + DX[k];
      const ny = cy + DY[k];
      if (!inBounds(g, nx, ny)) continue;
      const ni = ny * g.cols + nx;
      if (g.cells[ni] === 1) continue;
      if (d[ni] !== -1) continue;
      d[ni] = cd + 1;
      q[tail++] = ni;
    }
  }
  return d;
}

/** Path from `from` to `to` (excluding `from`, including `to`). Empty if unreachable. */
export function bfsPath(g: Grid, from: Vec, to: Vec): Vec[] {
  const n = g.cols * g.rows;
  const prev = new Int32Array(n).fill(-2);
  const seen = new Uint8Array(n);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const s = from.y * g.cols + from.x;
  const goal = to.y * g.cols + to.x;
  seen[s] = 1;
  q[tail++] = s;
  let found = s === goal;
  while (head < tail && !found) {
    const cur = q[head++];
    const cx = cur % g.cols;
    const cy = (cur - cx) / g.cols;
    for (let k = 0; k < 4; k++) {
      const nx = cx + DX[k];
      const ny = cy + DY[k];
      if (!inBounds(g, nx, ny)) continue;
      const ni = ny * g.cols + nx;
      if (g.cells[ni] === 1 || seen[ni]) continue;
      seen[ni] = 1;
      prev[ni] = cur;
      q[tail++] = ni;
      if (ni === goal) {
        found = true;
        break;
      }
    }
  }
  if (!found) return [];
  const path: Vec[] = [];
  let cur = goal;
  while (cur !== s && cur >= 0) {
    const cx = cur % g.cols;
    const cy = (cur - cx) / g.cols;
    path.push({ x: cx, y: cy });
    cur = prev[cur];
  }
  path.reverse();
  return path;
}

/**
 * Maze built from a perfect maze (recursive backtracker) that is then "braided"
 * — dead ends are opened up so the level is full of loops. Loops are the whole
 * game: you need somewhere to double back and vanish.
 */
export function generateMaze(cols: number, rows: number, seed: number): Grid {
  const rnd = mulberry32(seed);
  const g = makeGrid(cols, rows);
  const stack: Vec[] = [];
  let cx = 1;
  let cy = 1;
  carve(g, cx, cy);
  stack.push({ x: cx, y: cy });
  const visited = new Uint8Array(cols * rows);

  while (stack.length) {
    const cur = stack[stack.length - 1];
    cx = cur.x;
    cy = cur.y;
    const options: number[] = [];
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d] * 2;
      const ny = cy + DY[d] * 2;
      if (inBounds(g, nx, ny) && ny % 2 === 1 && nx % 2 === 1 && g.cells[ny * cols + nx] === 1) {
        options.push(d);
      }
    }
    if (!options.length) {
      stack.pop();
      continue;
    }
    const d = options[Math.floor(rnd() * options.length)];
    carve(g, cx + DX[d], cy + DY[d]);
    carve(g, cx + DX[d] * 2, cy + DY[d] * 2);
    stack.push({ x: cx + DX[d] * 2, y: cy + DY[d] * 2 });
    visited[cy * cols + cx] = 1;
  }

  // Braid: knock open walls at dead ends so the maze loops.
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      if (isWall(g, x, y)) continue;
      const legal = legalDirs(g, x, y);
      if (legal.length > 1) continue;
      if (rnd() > 0.62) continue;
      const cand: number[] = [];
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        const ox = x + DX[d] * 2;
        const oy = y + DY[d] * 2;
        if (!inBounds(g, ox, oy)) continue;
        if (isWall(g, nx, ny) && isFloor(g, ox, oy) && ox > 0 && oy > 0 && ox < cols - 1 && oy < rows - 1) {
          cand.push(d);
        }
      }
      if (cand.length) {
        const d = cand[Math.floor(rnd() * cand.length)];
        carve(g, x + DX[d], y + DY[d]);
      }
    }
  }

  // A few open chambers — good places to break line of thought.
  const chambers = 5;
  for (let i = 0; i < chambers; i++) {
    const w = 3 + Math.floor(rnd() * 3);
    const h = 3 + Math.floor(rnd() * 2);
    const x0 = 2 + Math.floor(rnd() * (cols - w - 4));
    const y0 = 2 + Math.floor(rnd() * (rows - h - 4));
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) carve(g, x, y);
  }

  // Solid border.
  for (let x = 0; x < cols; x++) {
    g.cells[x] = 1;
    g.cells[(rows - 1) * cols + x] = 1;
  }
  for (let y = 0; y < rows; y++) {
    g.cells[y * cols] = 1;
    g.cells[y * cols + cols - 1] = 1;
  }
  return g;
}

export function randomFloor(g: Grid, rnd: () => number): Vec {
  for (let i = 0; i < 4000; i++) {
    const x = 1 + Math.floor(rnd() * (g.cols - 2));
    const y = 1 + Math.floor(rnd() * (g.rows - 2));
    if (isFloor(g, x, y)) return { x, y };
  }
  return { x: 1, y: 1 };
}

/** Pick `count` spread-out floor tiles, far from `from` and from each other. */
export function pickSpread(g: Grid, from: Vec, count: number, rnd: () => number, minSep: number): Vec[] {
  const df = distanceField(g, from);
  const pool: Vec[] = [];
  for (let y = 1; y < g.rows - 1; y++) {
    for (let x = 1; x < g.cols - 1; x++) {
      if (isFloor(g, x, y) && df[y * g.cols + x] > 6) pool.push({ x, y });
    }
  }
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const chosen: Vec[] = [];
  let sep = minSep;
  while (chosen.length < count && sep > 2) {
    for (const p of pool) {
      if (chosen.length >= count) break;
      const ok = chosen.every((c) => Math.abs(c.x - p.x) + Math.abs(c.y - p.y) >= sep);
      if (ok) chosen.push(p);
    }
    sep -= 2;
  }
  return chosen;
}
