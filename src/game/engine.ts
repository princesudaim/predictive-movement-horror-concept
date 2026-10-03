import {
  bfsPath,
  distanceField,
  dist,
  DX,
  DY,
  generateMaze,
  Grid,
  isFloor,
  legalDirs,
  mulberry32,
  pickSpread,
  randomFloor,
  realChoices,
  Vec,
} from "./grid";
import { HabitModel } from "./habit";

export type Screen = "title" | "playing" | "caught" | "won";
export type CreatureState = "hunt" | "search" | "listen";

export interface Threat {
  id: "calm" | "standard" | "relentless";
  label: string;
  locked: number;
  search: number;
  listen: number;
  note: string;
}

export const THREATS: Threat[] = [
  { id: "calm", label: "Wandering", locked: 4.5, search: 2.2, listen: 8.5, note: "It is barely paying attention." },
  { id: "standard", label: "Attentive", locked: 5.8, search: 2.8, listen: 6.5, note: "It knows the shape of a person." },
  { id: "relentless", label: "Learned", locked: 6.8, search: 3.4, listen: 5.0, note: "It has your gait memorised." },
];

export const COLS = 35;
export const ROWS = 23;

export interface Fuse extends Vec {
  taken: boolean;
  phase: number;
}

export interface LogLine {
  text: string;
  t: number;
  kind: "info" | "danger" | "good";
}

/** Little floating verdicts above your head: the game telling you what it scored. */
export interface Pop {
  x: number;
  y: number;
  text: string;
  good: boolean;
  t: number;
}

export interface Game {
  screen: Screen;
  threat: Threat;
  grid: Grid;
  rnd: () => number;
  time: number;
  runTime: number;

  player: {
    x: number;
    y: number;
    fromX: number;
    fromY: number;
    t: number;
    fx: number;
    fy: number;
    dir: number;
    stepDur: number;
    stillFor: number;
    bob: number;
    creeping: boolean;
  };
  creature: {
    fx: number;
    fy: number;
    dir: number;
    state: CreatureState;
    path: Vec[];
    pathTimer: number;
    stateTimer: number;
    target: Vec;
    wobble: number;
  };
  ghost: {
    fx: number;
    fy: number;
    anchor: Vec;
    route: { x: number; y: number; d: number }[];
    segT: number;
    snapT: number;
    snapFrom: { x: number; y: number };
    opacity: number;
  };

  habit: HabitModel;
  readability: number;
  conviction: number;
  unreadableStreak: number;

  fuses: Fuse[];
  fusesTaken: number;
  exit: Vec;
  gateOpen: boolean;

  caughtCount: number;
  log: LogLine[];
  pops: Pop[];
  hint: string;
  hintTimer: number;
  listenTimer: number;
  shake: number;
  flash: number;
  redFlash: number;
  ghostFlash: number;
  proximity: number;
  lastCatchText: string;
  frozen: number;
  tutorialStage: number;
}

export interface Input {
  dirs: boolean[];
  creep: boolean;
}

const PLAYER_STEP = 0.165;
const CREEP_STEP = 0.3;
const GHOST_PACE = 5.0;
const ROUTE_LEN = 14;
const CATCH_RADIUS = 0.82;

function ease(t: number) {
  return t * t * (3 - 2 * t);
}

