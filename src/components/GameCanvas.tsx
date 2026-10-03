import { useEffect, useRef, type MutableRefObject } from "react";
import { Game, Input, restartChase, update } from "../game/engine";
import { createRenderer, H, W } from "../game/render";
import { sound } from "../game/audio";
import { Snapshot } from "./HUD";

const KEYMAP: Record<string, number> = {
  ArrowUp: 0,
  KeyW: 0,
  ArrowRight: 1,
  KeyD: 1,
  ArrowDown: 2,
  KeyS: 2,
  ArrowLeft: 3,
  KeyA: 3,
};

interface Props {
  game: Game;
  input: MutableRefObject<Input>;
  onSnapshot: (s: Snapshot) => void;
  onNewRun: () => void;
}

export default function GameCanvas({ game, input: inputRef, onSnapshot, onNewRun }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = createRenderer(canvas);

    const onKeyDown = (e: KeyboardEvent) => {
      const d = KEYMAP[e.code];
      if (d !== undefined) {
        inputRef.current.dirs[d] = true;
        e.preventDefault();
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") inputRef.current.creep = true;
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        sound.resume();
        if (game.screen === "caught") restartChase(game);
        else if (game.screen === "title") onNewRun();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const d = KEYMAP[e.code];
      if (d !== undefined) inputRef.current.dirs[d] = false;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") inputRef.current.creep = false;
    };
    const onBlur = () => {
      inputRef.current.dirs = [false, false, false, false];
      inputRef.current.creep = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    let raf = 0;
    let last = performance.now();
    let prevLogText = "";
    let prevFuses = 0;
    let prevGate = false;
    let prevScreen = game.screen;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(game, dt, inputRef.current);
      renderer.draw(game, dt);

      // audio cues
      if (game.screen === "playing") {
        sound.tick(game.time, game.proximity, game.conviction);
      }
      if (game.screen !== prevScreen) {
        if (game.screen === "caught") sound.sting("caught");
        prevScreen = game.screen;
      }
      if (game.log[0] && game.log[0].text !== prevLogText) {
        prevLogText = game.log[0].text;
        if (game.log[0].kind === "danger") sound.sting("lock");
        else if (game.log[0].kind === "good") sound.sting("unreadable");
      }
      if (game.fusesTaken !== prevFuses) {
        prevFuses = game.fusesTaken;
        sound.sting("pickup");
      }
      if (game.gateOpen !== prevGate) {
        prevGate = game.gateOpen;
        if (game.gateOpen) sound.sting("gate");
      }

      if (game.screen === "caught" && game.frozen <= -2.7) restartChase(game);

      snapRef.current += dt;
      if (snapRef.current > 0.09) {
        snapRef.current = 0;
        onSnapshot({
          screen: game.screen,
          runTime: game.runTime,
          fusesTaken: game.fusesTaken,
          fusesTotal: game.fuses.length,
          gateOpen: game.gateOpen,
          readability: game.readability,
          conviction: game.conviction,
          creatureState: game.creature.state,
          proximity: game.proximity,
          creatureDist: Math.hypot(game.creature.fx - game.player.fx, game.creature.fy - game.player.fy),
          ghostDist: Math.hypot(game.ghost.fx - game.player.fx, game.ghost.fy - game.player.fy),
          caughtCount: game.caughtCount,
          hint: game.hint,
          log: game.log.slice(0, 5),
          dirs: game.habit.normalisedDirs(),
          moveBias: game.habit.moveBias(),
          lastDir: game.habit.lastDir,
          threat: game.threat.label,
          restartIn: Math.max(0, 2.7 + game.frozen),
          creep: inputRef.current.creep,
          lastCatchText: game.lastCatchText,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [game, onSnapshot, onNewRun]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "auto", aspectRatio: `${W} / ${H}`, display: "block" }}
      className="rounded-sm"
    />
  );
}
