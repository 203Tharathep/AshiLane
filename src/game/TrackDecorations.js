import * as THREE from 'three';
import { ALL_IMAGE_FILES } from '../data/skinsData.js';

export class TrackDecorations {
  constructor(scene, spline) {
    this.scene = scene;
    this.spline = spline;
    this.textureLoader = new THREE.TextureLoader();
    this.billboards = [];
    this.tunnelRings = [];

    this.buildTerrain();
    this.buildCitySkyline();
    this.buildAshiBillboards();
    this.buildTunnelSection();
    this.buildSpectatorStands();
    this.buildFloatingHolograms();
  }

  buildTerrain() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b0c14';
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = '#1b2238';
    ctx.lineWidth = 2;
    for (let x = 0; x <= 512; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y <= 512; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    const groundTex = new THREE.CanvasTexture(canvas);
    groundTex.wrapS = THREE.RepeatWrapping;
    groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(40, 40);

    const groundGeo = new THREE.PlaneGeometry(1400, 1400);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.9,
      metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  buildCitySkyline() {
    const skylineGroup = new THREE.Group();
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x121422,
      roughness: 0.5,
      metalness: 0.8
    });
    const windowColors = [0x00f0ff, 0xff00aa, 0xffd700, 0x00ff88];

    for (let i = 0; i < 90; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 280 + Math.random() * 260;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const width = 15 + Math.random() * 25;
      const depth = 15 + Math.random() * 25;
      const height = 40 + Math.random() * 120;

      const bGeo = new THREE.BoxGeometry(width, height, depth);
      const bMesh = new THREE.Mesh(bGeo, buildingMat);
      bMesh.position.set(x, height / 2 - 5, z);
      skylineGroup.add(bMesh);

      const edgeGeo = new THREE.BoxGeometry(width * 1.02, 1.2, depth * 1.02);
      const edgeMat = new THREE.MeshBasicMaterial({
        color: windowColors[Math.floor(Math.random() * windowColors.length)]
      });
      const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
      edgeMesh.position.set(x, height - 5, z);
      skylineGroup.add(edgeMesh);
    }