export function createGame(threat: Threat, seed = Math.floor(Math.random() * 1e9)): Game {
  const rnd = mulberry32(seed);
  const grid = generateMaze(COLS, ROWS, seed);

  // Player start: a floor tile near the middle-left.
  let start: Vec = { x: 1, y: 1 };
  outer: for (let y = 3; y < ROWS - 3; y++) {
    for (let x = 3; x < 10; x++) {
      if (isFloor(grid, x, y) && legalDirs(grid, x, y).length >= 3) {
        start = { x, y };
        break outer;
      }
    }
  }

  const df = distanceField(grid, start);
  // Exit: the farthest reachable tile.
  let exit = start;
  let best = -1;
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      const d = df[y * COLS + x];
      if (d > best) {
        best = d;
        exit = { x, y };
      }
    }
  }

  const fuseTiles = pickSpread(grid, start, 3, rnd, 11).filter(
    (t) => Math.abs(t.x - exit.x) + Math.abs(t.y - exit.y) > 3
  );
  while (fuseTiles.length < 3) fuseTiles.push(randomFloor(grid, rnd));
  const fuses: Fuse[] = fuseTiles.slice(0, 3).map((t, i) => ({ ...t, taken: false, phase: i * 1.7 }));

  // Creature starts far from you.
  let cs = start;
  let cbest = -1;
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      const d = df[y * COLS + x];
      if (d > cbest) {
        cbest = d;
        cs = { x, y };
      }
    }
  }
  if (dist(cs, exit) < 3) cs = randomFloor(grid, rnd);

  const game: Game = {
    screen: "title",
    threat,
    grid,
    rnd,
    time: 0,
    runTime: 0,
    player: {
      x: start.x,
      y: start.y,
      fromX: start.x,
      fromY: start.y,
      t: 1,
      fx: start.x + 0.5,
      fy: start.y + 0.5,
      dir: 1,
      stepDur: PLAYER_STEP,
      stillFor: 0,
      bob: 0,
      creeping: false,
    },
    creature: {
      fx: cs.x + 0.5,
      fy: cs.y + 0.5,
      dir: 0,
      state: "hunt",
      path: [],
      pathTimer: 0,
      stateTimer: 0,
      target: { ...start },
      wobble: 0,
    },
    ghost: {
      fx: start.x + 0.5,
      fy: start.y + 0.5,
      anchor: { ...start },
      route: [],
      segT: 0,
      snapT: 1,
      snapFrom: { x: start.x + 0.5, y: start.y + 0.5 },
      opacity: 0.55,
    },
    habit: new HabitModel(),
    readability: 0.3,
    conviction: 0.3,
    unreadableStreak: 0,
    fuses,
    fusesTaken: 0,
    exit,
    gateOpen: false,
    caughtCount: 0,
    log: [],
    pops: [],
    hint: "",
    hintTimer: 0,
    listenTimer: threat.listen,
    shake: 0,
    flash: 0,
    redFlash: 0,
    ghostFlash: 0,
    proximity: 0,
    lastCatchText: "",
    frozen: 0,
    tutorialStage: 0,
  };
  extendRoute(game);
  return game;
}

function pop(g: Game, text: string, good: boolean, x?: number, y?: number) {
  g.pops.push({
    x: x ?? g.player.fx,
    y: y ?? g.player.fy,
    text,
    good,
    t: 0,
  });
  if (g.pops.length > 9) g.pops.shift();
}

function log(g: Game, text: string, kind: LogLine["kind"] = "info") {
  const last = g.log[0];
  if (last && last.text === text) return;
  g.log.unshift({ text, t: g.runTime, kind });
  if (g.log.length > 6) g.log.pop();
}

function extendRoute(g: Game) {
  const gh = g.ghost;
  let guard = 0;
  while (gh.route.length < ROUTE_LEN && guard++ < 12) {
    const last = gh.route.length ? gh.route[gh.route.length - 1] : null;
    const from = last ? { x: last.x, y: last.y } : gh.anchor;
    const startLast = last ? last.d : g.habit.lastDir;
    const more = g.habit.predictRoute(g.grid, from, ROUTE_LEN - gh.route.length, startLast);
    if (!more.length) break;
    for (const m of more) gh.route.push(m);
  }
}

/** Snap the creature's belief back onto you — this is what being readable costs. */
function reanchor(g: Game, tile: Vec, hard: boolean) {
  const gh = g.ghost;
  gh.snapFrom = { x: gh.fx, y: gh.fy };
  gh.anchor = { x: tile.x, y: tile.y };
  gh.segT = 0;
  gh.snapT = 0;
  gh.route = [];
  extendRoute(g);
  if (hard) {
    g.ghostFlash = Math.max(g.ghostFlash, 0.5);
  }
}

