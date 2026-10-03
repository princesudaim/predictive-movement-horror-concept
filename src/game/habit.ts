import { DX, DY, Grid, legalDirs, OPPOSITE } from "./grid";

/**
 * The creature's model of *you*. It never sees where you are — it only knows
 * what you tend to do. Every step you take is folded into this table, and the
 * pale copy runs the route this table says you'd take.
 */
export class HabitModel {
  /** Absolute direction preference (N, E, S, W). */
  dirW = [1, 1, 1, 1];
  /** Markov table: given the direction you were already moving, what next. */
  contW: number[][] = [
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
  ];
  /** Global bias toward moving rather than standing still. */
  moveW = [1, 1];
  lastDir: number | null = null;
  steps = 0;
  stops = 0;
  decay = 0.93;

  record(dir: number) {
    this.decayAll();
    this.dirW[dir] += 1;
    if (this.lastDir !== null) this.contW[this.lastDir][dir] += 1;
    this.moveW[0] += 1; // moved
    this.lastDir = dir;
    this.steps++;
  }

  recordStop() {
    this.decayAll();
    this.moveW[1] += 1;
    this.stops++;
  }

  private decayAll() {
    const d = this.decay;
    for (let i = 0; i < 4; i++) {
      this.dirW[i] *= d;
      for (let j = 0; j < 4; j++) this.contW[i][j] *= d;
    }
    this.moveW[0] *= d;
    this.moveW[1] *= d;
  }

  score(d: number, lastDir: number | null) {
    let s = this.dirW[d] * 1.0;
    if (lastDir !== null) s += this.contW[lastDir][d] * 1.45;
    if (lastDir !== null && d === lastDir) s += 0.35;
    if (lastDir !== null && d === OPPOSITE[lastDir]) s -= 0.25;
    return s;
  }

  /**
   * The single most likely direction out of `x,y` for the person you have
   * been so far. Deterministic on purpose: you can always read its guess.
   */
  predictDir(g: Grid, x: number, y: number, lastDir: number | null): number | null {
    const legal = legalDirs(g, x, y);
    if (!legal.length) return null;
    let best = legal[0];
    let bestScore = -Infinity;
    for (const d of legal) {
      const s = this.score(d, lastDir);
      if (s > bestScore + 1e-9) {
        bestScore = s;
        best = d;
      }
    }
    return best;
  }

  /** Roll the habit model forward into a full most-likely route. */
  predictRoute(
    g: Grid,
    start: { x: number; y: number },
    len: number,
    startLast: number | null = this.lastDir
  ) {
    const route: { x: number; y: number; d: number }[] = [];
    let cx = start.x;
    let cy = start.y;
    let simLast = startLast;
    let prev: { x: number; y: number } | null = null;
    for (let i = 0; i < len; i++) {
      let legal = legalDirs(g, cx, cy);
      if (legal.length > 1 && prev) {
        const filtered = legal.filter((d) => !(cx + DX[d] === prev!.x && cy + DY[d] === prev!.y));
        if (filtered.length) legal = filtered;
      }
      if (!legal.length) break;
      let best = legal[0];
      let bestScore = -Infinity;
      for (const d of legal) {
        const s = this.score(d, simLast);
        if (s > bestScore + 1e-9) {
          bestScore = s;
          best = d;
        }
      }
      const nx = cx + DX[best];
      const ny = cy + DY[best];
      route.push({ x: nx, y: ny, d: best });
      prev = { x: cx, y: cy };
      cx = nx;
      cy = ny;
      simLast = best;
    }
    return route;
  }

  moveBias() {
    const t = this.moveW[0] + this.moveW[1];
    return this.moveW[0] / t;
  }

  normalisedDirs() {
    const t = this.dirW.reduce((a, b) => a + b, 0) || 1;
    return this.dirW.map((v) => v / t);
  }

  normalisedCont() {
    return this.contW.map((row) => {
      const t = row.reduce((a, b) => a + b, 0) || 1;
      return row.map((v) => v / t);
    });
  }
}
