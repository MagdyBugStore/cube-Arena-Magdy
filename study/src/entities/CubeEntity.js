import * as THREE from 'three';

export class CubeEntity {
  static TYPES = Object.freeze({
    FREE: 'free',
    HEAD: 'head',
    TAIL: 'tail'
  });

  constructor(mesh, type, value, size, options = {}) {
    this.mesh = mesh;
    this.type = type;
    this.value = value;
    this.size = size;
    this.fallSpeed = options.fallSpeed || 0;
    this.isSettled = options.isSettled || false;
    this.box = new THREE.Box3();
    this.syncMeshUserData();
  }

  syncMeshUserData() {
    this.mesh.userData.type = this.type;
    this.mesh.userData.value = this.value;
    this.mesh.userData.entity = this;
    this.mesh.userData.box = this.box;
  }

  setValue(nextValue) {
    this.value = nextValue;
    this.mesh.userData.value = nextValue;
  }

  updateFall(dt) {
    if (this.type !== CubeEntity.TYPES.FREE || this.isSettled) return;
    this.mesh.position.y -= this.fallSpeed * dt;
    if (this.mesh.position.y <= this.size / 2) {
      this.mesh.position.y = this.size / 2;
      this.isSettled = true;
    }
  }

  updateBox() {
    this.mesh.updateMatrixWorld(true);
    this.box.setFromObject(this.mesh);
  }
}