function pickSearchTarget(g: Game): Vec {
  const c = { x: Math.floor(g.creature.fx), y: Math.floor(g.creature.fy) };
  for (let i = 0; i < 60; i++) {
    const p = randomFloor(g.grid, g.rnd);
    const d = dist(p, c);
    if (d > 4 && d < 14) return p;
  }
  return randomFloor(g.grid, g.rnd);
}

function onStepComplete(g: Game, fromX: number, fromY: number, dir: number) {
  const prevLast = g.habit.lastDir;
  const expected = g.habit.predictDir(g.grid, fromX, fromY, prevLast);
  const choices = realChoices(g.grid, fromX, fromY, prevLast);
  const atJunction = choices.length >= 2;
  const creeping = g.player.creeping;
  g.habit.record(dir);

  const matched = expected !== null && dir === expected;
  if (matched) {
    g.unreadableStreak = 0;
    if (atJunction) {
      g.readability = Math.min(1, g.readability + (creeping ? 0.11 : 0.17));
      reanchor(g, { x: g.player.x, y: g.player.y }, g.conviction > 0.35);
      pop(g, "THAT'S YOU", false);
      if (g.conviction > 0.55) log(g, "You turned the way you always turn.", "danger");
    } else {
      g.readability = Math.min(1, g.readability + (creeping ? 0.028 : 0.055));
      // Corridors are loud — but only if it already knows who it is hearing.
      if (g.conviction > (creeping ? 0.66 : 0.45)) {
        reanchor(g, { x: fromX, y: fromY }, false);
        pop(g, "footsteps", false);
      }
    }
  } else {
    g.readability = Math.max(0, g.readability - (atJunction ? 0.155 : 0.05));
    if (atJunction) pop(g, "NOT YOU", true);
    g.unreadableStreak++;
    if (atJunction && g.unreadableStreak === 1) log(g, "You took the path you never take.", "good");
    if (atJunction && g.unreadableStreak === 5) log(g, "It is following someone who isn't here.", "good");
  }
}

function updatePlayer(g: Game, dt: number, input: Input) {
  const p = g.player;
  p.stepDur = input.creep ? CREEP_STEP : PLAYER_STEP;

  if (p.t < 1) {
    p.t = Math.min(1, p.t + dt / p.stepDur);
    if (p.t >= 1) {
      p.x = p.fromX + DX[p.dir];
      p.y = p.fromY + DY[p.dir];
      onStepComplete(g, p.fromX, p.fromY, p.dir);
    }
  }

  if (p.t >= 1) {
    p.x = p.fromX + DX[p.dir];
    p.y = p.fromY + DY[p.dir];
    let chosen = -1;
    if (input.dirs[p.dir]) chosen = p.dir;
    else for (let d = 0; d < 4; d++) if (input.dirs[d]) chosen = d;
    if (chosen >= 0 && isFloor(g.grid, p.x + DX[chosen], p.y + DY[chosen])) {
      p.fromX = p.x;
      p.fromY = p.y;
      p.dir = chosen;
      p.t = 0;
      p.stillFor = 0;
      p.creeping = input.creep;
      p.x = p.fromX + DX[chosen];
      p.y = p.fromY + DY[chosen];
    } else {
      p.stillFor += dt;
    }
  }

  const e = ease(p.t);
  const targetX = p.fromX + (p.x - p.fromX) * e + 0.5;
  const targetY = p.fromY + (p.y - p.fromY) * e + 0.5;
  p.fx += (targetX - p.fx) * Math.min(1, dt * 26);
  p.fy += (targetY - p.fy) * Math.min(1, dt * 26);
  p.bob += dt * (p.t < 1 ? 13 : 2.2);

  // Standing still is only unpredictable if you are usually a mover.
  if (p.stillFor > 0.55 && p.t >= 1) {
    const wasStill = p.stillFor - dt <= 0.55;
    if (wasStill) {
      g.habit.recordStop();
      if (g.habit.moveBias() > 0.55) {
        g.readability = Math.max(0, g.readability - 0.07);
      }
    }
  }
}

