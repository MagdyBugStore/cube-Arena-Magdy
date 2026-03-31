import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

function styleForValue(value) {
  const exp = Math.round(Math.log2(Math.max(1, value)));
  const palette = ['#FF6B6B', '#FFD166', '#06D6A0', '#4ECDC4', '#6C63FF', '#F78C6B'];
  const bg = palette[Math.max(0, exp - 1) % palette.length];
  const cubeColor = parseInt(bg.slice(1), 16);
  return { bg, cubeColor };
}

function tintHex(hex, factor) {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, Math.max(0, c.r * factor));
  c.g = Math.min(1, Math.max(0, c.g * factor));
  c.b = Math.min(1, Math.max(0, c.b * factor));
  return c.getHex();
}

function createNumberTexture(text, backgroundColor) {
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, size, size);

  const shade = ctx.createLinearGradient(0, 0, size, size);
  shade.addColorStop(0, 'rgba(255,255,255,0.22)');
  shade.addColorStop(0.45, 'rgba(255,255,255,0.06)');
  shade.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);

  const textValue = String(text);
  let fontSize = 220;
  ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  while ((ctx.measureText(textValue).width > size * 0.94 || fontSize > size * 0.82) && fontSize > 72) {
    fontSize -= 6;
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  }

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  ctx.fillText(textValue, 0, 0);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

function createCube(value = 4096, size = 4.2) {
  const { bg, cubeColor } = styleForValue(value);
  const topTex = createNumberTexture(String(value), bg);

  // Stronger separation between faces to mimic stylized shading
  const topColor = tintHex(cubeColor, 1.15);
  const sideColor = tintHex(cubeColor, 0.55);
  const bottomColor = tintHex(cubeColor, 0.35);

  const mat = (color, map = null) =>
    new THREE.MeshStandardMaterial({
      color,
      map,
      roughness: 0.4,
      metalness: 0.1
    });

  const materials = [
    mat(sideColor, null),
    mat(sideColor, null),
    mat(topColor, topTex),
    mat(bottomColor, null),
    mat(sideColor, null),
    mat(sideColor, null)
  ];

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), materials);
  mesh.position.y = size / 2;
  mesh.rotation.set(0, 0, 0);
  mesh.castShadow = true;
  return mesh;
}

export function startCubePreview() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5e4a5a);

  const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(7.5, 8.2, 8.6);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const canvas = renderer.domElement;
  canvas.style.position = 'fixed';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.zIndex = '0';
  (document.getElementById('app') || document.body).appendChild(canvas);

  // Ground plane to receive shadows (match background color for seamless look)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: 0x5e4a5a, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);

  const cube = createCube(4096, 4.2);
  scene.add(cube);

  // Lighting setup: ambient + hemi + directional with soft shadows
  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  scene.add(hemi);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(5, 10, 7);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.radius = 4;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 50;
  scene.add(dirLight);

  // Optional subtle outline for crisp silhouette
  const edges = new THREE.EdgesGeometry(cube.geometry);
  const outline = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.18, transparent: true })
  );
  // Keep outline slightly inside so it does not pop outside cube edges.
  outline.scale.setScalar(0.998);
  cube.add(outline);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4.5;
  controls.maxDistance = 24;
  controls.target.set(0, 2.2, 0);
  controls.update();

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  };
  window.addEventListener('resize', onResize, { passive: true });
  onResize();

  function loop() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