    this.scene.add(skylineGroup);
  }

  buildAshiBillboards() {
    const billboardConfigs = [
      { t: 0.04, side: 1, dist: 16, width: 14, height: 9, file: 'Gemini_Generated_Image_4g9dic4g9dic4g9d.jpg', title: 'ASHI COUTURE' },
      { t: 0.16, side: -1, dist: 18, width: 15, height: 10, file: 'qwen_edit_20261004_234512.png', title: 'ASHI SUMMER BEACH' },
      { t: 0.28, side: 1, dist: 17, width: 12, height: 12, file: 'Gemini_Generated_Image_9bccp39bccp39bcc.jpeg', title: 'SHREK ASHI LAND' },
      { t: 0.40, side: -1, dist: 19, width: 16, height: 10, file: 'Gemini_Generated_Image_w62h0zw62h0zw62h.jpg', title: 'ANGRY ASHI SPEED' },
      { t: 0.52, side: 1, dist: 18, width: 15, height: 10, file: 'Gemini_Generated_Image_ovar5lovar5lovar.jpeg', title: 'TOKYO ASHI GHOUL' },
      { t: 0.64, side: -1, dist: 18, width: 14, height: 10, file: 'Gemini_Generated_Image_t2e45ct2e45ct2e4.jpeg', title: 'CEO ASHI ENTERPRISES' },
      { t: 0.74, side: 1, dist: 16, width: 13, height: 13, file: 'Gemini_Generated_Image_kwy6itkwy6itkwy6.jpeg', title: 'LARVA DRIFT RACING' },
      { t: 0.85, side: -1, dist: 17, width: 14, height: 10, file: 'Gemini_Generated_Image_nkpk4ynkpk4ynkpk.jpeg', title: 'WARRIOR ASHI' },
      { t: 0.95, side: 1, dist: 16, width: 15, height: 10, file: '1.jpeg', title: 'ZZZ... WAKE UP & WIN' }
    ];

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x181a20, metalness: 0.8, roughness: 0.3 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x33333e, metalness: 0.9, roughness: 0.2 });
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });

    billboardConfigs.forEach((cfg) => {
      const pt = this.spline.getPointAt(cfg.t);
      const tangent = this.spline.getTangentAt(cfg.t).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();

      const pos = new THREE.Vector3().copy(pt).addScaledVector(normal, cfg.side * cfg.dist);
      pos.y = 0.5;

      const group = new THREE.Group();
      group.position.copy(pos);

      const poleGeo = new THREE.CylinderGeometry(0.3, 0.35, 10, 12);
      const poleL = new THREE.Mesh(poleGeo, poleMat);
      poleL.position.set(-cfg.width * 0.35, 5, 0);
      const poleR = new THREE.Mesh(poleGeo, poleMat);
      poleR.position.set(cfg.width * 0.35, 5, 0);
      group.add(poleL, poleR);

      const frameGeo = new THREE.BoxGeometry(cfg.width + 1.0, cfg.height + 1.0, 0.8);
      const frameMesh = new THREE.Mesh(frameGeo, frameMat);
      frameMesh.position.set(0, 10 + cfg.height / 2 - 2, 0);
      group.add(frameMesh);

      const borderGeo = new THREE.BoxGeometry(cfg.width + 1.2, cfg.height + 1.2, 0.2);
      const borderMesh = new THREE.Mesh(borderGeo, neonMat);
      borderMesh.position.set(0, 10 + cfg.height / 2 - 2, -0.35);
      group.add(borderMesh);

      const tex = this.textureLoader.load(`/assets/ashi/${cfg.file}`);
      tex.colorSpace = THREE.SRGBColorSpace;
      const screenMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
      const screenGeo = new THREE.PlaneGeometry(cfg.width, cfg.height);
      const screenMesh = new THREE.Mesh(screenGeo, screenMat);
      screenMesh.position.set(0, 10 + cfg.height / 2 - 2, 0.45);
      group.add(screenMesh);

      const lookTarget = new THREE.Vector3().copy(pt).addScaledVector(tangent, -25);
      group.lookAt(lookTarget.x, group.position.y, lookTarget.z);

      this.scene.add(group);
      this.billboards.push(group);
    });
  }

  buildTunnelSection() {
    const startT = 0.48;
    const endT = 0.54;
    const ringsCount = 20;

    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide });
    const ringMatPink = new THREE.MeshBasicMaterial({ color: 0xff0066, side: THREE.DoubleSide });

    for (let i = 0; i <= ringsCount; i++) {
      const t = startT + (i / ringsCount) * (endT - startT);
      const pt = this.spline.getPointAt(t);
      const tangent = this.spline.getTangentAt(t).normalize();

      const ringGroup = new THREE.Group();
      ringGroup.position.set(pt.x, 3.8, pt.z);
      ringGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);

      const ringGeo = new THREE.TorusGeometry(12, 0.35, 8, 24, Math.PI);
      const ringMesh = new THREE.Mesh(ringGeo, i % 2 === 0 ? ringMat : ringMatPink);
      ringMesh.rotation.z = Math.PI;
      ringGroup.add(ringMesh);

      this.scene.add(ringGroup);
      this.tunnelRings.push(ringMesh);
    }
  }

  buildSpectatorStands() {
    const standMat = new THREE.MeshStandardMaterial({ color: 0x242836, roughness: 0.6 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xff0044, roughness: 0.4 });

    // Right side grandstand
    const standGroupR = new THREE.Group();
    const standGeo = new THREE.BoxGeometry(60, 8, 14);
    const standMeshR = new THREE.Mesh(standGeo, standMat);
    standMeshR.position.set(24, 4, 30);
    standMeshR.rotation.y = Math.PI;

    const roofGeo = new THREE.BoxGeometry(62, 0.8, 16);
    const roofMeshR = new THREE.Mesh(roofGeo, roofMat);
    roofMeshR.position.set(24, 8.5, 30);
    roofMeshR.rotation.z = 0.12;

    standGroupR.add(standMeshR, roofMeshR);
    this.scene.add(standGroupR);

    // Left side grandstand
    const standGroupL = new THREE.Group();
    const standMeshL = new THREE.Mesh(standGeo, standMat);
    standMeshL.position.set(-24, 4, 40);

    const roofMeshL = new THREE.Mesh(roofGeo, roofMat);
    roofMeshL.position.set(-24, 8.5, 40);
    roofMeshL.rotation.z = -0.12;

    standGroupL.add(standMeshL, roofMeshL);
    this.scene.add(standGroupL);
  }

  buildFloatingHolograms() {
    this.holograms = [];
    const holoGeo = new THREE.OctahedronGeometry(1.2, 0);
    const holoMat = new THREE.MeshBasicMaterial({
      color: 0xffdd00,
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });

    const spots = [0.08, 0.26, 0.46, 0.68, 0.88];
    spots.forEach(t => {
      const pt = this.spline.getPointAt(t);
      const mesh = new THREE.Mesh(holoGeo, holoMat);
      mesh.position.set(pt.x, 3.5, pt.z);
      this.scene.add(mesh);
      this.holograms.push(mesh);
    });
  }

  update(delta) {
    if (this.holograms) {
      this.holograms.forEach(h => {
        h.rotation.y += delta * 2;
        h.rotation.x += delta * 1.5;
      });
    }
  }
}
