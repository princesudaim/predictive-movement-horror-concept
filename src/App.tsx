import { useCallback, useRef, useState } from "react";
import GameCanvas from "./components/GameCanvas";
import HUD, { TouchPad, type Snapshot } from "./components/HUD";
import { createGame, Game, Input, restartChase, startRun, THREATS } from "./game/engine";
import { sound } from "./game/audio";

const RULES = [
  ["You can always see its guess.", "The pale copy is where it believes you are right now, and the dotted line is the route it expects. Read it. That's the whole puzzle."],
  ["Corridors are loud.", "It hears footsteps in a hallway — but only if it already knows who it's listening for. Junctions are where you actually get to lie."],
  ["Break your own habits.", "The amber chevron at your feet is the way it expects you to go. Stop dead, double back, take the stupid route. You are invisible exactly as long as you are unrecognisable."],
];

export default function App() {
  const [game, setGame] = useState<Game>(() => createGame(THREATS[1]));
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [threatId, setThreatId] = useState<"calm" | "standard" | "relentless">("standard");
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<Input>({ dirs: [false, false, false, false], creep: false });

  const onSnapshot = useCallback((s: Snapshot) => setSnap(s), []);
  const beginRun = useCallback(
    (id: typeof threatId) => {
      const t = THREATS.find((x) => x.id === id) ?? THREATS[1];
      sound.resume();
      const g = createGame(t);
      startRun(g);
      setGame(g);
    },
    []
  );
  const onNewRun = useCallback(() => beginRun(threatId), [beginRun, threatId]);

  const s: Snapshot =
    snap ??
    {
      screen: game.screen,
      runTime: 0,
      fusesTaken: 0,
      fusesTotal: game.fuses.length,
      gateOpen: false,
      readability: 0.3,
      conviction: 0.3,
      creatureState: "hunt",
      proximity: 0,
      creatureDist: 20,
      ghostDist: 20,
      caughtCount: 0,
      hint: "",
      log: [],
      dirs: [0.25, 0.25, 0.25, 0.25],
      moveBias: 0.5,
      lastDir: null,
      threat: game.threat.label,
      restartIn: 0,
      creep: false,
      lastCatchText: "",
    };

  const setTouch = (d: number | null) => {
    if (d === null) inputRef.current.dirs = [false, false, false, false];
    else inputRef.current.dirs = [d === 0, d === 1, d === 2, d === 3];
  };

  return (
    <div className="min-h-screen bg-[#05060a] text-zinc-200 [background-image:radial-gradient(circle_at_50%_0%,rgba(60,80,120,0.10),transparent_60%)]">
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-5">
        <HUD s={s}>
          <div className="relative overflow-hidden rounded-md ring-1 ring-white/10">
            <GameCanvas game={game} input={inputRef} onSnapshot={onSnapshot} onNewRun={onNewRun} />

            {/* ---------- CAUGHT ---------- */}
            {s.screen === "caught" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-black/80 via-[#280008]/85 to-black/90 px-6 text-center backdrop-blur-[2px]">
                <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-rose-400/70">
                  contact
                </div>
                <div className="max-w-md text-2xl font-semibold leading-snug text-rose-100 sm:text-3xl">
                  {s.lastCatchText || "It caught up with who you were."}
                </div>
                <p className="max-w-md text-sm leading-relaxed text-zinc-400">
                  Nothing is lost but time. It drops the thread of you and has to learn your gait all
                  over again — and it gets a little faster each time it's right.
                </p>
                <button
                  onClick={() => restartChase(game)}
                  className="pointer-events-auto rounded border border-rose-400/40 bg-rose-500/10 px-5 py-2 font-mono text-xs uppercase tracking-[0.2em] text-rose-200 hover:bg-rose-500/20"
                >
                  break the pattern · {s.restartIn.toFixed(1)}s
                </button>
              </div>
            )}

            {/* ---------- WON ---------- */}
            {s.screen === "won" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center backdrop-blur-sm">
                <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-emerald-300/70">
                  outside
                </div>
                <div className="text-3xl font-semibold text-emerald-100">You got out.</div>
                <p className="max-w-md text-sm leading-relaxed text-zinc-400">
                  {s.runTime.toFixed(1)} seconds. Caught {s.caughtCount}{" "}
                  {s.caughtCount === 1 ? "time" : "times"}. By the end it knew{" "}
                  {(s.readability * 100).toFixed(0)}% of your gait — and it still couldn't find
                  anyone standing where you'd have to be.
                </p>
                <button
                  onClick={() => beginRun(threatId)}
                  className="pointer-events-auto rounded border border-emerald-400/40 bg-emerald-500/10 px-5 py-2 font-mono text-xs uppercase tracking-[0.2em] text-emerald-200 hover:bg-emerald-500/20"
                >
                  go back in
                </button>
              </div>
            )}

            {/* ---------- TITLE ---------- */}
            {s.screen === "title" && (
              <div className="absolute inset-0 overflow-y-auto bg-gradient-to-b from-black/90 via-black/80 to-black/95 px-5 py-6 backdrop-blur-sm sm:px-8 sm:py-8">
                <div className="mx-auto max-w-2xl">
                  <div className="font-mono text-[10px] uppercase tracking-[0.45em] text-sky-300/60">
                    hide &amp; seek horror
                  </div>
                  <h1 className="mt-2 text-2xl font-semibold leading-tight text-zinc-100 sm:text-4xl">
                    It Only Moves Where You Would Be
                  </h1>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                    The thing in here is blind to the present tense. It cannot see you — it can only
                    predict you. Its guess walks around as a translucent copy of you, running your
                    most likely route, and it hunts that. Walk like yourself and the guess <em>is</em>{" "}
                    you. Stop, backtrack, take the path you'd never take, and you were never here at
                    all.
                  </p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {RULES.map(([h, b], i) => (
                      <div key={i} className="rounded border border-white/10 bg-white/[0.02] p-3">
                        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-sky-300/70">
                          0{i + 1} · {h}
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">{b}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5">
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                      how attentive is it
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {THREATS.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setThreatId(t.id)}
                          className={`rounded border px-3 py-2 text-left transition ${
                            threatId === t.id
                              ? "border-sky-400/50 bg-sky-400/10"
                              : "border-white/10 bg-white/[0.02] hover:border-white/25"
                          }`}
                        >
                          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-200">
                            {t.label}
                          </div>
                          <div className="text-[10px] leading-snug text-zinc-500">{t.note}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-4">
                    <button
                      onClick={() => beginRun(threatId)}
                      className="pointer-events-auto rounded bg-zinc-100 px-6 py-2.5 font-mono text-xs uppercase tracking-[0.24em] text-black hover:bg-white"
                    >
                      enter the dark
                    </button>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                      wasd / arrows · shift to creep · pull 3 relays · reach the gate
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---------- HELP ---------- */}
            {showHelp && s.screen === "playing" && (
              <div className="absolute inset-y-0 right-0 w-full max-w-sm overflow-y-auto border-l border-white/10 bg-black/85 p-4 backdrop-blur-sm sm:w-80">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                    field notes
                  </div>
                  <button
                    onClick={() => setShowHelp(false)}
                    className="rounded border border-white/10 px-2 py-0.5 font-mono text-[10px] text-zinc-500 hover:bg-white/5"
                  >
                    close
                  </button>
                </div>
                <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-zinc-400">
                  <li>
                    <b className="text-sky-300">The pale copy</b> is where It believes you are. The
                    dotted line is where It believes you're going. It runs at the copy, never at you.
                  </li>
                  <li>
                    <b className="text-amber-300">The amber chevron</b> at your feet is the exit it
                    already expects you to take. Step out any other way and you score as
                    &ldquo;not you&rdquo;.
                  </li>
                  <li>
                    <b className="text-rose-300">Readability</b> rises whenever you do the thing you
                    usually do. High readability snaps the copy onto you and speeds It up.
                  </li>
                  <li>
                    <b className="text-emerald-300">Corridors</b> re-anchor the copy on you, but only
                    while it's confident. Junctions are where your choice is actually scored.
                  </li>
                  <li>
                    <b className="text-zinc-200">Standing still</b> counts as a lie — but only if
                    you're normally a mover. If you always stop, stopping becomes your signature.
                  </li>
                  <li>
                    <b className="text-amber-300">Creeping</b> (shift) is slow but quiet: it halves
                    how much the corridors give you away. You can't outrun anything while creeping.
                  </li>
                  <li>Being caught restarts the chase. You keep your relays. It gets faster.</li>
                </ul>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-end justify-between gap-4">
            <button
              onClick={() => setShowHelp((v) => !v)}
              className="rounded border border-white/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 hover:bg-white/5"
            >
              {showHelp ? "hide notes" : "field notes"}
            </button>
            <TouchPad onPress={setTouch} />
          </div>
        </HUD>

        <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-zinc-600">
          No combat, no reflexes. One verb: being unrecognisable to a model of your own muscle
          memory. Everything It knows about you is on the right — it is the same table It is using.
        </p>
      </div>
    </div>
  );
}
