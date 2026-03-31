import { THREE } from "../vendor/three.js";
import { EXPLOSION } from "../config/explosion.js";

export function createSparkManager(scene) {
  const bursts = [];

  function spawnBurst({ x = 0, y = 0.4, z = 0, intensity = 1 } = {}) {
    const scaledIntensity = Math.max(0.1, Number(intensity) || 0) * EXPLOSION.intensityMultiplier;
    const count = Math.max(18, Math.min(520, Math.round(40 * scaledIntensity * EXPLOSION.sparkMultiplier)));
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const a = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.4);
      const speed = (2.2 + 8.8 * r) * scaledIntensity * EXPLOSION.speedMultiplier;
      velocities[i * 3 + 0] = Math.cos(a) * speed;
      velocities[i * 3 + 2] = Math.sin(a) * speed;
      velocities[i * 3 + 1] = (4.6 + Math.random() * 10.8) * scaledIntensity * EXPLOSION.upMultiplier;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffc86a,
      size: 0.12 * EXPLOSION.sizeMultiplier,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const points = new THREE.Points(geom, mat);
    points.renderOrder = 100;
    scene.add(points);
    bursts.push({
      points,
      velocities,
      age: 0,
      life: 0.75 + Math.random() * 0.45,
      gravity: 18 + 18 * scaledIntensity,
      damping: 0.06,
    });
  }

  function update(dt) {
    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const b = bursts[i];
      b.age += dt;
      const t = b.life > 0 ? b.age / b.life : 1;
      const alpha = 1 - Math.max(0, Math.min(1, t));

      const geom = b.points.geometry;
      const posAttr = geom.getAttribute("position");
      const pos = posAttr.array;
      const vel = b.velocities;

      for (let k = 0; k < pos.length; k += 3) {
        vel[k + 1] -= b.gravity * dt;
        pos[k + 0] += vel[k + 0] * dt;
        pos[k + 1] += vel[k + 1] * dt;
        pos[k + 2] += vel[k + 2] * dt;

        const damp = Math.pow(b.damping, dt);
        vel[k + 0] *= damp;
        vel[k + 2] *= damp;
      }
      posAttr.needsUpdate = true;
      b.points.material.opacity = alpha;

      if (b.age >= b.life) {
        scene.remove(b.points);
        b.points.geometry.dispose();
        b.points.material.dispose();
        bursts.splice(i, 1);
      }
    }
  }

  return { spawnBurst, update };
}