function updateGhost(g: Game, dt: number) {
  const gh = g.ghost;
  extendRoute(g);

  if (gh.snapT < 1) {
    gh.snapT = Math.min(1, gh.snapT + dt / 0.32);
    const e = ease(gh.snapT);
    gh.fx = gh.snapFrom.x + (g.player.fx - gh.snapFrom.x) * e;
    gh.fy = gh.snapFrom.y + (g.player.fy - gh.snapFrom.y) * e;
    gh.opacity += (0.95 - gh.opacity) * Math.min(1, dt * 8);
    return;
  }

  if (!gh.route.length) {
    extendRoute(g);
    if (!gh.route.length) return;
  }
  gh.segT += GHOST_PACE * dt;
  while (gh.segT >= 1 && gh.route.length) {
    gh.anchor = { x: gh.route[0].x, y: gh.route[0].y };
    gh.route.shift();
    gh.segT -= 1;
    extendRoute(g);
  }
  if (!gh.route.length) {
    gh.segT = 0;
    return;
  }
  const a = gh.anchor;
  const b = gh.route[0];
  const e = ease(Math.min(1, gh.segT));
  const tx = a.x + (b.x - a.x) * e + 0.5;
  const ty = a.y + (b.y - a.y) * e + 0.5;
  gh.fx += (tx - gh.fx) * Math.min(1, dt * 18);
  gh.fy += (ty - gh.fy) * Math.min(1, dt * 18);
  const targetOpacity = g.creature.state === "search" ? 0.28 : 0.6;
  gh.opacity += (targetOpacity - gh.opacity) * Math.min(1, dt * 3);
}

function updateCreature(g: Game, dt: number) {
  const c = g.creature;
  const gh = g.ghost;
  c.wobble += dt;

  const creatureTile = { x: Math.floor(c.fx), y: Math.floor(c.fy) };
  let targetTile = { x: Math.floor(gh.fx), y: Math.floor(gh.fy) };
  let speed =
    g.threat.search + (g.threat.locked + g.caughtCount * 0.22 - g.threat.search) * g.conviction;

  if (c.state === "search") {
    targetTile = c.target;
    speed = g.threat.search * 0.95;
    c.stateTimer -= dt;
    if (Math.hypot(c.target.x + 0.5 - c.fx, c.target.y + 0.5 - c.fy) < 1.2 || c.stateTimer <= 0) {
      c.state = "hunt";
      c.target = { x: Math.floor(gh.fx), y: Math.floor(gh.fy) };
      log(g, "It stops. It listens. Nothing moves the way you would.", "info");
      g.readability = Math.max(0, g.readability - 0.12);
    }
  } else {
    // Did it reach the guess, only to find nobody there?
    const dGhost = Math.hypot(gh.fx - c.fx, gh.fy - c.fy);
    const dYou = Math.hypot(g.player.fx - gh.fx, g.player.fy - gh.fy);
    if (dGhost < 1.15 && dYou > 4.2) {
      c.state = "search";
      c.stateTimer = 3.6;
      c.target = pickSearchTarget(g);
      log(g, "It reaches for who you were — and closes on nothing.", "good");
      g.readability = Math.max(0, g.readability - 0.2);
      g.flash = 0.4;
    }
  }

  c.pathTimer -= dt;
  const targetMoved = Math.hypot(targetTile.x - c.target.x, targetTile.y - c.target.y);
  if (c.pathTimer <= 0 || targetMoved > 0.01) {
    c.path = bfsPath(g.grid, creatureTile, targetTile);
    c.pathTimer = 0.2;
    c.target = { ...targetTile };
  }

  let remaining = dt * Math.max(0.2, speed);
  let guard = 0;
  while (remaining > 0 && c.path.length && guard++ < 40) {
    const next = c.path[0];
    const nx = next.x + 0.5;
    const ny = next.y + 0.5;
    const dx = nx - c.fx;
    const dy = ny - c.fy;
    const d = Math.hypot(dx, dy) || 1e-6;
    if (remaining >= d) {
      c.fx = nx;
      c.fy = ny;
      c.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
      c.path.shift();
      remaining -= d;
    } else {
      c.fx += (dx / d) * remaining;
      c.fy += (dy / d) * remaining;
      c.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
      remaining = 0;
    }
  }
  if (!c.path.length) {
    // Same tile as its guess: just lean toward it rather than freezing.
    c.pathTimer = 0;
    const dx = targetTile.x + 0.5 - c.fx;
    const dy = targetTile.y + 0.5 - c.fy;
    const d = Math.hypot(dx, dy);
    if (d > 0.06 && d < 1.6) {
      const step = dt * speed * 0.7;
      c.fx += (dx / d) * step;
      c.fy += (dy / d) * step;
    }
  }
}

