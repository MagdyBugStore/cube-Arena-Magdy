import { THREE } from "../vendor/three.js";
import {
  makeDottedGroundTexture,
  makeFootballFieldTexture,
  makeGeometricGroundTexture,
  makeInterlockPaversTexture,
  makeTennisCourtTexture,
} from "../render/textures.js";

export class GameMap {
  constructor({ size = 18, thickness = 1.6, outerSize, dotTexture, parent, arenaType = "default" } = {}) {
    this.group = new THREE.Group();

    const arenaSize = Math.max(1, Number(size) || 1);
    const normalizedArenaType = String(arenaType || "default").trim().toLowerCase();
    const baseOuterSize =
      typeof outerSize === "number"
        ? outerSize
        : normalizedArenaType === "football" || normalizedArenaType === "soccer"
          ? arenaSize * 8
          : arenaSize * 1.9;
    const platformSize = Math.max(arenaSize, Number(baseOuterSize) || arenaSize);
    const texture =
      dotTexture ??
      this._makeTopTexture({
        arenaType: normalizedArenaType,
        arenaSize,
        platformSize,
      });
    const groundTop = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    const groundSide = new THREE.MeshPhongMaterial({ color: 0x122e4b });

    const ground = new THREE.Mesh(new THREE.BoxGeometry(platformSize, thickness, platformSize), [
      groundSide,
      groundSide,
      groundTop,
      groundSide,
      groundSide,
      groundSide,
    ]);
    ground.position.y = -thickness / 2;
    this.group.add(ground);

    const shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(platformSize, platformSize),
      new THREE.ShadowMaterial({ opacity: 0.28 })
    );
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = 0.001;
    shadowCatcher.receiveShadow = true;
    this.group.add(shadowCatcher);

    const fence =
      normalizedArenaType === "interlock"
        ? this._createInterlockSidewalkFence({ arenaSize, platformSize })
        : normalizedArenaType === "football" || normalizedArenaType === "soccer"
          ? null
          : this._createGardenFence({ arenaSize });
    if (fence) this.group.add(fence);

