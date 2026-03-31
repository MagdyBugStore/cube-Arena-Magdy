import { THREE } from "../vendor/three.js";
import { makeDottedGroundTexture } from "../render/textures.js";

export class GameMap {
  constructor({ size = 18, thickness = 1.6, dotTexture = makeDottedGroundTexture(), parent } = {}) {
    this.group = new THREE.Group();

    const groundTop = new THREE.MeshBasicMaterial({ map: dotTexture });
    const groundSide = new THREE.MeshPhongMaterial({ color: 0x122e4b });

    const ground = new THREE.Mesh(new THREE.BoxGeometry(size, thickness, size), [
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
      new THREE.PlaneGeometry(size, size),
      new THREE.ShadowMaterial({ opacity: 0.28 })
    );
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = 0.001;
    shadowCatcher.receiveShadow = true;
    this.group.add(shadowCatcher);

    if (parent) parent.add(this.group);
  }
}