export function update(g: Game, dt: number, input: Input) {
  g.time += dt;
  g.shake = Math.max(0, g.shake - dt * 2.6);
  g.flash = Math.max(0, g.flash - dt * 2.2);
  g.redFlash = Math.max(0, g.redFlash - dt * 1.6);
  g.ghostFlash = Math.max(0, g.ghostFlash - dt * 2.0);
  for (let i = g.pops.length - 1; i >= 0; i--) {
    g.pops[i].t += dt;
    if (g.pops[i].t > 1.2) g.pops.splice(i, 1);
  }

  if (g.screen === "caught" || g.screen === "won") {
    g.frozen -= dt;
    updateCreature(g, dt * 0.15);
    return;
  }
  if (g.screen !== "playing") {
    // Idle title-screen drift: it hunts the guess even before you begin.
    updateGhost(g, dt * 0.5);
    updateCreature(g, dt * 0.5);
    return;
  }

  g.runTime += dt;
  updatePlayer(g, dt, input);
  updateGhost(g, dt);
  updateCreature(g, dt);

  // Conviction is the smoothed read on you; it drives Its speed.
  const target = g.readability;
  g.conviction += (target - g.conviction) * Math.min(1, dt * 1.1);
  g.readability = Math.max(0, g.readability - dt * 0.022);

  const dYou = Math.hypot(g.player.fx - g.creature.fx, g.player.fy - g.creature.fy);
  g.proximity = Math.max(0, Math.min(1, 1 - (dYou - 1) / 11));
  if (dYou < 3.2) g.shake = Math.max(g.shake, 0.12 + (3.2 - dYou) * 0.06);

  // The periodic "listen": if you have been yourself lately, it places you.
  g.listenTimer -= dt;
  if (g.listenTimer <= 0) {
    g.listenTimer = g.threat.listen;
    if (g.readability > 0.5) {
      reanchor(g, { x: g.player.x, y: g.player.y }, true);
      log(g, "It listens — and hears someone walking exactly like you.", "danger");
      pop(g, "IT PLACES YOU", false);
      g.redFlash = 0.5;
    } else if (g.readability < 0.24) {
      log(g, "It listens. Your footsteps don't add up to a person.", "good");
    }
  }

  // Pickups
  for (const f of g.fuses) {
    if (f.taken) continue;
    if (Math.hypot(g.player.fx - (f.x + 0.5), g.player.fy - (f.y + 0.5)) < 0.7) {
      f.taken = true;
      g.fusesTaken++;
      g.flash = 0.55;
      pop(g, g.fusesTaken >= g.fuses.length ? "GATE LIVE" : "RELAY", true, f.x + 0.5, f.y + 0.5);
      if (g.fusesTaken >= g.fuses.length) {
        g.gateOpen = true;
        log(g, "Last relay pulled. The gate has power. RUN.", "good");
      } else {
        log(g, `Relay secured. ${g.fuses.length - g.fusesTaken} left.`, "good");
      }
    }
  }

  // Win
  if (g.gateOpen && Math.hypot(g.player.fx - (g.exit.x + 0.5), g.player.fy - (g.exit.y + 0.5)) < 0.75) {
    g.screen = "won";
    g.frozen = 0;
    g.flash = 1;
    return;
  }

  // Caught
  if (dYou < CATCH_RADIUS) {
    catchPlayer(g);
  }

  // Coaching
  g.hintTimer -= dt;
  if (g.hintTimer <= 0) {
    g.hintTimer = 1.1;
    const ghOnYou = Math.hypot(g.player.fx - g.ghost.fx, g.player.fy - g.ghost.fy) < 1.4;
    if (g.tutorialStage === 0 && g.runTime > 0.6) {
      g.hint = "WASD / arrows to walk. The pale one is where It believes you are.";
      if (g.runTime > 6) g.tutorialStage = 1;
    } else if (ghOnYou && g.conviction > 0.5) {
      g.hint = "IT HAS YOU. The copy is standing on you — stop being predictable, right now.";
    } else if (g.readability > 0.7) {
      g.hint = "You're legible. Turn around. Take the wrong way. Stand still.";
    } else if (g.creature.state === "search") {
      g.hint = "It's searching a guess. Move away from the pale route, not just away from It.";
    } else if (g.conviction < 0.3) {
      g.hint = "You're a stranger to it. Creep where you like — but don't get tidy.";
    } else if (!g.gateOpen) {
      g.hint = "Pull the three relays. Going straight for them is the most you thing you could do.";
    } else {
      g.hint = "Gate is live. It expects you to beeline. So don't.";
    }
  }
}

