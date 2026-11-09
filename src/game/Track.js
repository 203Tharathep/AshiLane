import * as THREE from 'three';

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.trackWidth = 20; // Total track width (including kerbs)
    this.roadWidth = 17.6; // Asphalt surface width
    this.kerbWidth = 1.2;  // Flush rumble strip width each side
    this.wallHeight = 1.0; // Sleek modern safety barrier height
    this.maxAllowedLateral = 9.2; // Barrier rebound distance

    this.checkpoints = [];
    this.boostPads = [];
    this.spline = null;
    this.trackMesh = null;
    this.kerbMeshL = null;
    this.kerbMeshR = null;
    this.barrierMeshes = [];
    this.decorationsList = [];

    this.initSpline();
    this.buildRoadMesh();
    this.build3DKerbs();
    this.buildCrashBarriers();
    this.buildStartFinishLine();
    this.buildBrakeDistanceMarkers();
    this.buildTireBarriers();
    this.buildCheckpoints();
    this.buildBoostPads();
  }

  initSpline() {
    // 100% Flat (y = 0 everywhere), 100% Non-Overlapping Grand Prix Circuit
    // Minimum 58.7m clearance between all non-adjacent sectors
    // 200m straight home stretch pointing straight into +Z with tangent (0, 0, 1)
    const points = [
      new THREE.Vector3(0, 0, 0),         // START / FINISH LINE (Heading North +Z)
      new THREE.Vector3(0, 0, 80),        // Main Straight
      new THREE.Vector3(0, 0, 160),       // Main Straight Speed Trap
      new THREE.Vector3(45, 0, 230),      // Turn 1 Entry (Wide Sweeper)
      new THREE.Vector3(120, 0, 250),     // Turn 1 Apex
      new THREE.Vector3(195, 0, 220),     // Turn 2 Exit
      new THREE.Vector3(260, 0, 150),     // East Sector Entry
      new THREE.Vector3(280, 0, 50),      // High-Speed East Sweeper
      new THREE.Vector3(260, 0, -50),     // Turn 5
      new THREE.Vector3(220, 0, -140),    // Turn 6 S-curve Entry
      new THREE.Vector3(150, 0, -210),    // South Sweeper
      new THREE.Vector3(60, 0, -250),     // South Back Straight
      new THREE.Vector3(-40, 0, -250),    // Turn 8 Entry
      new THREE.Vector3(-130, 0, -210),   // Turn 8 Apex
      new THREE.Vector3(-180, 0, -130),   // West Stadium Loop Entry
      new THREE.Vector3(-190, 0, -30),    // West Loop Northbound Straight
      new THREE.Vector3(-150, 0, 50),     // Infield Hairpin Entry
      new THREE.Vector3(-90, 0, 20),      // Infield Hairpin Apex
      new THREE.Vector3(-75, 0, -40),     // Hairpin Exit
      new THREE.Vector3(-60, 0, -120),    // Final Sector Entry
      new THREE.Vector3(-30, 0, -170),    // Final Corner Entry
      new THREE.Vector3(0, 0, -180),      // Final Corner Apex
      new THREE.Vector3(0, 0, -120),      // Home Straight Entry (Aligned North)
      new THREE.Vector3(0, 0, -60)        // Home Straight Acceleration Zone
    ];

    this.spline = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);
    this.trackLength = this.spline.getLength();
  }

  buildRoadMesh() {
    const numSteps = 500;
    const halfWidth = this.roadWidth / 2;

    const vertices = [];
    const uvs = [];
    const indices = [];

    // Real-Life FIA Asphalt Canvas Texture (1024x1024)
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Base dark tarmac
    ctx.fillStyle = '#1c1e24';
    ctx.fillRect(0, 0, 1024, 1024);

    // Fine asphalt aggregate speckles
    for (let i = 0; i < 12000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#15161a' : (Math.random() > 0.5 ? '#262932' : '#22252d');
      ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
    }

    // Realistic darker tire rubber racing grooves (left & right wheel paths)
    const rubberGradL = ctx.createLinearGradient(220, 0, 380, 0);
    rubberGradL.addColorStop(0, 'rgba(10, 11, 14, 0)');
    rubberGradL.addColorStop(0.5, 'rgba(10, 11, 14, 0.55)');
    rubberGradL.addColorStop(1, 'rgba(10, 11, 14, 0)');
    ctx.fillStyle = rubberGradL;
    ctx.fillRect(220, 0, 160, 1024);

    const rubberGradR = ctx.createLinearGradient(644, 0, 804, 0);
    rubberGradR.addColorStop(0, 'rgba(10, 11, 14, 0)');
    rubberGradR.addColorStop(0.5, 'rgba(10, 11, 14, 0.55)');
    rubberGradR.addColorStop(1, 'rgba(10, 11, 14, 0)');
    ctx.fillStyle = rubberGradR;
    ctx.fillRect(644, 0, 160, 1024);

    // Continuous FIA white boundary lines on edge of asphalt
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(35, 0, 18, 1024);
    ctx.fillRect(971, 0, 18, 1024);

    // Center dashed white racing line
    ctx.fillStyle = '#ffffff';
    for (let y = 40; y < 1024; y += 180) {
      ctx.fillRect(504, y, 16, 90);
    }

    const roadTex = new THREE.CanvasTexture(canvas);
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(1, numSteps / 8);

    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: 0.75,
      metalness: 0.15,
      side: THREE.DoubleSide
    });

    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i <= numSteps; i++) {
      const t = (i % numSteps) / numSteps;
      const pt = this.spline.getPointAt(t);
      const tangent = this.spline.getTangentAt(t).normalize();
      const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();

      const leftPt = new THREE.Vector3().copy(pt).addScaledVector(normal, -halfWidth);
      const rightPt = new THREE.Vector3().copy(pt).addScaledVector(normal, halfWidth);

      // 100% Flat: asphalt sits at flush y = 0.05
      vertices.push(leftPt.x, 0.05, leftPt.z);
      vertices.push(rightPt.x, 0.05, rightPt.z);

      uvs.push(0, (i / numSteps) * (numSteps / 8));
      uvs.push(1, (i / numSteps) * (numSteps / 8));

      if (i < numSteps) {
        const base = i * 2;
        indices.push(base, base + 2, base + 1);
        indices.push(base + 1, base + 2, base + 3);
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);
    roadGeo.computeVertexNormals();

    this.trackMesh = new THREE.Mesh(roadGeo, roadMat);
    this.trackMesh.receiveShadow = true;
    this.scene.add(this.trackMesh);
  }

  build3DKerbs() {
    const numSteps = 500;
    const roadHalf = this.roadWidth / 2;
    const kerbW = this.kerbWidth;
    const kerbHeight = 0.02; // Flush flat curbs - no elevated steps or ledges!

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    for (let y = 0; y < 256; y += 64) {
      ctx.fillStyle = (y / 64) % 2 === 0 ? '#d21424' : '#f0f2f5';
      ctx.fillRect(0, y, 128, 64);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(0, y + 54, 128, 10);
    }
    const kerbTex = new THREE.CanvasTexture(canvas);
    kerbTex.wrapS = THREE.RepeatWrapping;
    kerbTex.wrapT = THREE.RepeatWrapping;
    kerbTex.repeat.set(1, numSteps / 4);

    const kerbMat = new THREE.MeshStandardMaterial({
      map: kerbTex,
      roughness: 0.6,
      metalness: 0.2,
      side: THREE.DoubleSide
    });

    const up = new THREE.Vector3(0, 1, 0);

    const buildSideKerb = (isRight) => {
      const verts = [];
      const uvs = [];
      const idx = [];

      for (let i = 0; i <= numSteps; i++) {
        const t = (i % numSteps) / numSteps;
        const pt = this.spline.getPointAt(t);
        const tangent = this.spline.getTangentAt(t).normalize();
        const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();

        const innerDist = isRight ? roadHalf : -roadHalf;
        const outerDist = isRight ? (roadHalf + kerbW) : (-roadHalf - kerbW);

        const innerPt = new THREE.Vector3().copy(pt).addScaledVector(normal, innerDist);
        const outerPt = new THREE.Vector3().copy(pt).addScaledVector(normal, outerDist);

        // Perfectly flat and flush with asphalt
        verts.push(innerPt.x, 0.055, innerPt.z);
        verts.push(outerPt.x, 0.055 + kerbHeight, outerPt.z);

        uvs.push(0, (i / numSteps) * (numSteps / 4));
        uvs.push(1, (i / numSteps) * (numSteps / 4));

        if (i < numSteps) {
          const b = i * 2;
          if (isRight) {
            idx.push(b, b + 2, b + 1);
            idx.push(b + 1, b + 2, b + 3);
          } else {
            idx.push(b, b + 1, b + 2);
            idx.push(b + 1, b + 3, b + 2);
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, kerbMat);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    };

    this.kerbMeshL = buildSideKerb(false);
    this.kerbMeshR = buildSideKerb(true);
  }

  buildCrashBarriers() {
    const numSteps = 500;
    const barrierDist = this.trackWidth / 2; // 10 meters from center
    const wallH = this.wallHeight; // 1.0m modern sleek barrier

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Concrete & Tecpro rubber composite base
    ctx.fillStyle = '#2f343f';
    ctx.fillRect(0, 0, 1024, 256);

    ctx.fillStyle = '#1e2129';
    for (let x = 0; x < 1024; x += 128) {
      ctx.fillRect(x, 0, 4, 256);
    }

    // High-visibility hazard base stripes
    for (let x = 0; x < 1024; x += 32) {
      ctx.fillStyle = (x / 32) % 2 === 0 ? '#ffd700' : '#111111';
      ctx.fillRect(x, 220, 32, 36);
    }

    const sponsors = [
      { text: '⚡ ASHI GRAND PRIX ⚡', bg: '#00f3ff', color: '#000000' },
      { text: '🏁 BURIRAM SPEEDWAY', bg: '#ff0055', color: '#ffffff' },
      { text: '🏎️ PIRELLI RACING', bg: '#ffd700', color: '#d21424' },
      { text: '👑 ASHI LANE 3D', bg: '#7928ca', color: '#00f3ff' }
    ];

    sponsors.forEach((sp, idx) => {
      const segW = 256;
      const startX = idx * segW;
      ctx.fillStyle = sp.bg;
      ctx.fillRect(startX + 8, 45, segW - 16, 130);

      ctx.fillStyle = sp.color;
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sp.text, startX + segW / 2, 110);
    });

    const barrierTex = new THREE.CanvasTexture(canvas);
    barrierTex.wrapS = THREE.RepeatWrapping;
    barrierTex.wrapT = THREE.RepeatWrapping;
    barrierTex.repeat.set(numSteps / 8, 1);

    const barrierMat = new THREE.MeshStandardMaterial({
      map: barrierTex,
      roughness: 0.65,
      metalness: 0.35,
      side: THREE.DoubleSide
    });

    const up = new THREE.Vector3(0, 1, 0);

    const buildBarrierWall = (isRight) => {
      const verts = [];
      const uvs = [];
      const idx = [];

      for (let i = 0; i <= numSteps; i++) {
        const t = (i % numSteps) / numSteps;
        const pt = this.spline.getPointAt(t);
        const tangent = this.spline.getTangentAt(t).normalize();
        const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();

        const offset = isRight ? barrierDist : -barrierDist;
        const basePt = new THREE.Vector3().copy(pt).addScaledVector(normal, offset);

        verts.push(basePt.x, 0, basePt.z);
        verts.push(basePt.x, wallH, basePt.z);

        const u = (i / numSteps) * (numSteps / 8);
        uvs.push(u, 1);
        uvs.push(u, 0);

        if (i < numSteps) {
          const b = i * 2;
          if (isRight) {
            idx.push(b, b + 1, b + 2);
            idx.push(b + 1, b + 3, b + 2);
          } else {
            idx.push(b, b + 2, b + 1);
            idx.push(b + 1, b + 2, b + 3);
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();

      const mesh = new THREE.Mesh(geo, barrierMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.barrierMeshes.push(mesh);

      // Steel Top Glowing Railing on top of wall
      const railPts = [];
      for (let i = 0; i < numSteps; i++) {
        const t = i / numSteps;
        const pt = this.spline.getPointAt(t);
        const tangent = this.spline.getTangentAt(t).normalize();
        const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();
        railPts.push(pt.clone().addScaledVector(normal, isRight ? barrierDist : -barrierDist).add(new THREE.Vector3(0, wallH, 0)));
      }
      const railCurve = new THREE.CatmullRomCurve3(railPts, true);
      const railGeo = new THREE.TubeGeometry(railCurve, 250, 0.08, 6, true);
      const railMat = new THREE.MeshStandardMaterial({
        color: isRight ? 0x00f3ff : 0xff0055,
        metalness: 0.9,
        roughness: 0.2
      });
      const railMesh = new THREE.Mesh(railGeo, railMat);
      this.scene.add(railMesh);
    };

    buildBarrierWall(false);
    buildBarrierWall(true);
  }

  buildStartFinishLine() {
    const pt = this.spline.getPointAt(0);
    const tangent = this.spline.getTangentAt(0).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    for (let x = 0; x < 512; x += 32) {
      for (let y = 0; y < 128; y += 32) {
        ctx.fillStyle = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 0 ? '#ffffff' : '#111111';
        ctx.fillRect(x, y, 32, 32);
      }
    }
    const checkerTex = new THREE.CanvasTexture(canvas);

    const finishGeo = new THREE.PlaneGeometry(this.roadWidth * 0.98, 5);
    const finishMat = new THREE.MeshStandardMaterial({ map: checkerTex, side: THREE.DoubleSide });
    const finishMesh = new THREE.Mesh(finishGeo, finishMat);
    finishMesh.rotation.x = -Math.PI / 2;
    finishMesh.rotation.z = -Math.atan2(tangent.x, tangent.z);
    finishMesh.position.set(pt.x, 0.08, pt.z);
    this.scene.add(finishMesh);

    this.buildF1StartGantry(pt, tangent, normal);
  }

  buildF1StartGantry(pt, tangent, normal) {
    const gantry = new THREE.Group();
    const halfWidth = this.trackWidth / 2 + 1.2;

    const steelMat = new THREE.MeshStandardMaterial({ color: 0x1f222a, metalness: 0.85, roughness: 0.3 });
    const lightHousingMat = new THREE.MeshStandardMaterial({ color: 0x111114, metalness: 0.9, roughness: 0.2 });
    const redLightMat = new THREE.MeshBasicMaterial({ color: 0xff0022 });

    const colGeo = new THREE.CylinderGeometry(0.5, 0.6, 9.5, 12);
    const colL = new THREE.Mesh(colGeo, steelMat);
    colL.position.copy(pt).addScaledVector(normal, -halfWidth);
    colL.position.y += 4.75;

    const colR = new THREE.Mesh(colGeo, steelMat);
    colR.position.copy(pt).addScaledVector(normal, halfWidth);
    colR.position.y += 4.75;

    const beamGeo = new THREE.BoxGeometry(this.trackWidth + 4, 1.6, 1.4);
    const beam = new THREE.Mesh(beamGeo, steelMat);
    beam.position.copy(pt);
    beam.position.y += 9.5;
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), normal);

    const lightsGroup = new THREE.Group();
    for (let i = -2; i <= 2; i++) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.5), lightHousingMat);
      pod.position.set(i * 1.8, 0, 0.8);

      const bulb1 = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), redLightMat);
      bulb1.position.set(0, 0.4, 0.26);
      const bulb2 = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), redLightMat);
      bulb2.position.set(0, -0.4, 0.26);

      pod.add(bulb1, bulb2);
      lightsGroup.add(pod);
    }
    lightsGroup.position.copy(pt);
    lightsGroup.position.y += 8.6;
    lightsGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);

    const bannerCanvas = document.createElement('canvas');
    bannerCanvas.width = 512;
    bannerCanvas.height = 128;
    const bctx = bannerCanvas.getContext('2d');
    bctx.fillStyle = '#0a0d18';
    bctx.fillRect(0, 0, 512, 128);
    bctx.strokeStyle = '#00f3ff';
    bctx.lineWidth = 6;
    bctx.strokeRect(6, 6, 500, 116);
    bctx.font = 'bold 36px sans-serif';
    bctx.fillStyle = '#ff0055';
    bctx.textAlign = 'center';
    bctx.fillText('⚡ BURIRAM SPEEDWAY ⚡', 256, 52);
    bctx.font = 'bold 22px sans-serif';
    bctx.fillStyle = '#00f3ff';
    bctx.fillText('START / FINISH LINE', 256, 94);

    const bannerTex = new THREE.CanvasTexture(bannerCanvas);
    const bannerGeo = new THREE.PlaneGeometry(12, 2.2);
    const bannerMesh = new THREE.Mesh(bannerGeo, new THREE.MeshBasicMaterial({ map: bannerTex, side: THREE.DoubleSide }));
    bannerMesh.position.copy(pt);
    bannerMesh.position.y += 10.8;
    bannerMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);

    gantry.add(colL, colR, beam, lightsGroup, bannerMesh);
    this.scene.add(gantry);
  }

  buildBrakeDistanceMarkers() {
    const brakingZones = [
      { turnT: 0.12, distances: [150, 100, 50] }, // Before Turn 1 Sweeper
      { turnT: 0.35, distances: [150, 100, 50] }, // Before East Sweeper
      { turnT: 0.58, distances: [150, 100, 50] }, // Before South Chicane
      { turnT: 0.78, distances: [150, 100, 50] }  // Before Infield Hairpin
    ];

    const up = new THREE.Vector3(0, 1, 0);

    brakingZones.forEach(zone => {
      zone.distances.forEach((distMeters) => {
        const deltaT = (distMeters / this.trackLength);
        const t = (zone.turnT - deltaT + 1) % 1;

        const pt = this.spline.getPointAt(t);
        const tangent = this.spline.getTangentAt(t).normalize();
        const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();

        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = '#000000';
        ctx.font = '900 64px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${distMeters}`, 64, 64);
        const tex = new THREE.CanvasTexture(canvas);

        const boardGeo = new THREE.BoxGeometry(1.6, 1.4, 0.2);
        const boardMat = new THREE.MeshStandardMaterial({ map: tex });
        const board = new THREE.Mesh(boardGeo, boardMat);

        const pos = pt.clone().addScaledVector(normal, -(this.trackWidth / 2 - 0.4));
        pos.y = 1.0;
        board.position.copy(pos);
        board.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);

        this.scene.add(board);
      });
    });
  }

  buildTireBarriers() {
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 });
    const tireGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.32, 12);
    tireGeo.rotateZ(Math.PI / 2);

    const impactZones = [0.15, 0.35, 0.62, 0.78];
    const up = new THREE.Vector3(0, 1, 0);

    impactZones.forEach(t => {
      const pt = this.spline.getPointAt(t);
      const tangent = this.spline.getTangentAt(t).normalize();
      const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();

      const group = new THREE.Group();
      const basePos = pt.clone().addScaledVector(normal, this.trackWidth / 2 - 0.5);

      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const tire = new THREE.Mesh(tireGeo, tireMat);
          tire.position.set(col * 0.7 - 0.7, row * 0.32 + 0.2, 0);
          group.add(tire);
        }
      }

      basePos.y = 0;
      group.position.copy(basePos);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
      this.scene.add(group);
    });
  }

  buildCheckpoints() {
    const numCheckpoints = 24;
    this.checkpoints = [];

    for (let i = 0; i < numCheckpoints; i++) {
      const t = i / numCheckpoints;
      const pt = this.spline.getPointAt(t);
      const tangent = this.spline.getTangentAt(t).normalize();
      const normal = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), tangent).normalize();

      this.checkpoints.push({
        index: i,
        t,
        position: pt,
        tangent,
        normal,
        radius: this.trackWidth * 0.9
      });
    }
  }

  buildBoostPads() {
    const padLocations = [0.03, 0.24, 0.48, 0.68, 0.94];

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000aa';
    ctx.fillRect(0, 0, 128, 256);

    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';

    for (let y = 50; y < 240; y += 70) {
      ctx.beginPath();
      ctx.moveTo(25, y + 30);
      ctx.lineTo(64, y);
      ctx.lineTo(103, y + 30);
      ctx.stroke();
    }

    const boostTex = new THREE.CanvasTexture(canvas);
    boostTex.wrapS = THREE.RepeatWrapping;
    boostTex.wrapT = THREE.RepeatWrapping;

    padLocations.forEach((t) => {
      const pt = this.spline.getPointAt(t);
      const tangent = this.spline.getTangentAt(t).normalize();

      const padGeo = new THREE.PlaneGeometry(6, 12);
      const padMat = new THREE.MeshBasicMaterial({
        map: boostTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.rotation.x = -Math.PI / 2;
      padMesh.rotation.z = -Math.atan2(tangent.x, tangent.z);
      padMesh.position.set(pt.x, 0.1, pt.z);

      this.scene.add(padMesh);
      this.boostPads.push({
        mesh: padMesh,
        position: pt,
        radius: 4.5
      });
    });
  }

  getClosestPointAndT(pos) {
    const samples = 160;
    let minDist = Infinity;
    let bestT = 0;
    let bestPt = null;

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const pt = this.spline.getPointAt(t);
      const dx = pos.x - pt.x;
      const dz = pos.z - pt.z;
      const d = dx * dx + dz * dz;
      if (d < minDist) {
        minDist = d;
        bestT = t;
        bestPt = pt;
      }
    }

    const delta = 1 / samples;
    for (let i = -6; i <= 6; i++) {
      let t = (bestT + (i * delta * 0.16)) % 1;
      if (t < 0) t += 1;
      const pt = this.spline.getPointAt(t);
      const dx = pos.x - pt.x;
      const dz = pos.z - pt.z;
      const d = dx * dx + dz * dz;
      if (d < minDist) {
        minDist = d;
        bestT = t;
        bestPt = pt;
      }
    }

    return {
      t: bestT,
      point: bestPt,
      distance: Math.sqrt(minDist)
    };
  }

  getRespawnTransform(t) {
    const pt = this.spline.getPointAt(t);
    const tangent = this.spline.getTangentAt(t).normalize();
    return {
      position: new THREE.Vector3(pt.x, 0.35, pt.z),
      rotationY: Math.atan2(tangent.x, tangent.z)
    };
  }
}
