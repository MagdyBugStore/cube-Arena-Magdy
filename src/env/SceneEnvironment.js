import { THREE } from "../vendor/three.js";

export class SceneEnvironment {
  constructor({ container = document.body } = {}) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0b1020, 6, 22);

    this.frustum = 7.5;
    this.camera = new THREE.OrthographicCamera(0, 0, 0, 0, 0.1, 50);
    this.camera.position.set(4.2, 6.0, 4.2);
    this.camera.lookAt(0, 0.0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);

    this.container.appendChild(this.renderer.domElement);

    this.updatables = new Set();
    this._raf = 0;
    this._prevT = undefined;

    this.keyLight = undefined;
    this.keyLightTarget = undefined;
    this.keyLightOffset = new THREE.Vector3(-3.0, 5.0, 2.0);

    this._addLights();
    this._applyCameraSize();

    addEventListener("resize", () => this._handleResize());
  }

  _addLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    this.scene.add(new THREE.HemisphereLight(0x9bd7ff, 0x0b1020, 0.35));

    const key = new THREE.DirectionalLight(0xffe0c2, 1.1);
    key.position.copy(this.keyLightOffset);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.target = new THREE.Object3D();
    this.scene.add(key.target);
    this.scene.add(key);
    this.keyLight = key;
    this.keyLightTarget = key.target;

    const rim = new THREE.DirectionalLight(0x9bd7ff, 0.65);
    rim.position.set(4.5, 2.4, -2.5);
    this.scene.add(rim);
  }

  setShadowArea(size) {
    if (!this.keyLight) return;
    const half = Math.max(6, size / 2 + 1);
    this.keyLight.shadow.camera.left = -half;
    this.keyLight.shadow.camera.right = half;
    this.keyLight.shadow.camera.top = half;
    this.keyLight.shadow.camera.bottom = -half;
    this.keyLight.shadow.camera.updateProjectionMatrix();
  }

  setShadowCenter(x, z) {
    if (!this.keyLight || !this.keyLightTarget) return;
    this.keyLightTarget.position.set(x, 0, z);
    this.keyLight.position.copy(this.keyLightTarget.position).add(this.keyLightOffset);
    this.keyLightTarget.updateMatrixWorld();
  }

  _applyCameraSize() {
    const aspect = innerWidth / innerHeight;
    this.camera.left = (-this.frustum * aspect) / 2;
    this.camera.right = (this.frustum * aspect) / 2;
    this.camera.top = this.frustum / 2;
    this.camera.bottom = -this.frustum / 2;
    this.camera.updateProjectionMatrix();
  }

  _handleResize() {
    this._applyCameraSize();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  add(object3D) {
    this.scene.add(object3D);
  }

  addUpdatable(obj) {
    if (obj && typeof obj.update === "function") this.updatables.add(obj);
  }

  start() {
    if (this._raf) return;
    const tick = (t) => {
      const dt = Math.min(0.05, (t - (this._prevT ?? t)) * 0.001);
      this._prevT = t;

      for (const obj of this.updatables) obj.update(dt, t);
      this.renderer.render(this.scene, this.camera);

      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
}
