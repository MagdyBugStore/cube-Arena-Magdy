export function createBotsSystem({
  THREE,
  TEST_MODE,
  TEST_LOG,
  LLM_BOT_INDEX,
  bots,
  players,
  freeCubeSpawner,
  clamp,
  clamp01,
  randomBetween,
  randomSign,
  halfBoundsFor,
  getPlayerName,
} = {}) {
  function isBotTracked(bot) {
    if (!TEST_MODE || !TEST_LOG) return false;
    return bots?.[0] === bot;
  }

  function isLLMBot(bot) {
    if (!bot) return false;
    if (!Array.isArray(bots) || bots.length === 0) return false;
    const idx = clamp((LLM_BOT_INDEX | 0) ?? 0, 0, bots.length - 1);
    return bots[idx] === bot;
  }

  function planKey(plan) {
    if (!plan) return "";
    return `${plan.type}|${plan.targetKind ?? ""}|${plan.targetId ?? ""}`;
  }

  function setPlan(brain, nowSec, nextPlan) {
    const p = brain.personality;
    const commitSec = Math.max(0.12, brain.commitBaseSec * THREE.MathUtils.lerp(0.75, 1.35, p.stubbornness));
    const focusCostSec = Math.max(0, brain.focusSwitchDelaySec * THREE.MathUtils.lerp(1.0, 0.55, p.impulsiveness));
    const plan = {
      type: nextPlan.type,
      targetKind: nextPlan.targetKind ?? null,
      targetId: nextPlan.targetId ?? null,
      targetOwnerId: nextPlan.targetOwnerId ?? null,
      x: Number(nextPlan.x) || 0,
      z: Number(nextPlan.z) || 0,
      createdAtSec: nowSec,
      commitUntilSec: nowSec + commitSec,
      reason: String(nextPlan.reason ?? ""),
      lastDist: Infinity,
      stuckSec: 0,
    };
    brain.plan = plan;
    brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + focusCostSec);
  }

  function shouldMiss(brain, category, load01) {
    const p = brain.personality;
    const attention = clamp01(p.attention);
    const focus = clamp01(p.focus);
    const base = (1 - attention) * 0.35 + load01 * 0.35;
    const extra =
      category === "threat"
        ? focus * 0.22
        : category === "opportunity"
          ? focus * 0.12
          : 0;
    const prob = clamp01(base + extra);
    return Math.random() < prob;
  }

  function computePlanLoad01(planType) {
    if (planType === "hunt") return 0.62;
    if (planType === "harvestTail") return 0.5;
    if (planType === "defendTail") return 0.52;
    if (planType === "escape") return 0.55;
    if (planType === "collect") return 0.35;
    return 0.28;
  }

  function visionRadiusFor(brain) {
    const p = brain.personality;
    const base = THREE.MathUtils.lerp(9.5, 22, clamp01(p.attention));
    const focusPenalty = THREE.MathUtils.lerp(1.0, 0.82, clamp01(p.focus));
    return base * focusPenalty;
  }

  function fovCosFor(brain, category) {
    const p = brain.personality;
    const baseDeg = THREE.MathUtils.lerp(165, 85, clamp01(p.focus));
    const extra = category === "threat" ? THREE.MathUtils.lerp(10, 55, clamp01(p.attention)) : 0;
    const deg = clamp(THREE.MathUtils.lerp(baseDeg, baseDeg + extra, 1), 60, 220);
    return Math.cos((deg * Math.PI) / 180 / 2);
  }

  function isVisible(bot, brain, dx, dz, dist, category) {
    const r = visionRadiusFor(brain);
    if (dist > r) return false;
    if (dist < 1.2) return true;
    const dir = bot.headDirection ?? new THREE.Vector3(0, 0, -1);
    const invD = 1 / Math.max(1e-6, dist);
    const tx = dx * invD;
    const tz = dz * invD;
    const dot = (dir.x ?? 0) * tx + (dir.z ?? 0) * tz;
    const cos = fovCosFor(brain, category);
    return dot >= cos;
  }

  function clampTargetToArena(bot, planType, x, z) {
    const { halfX, halfZ } = halfBoundsFor(bot);
    const size = bot?.head?.size ?? 0;
    const edgeMargin = size * 0.3;
    if (planType === "hunt") {
      return { x: clamp(x, -halfX + edgeMargin, halfX - edgeMargin), z: clamp(z, -halfZ + edgeMargin, halfZ - edgeMargin) };
    }

    const margin = size / 2 + 0.2;
    const extra =
      planType === "escape"
        ? 1.1 + size * 0.65
        : planType === "collect" || planType === "harvestTail"
          ? 0.35 + size * 0.25
          : 0.7 + size * 0.35;
    const m = margin + extra;
    return { x: clamp(x, -halfX + m, halfX - m), z: clamp(z, -halfZ + m, halfZ - m) };
  }

  function computeThreat(bot, brain) {
    const botPos = bot.head.mesh.position;
    const botValue = bot.head.value ?? 0;
    const botSize = bot.head.size ?? 0;
    const planType = brain.plan?.type ?? null;
    const load01 = computePlanLoad01(planType);
    if (shouldMiss(brain, "threat", load01)) return null;
    let threat = null;
    let threatDist = Infinity;
    const threatValueThreshold = botValue * (1.12 + brain.personality.caution * 0.35);
    for (const other of players) {
      if (!other || other === bot) continue;
      const otherValue = other.head.value ?? 0;
      if (otherValue <= threatValueThreshold) continue;
      const pos = other.head.mesh.position;
      const dx = pos.x - botPos.x;
      const dz = pos.z - botPos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (!isVisible(bot, brain, dx, dz, d, "threat")) continue;
      if (d < threatDist) {
        threatDist = d;
        threat = other;
      }
    }
    if (!threat) return null;
    const dangerDist = 3.8 + botSize * (7.5 + brain.personality.caution * 8);
    const level = clamp01((dangerDist - threatDist) / Math.max(1e-6, dangerDist));
    return { threat, threatDist, level };
  }

  function findBestFreeCube(bot, brain) {
    const botPos = bot.head.mesh.position;
    const botValue = bot.head.value ?? 0;
    const botDir = bot.headDirection ?? new THREE.Vector3(0, 0, -1);
    const planType = brain.plan?.type ?? null;
    const load01 = computePlanLoad01(planType);
    if (shouldMiss(brain, "opportunity", load01)) return null;
    const cubes = freeCubeSpawner.cubes;
    if (!Array.isArray(cubes) || cubes.length === 0) return null;
    const selfLog = Math.log2(Math.max(2, botValue));
    const big = clamp01((selfLog - 8) / 8);
    const ignore = THREE.MathUtils.lerp(0.0025, 0.02, big) * THREE.MathUtils.lerp(1.15, 0.75, brain.personality.curiosity);
    let best = null;
    let bestScore = -Infinity;
    let bestDist = Infinity;
    const samples = Math.min(32, cubes.length);
    for (let i = 0; i < samples; i += 1) {
      const entry = cubes[(Math.random() * cubes.length) | 0];
      const cube = entry?.cube;
      if (!cube?.mesh) continue;
      const v = cube.value ?? 0;
      if (v <= 0 || v > botValue) continue;
      const marginal = v / Math.max(1, botValue);
      if (marginal < ignore) continue;
      const dx = cube.mesh.position.x - botPos.x;
      const dz = cube.mesh.position.z - botPos.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 0;
      if (!isVisible(bot, brain, dx, dz, d, "opportunity")) continue;
      const invD = 1 / Math.max(1e-6, d);
      const tx = dx * invD;
      const tz = dz * invD;
      const dot = (botDir.x ?? 0) * tx + (botDir.z ?? 0) * tz;
      const front = clamp01((dot + 1) * 0.5);
      const frontMul = THREE.MathUtils.lerp(0.72, 1.2, front);
      const desirability = (Math.pow(marginal, 0.65 + brain.personality.greed * 0.55) * frontMul) / Math.pow(d + 0.45, 1.15);
      const score = desirability + brain.noiseValue * 0.01;
      if (score > bestScore) {
        bestScore = score;
        best = cube;
        bestDist = d;
      }
    }
    if (!best) return null;
    return { cube: best, score: bestScore, dist: bestDist, value: best.value ?? 0, id: best.mesh.uuid };
  }

  function findBestTailToHarvest(bot, brain) {
    const botPos = bot.head.mesh.position;
    const botValue = bot.head.value ?? 0;
    const botDir = bot.headDirection ?? new THREE.Vector3(0, 0, -1);
    const planType = brain.plan?.type ?? null;
    const load01 = computePlanLoad01(planType);
    if (shouldMiss(brain, "opportunity", load01)) return null;
    let best = null;
    let bestScore = -Infinity;
    for (const owner of players) {
      if (!owner || owner === bot) continue;
      const ownerValue = owner.head.value ?? 0;
      const tail = owner.tail;
      if (!Array.isArray(tail) || tail.length === 0) continue;
      const idxA = tail.length - 1;
      const idxB = (tail.length * 0.5) | 0;
      const idxC = 0;
      for (const idx of [idxA, idxB, idxC]) {
        const seg = tail[idx];
        if (!seg?.mesh) continue;
        const v = seg.value ?? 0;
        if (v <= 0 || v > botValue) continue;
        const dx = seg.mesh.position.x - botPos.x;
        const dz = seg.mesh.position.z - botPos.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 0;
        if (!isVisible(bot, brain, dx, dz, d, "opportunity")) continue;
        const invD = 1 / Math.max(1e-6, d);
        const tx = dx * invD;
        const tz = dz * invD;
        const dot = (botDir.x ?? 0) * tx + (botDir.z ?? 0) * tz;
        const front = clamp01((dot + 1) * 0.5);
        const frontMul = THREE.MathUtils.lerp(0.75, 1.15, front);
        const ownerDanger = ownerValue > botValue ? clamp01((ownerValue / Math.max(1, botValue) - 1) * 0.65) : 0;
        const marginal = v / Math.max(1, botValue);
        const desirability =
          (Math.pow(marginal, 0.7 + brain.personality.opportunism * 0.6) * frontMul) / Math.pow(d + 0.35, 1.1);
        const riskPenalty = 1 + ownerDanger * (0.8 + brain.personality.caution * 1.2);
        const score = desirability / riskPenalty + brain.noiseValue * 0.01;
        if (score > bestScore) {
          bestScore = score;
          best = { seg, owner, dist: d, value: v, ownerValue, id: seg.mesh.uuid };
        }
      }
    }
    if (!best) return null;
    return { ...best, score: bestScore };
  }

  function findBestPrey(bot, brain) {
    const botPos = bot.head.mesh.position;
    const botValue = bot.head.value ?? 0;
    const planType = brain.plan?.type ?? null;
    const load01 = computePlanLoad01(planType);
    if (shouldMiss(brain, "opportunity", load01)) return null;
    const killAll = brain.objective === "killAll";
    let prey = null;
    let preyDist = Infinity;
    let preyValue = 0;
    const preyValueThreshold = botValue * (0.82 - brain.personality.aggressiveness * 0.14);
    let bestScore = -Infinity;
    for (const other of players) {
      if (!other || other === bot) continue;
      const otherValue = other.head.value ?? 0;
      if (killAll) {
        if (otherValue <= 0 || otherValue >= botValue) continue;
      } else {
        if (otherValue <= 0 || otherValue >= preyValueThreshold) continue;
      }
      const pos = other.head.mesh.position;
      const dx = pos.x - botPos.x;
      const dz = pos.z - botPos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (!isVisible(bot, brain, dx, dz, d, "opportunity")) continue;
      if (killAll) {
        const ratio = otherValue / Math.max(1, botValue);
        const score = Math.pow(ratio, 0.9) / Math.pow(d + 0.8, 1.05);
        if (score > bestScore) {
          bestScore = score;
          preyDist = d;
          prey = other;
          preyValue = otherValue;
        }
      } else if (d < preyDist) {
        preyDist = d;
        prey = other;
        preyValue = otherValue;
      }
    }
    if (!prey) return null;
    const gain = preyValue / Math.max(1, botValue);
    const score = killAll ? Math.max(0, bestScore) : gain / Math.pow(preyDist + 0.6, 1.05);
    return { prey, dist: preyDist, value: preyValue, score, id: prey.head.mesh.uuid };
  }

  function computeTailDefense(bot, brain) {
    const botValue = bot.head.value ?? 0;
    const botSize = bot.head.size ?? 0;
    const tail = bot.tail;
    if (!Array.isArray(tail) || tail.length === 0) return null;
    const defendMinValue = Math.max(16, botValue * 0.02);
    const important = tail
      .filter((s) => (s?.value ?? 0) >= defendMinValue && s?.mesh)
      .sort((a, b) => (b?.value ?? 0) - (a?.value ?? 0))
      .slice(0, 4);
    if (important.length === 0) return null;
    const defendRadius = 2.2 + botSize * 1.3;
    let best = null;
    let bestScore = 0;
    for (const seg of important) {
      const segPos = seg.mesh.position;
      for (const other of players) {
        if (!other || other === bot) continue;
        const otherValue = other.head.value ?? 0;
        if (otherValue <= 0) continue;
        if (otherValue < (seg.value ?? 0)) continue;
        const op = other.head.mesh.position;
        const dx = op.x - segPos.x;
        const dz = op.z - segPos.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 0;
        if (d > defendRadius) continue;
        const t = clamp01((defendRadius - d) / Math.max(1e-6, defendRadius));
        const importance = clamp01((seg.value ?? 0) / Math.max(1, botValue));
        const score = t * (0.65 + importance * 1.25);
        if (score > bestScore) {
          bestScore = score;
          best = { attacker: other, seg, dist: d, score, attackerValue: otherValue, segValue: seg.value ?? 0 };
        }
      }
    }
    if (!best) return null;
    return best;
  }

  function getFreeCubeById(id) {
    if (!id) return null;
    const cubes = freeCubeSpawner.cubes;
    if (!Array.isArray(cubes) || cubes.length === 0) return null;
    for (const entry of cubes) {
      const c = entry?.cube;
      if (c?.mesh?.uuid === id) return c;
    }
    return null;
  }

  function getTailSegById(id) {
    if (!id) return null;
    for (const p of players) {
      const tail = p?.tail;
      if (!Array.isArray(tail)) continue;
      for (const seg of tail) {
        if (seg?.mesh?.uuid === id) return { seg, owner: p };
      }
    }
    return null;
  }

  function getPlayerByHeadId(id) {
    if (!id) return null;
    for (const p of players) if (p?.head?.mesh?.uuid === id) return p;
    return null;
  }

  function isPlanTargetValid(bot, plan) {
    if (!plan) return false;
    if (plan.type === "collect" && plan.targetKind === "cube" && plan.targetId) {
      for (const entry of freeCubeSpawner.cubes) {
        const c = entry?.cube;
        if (c?.mesh?.uuid === plan.targetId) return true;
      }
      return false;
    }
    if ((plan.type === "harvestTail" || plan.type === "defendTail") && plan.targetId) {
      for (const p of players) {
        if (!p?.tail) continue;
        for (const seg of p.tail) if (seg?.mesh?.uuid === plan.targetId) return true;
      }
      return false;
    }
    if (plan.type === "hunt" && plan.targetId) {
      for (const p of players) if (p?.head?.mesh?.uuid === plan.targetId) return true;
      return false;
    }
    if (plan.type === "escape" || plan.type === "wander") return true;
    return true;
  }

  function updatePlanTargetPos(bot, brain, nowSec) {
    const plan = brain.plan;
    if (!plan) return;
    if (plan.type === "escape") return;
    if (plan.type === "wander") return;
    if (plan.type === "collect" && plan.targetKind === "cube") {
      for (const entry of freeCubeSpawner.cubes) {
        const c = entry?.cube;
        if (c?.mesh?.uuid !== plan.targetId) continue;
        const t = clampTargetToArena(bot, plan.type, c.mesh.position.x, c.mesh.position.z);
        plan.x = t.x;
        plan.z = t.z;
        return;
      }
      return;
    }
    if (plan.type === "harvestTail") {
      for (const p of players) {
        if (!Array.isArray(p?.tail)) continue;
        for (const seg of p.tail) {
          if (seg?.mesh?.uuid !== plan.targetId) continue;
          const t = clampTargetToArena(bot, plan.type, seg.mesh.position.x, seg.mesh.position.z);
          plan.x = t.x;
          plan.z = t.z;
          return;
        }
      }
      return;
    }
    if (plan.type === "hunt") {
      for (const p of players) {
        if (p?.head?.mesh?.uuid !== plan.targetId) continue;
        const pos = p.head.mesh.position;
        const dir = p.headDirection ?? new THREE.Vector3(0, 0, -1);
        const dx = pos.x - bot.head.mesh.position.x;
        const dz = pos.z - bot.head.mesh.position.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 0;
        const leadBase = clamp(d * 0.35, 1.1, 5.5);
        const lead = leadBase * (0.55 + brain.personality.aggressiveness * 0.65);
        const close = d < 2.2 + (bot.head.size ?? 0) * 1.4;
        const t = clampTargetToArena(
          bot,
          plan.type,
          pos.x + (close ? 0 : (dir.x ?? 0) * lead),
          pos.z + (close ? 0 : (dir.z ?? 0) * lead),
        );
        plan.x = t.x;
        plan.z = t.z;
        return;
      }
    }
    if (plan.type === "defendTail") {
      for (const p of players) {
        if (p?.head?.mesh?.uuid !== plan.targetId) continue;
        const t = clampTargetToArena(bot, plan.type, p.head.mesh.position.x, p.head.mesh.position.z);
        plan.x = t.x;
        plan.z = t.z;
        return;
      }
    }
  }

  function findKillablePrey(bot, brain) {
    const botPos = bot.head.mesh.position;
    const botValue = bot.head.value ?? 0;
    const planType = brain.plan?.type ?? null;
    const load01 = computePlanLoad01(planType);
    if (shouldMiss(brain, "opportunity", load01)) return null;
    let best = null;
    let bestScore = -Infinity;
    for (const other of players) {
      if (!other || other === bot || !other?.head?.mesh) continue;
      const otherValue = other.head.value ?? 0;
      if (otherValue <= 0 || otherValue >= botValue) continue;
      const pos = other.head.mesh.position;
      const dx = pos.x - botPos.x;
      const dz = pos.z - botPos.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 0;
      if (!isVisible(bot, brain, dx, dz, d, "opportunity")) continue;
      const ratio = otherValue / Math.max(1, botValue);
      const score = Math.pow(ratio, 0.9) / Math.pow(d + 0.8, 1.05);
      if (score > bestScore) {
        bestScore = score;
        best = { prey: other, id: other.head.mesh.uuid, dist: d, value: otherValue, score };
      }
    }
    return best;
  }

  function thinkMockLLM(bot, brain, nowSec) {
    const t0 = performance.now();
    updatePlanTargetPos(bot, brain, nowSec);

    const plan = brain.plan;
    const planValid = isPlanTargetValid(bot, plan);
    const commitLocked = plan && nowSec < (plan.commitUntilSec ?? 0);
    const minThink = Math.max(0.12, brain.minThinkIntervalSec);

    const planType = brain.plan?.type ?? null;
    const load01 = computePlanLoad01(planType);
    const threatInfo = computeThreat(bot, brain);
    if (threatInfo && threatInfo.level > 0.92 && (!plan || plan.type !== "escape")) {
      const pos = bot.head.mesh.position;
      const botSize = bot.head.size ?? 0;
      const th = threatInfo.threat;
      if (th?.head?.mesh) {
        const tPos = th.head.mesh.position;
        let ax = pos.x - tPos.x;
        let az = pos.z - tPos.z;
        const al = Math.sqrt(ax * ax + az * az) || 1;
        ax /= al;
        az /= al;
        const { halfX, halfZ } = halfBoundsFor(bot);
        const margin = botSize / 2 + 0.8;
        const push = (3.8 + botSize * 11) * (0.9 + brain.personality.caution * 0.35);
        setPlan(brain, nowSec, {
          type: "escape",
          targetKind: "point",
          targetId: th.head.mesh.uuid,
          x: clamp(pos.x + ax * push, -halfX + margin, halfX - margin),
          z: clamp(pos.z + az * push, -halfZ + margin, halfZ - margin),
          reason: "llm:escape",
        });
        brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + minThink);
        return;
      }
    }
    if (shouldMiss(brain, "threat", load01)) threatInfo;

    if (plan && planValid && commitLocked) {
      brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + minThink);
      return;
    }

    const prey = findKillablePrey(bot, brain);
    const cube = findBestFreeCube(bot, brain);
    const tail = findBestTailToHarvest(bot, brain);

    let newPlan = null;
    let reason = "llm";
    if (prey?.prey?.head?.mesh) {
      newPlan = {
        type: "hunt",
        targetKind: "player",
        targetId: prey.id,
        x: prey.prey.head.mesh.position.x,
        z: prey.prey.head.mesh.position.z,
      };
      reason = "llm:hunt";
    } else if (tail?.seg?.mesh) {
      newPlan = {
        type: "harvestTail",
        targetKind: "tail",
        targetId: tail.id,
        targetOwnerId: tail.owner?.head?.mesh?.uuid ?? null,
        x: tail.seg.mesh.position.x,
        z: tail.seg.mesh.position.z,
      };
      reason = "llm:harvest";
    } else if (cube?.cube?.mesh) {
      newPlan = {
        type: "collect",
        targetKind: "cube",
        targetId: cube.id,
        x: cube.cube.mesh.position.x,
        z: cube.cube.mesh.position.z,
      };
      reason = "llm:collect";
    } else {
      const pos = bot.head.mesh.position;
      const botSize = bot.head.size ?? 0;
      const botDir = bot.headDirection ?? new THREE.Vector3(0, 0, -1);
      const fwdLen = Math.sqrt((botDir.x ?? 0) ** 2 + (botDir.z ?? 0) ** 2) || 1;
      const fx = (botDir.x ?? 0) / fwdLen;
      const fz = (botDir.z ?? 0) / fwdLen;
      const px = -fz;
      const pz = fx;
      const { halfX, halfZ } = halfBoundsFor(bot);
      const margin = botSize / 2 + 0.8;
      const dist = randomBetween(6, 16);
      const side = randomSign() * randomBetween(0, 7.5);
      newPlan = {
        type: "wander",
        targetKind: "point",
        targetId: null,
        x: clamp(pos.x + fx * dist + px * side, -halfX + margin, halfX - margin),
        z: clamp(pos.z + fz * dist + pz * side, -halfZ + margin, halfZ - margin),
      };
      reason = "llm:wander";
    }

    if (newPlan) setPlan(brain, nowSec, { ...newPlan, reason });
    brain.llmNextAtSec = nowSec + THREE.MathUtils.lerp(0.55, 0.22, clamp01(brain.personality.reactionSpeed));
    brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + minThink);

    if (isBotTracked(bot)) {
      const decisionMs = performance.now() - t0;
      console.log(
        `[LLM-MOCK] ${getPlayerName(bot)} plan=${brain.plan?.type ?? "-"} reason=${brain.plan?.reason ?? "-"} cpu=${decisionMs.toFixed(2)}ms`,
      );
    }
  }

  function thinkBot(bot, brain, nowSec) {
    const t0 = performance.now();
    const planType = brain.plan?.type ?? null;
    const load01 = computePlanLoad01(planType);

    brain.noiseValue = brain.noiseValue * 0.7 + (Math.random() - 0.5) * 0.3;

    const pos = bot.head.mesh.position;
    const botValue = bot.head.value ?? 0;
    const botSize = bot.head.size ?? 0;

    updatePlanTargetPos(bot, brain, nowSec);

    const plan = brain.plan;
    const planValid = isPlanTargetValid(bot, plan);
    const reachDist = 1.05 + botSize * 0.55;
    const dxp = plan ? plan.x - pos.x : 0;
    const dzp = plan ? plan.z - pos.z : 0;
    const planDist = plan ? Math.sqrt(dxp * dxp + dzp * dzp) : Infinity;

    const threatInfo = computeThreat(bot, brain);
    if (threatInfo && threatInfo.level > 0.52 && !brain.pendingInterrupt && !shouldMiss(brain, "threat", load01)) {
      brain.pendingInterrupt = {
        type: "escape",
        dueAtSec: nowSec + brain.reactionDelaySec,
        threatId: threatInfo.threat?.head?.mesh?.uuid ?? null,
      };
    }
    if (brain.pendingInterrupt && nowSec >= brain.pendingInterrupt.dueAtSec) {
      const th = threatInfo?.threat;
      if (th?.head?.mesh) {
        const tPos = th.head.mesh.position;
        let ax = pos.x - tPos.x;
        let az = pos.z - tPos.z;
        const al = Math.sqrt(ax * ax + az * az) || 1;
        ax /= al;
        az /= al;
        const { halfX, halfZ } = halfBoundsFor(bot);
        const margin = botSize / 2 + 0.8;
        const push = (3.8 + botSize * 11) * (0.9 + brain.personality.caution * 0.35);
        setPlan(brain, nowSec, {
          type: "escape",
          targetKind: "point",
          targetId: th.head.mesh.uuid,
          x: clamp(pos.x + ax * push, -halfX + margin, halfX - margin),
          z: clamp(pos.z + az * push, -halfZ + margin, halfZ - margin),
          reason: "emergency",
        });
        brain.pendingInterrupt = null;
      } else {
        brain.pendingInterrupt = null;
      }
    }

    const nowMs = performance.now();
    const last = Number(brain._dbgLastDecisionAtMs) || 0;
    const dtSec = last > 0 ? (nowMs - last) / 1000 : 0;
    brain._dbgLastDecisionAtMs = nowMs;

    const tailDefense = computeTailDefense(bot, brain);
    const bestCube = findBestFreeCube(bot, brain);
    const bestTail = findBestTailToHarvest(bot, brain);
    const bestPrey = findBestPrey(bot, brain);

    const p = brain.personality;
    const killAll = brain.objective === "killAll";

    const huntUpgradeFactor =
      THREE.MathUtils.lerp(1.75, 1.2, p.aggressiveness) * THREE.MathUtils.lerp(1.1, 0.85, p.opportunism);
    const harvestUpgradeFactor = THREE.MathUtils.lerp(1.4, 1.05, p.opportunism) * THREE.MathUtils.lerp(1.15, 0.9, p.greed);

    const bestCubeGain = bestCube ? (bestCube.value ?? 0) / Math.max(1, botValue) : 0;
    const bestTailGain = bestTail ? (bestTail.value ?? 0) / Math.max(1, botValue) : 0;
    const bestPreyGain = bestPrey ? (bestPrey.value ?? 0) / Math.max(1, botValue) : 0;

    const commitLocked = plan && nowSec < (plan.commitUntilSec ?? 0);
    const minThink = Math.max(0.12, brain.minThinkIntervalSec);

    const planNear = plan && planDist < reachDist;
    const planNearLongEnough = planNear && nowSec - (plan.createdAtSec ?? nowSec) > minThink * 0.9;
    const planCompleted = plan
      ? plan.type === "collect" || plan.type === "harvestTail"
        ? !planValid
        : killAll && plan.type === "hunt"
          ? false
          : planNearLongEnough
      : false;

    if (plan && planValid) {
      const distNow = planDist;
      const distPrev = Number.isFinite(plan.lastDist) ? plan.lastDist : Infinity;
      const improved = distNow < distPrev - 0.15;
      plan.lastDist = distNow;
      const stuckIncrease = improved ? -minThink * 2.0 : minThink;
      plan.stuckSec = Math.max(0, (plan.stuckSec ?? 0) + stuckIncrease);
    }

    const forceReplan = !plan || !planValid || planCompleted || (plan && (plan.stuckSec ?? 0) > THREE.MathUtils.lerp(1.2, 2.6, p.patience));

    let newPlan = null;
    let reason = "";

    const panic = threatInfo && threatInfo.level > 0.92 && Math.random() < clamp01(p.reactionSpeed * 0.55 + p.attention * 0.35);
    if (panic && (!plan || plan.type !== "escape")) {
      const th = threatInfo?.threat;
      if (th?.head?.mesh) {
        const tPos = th.head.mesh.position;
        let ax = pos.x - tPos.x;
        let az = pos.z - tPos.z;
        const al = Math.sqrt(ax * ax + az * az) || 1;
        ax /= al;
        az /= al;
        const { halfX, halfZ } = halfBoundsFor(bot);
        const margin = botSize / 2 + 0.8;
        const push = (3.8 + botSize * 11) * (0.9 + p.caution * 0.35);
        newPlan = {
          type: "escape",
          targetKind: "point",
          targetId: th.head.mesh.uuid,
          x: clamp(pos.x + ax * push, -halfX + margin, halfX - margin),
          z: clamp(pos.z + az * push, -halfZ + margin, halfZ - margin),
        };
        reason = "panic";
      }
    }

    if (!newPlan && tailDefense && tailDefense.score > THREE.MathUtils.lerp(0.78, 0.4, p.defensiveness)) {
      const attacker = tailDefense.attacker;
      if (attacker?.head?.mesh && plan?.type !== "escape") {
        const attackerValue = attacker.head.value ?? 0;
        if (killAll && attackerValue > 0 && attackerValue < botValue) {
          newPlan = {
            type: "hunt",
            targetKind: "player",
            targetId: attacker.head.mesh.uuid,
            x: attacker.head.mesh.position.x,
            z: attacker.head.mesh.position.z,
          };
          reason = "punish";
        } else {
          newPlan = {
            type: "defendTail",
            targetKind: "player",
            targetId: attacker.head.mesh.uuid,
            x: attacker.head.mesh.position.x,
            z: attacker.head.mesh.position.z,
          };
          reason = "defendTail";
        }
      }
    }

    if (
      !newPlan &&
      killAll &&
      bestPrey?.prey?.head?.mesh &&
      (!plan || plan.type !== "hunt") &&
      (!commitLocked || forceReplan || nowSec - (plan?.createdAtSec ?? nowSec) > minThink * 0.75)
    ) {
      newPlan = {
        type: "hunt",
        targetKind: "player",
        targetId: bestPrey.id,
        x: bestPrey.prey.head.mesh.position.x,
        z: bestPrey.prey.head.mesh.position.z,
      };
      reason = "hunt";
    }

    if (!newPlan && killAll && plan && planValid && plan.type === "hunt" && commitLocked && !forceReplan) {
      brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + minThink);
      return;
    }

    if (!newPlan && plan && planValid && !forceReplan) {
      const currentUtility = (() => {
        const self = Math.max(1, botValue);
        if (plan.type === "collect" && plan.targetKind === "cube") {
          const cube = getFreeCubeById(plan.targetId);
          if (!cube?.mesh) return 0;
          const v = cube.value ?? 0;
          if (!(v > 0) || v > botValue) return 0;
          const dx = cube.mesh.position.x - pos.x;
          const dz = cube.mesh.position.z - pos.z;
          const d = Math.sqrt(dx * dx + dz * dz) || 0;
          return (v / self) / (d + 0.7);
        }
        if (plan.type === "harvestTail" && plan.targetKind === "tail") {
          const r = getTailSegById(plan.targetId);
          const seg = r?.seg;
          if (!seg?.mesh) return 0;
          const v = seg.value ?? 0;
          if (!(v > 0) || v > botValue) return 0;
          const dx = seg.mesh.position.x - pos.x;
          const dz = seg.mesh.position.z - pos.z;
          const d = Math.sqrt(dx * dx + dz * dz) || 0;
          return (v / self) / (d + 0.7);
        }
        if (plan.type === "hunt" && plan.targetKind === "player") {
          const prey = getPlayerByHeadId(plan.targetId);
          if (!prey?.head?.mesh) return 0;
          const v = prey.head.value ?? 0;
          if (!(v > 0) || v >= botValue) return 0;
          const dx = prey.head.mesh.position.x - pos.x;
          const dz = prey.head.mesh.position.z - pos.z;
          const d = Math.sqrt(dx * dx + dz * dz) || 0;
          return (v / self) / (d + 0.9);
        }
        return 0;
      })();

      const bestCandidate = (() => {
        const self = Math.max(1, botValue);
        let best = null;
        const consider = (cand) => {
          if (!cand) return;
          if (!best || cand.utility > best.utility) best = cand;
        };
        if (!killAll && bestCube?.cube?.mesh) {
          consider({
            type: "collect",
            targetKind: "cube",
            targetId: bestCube.id,
            x: bestCube.cube.mesh.position.x,
            z: bestCube.cube.mesh.position.z,
            utility: (Number(bestCube.value) / self) / ((Number(bestCube.dist) || 0) + 0.7),
            value: Number(bestCube.value) || 0,
          });
        }
        if (!killAll && bestTail?.seg?.mesh) {
          consider({
            type: "harvestTail",
            targetKind: "tail",
            targetId: bestTail.id,
            targetOwnerId: bestTail.owner?.head?.mesh?.uuid ?? null,
            x: bestTail.seg.mesh.position.x,
            z: bestTail.seg.mesh.position.z,
            utility: (Number(bestTail.value) / self) / ((Number(bestTail.dist) || 0) + 0.7),
          });
        }
        if (bestPrey?.prey?.head?.mesh) {
          consider({
            type: "hunt",
            targetKind: "player",
            targetId: bestPrey.id,
            x: bestPrey.prey.head.mesh.position.x,
            z: bestPrey.prey.head.mesh.position.z,
            utility: (Number(bestPrey.value) / self) / ((Number(bestPrey.dist) || 0) + 0.9),
          });
        }
        return best;
      })();

      const cand = bestCandidate;
      const candKey = cand ? `${cand.type}|${cand.targetKind ?? ""}|${cand.targetId ?? ""}` : "";
      const curKey = planKey(plan);
      const isDifferentTarget = cand && candKey !== curKey;
      const baseThreshold =
        THREE.MathUtils.lerp(1.2, 2.1, clamp01(p.stubbornness)) * THREE.MathUtils.lerp(1.0, 1.2, clamp01(p.discipline));
      const threshold = baseThreshold * (commitLocked ? 1.25 : 1.0);
      const upgradeFactor = currentUtility > 1e-6 ? (cand?.utility ?? 0) / currentUtility : cand?.utility ?? 0;

      let easyThreshold = threshold;
      if (plan.type === "collect" && cand?.type === "collect") {
        const curCube = getFreeCubeById(plan.targetId);
        const curV = Number(curCube?.value ?? 0) || 0;
        const candV = Number(cand?.value ?? 0) || 0;
        if (candV > curV) easyThreshold = Math.min(easyThreshold, THREE.MathUtils.lerp(1.08, 1.32, clamp01(p.stubbornness)));
      }

      if (isDifferentTarget && cand && upgradeFactor >= easyThreshold) {
        newPlan = { ...cand };
        reason = "upgrade";
      } else {
        brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + minThink);
        return;
      }
    }

    if (!newPlan && (!commitLocked || forceReplan)) {
      if (tailDefense && tailDefense.score > THREE.MathUtils.lerp(0.75, 0.45, p.defensiveness)) {
        const attacker = tailDefense.attacker;
        if (attacker?.head?.mesh) {
          const attackerValue = attacker.head.value ?? 0;
          if (killAll && attackerValue > 0 && attackerValue < botValue) {
            newPlan = {
              type: "hunt",
              targetKind: "player",
              targetId: attacker.head.mesh.uuid,
              x: attacker.head.mesh.position.x,
              z: attacker.head.mesh.position.z,
            };
            reason = "punish";
          } else {
            newPlan = {
              type: "defendTail",
              targetKind: "player",
              targetId: attacker.head.mesh.uuid,
              x: attacker.head.mesh.position.x,
              z: attacker.head.mesh.position.z,
            };
            reason = "defendTail";
          }
        }
      }

      if (!newPlan) {
        const collectOk = bestCube && bestCubeGain > 0;
        const harvestOk = bestTail && bestTailGain > 0;
        const huntOk = bestPrey && bestPreyGain > 0;

        if (killAll) {
          if (huntOk) {
            newPlan = {
              type: "hunt",
              targetKind: "player",
              targetId: bestPrey.id,
              x: bestPrey.prey.head.mesh.position.x,
              z: bestPrey.prey.head.mesh.position.z,
            };
            reason = "hunt";
          } else if (harvestOk) {
            newPlan = {
              type: "harvestTail",
              targetKind: "tail",
              targetId: bestTail.id,
              targetOwnerId: bestTail.owner?.head?.mesh?.uuid ?? null,
              x: bestTail.seg.mesh.position.x,
              z: bestTail.seg.mesh.position.z,
            };
            reason = "harvest";
          } else if (collectOk) {
            newPlan = {
              type: "collect",
              targetKind: "cube",
              targetId: bestCube.id,
              x: bestCube.cube.mesh.position.x,
              z: bestCube.cube.mesh.position.z,
            };
            reason = "collect";
          }
        } else {
          if (collectOk) {
            newPlan = {
              type: "collect",
              targetKind: "cube",
              targetId: bestCube.id,
              x: bestCube.cube.mesh.position.x,
              z: bestCube.cube.mesh.position.z,
            };
            reason = "collect";
          } else if (harvestOk) {
            newPlan = {
              type: "harvestTail",
              targetKind: "tail",
              targetId: bestTail.id,
              targetOwnerId: bestTail.owner?.head?.mesh?.uuid ?? null,
              x: bestTail.seg.mesh.position.x,
              z: bestTail.seg.mesh.position.z,
            };
            reason = "harvest";
          }

          if (huntOk) {
            const collectUtility = collectOk ? bestCubeGain : 0;
            const harvestUtility = harvestOk ? bestTailGain : 0;
            const bestSafeUtility = Math.max(collectUtility, harvestUtility);
            const worth = bestSafeUtility <= 0 ? true : bestPreyGain >= bestSafeUtility * huntUpgradeFactor;
            if (worth && (!newPlan || bestSafeUtility <= 0)) {
              newPlan = {
                type: "hunt",
                targetKind: "player",
                targetId: bestPrey.id,
                x: bestPrey.prey.head.mesh.position.x,
                z: bestPrey.prey.head.mesh.position.z,
              };
              reason = "hunt";
            }
          }

          if (harvestOk && collectOk && newPlan?.type === "collect") {
            const harvestWorth = bestTailGain >= bestCubeGain * harvestUpgradeFactor;
            if (harvestWorth && p.opportunism > 0.42) {
              newPlan = {
                type: "harvestTail",
                targetKind: "tail",
                targetId: bestTail.id,
                targetOwnerId: bestTail.owner?.head?.mesh?.uuid ?? null,
                x: bestTail.seg.mesh.position.x,
                z: bestTail.seg.mesh.position.z,
              };
              reason = "harvest>collect";
            }
          }
        }

        if (!newPlan) {
          const botDir = bot.headDirection ?? new THREE.Vector3(0, 0, -1);
          const fwdLen = Math.sqrt((botDir.x ?? 0) ** 2 + (botDir.z ?? 0) ** 2) || 1;
          const fx = (botDir.x ?? 0) / fwdLen;
          const fz = (botDir.z ?? 0) / fwdLen;
          const px = -fz;
          const pz = fx;
          const { halfX, halfZ } = halfBoundsFor(bot);
          const margin = botSize / 2 + 0.8;
          const dist = randomBetween(6, 16) * (0.8 + p.curiosity * 0.45);
          const side = randomSign() * randomBetween(0, 7.5);
          newPlan = {
            type: "wander",
            targetKind: "point",
            targetId: null,
            x: clamp(pos.x + fx * dist + px * side, -halfX + margin, halfX - margin),
            z: clamp(pos.z + fz * dist + pz * side, -halfZ + margin, halfZ - margin),
          };
          reason = "wander";
        }
      }
    }

    if (newPlan) {
      const prevKey = planKey(brain.plan);
      const candKey2 = `${newPlan.type}|${newPlan.targetKind ?? ""}|${newPlan.targetId ?? ""}`;
      if (prevKey === candKey2 && brain.plan) {
        brain.plan.x = Number(newPlan.x) || brain.plan.x;
        brain.plan.z = Number(newPlan.z) || brain.plan.z;
        brain.plan.reason = brain.plan.reason || String(reason || "");
        brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + minThink);
        return;
      }

      setPlan(brain, nowSec, { ...newPlan, reason });
      brain.decisionCounter += 1;
      if (isBotTracked(bot)) {
        const decisionMs = performance.now() - t0;
        const extra =
          brain.plan.type === "escape"
            ? ` danger=${threatInfo ? threatInfo.level.toFixed(2) : "0"}`
            : brain.plan.type === "collect"
              ? ` cube=${bestCube?.value ?? 0} d=${bestCube?.dist?.toFixed(2) ?? "-"}`
              : brain.plan.type === "harvestTail"
                ? ` tail=${bestTail?.value ?? 0} owner=${bestTail?.owner ? getPlayerName(bestTail.owner) : "-"} d=${bestTail?.dist?.toFixed(2) ?? "-"}`
                : brain.plan.type === "hunt"
                  ? ` prey=${bestPrey ? getPlayerName(bestPrey.prey) : "-"} d=${bestPrey?.dist?.toFixed(2) ?? "-"}`
                  : brain.plan.type === "defendTail"
                    ? ` seg=${tailDefense?.segValue ?? 0} attacker=${tailDefense?.attacker ? getPlayerName(tailDefense.attacker) : "-"}`
                    : "";
        console.log(
          `[AI] ${getPlayerName(bot)} * plan=${brain.plan.type} reason=${brain.plan.reason} dt=${dtSec.toFixed(3)}s cpu=${decisionMs.toFixed(2)}ms target=(${brain.plan.x.toFixed(2)},${brain.plan.z.toFixed(2)})${extra}`,
        );
      }
    }

    brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + minThink);
  }

  function steerBot(bot, brain, dt) {
    const pos = bot.head.mesh.position;
    const plan = brain.plan;
    if (!plan) return;
    const dx = plan.x - pos.x;
    const dz = plan.z - pos.z;
    let vx = dx;
    let vz = dz;

    const { halfX, halfZ } = halfBoundsFor(bot);
    const headSize = bot.head.size ?? 0;
    const mode = plan.type || "wander";
    const killAll = brain.objective === "killAll";
    const safeBase =
      mode === "escape"
        ? 1.6 + headSize * 1.5
        : mode === "collect" || mode === "harvestTail"
          ? 0.85 + headSize * 0.85
          : 1.15 + headSize * 1.15;
    const targetNearWall = Math.abs(plan.x) > halfX - safeBase * 0.55 || Math.abs(plan.z) > halfZ - safeBase * 0.55;
    const safe =
      targetNearWall && (mode === "collect" || mode === "harvestTail")
        ? safeBase * 0.55
        : targetNearWall && mode === "hunt"
          ? safeBase * 0.18
          : safeBase;
    const wallK =
      mode === "escape"
        ? 4
        : mode === "collect" || mode === "harvestTail"
          ? 2.4
          : targetNearWall && mode === "hunt"
            ? 0.9
            : 3.2;
    if (pos.x > halfX - safe) vx -= (pos.x - (halfX - safe)) * wallK;
    if (pos.x < -halfX + safe) vx += (-halfX + safe - pos.x) * wallK;
    if (pos.z > halfZ - safe) vz -= (pos.z - (halfZ - safe)) * wallK;
    if (pos.z < -halfZ + safe) vz += (-halfZ + safe - pos.z) * wallK;

    const botValue = bot.head.value ?? 0;
    const botSize = bot.head.size ?? 0;
    const avoidDist = 3.2 + botSize * 2.25;
    const avoidMul = mode === "escape" ? 1.25 : mode === "collect" || mode === "harvestTail" ? 0.85 : 1.0;
    for (const other of players) {
      if (!other || other === bot || !other?.head?.mesh) continue;
      const oPos = other.head.mesh.position;
      const ox = pos.x - oPos.x;
      const oz = pos.z - oPos.z;
      const od = Math.sqrt(ox * ox + oz * oz) || 0;
      if (!(od > 1e-6) || od > avoidDist) continue;
      const oValue = other.head.value ?? 0;
      const isHuntTarget = mode === "hunt" && plan.targetKind === "player" && plan.targetId && other.head.mesh.uuid === plan.targetId;
      const scale =
        killAll && isHuntTarget && oValue > 0 && oValue < botValue
          ? -0.18 * avoidMul
          : (oValue > botValue ? 1.6 : 0.5) * avoidMul;
      const t = (avoidDist - od) / avoidDist;
      const k = scale * (t * t) * 2.6;
      vx += (ox / od) * k;
      vz += (oz / od) * k;

      const tail = other.tail;
      if (!Array.isArray(tail) || tail.length === 0) continue;
      const idxA = tail.length - 1;
      const idxB = (tail.length * 0.5) | 0;
      for (const idx of [idxA, idxB]) {
        const seg = tail[idx];
        if (!seg?.mesh) continue;
        const sx = pos.x - seg.mesh.position.x;
        const sz = pos.z - seg.mesh.position.z;
        const sd = Math.sqrt(sx * sx + sz * sz) || 0;
        if (!(sd > 1e-6) || sd > avoidDist) continue;
        const sValue = seg.value ?? 0;
        const st = (avoidDist - sd) / avoidDist;
        if (sValue > botValue) {
          const sScale = 1.4 * avoidMul;
          const sk = sScale * (st * st) * 2.0;
          vx += (sx / sd) * sk;
          vz += (sz / sd) * sk;
        } else if (mode === "harvestTail") {
          const headThreat = oValue > botValue ? clamp01(((avoidDist * 0.8) - od) / Math.max(1e-6, avoidDist * 0.8)) : 0;
          const aScale =
            (0.75 + brain.personality.opportunism * 0.85) * (1 - headThreat * (0.6 + brain.personality.caution * 0.65));
          const ak = aScale * (st * st) * 1.9;
          vx -= (sx / sd) * ak;
          vz -= (sz / sd) * ak;
        }
      }
    }

    const shouldWanderCurve = plan.type === "wander" || plan.type === "collect";
    if (shouldWanderCurve) {
      const t = Math.max(0, Number(dt) || 0);
      brain.wanderPhase = (Number(brain.wanderPhase) || 0) + t * (Number(brain.wanderTurnSpeed) || 0);
      const amp = THREE.MathUtils.lerp(0.05, 0.22, brain.personality.curiosity) * THREE.MathUtils.lerp(0.25, 0.8, 1 - brain.personality.focus);
      const px = -vz;
      const pz = vx;
      const wave = Math.sin(brain.wanderPhase) * amp;
      vx += px * wave;
      vz += pz * wave;
    }

    if (mode !== "escape" && (!killAll || mode === "collect" || mode === "harvestTail")) {
      const cubes = freeCubeSpawner.cubes;
      if (Array.isArray(cubes) && cubes.length > 0) {
        const baseLen = Math.sqrt(vx * vx + vz * vz) || 1;
        const dirX = vx / baseLen;
        const dirZ = vz / baseLen;
        const perpX = -dirZ;
        const perpZ = dirX;
        const selfLog = Math.log2(Math.max(2, botValue));
        const big = clamp01((selfLog - 8) / 8);
        const ignore =
          THREE.MathUtils.lerp(0.0025, 0.02, big) *
          THREE.MathUtils.lerp(1.15, 0.75, brain.personality.curiosity) *
          0.65;
        const localRadius = 4.5 + botSize * 1.55;
        const corridorAhead = 5.5 + botSize * 2.1;
        const corridorWidth = 2.0 + botSize * 1.05;
        const load2 = computePlanLoad01(mode);
        const focusMul = THREE.MathUtils.lerp(0.95, 0.35, clamp01(brain.personality.focus) * load2);
        let ax = 0;
        let az = 0;
        const samples = Math.min(10, cubes.length);
        for (let i = 0; i < samples; i += 1) {
          const entry = cubes[(Math.random() * cubes.length) | 0];
          const cube = entry?.cube;
          if (!cube?.mesh) continue;
          const v = cube.value ?? 0;
          if (v <= 0 || v > botValue) continue;
          const cx = cube.mesh.position.x;
          const cz = cube.mesh.position.z;
          const cdx = cx - pos.x;
          const cdz = cz - pos.z;
          const d = Math.sqrt(cdx * cdx + cdz * cdz) || 0;
          if (!(d > 1e-6) || d > localRadius) continue;
          if (!isVisible(bot, brain, cdx, cdz, d, "opportunity")) continue;
          const marginal = v / Math.max(1, botValue);
          if (marginal < ignore) continue;
          const along = cdx * dirX + cdz * dirZ;
          if (along < 0.0 || along > corridorAhead) continue;
          const side = Math.abs(cdx * perpX + cdz * perpZ);
          if (side > corridorWidth) continue;
          const sideMul = 1 - side / Math.max(1e-6, corridorWidth);
          const desirability = Math.pow(marginal, 0.65 + brain.personality.greed * 0.35) / (d + 0.25);
          const score = desirability * sideMul * focusMul;
          ax += (cdx / d) * score;
          az += (cdz / d) * score;
        }
        const aLen = Math.sqrt(ax * ax + az * az) || 0;
        if (aLen > 1e-6) {
          const strength = THREE.MathUtils.lerp(0.55, 1.05, clamp01(brain.personality.opportunism)) * focusMul;
          vx += (ax / aLen) * strength;
          vz += (az / aLen) * strength;
        }
      }
    }

    const len = Math.sqrt(vx * vx + vz * vz) || 1;
    const desiredX = vx / len;
    const desiredZ = vz / len;
    const sx = Number(brain.steerX);
    const sz = Number(brain.steerZ);
    const alpha = clamp((Number(dt) || 0) * 7.5, 0, 1);
    const nx = Number.isFinite(sx) ? THREE.MathUtils.lerp(sx, desiredX, alpha) : desiredX;
    const nz = Number.isFinite(sz) ? THREE.MathUtils.lerp(sz, desiredZ, alpha) : desiredZ;
    const nLen = Math.sqrt(nx * nx + nz * nz) || 1;
    brain.steerX = nx / nLen;
    brain.steerZ = nz / nLen;
    bot.setLookDirFromMove(brain.steerX, brain.steerZ);
  }

  function updateBots(dt, t) {
    const nowSec = (Number.isFinite(t) ? t : performance.now()) * 0.001;
    for (const bot of bots) {
      const brain = bot.ai;
      if (!brain) continue;
      if (brain.llmMode === "mock" && isLLMBot(bot)) {
        if (nowSec >= (brain.llmNextAtSec ?? 0)) thinkMockLLM(bot, brain, nowSec);
        steerBot(bot, brain, dt);
        continue;
      }
      if (brain.pendingInterrupt && nowSec >= brain.pendingInterrupt.dueAtSec) {
        thinkBot(bot, brain, nowSec);
      }
      if (nowSec >= (brain.nextThinkAtSec ?? 0)) thinkBot(bot, brain, nowSec);
      steerBot(bot, brain, dt);
    }
  }

  return { updateBots };
}