    if (parent) parent.add(this.group);
  }

  _makeTopTexture({ arenaType, arenaSize, platformSize }) {
    if (arenaType === "football" || arenaType === "soccer") {
      return makeFootballFieldTexture({ arenaSize, platformSize });
    }
    if (arenaType === "tennis") {
      return makeTennisCourtTexture({ arenaSize, platformSize });
    }
    if (arenaType === "interlock") {
      const repeat = Math.max(3, (platformSize / 18) * 4.75);
      return makeInterlockPaversTexture({ repeat });
    }
    if (arenaType === "geo" || arenaType === "geometric" || arenaType === "geometry") {
      const repeat = Math.max(3, (platformSize / 18) * 5.25);
      return makeGeometricGroundTexture({ repeat, cell: 110 });
    }
    return makeDottedGroundTexture({ repeat: (platformSize / 18) * 7 });
  }

  _createGardenFence({ arenaSize }) {
    const group = new THREE.Group();

    const half = arenaSize / 2;
    const height = 1.35;
    const thickness = 0.18;
    const postSize = 0.16;
    const inset = 0.01;

    const makeToonRamp = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 4;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, 4, 1);
      ctx.fillStyle = "#3a3a3a";
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = "#9a9a9a";
      ctx.fillRect(1, 0, 1, 1);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(2, 0, 2, 1);
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.needsUpdate = true;
      return t;
    };

    const ramp = makeToonRamp();
    const railMat = new THREE.MeshToonMaterial({ color: 0xf0c08a, gradientMap: ramp });
    const postMat = new THREE.MeshToonMaterial({ color: 0xd59b5f, gradientMap: ramp });
    const capMat = new THREE.MeshToonMaterial({ color: 0xffe6cc, gradientMap: ramp });

    const railGeoX = new THREE.BoxGeometry(arenaSize + thickness * 2, height * 0.62, thickness);
    const railGeoZ = new THREE.BoxGeometry(thickness, height * 0.62, arenaSize + thickness * 2);
    const capGeoX = new THREE.BoxGeometry(arenaSize + thickness * 2.15, thickness * 1.05, thickness * 1.15);
    const capGeoZ = new THREE.BoxGeometry(thickness * 1.15, thickness * 1.05, arenaSize + thickness * 2.15);

    const railN = new THREE.Mesh(railGeoX, railMat);
    railN.position.set(0, height * 0.31, half + thickness / 2 - inset);
    const railS = new THREE.Mesh(railGeoX, railMat);
    railS.position.set(0, height * 0.31, -half - thickness / 2 + inset);
    const railE = new THREE.Mesh(railGeoZ, railMat);
    railE.position.set(half + thickness / 2 - inset, height * 0.31, 0);
    const railW = new THREE.Mesh(railGeoZ, railMat);
    railW.position.set(-half - thickness / 2 + inset, height * 0.31, 0);

    const capN = new THREE.Mesh(capGeoX, capMat);
    capN.position.set(0, height + thickness * 0.2, half + thickness / 2 - inset);
    const capS = new THREE.Mesh(capGeoX, capMat);
    capS.position.set(0, height + thickness * 0.2, -half - thickness / 2 + inset);
    const capE = new THREE.Mesh(capGeoZ, capMat);
    capE.position.set(half + thickness / 2 - inset, height + thickness * 0.2, 0);
    const capW = new THREE.Mesh(capGeoZ, capMat);
    capW.position.set(-half - thickness / 2 + inset, height + thickness * 0.2, 0);

    const casts = [railN, railS, railE, railW, capN, capS, capE, capW];
    for (const m of casts) {
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }

    const postGeo = new THREE.BoxGeometry(postSize, height, postSize);
    const step = Math.max(0.95, arenaSize / Math.max(8, Math.round(arenaSize * 0.75)));
    const countSide = Math.max(2, Math.floor(arenaSize / step));
    const postCount = countSide * 4;
    const posts = new THREE.InstancedMesh(postGeo, postMat, postCount);
    posts.castShadow = true;
    posts.receiveShadow = true;

    const m4 = new THREE.Matrix4();
    let idx = 0;
    for (let i = 0; i < countSide; i += 1) {
      const t = countSide === 1 ? 0 : i / (countSide - 1);
      const x = THREE.MathUtils.lerp(-half, half, t);
      const z = THREE.MathUtils.lerp(-half, half, t);

      m4.makeTranslation(x, height / 2, half - inset);
      posts.setMatrixAt(idx++, m4);
      m4.makeTranslation(x, height / 2, -half + inset);
      posts.setMatrixAt(idx++, m4);
      m4.makeTranslation(half - inset, height / 2, z);
      posts.setMatrixAt(idx++, m4);
      m4.makeTranslation(-half + inset, height / 2, z);
      posts.setMatrixAt(idx++, m4);
    }
    posts.instanceMatrix.needsUpdate = true;
    group.add(posts);

    return group;
  }

  _createInterlockSidewalkFence({ arenaSize, platformSize }) {
    const group = new THREE.Group();

    const half = arenaSize / 2;
    const height = 0.38;
    const width = Math.max(0.7, platformSize * 0.06);
    const inset = 0.01;

    const topTexture = makeInterlockPaversTexture({ repeat: Math.max(2, (arenaSize / 18) * 2.2) });
    const topMat = new THREE.MeshBasicMaterial({ map: topTexture, toneMapped: false });
    const sideMat = new THREE.MeshPhongMaterial({ color: 0x5a5f66 });
    const bottomMat = sideMat;

    const mats = [sideMat, sideMat, topMat, bottomMat, sideMat, sideMat];

    const geoX = new THREE.BoxGeometry(arenaSize + width * 2, height, width);
    const geoZ = new THREE.BoxGeometry(width, height, arenaSize + width * 2);

    const north = new THREE.Mesh(geoX, mats);
    north.position.set(0, height / 2, half + width / 2 - inset);
    const south = new THREE.Mesh(geoX, mats);
    south.position.set(0, height / 2, -half - width / 2 + inset);
    const east = new THREE.Mesh(geoZ, mats);
    east.position.set(half + width / 2 - inset, height / 2, 0);
    const west = new THREE.Mesh(geoZ, mats);
    west.position.set(-half - width / 2 + inset, height / 2, 0);

    for (const m of [north, south, east, west]) {
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }

    const curbTopMat = new THREE.MeshToonMaterial({ color: 0xbfc5cc });
    const curbTopGeoX = new THREE.BoxGeometry(arenaSize + width * 2.1, 0.06, width * 0.35);
    const curbTopGeoZ = new THREE.BoxGeometry(width * 0.35, 0.06, arenaSize + width * 2.1);
    const capN = new THREE.Mesh(curbTopGeoX, curbTopMat);
    capN.position.set(0, height + 0.03, half + width / 2 - inset);
    const capS = new THREE.Mesh(curbTopGeoX, curbTopMat);
    capS.position.set(0, height + 0.03, -half - width / 2 + inset);
    const capE = new THREE.Mesh(curbTopGeoZ, curbTopMat);
    capE.position.set(half + width / 2 - inset, height + 0.03, 0);
    const capW = new THREE.Mesh(curbTopGeoZ, curbTopMat);
    capW.position.set(-half - width / 2 + inset, height + 0.03, 0);

    for (const m of [capN, capS, capE, capW]) {
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }

    return group;
  }
}