const CATCH_LINES = [
  "It caught up with who you were.",
  "You walked like yourself, and it was waiting.",
  "Your habits walked you into its hands.",
  "It didn't find you. It found your pattern.",
];

export function catchPlayer(g: Game) {
  g.screen = "caught";
  g.frozen = 0;
  g.caughtCount++;
  g.lastCatchText = CATCH_LINES[g.caughtCount % CATCH_LINES.length];
  g.shake = 1;
  g.redFlash = 1;
  log(g, g.lastCatchText, "danger");
}

/** Caught is not death. The chase restarts; It simply starts learning again. */
export function restartChase(g: Game) {
  const df = distanceField(g.grid, { x: g.player.x, y: g.player.y });
  let spot: Vec = { x: g.player.x, y: g.player.y };
  let best = -1;
  for (let i = 0; i < 200; i++) {
    const p = randomFloor(g.grid, g.rnd);
    const d = df[p.y * COLS + p.x];
    if (d > best && d > 6) {
      best = d;
      spot = p;
    }
  }
  g.creature.fx = spot.x + 0.5;
  g.creature.fy = spot.y + 0.5;
  g.creature.path = [];
  g.creature.state = "hunt";
  g.creature.stateTimer = 0;
  g.readability = 0.16;
  g.conviction = 0.16;
  g.unreadableStreak = 0;
  g.habit.lastDir = null;
  // It goes back to guessing from a stale footprint near you.
  const dfc = distanceField(g.grid, spot);
  const cands: Vec[] = [];
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      const d = dfc[y * COLS + x];
      if (d > 3 && d < 9) cands.push({ x, y });
    }
  }
  const anchor = cands.length ? cands[Math.floor(g.rnd() * cands.length)] : { x: g.player.x, y: g.player.y };
  g.ghost.anchor = { ...anchor };
  g.ghost.fx = anchor.x + 0.5;
  g.ghost.fy = anchor.y + 0.5;
  g.ghost.route = [];
  g.ghost.segT = 0;
  g.ghost.snapT = 1;
  extendRoute(g);
  g.listenTimer = g.threat.listen;
  g.screen = "playing";
  log(g, "It loses the thread of you. Again, from the top.", "info");
}

export function startRun(g: Game) {
  g.screen = "playing";
  g.runTime = 0;
  log(g, "It is somewhere in here, listening for a pattern.", "danger");
}
