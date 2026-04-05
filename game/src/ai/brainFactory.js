import { clamp01, lerp } from "../utils/math.js";
import { pickWeighted, randomBetween } from "../utils/random.js";

export function makePersonality({ botKillAll } = {}) {
  const presets = [
    {
      name: "Balanced",
      w: 0.6,
      t: {
        aggressiveness: 0.55,
        greed: 0.55,
        caution: 0.55,
        stubbornness: 0.45,
        curiosity: 0.55,
        patience: 0.55,
        impulsiveness: 0.45,
        defensiveness: 0.55,
        opportunism: 0.55,
        reactionSpeed: 0.55,
        attention: 0.55,
        focus: 0.55,
        discipline: 0.55,
      },
    },
    {
      name: "Aggressive",
      w: 0.35,
      t: {
        aggressiveness: 0.78,
        greed: 0.45,
        caution: 0.42,
        stubbornness: 0.55,
        curiosity: 0.35,
        patience: 0.4,
        impulsiveness: 0.6,
        defensiveness: 0.42,
        opportunism: 0.68,
        reactionSpeed: 0.62,
        attention: 0.55,
        focus: 0.65,
        discipline: 0.35,
      },
    },
    {
      name: "Terminator",
      w: 0.2,
      t: {
        aggressiveness: 0.95,
        greed: 0.5,
        caution: 0.38,
        stubbornness: 0.75,
        curiosity: 0.25,
        patience: 0.55,
        impulsiveness: 0.28,
        defensiveness: 0.45,
        opportunism: 0.92,
        reactionSpeed: 0.75,
        attention: 0.6,
        focus: 0.82,
        discipline: 0.72,
      },
    },
  ];
  const weights = presets.map((p) => p.w);
  const chosen = botKillAll ? presets.find((x) => x.name === "Terminator") ?? presets[0] : presets[pickWeighted(weights)];
  const base = chosen.t;
  const j = 0.22;
  const mix = (x) => clamp01(x + (Math.random() - 0.5) * j);
  const p = {
    preset: chosen.name,
    aggressiveness: mix(base.aggressiveness),
    greed: mix(base.greed),
    caution: mix(base.caution),
    stubbornness: mix(base.stubbornness),
    curiosity: mix(base.curiosity),
    patience: mix(base.patience),
    impulsiveness: mix(base.impulsiveness),
    defensiveness: mix(base.defensiveness),
    opportunism: mix(base.opportunism),
    reactionSpeed: mix(base.reactionSpeed),
    attention: mix(base.attention),
    focus: mix(base.focus),
    discipline: mix(base.discipline),
  };
  p.impulsiveness = clamp01(p.impulsiveness * (1 - p.discipline * 0.55));
  return p;
}

export function createBrain({ botKillAll, llmMode } = {}) {
  const personality = makePersonality({ botKillAll });
  const minThinkIntervalSec = lerp(0.16, 0.55, personality.patience) * lerp(0.9, 0.7, personality.reactionSpeed);
  const reactionDelaySec = lerp(0.55, 0.08, personality.reactionSpeed);
  const focusSwitchDelaySec = lerp(0.08, 0.55, personality.discipline) * lerp(1.0, 0.55, personality.impulsiveness);
  const commitBaseSec = lerp(0.35, 2.35, personality.stubbornness) * lerp(0.75, 1.25, personality.patience);
  return {
    personality,
    objective: botKillAll ? "killAll" : "normal",
    llmMode: llmMode || "off",
    llmNextAtSec: 0,
    plan: null,
    pendingInterrupt: null,
    nextThinkAtSec: 0,
    lastThinkAtMs: 0,
    minThinkIntervalSec,
    reactionDelaySec,
    focusSwitchDelaySec,
    commitBaseSec,
    steerX: 0,
    steerZ: -1,
    wanderPhase: randomBetween(0, Math.PI * 2),
    wanderTurnSpeed: randomBetween(0.55, 1.9),
    noiseValue: 0,
    decisionCounter: 0,
    _dbgLastDecisionAtMs: 0,
    _dbgLastPlanKey: "",
  };
}

