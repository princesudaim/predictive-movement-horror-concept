import { LogLine, THREATS } from "../game/engine";
import { DIRNAME } from "../game/grid";
import { sound } from "../game/audio";
import { useState } from "react";

export interface Snapshot {
  screen: string;
  runTime: number;
  fusesTaken: number;
  fusesTotal: number;
  gateOpen: boolean;
  readability: number;
  conviction: number;
  creatureState: string;
  proximity: number;
  creatureDist: number;
  ghostDist: number;
  caughtCount: number;
  hint: string;
  log: LogLine[];
  dirs: number[];
  moveBias: number;
  lastDir: number | null;
  threat: string;
  restartIn: number;
  creep: boolean;
  lastCatchText: string;
}

const READ_LABEL = (v: number) =>
  v < 0.2 ? "A STRANGER" : v < 0.4 ? "FUZZY" : v < 0.62 ? "LEGIBLE" : v < 0.82 ? "PREDICTABLE" : "TRANSPARENT";

function Bar({ v, label, value }: { v: number; label: string; value: string }) {
  const pct = Math.max(0, Math.min(1, v)) * 100;
  const color = v < 0.35 ? "bg-emerald-400" : v < 0.62 ? "bg-amber-300" : "bg-rose-500";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{label}</span>
        <span className="font-mono text-[10px] text-zinc-400">{value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-sm bg-zinc-900 ring-1 ring-white/5">
        <div className={`h-full ${color} transition-[width] duration-150`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TouchPad({ onPress }: { onPress: (d: number | null) => void }) {
  const btn =
    "flex h-12 w-12 touch-none items-center justify-center rounded-md bg-zinc-900/80 text-zinc-400 ring-1 ring-white/10 select-none active:bg-zinc-700";
  return (
    <div className="grid grid-cols-3 gap-1 md:hidden">
      <span />
      <button className={btn} onPointerDown={() => onPress(0)} onPointerUp={() => onPress(null)} onPointerLeave={() => onPress(null)}>
        ▲
      </button>
      <span />
      <button className={btn} onPointerDown={() => onPress(3)} onPointerUp={() => onPress(null)} onPointerLeave={() => onPress(null)}>
        ◀
      </button>
      <button className={btn} onPointerDown={() => onPress(2)} onPointerUp={() => onPress(null)} onPointerLeave={() => onPress(null)}>
        ▼
      </button>
      <button className={btn} onPointerDown={() => onPress(1)} onPointerUp={() => onPress(null)} onPointerLeave={() => onPress(null)}>
        ▶
      </button>
    </div>
  );
}

export default function HUD({ s, children }: { s: Snapshot; children: React.ReactNode }) {
  const [mute, setMute] = useState(false);
  const stateColor =
    s.creatureState === "search" ? "text-emerald-300" : s.conviction > 0.6 ? "text-rose-400" : "text-amber-300";
  const stateWord = s.creatureState === "search" ? "SEARCHING A GHOST" : "HUNTING ITS GUESS";

  return (
    <div className="flex flex-col gap-3">
      {/* top strip */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/10 pb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
        <span className="text-zinc-300">It Only Moves Where You Would Be</span>
        <span>
          Relays{" "}
          <span className="text-amber-300">
            {s.fusesTaken}/{s.fusesTotal}
          </span>
          {s.gateOpen && <span className="ml-2 text-emerald-300">gate live</span>}
        </span>
        <span>
          Time <span className="text-zinc-300">{s.runTime.toFixed(1)}s</span>
        </span>
        <span>
          Caught <span className="text-zinc-300">{s.caughtCount}</span>
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className="hidden sm:inline">It: {s.threat}</span>
          <button
            onClick={() => {
              const next = !mute;
              setMute(next);
              sound.setEnabled(!next);
            }}
            className="rounded border border-white/10 px-2 py-1 text-[10px] text-zinc-400 hover:bg-white/5"
          >
            {mute ? "sound off" : "sound on"}
          </button>
        </span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="relative min-w-0 flex-1">{children}</div>
        <div className="w-full shrink-0 space-y-4 lg:w-[268px]">
          <div className="space-y-2 rounded-md border border-white/10 bg-black/40 p-3">
            <Bar v={s.readability} label="How readable you are" value={READ_LABEL(s.readability)} />
            <div className={`font-mono text-[10px] tracking-[0.16em] ${stateColor}`}>
              {stateWord} · {s.creatureDist.toFixed(1)} tiles away
            </div>
            <div className="font-mono text-[10px] text-sky-300/80">
              its guess is {s.ghostDist.toFixed(1)} tiles from you
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-black/40 p-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Its model of you
            </div>
            <div className="space-y-1.5">
              {s.dirs.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-4 font-mono text-[10px] text-zinc-500">{DIRNAME[i]}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-zinc-900">
                    <div
                      className="h-full bg-sky-400/70"
                      style={{ width: `${Math.min(100, (v / 0.5) * 100)}%`, transition: "width 200ms" }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-[9px] text-zinc-600">
                    {(v * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 font-mono text-[9px] leading-relaxed text-zinc-500">
              moves {(s.moveBias * 100).toFixed(0)}% of the time · last step{" "}
              <span className="text-zinc-300">{s.lastDir === null ? "—" : DIRNAME[s.lastDir]}</span>
              {s.creep && <span className="ml-1 text-amber-300">· creeping</span>}
            </div>
          </div>

          <div className="min-h-[92px] rounded-md border border-white/10 bg-black/40 p-3">
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">Wireless</div>
            <div className="space-y-1">
              {s.log.length === 0 && <div className="font-mono text-[10px] text-zinc-600">…static…</div>}
              {s.log.map((l, i) => (
                <div
                  key={`${l.t}-${i}`}
                  className={`font-mono text-[10px] leading-snug ${
                    l.kind === "danger"
                      ? "text-rose-300"
                      : l.kind === "good"
                        ? "text-emerald-300/90"
                        : "text-zinc-500"
                  }`}
                  style={{ opacity: 1 - i * 0.16 }}
                >
                  <span className="text-zinc-700">{l.t.toFixed(1)} </span>
                  {l.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 pt-2">
        <div className="font-mono text-[11px] leading-relaxed text-amber-200/80">
          <span className="mr-2 text-zinc-600">›</span>
          {s.hint}
        </div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-700">
          wasd / arrows walk · shift creeps (quiet, slow) · space continues
        </div>
      </div>
    </div>
  );
}

export { THREATS };
