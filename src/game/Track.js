import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * A flat closed-loop race track built from a track definition (see tracksData.js).
 * All meshes live inside `this.group` so a track can be disposed / swapped at runtime.
 *
 * The spline is pre-sampled every ~2 m into lookup tables (positions, tangents,
 * normals, curvature). Cars keep a sample-index hint so closest-point queries are
 * a cheap local search instead of the old 160x getPointAt() global scan.
 */
export class Track {
  constructor(scene, def) {
    this.scene = scene;
    this.def = def;
    this.theme = def.theme || {};

    this.trackWidth = def.trackWidth || 20;           // barrier to barrier
    this.kerbWidth = 1.2;
    this.roadWidth = this.trackWidth - this.kerbWidth * 2;
    this.wallHeight = 1.0;
    this.maxAllowedLateral = this.trackWidth / 2 - 0.9; // car centre limit

    this.group = new THREE.Group();
    this.group.name = `Track:${def.id}`;
    this.scene.add(this.group);

    this.checkpoints = [];
    this.sectorCount = 16;
    this.boostPads = [];
    this.startLightMats = [];
    this.brakeZones = [];

    this.initSpline();
    this.buildSamples();
    this.buildRoadMesh();
    this.buildKerbs();
    this.buildCrashBarriers();
    this.buildViaductStructure();
    this.buildStartFinishLine();
    this.buildBrakeDistanceMarkers();
    this.buildCornerChevrons();
    this.buildSectorPortals();
    this.buildTireBarriers();
    this.buildCheckpoints();
    this.buildBoostPads();
  }

  // ------------------------------------------------------------------
  // Geometry helpers
  // ------------------------------------------------------------------
  initSpline() {
    const pts = this.def.points.map(pt =>
      pt.length >= 3 ? new THREE.Vector3(pt[0], pt[1], pt[2]) : new THREE.Vector3(pt[0], 0, pt[1])
    );
    this.spline = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    this.spline.arcLengthDivisions = 3000;
    this.trackLength = this.spline.getLength();
  }

  buildSamples() {
    const N = Math.max(400, Math.ceil(this.trackLength / 2.5));
    this.sampleCount = N;
    this.sampleSpacing = this.trackLength / N;
    this.samplePos = new Array(N);
    this.sampleTan = new Array(N);
    this.sampleTan3D = new Array(N);
    this.sampleNorm = new Array(N);
    this.sampleSlope = new Float32Array(N);
    this.sampleCurv = new Float32Array(N); // signed rad / metre (+ = turning left / towards +normal)

    for (let i = 0; i < N; i++) {
      const t = i / N;
      const p = this.spline.getPointAt(t);
      p.y = Math.max(0, p.y);
      const tan3D = this.spline.getTangentAt(t).normalize();
      const tan = new THREE.Vector3(tan3D.x, 0, tan3D.z).normalize();
      this.samplePos[i] = p;
      this.sampleTan[i] = tan;
      this.sampleTan3D[i] = tan3D;
      this.sampleNorm[i] = new THREE.Vector3().crossVectors(UP, tan).normalize();
    }

    for (let i = 0; i < N; i++) {
      const pPrev = this.samplePos[(i - 2 + N) % N];
      const pNext = this.samplePos[(i + 2) % N];
      const xzSpan = Math.max(0.01, Math.hypot(pNext.x - pPrev.x, pNext.z - pPrev.z));
      const slope = Math.atan2(pNext.y - pPrev.y, xzSpan);
      this.sampleSlope[i] = slope;
      this.sampleTan3D[i].set(
        this.sampleTan[i].x * Math.cos(slope),
        Math.sin(slope),
        this.sampleTan[i].z * Math.cos(slope)
      ).normalize();
    }

    // Signed curvature using a +-3 sample window, then smoothed
    const raw = new Float32Array(N);
    const k = 3;
    for (let i = 0; i < N; i++) {
      const a = this.sampleTan[(i - k + N) % N];
      const b = this.sampleTan[(i + k) % N];
      const ang = Math.atan2(a.z * b.x - a.x * b.z, a.x * b.x + a.z * b.z);
      raw[i] = ang / (2 * k * this.sampleSpacing);
    }
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let j = -2; j <= 2; j++) s += raw[(i + j + N) % N];
      this.sampleCurv[i] = s / 5;
    }
  }

  wrapIndex(i) {
    const N = this.sampleCount;
    return ((Math.round(i) % N) + N) % N;
  }

  indexFromT(t) {
    return this.wrapIndex(((t % 1) + 1) % 1 * this.sampleCount);
  }

  /** World position at lap fraction t with a lateral offset (+ = towards normal). */
  getPositionAt(t, lateral = 0, target = new THREE.Vector3()) {
    const i = this.indexFromT(t);
    return target.copy(this.samplePos[i]).addScaledVector(this.sampleNorm[i], lateral);
  }

  /**
   * Closest centre-line point to `pos`. Pass the previous sample index as `hint`
   * for a fast local search. Returns index, t (0..1), point, tangent, normal,
   * signed lateral offset and planar distance.
   */
  getClosest(pos, hint = -1) {
    const N = this.sampleCount;
    const P = this.samplePos;
    let best = -1;
    let bestD = Infinity;

    if (hint >= 0) {
      const W = 38;
      for (let k = -W; k <= W; k++) {
        const i = (hint + k + N) % N;
        const dx = pos.x - P[i].x;
        const dz = pos.z - P[i].z;
        const dy = pos.y - P[i].y;
        const d = dx * dx + dz * dz + dy * dy * 2.5;
        if (d < bestD) { bestD = d; best = i; }
      }
      const limit = this.trackWidth * 2.5;
      if (bestD > limit * limit) best = -1;
    }

    if (best < 0) {
      bestD = Infinity;
      for (let i = 0; i < N; i++) {
        const dx = pos.x - P[i].x;
        const dz = pos.z - P[i].z;
        const dy = pos.y - P[i].y;
        const d = dx * dx + dz * dz + dy * dy * 3.5;
        if (d < bestD) { bestD = d; best = i; }
      }
    }

    // Refine: project onto the neighbouring segment for a continuous t
    let base = best;
    let frac = this.projectFrac(pos, best, (best + 1) % N);
    if (frac < 0) {
      base = (best - 1 + N) % N;
      frac = this.projectFrac(pos, base, best);
    }
    frac = Math.min(1, Math.max(0, frac));

    const nextBase = (base + 1) % N;
    const a = P[base];
    const b = P[nextBase];
    const point = new THREE.Vector3(
      a.x + (b.x - a.x) * frac,
      a.y + (b.y - a.y) * frac,
      a.z + (b.z - a.z) * frac
    );
    const tangent = this.sampleTan[best];
    const normal = this.sampleNorm[best];
    const slope = this.sampleSlope
      ? this.sampleSlope[base] + (this.sampleSlope[nextBase] - this.sampleSlope[base]) * frac
      : 0;
    const dx = pos.x - point.x;
    const dz = pos.z - point.z;
    const lateral = dx * normal.x + dz * normal.z;

    return {
      index: best,
      t: (base + frac) / N,
      point,
      tangent,
      normal,
      slope,
      lateral,
      distance: Math.sqrt(dx * dx + dz * dz)
    };
  }

  projectFrac(pos, i0, i1) {
    const a = this.samplePos[i0];
    const b = this.samplePos[i1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1;
    return ((pos.x - a.x) * abx + (pos.z - a.z) * abz) / len2;
  }

  /** Backwards compatible helper used by older code paths. */
  getClosestPointAndT(pos, hint = -1) {
    return this.getClosest(pos, hint);
  }

  getRespawnTransform(t, lateral = 0) {
    const i = this.indexFromT(t);
    const tan = this.sampleTan[i];
    const pos = this.samplePos[i].clone().addScaledVector(this.sampleNorm[i], lateral);
    pos.y += 0.05;
    return { position: pos, rotationY: Math.atan2(tan.x, tan.z), slope: this.sampleSlope ? this.sampleSlope[i] : 0, index: i };
  }

  /** Returns true if a non-adjacent track section passes within `radius` in XZ plane. */
  hasOtherSectionNear(sampleIdx, radius = 20) {
    const N = this.sampleCount;
    const p = this.samplePos[sampleIdx];
    const r2 = radius * radius;
    const minArcSamples = Math.max(20, Math.round(55 / this.sampleSpacing));
    for (let j = 0; j < N; j += 2) {
      const arcDiff = Math.abs(j - sampleIdx);
      const wrapArc = Math.min(arcDiff, N - arcDiff);
      if (wrapArc < minArcSamples) continue;
      const dx = this.samplePos[j].x - p.x;
      const dz = this.samplePos[j].z - p.z;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }

  /** Planar distance from (x, z) to the centre line (coarse, used at build time). */
  distanceToCentreLine(x, z, stride = 2) {
    let best = Infinity;
    for (let i = 0; i < this.sampleCount; i += stride) {
      const p = this.samplePos[i];
      const dx = x - p.x;
      const dz = z - p.z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  isClearOfTrack(x, z, margin = 6) {
    return this.distanceToCentreLine(x, z) > this.trackWidth / 2 + margin;
  }

  getBounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of this.samplePos) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
  }

  // ------------------------------------------------------------------
  // Strip builder (road, kerbs, walls) driven by the sample table
  // ------------------------------------------------------------------
  buildStrip(innerOffset, outerOffset, y0, y1, vScale, material, vertical = false) {
    const N = this.sampleCount;
    const verts = [];
    const uvs = [];
    const idx = [];
    let dist = 0;

    for (let i = 0; i <= N; i++) {
      const s = i % N;
      if (i > 0) dist += this.sampleSpacing;
      const p = this.samplePos[s];
      const n = this.sampleNorm[s];
      const v = dist / vScale;

      if (vertical) {
        const x = p.x + n.x * innerOffset;
        const z = p.z + n.z * innerOffset;
        verts.push(x, p.y + y0, z, x, p.y + y1, z);
        uvs.push(v, 0, v, 1);
      } else {
        verts.push(p.x + n.x * innerOffset, p.y + y0, p.z + n.z * innerOffset);
        verts.push(p.x + n.x * outerOffset, p.y + y1, p.z + n.z * outerOffset);
        uvs.push(0, v, 1, v);
      }

      if (i < N) {
        const b = i * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    this.group.add(mesh);
    return mesh;
  }

  buildRoadMesh() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = this.theme.tarmac || '#1c1e24';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 6000; i++) {
      const r = Math.random();
      ctx.fillStyle = r > 0.66 ? 'rgba(0,0,0,0.35)' : (r > 0.33 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.09)');
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    // Rubbered-in racing grooves
    [[110, 190], [322, 402]].forEach(([a, b]) => {
      const g = ctx.createLinearGradient(a, 0, b, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(a, 0, b - a, 512);
    });

    // Edge lines + dashed centre line
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(14, 0, 10, 512);
    ctx.fillRect(488, 0, 10, 512);
    ctx.fillRect(250, 0, 12, 256);

    const roadTex = new THREE.CanvasTexture(canvas);
    roadTex.wrapS = THREE.ClampToEdgeWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.colorSpace = THREE.SRGBColorSpace;
    roadTex.anisotropy = 16;

    // Procedural asphalt grain bump map & racing-line/puddle roughness map
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 256;
    bumpCanvas.height = 512;
    const bctx = bumpCanvas.getContext('2d');
    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 6500; i++) {
      const v = 90 + ((i * 73) % 85);
      bctx.fillStyle = `rgb(${v},${v},${v})`;
      bctx.fillRect((i * 47) % 256, (i * 113) % 512, 2, 2);
    }
    const bumpTex = new THREE.CanvasTexture(bumpCanvas);
    bumpTex.wrapS = THREE.ClampToEdgeWrapping;
    bumpTex.wrapT = THREE.RepeatWrapping;

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = 256;
    roughCanvas.height = 512;
    const rctx = roughCanvas.getContext('2d');
    rctx.fillStyle = this.def.id === 'buriram' ? '#b8b8b8' : '#e0e0e0';
    rctx.fillRect(0, 0, 256, 512);
    // Subtle smoother worn racing grooves + glossy puddles in night circuit
    const grooveCol = this.def.id === 'buriram' ? 'rgba(40,40,40,0.45)' : 'rgba(130,130,130,0.28)';
    rctx.fillStyle = grooveCol;
    rctx.fillRect(58, 0, 28, 512);
    rctx.fillRect(170, 0, 28, 512);
    if (this.def.id === 'buriram' || this.def.id === 'snow') {
      for (let p = 0; p < 18; p++) {
        const px = 28 + ((p * 89) % 200);
        const py = (p * 137) % 512;
        const rg = rctx.createRadialGradient(px, py, 2, px, py, 28);
        rg.addColorStop(0, 'rgba(30,30,30,0.65)');
        rg.addColorStop(1, 'rgba(30,30,30,0)');
        rctx.fillStyle = rg;
        rctx.beginPath();
        rctx.ellipse(px, py, 22, 38, 0, 0, Math.PI * 2);
        rctx.fill();
      }
    }
    const roughTex = new THREE.CanvasTexture(roughCanvas);
    roughTex.wrapS = THREE.ClampToEdgeWrapping;
    roughTex.wrapT = THREE.RepeatWrapping;

    let roadRoughness = 0.72;
    let roadMetalness = 0.08;
    if (this.def.id === 'buriram') {
      // Buriram Night GP: Wet tarmac with specular reflections under floodlights
      roadRoughness = 0.36;
      roadMetalness = 0.38;
    } else if (this.def.id === 'snow') {
      // Frosty Peak: Cold frozen sheen
      roadRoughness = 0.44;
      roadMetalness = 0.22;
    } else if (this.def.id === 'volcano') {
      // Ashi Volcano: Basalt dark asphalt
      roadRoughness = 0.68;
      roadMetalness = 0.16;
    }

    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      bumpMap: bumpTex,
      bumpScale: this.def.id === 'volcano' ? 0.06 : 0.038,
      roughnessMap: roughTex,
      roughness: roadRoughness,
      metalness: roadMetalness,
      side: THREE.DoubleSide
    });

    const half = this.roadWidth / 2;
    this.trackMesh = this.buildStrip(-half, half, 0.05, 0.05, 14, roadMat);
    this.trackMesh.receiveShadow = true;
  }

  buildKerbs() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#d21424';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#f0f2f5';
    ctx.fillRect(0, 64, 64, 64);
    const kerbTex = new THREE.CanvasTexture(canvas);
    kerbTex.wrapS = THREE.ClampToEdgeWrapping;
    kerbTex.wrapT = THREE.RepeatWrapping;
    kerbTex.colorSpace = THREE.SRGBColorSpace;
    kerbTex.anisotropy = 16;

    const kerbMat = new THREE.MeshStandardMaterial({
      map: kerbTex,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    const half = this.roadWidth / 2;
    const k = this.kerbWidth;
    const peak = k * 0.32;
    // True 3D beveled raised kerbs casting crisp edge shadows onto the road
    const kerbInL = this.buildStrip(-half - peak, -half, 0.16, 0.05, 6, kerbMat);
    const kerbOutL = this.buildStrip(-half - k, -half - peak, 0.09, 0.16, 6, kerbMat);
    const kerbInR = this.buildStrip(half, half + peak, 0.05, 0.16, 6, kerbMat);
    const kerbOutR = this.buildStrip(half + peak, half + k, 0.16, 0.09, 6, kerbMat);
    this.kerbMeshL = kerbInL;
    this.kerbMeshR = kerbInR;
    [kerbInL, kerbOutL, kerbInR, kerbOutR].forEach(m => {
      m.castShadow = true;
      m.receiveShadow = true;
    });

    // Graded 3D perimeter shoulder embankments blending barrier bases smoothly into terrain
    const outerHalf = this.trackWidth / 2;
    const shoulderColor = this.def.id === 'snow' ? 0xbcd6ef : this.def.id === 'volcano' ? 0x261614 : this.def.id === 'buriram' ? 0x1d2536 : 0xdcc39b;
    const shoulderMat = new THREE.MeshStandardMaterial({
      color: shoulderColor,
      roughness: 0.92,
      metalness: 0.04,
      side: THREE.DoubleSide
    });
    const bermL = this.buildStrip(-outerHalf - 3.4, -outerHalf, -0.04, 0.22, 10, shoulderMat);
    const bermR = this.buildStrip(outerHalf, outerHalf + 3.4, 0.22, -0.04, 10, shoulderMat);
    bermL.receiveShadow = true;
    bermR.receiveShadow = true;
  }

  buildCrashBarriers() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#2f343f';
    ctx.fillRect(0, 0, 1024, 256);
    for (let x = 0; x < 1024; x += 32) {
      ctx.fillStyle = (x / 32) % 2 === 0 ? '#ffd700' : '#111111';
      ctx.fillRect(x, 0, 32, 36);
    }

    const sponsors = [
      { text: 'ASHI GRAND PRIX', bg: '#00f3ff', color: '#000000' },
      { text: this.def.name.toUpperCase(), bg: '#ff0055', color: '#ffffff' },
      { text: 'PIRELLI RACING', bg: '#ffd700', color: '#d21424' },
      { text: 'ASHI LANE 3D', bg: '#7928ca', color: '#00f3ff' }
    ];
    sponsors.forEach((sp, i) => {
      const segW = 256;
      const sx = i * segW;
      ctx.fillStyle = sp.bg;
      ctx.fillRect(sx + 8, 60, segW - 16, 150);
      ctx.fillStyle = sp.color;
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let size = 26;
      while (ctx.measureText(sp.text).width > segW - 28 && size > 12) {
        size -= 2;
        ctx.font = `bold ${size}px sans-serif`;
      }
      ctx.fillText(sp.text, sx + segW / 2, 135);
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;

    const wallMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.65,
      metalness: 0.25,
      side: THREE.DoubleSide
    });

    const half = this.trackWidth / 2;
    const wallThickness = 0.38;
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x2a303d,
      roughness: 0.42,
      metalness: 0.65,
      side: THREE.DoubleSide
    });

    // Instanced structural H-posts along both barriers casting crisp 3D shadows
    const postStride = Math.max(4, Math.round(12 / this.sampleSpacing));
    const postTransforms = [];

    [-half, half].forEach((offset, sideIdx) => {
      const outSign = sideIdx === 0 ? -1 : 1;
      const outerOffset = offset + outSign * wallThickness;
      const wallIn = this.buildStrip(offset, offset, 0, this.wallHeight, 8, wallMat, true);
      const wallOut = this.buildStrip(outerOffset, outerOffset, 0, this.wallHeight, 8, wallMat, true);
      const capMin = Math.min(offset, outerOffset);
      const capMax = Math.max(offset, outerOffset);
      const wallTop = this.buildStrip(capMin, capMax, this.wallHeight, this.wallHeight, 8, capMat, false);

      wallIn.castShadow = true;
      wallIn.receiveShadow = true;
      wallOut.receiveShadow = true;
      wallTop.receiveShadow = true;

      // Glowing neon top rail + soft additive glow sleeve
      const railPts = [];
      for (let i = 0; i < this.sampleCount; i += 4) {
        const p = this.samplePos[i];
        const n = this.sampleNorm[i];
        railPts.push(new THREE.Vector3(p.x + n.x * (offset + outSign * 0.05), p.y + this.wallHeight + 0.06, p.z + n.z * (offset + outSign * 0.05)));
      }
      const railCurve = new THREE.CatmullRomCurve3(railPts, true);
      const railCol = sideIdx === 0 ? (this.theme.railA ?? 0xff0055) : (this.theme.railB ?? 0x00f3ff);
      const railGeo = new THREE.TubeGeometry(railCurve, Math.min(360, railPts.length), 0.075, 4, true);
      const railMat = new THREE.MeshBasicMaterial({ color: railCol });
      this.group.add(new THREE.Mesh(railGeo, railMat));

      const haloGeo = new THREE.TubeGeometry(railCurve, Math.min(300, railPts.length), 0.16, 4, true);
      const haloMat = new THREE.MeshBasicMaterial({
        color: railCol,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      this.group.add(new THREE.Mesh(haloGeo, haloMat));

      for (let i = 0; i < this.sampleCount; i += postStride) {
        const p = this.samplePos[i];
        const n = this.sampleNorm[i];
        const tan = this.sampleTan[i];
        const midOff = offset + outSign * (wallThickness * 0.55);
        postTransforms.push({
          x: p.x + n.x * midOff,
          y: p.y,
          z: p.z + n.z * midOff,
          tan
        });
      }
    });

    if (postTransforms.length) {
      const postGeo = new THREE.BoxGeometry(0.46, this.wallHeight + 0.24, 0.24);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x3b4252, metalness: 0.8, roughness: 0.32 });
      const posts = new THREE.InstancedMesh(postGeo, postMat, postTransforms.length);
      posts.castShadow = true;
      posts.receiveShadow = true;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3(1, 1, 1);
      const pos = new THREE.Vector3();
      postTransforms.forEach((pt, idx) => {
        q.setFromUnitVectors(Z_AXIS, pt.tan);
        pos.set(pt.x, pt.y + (this.wallHeight + 0.24) * 0.5, pt.z);
        m.compose(pos, q, s);
        posts.setMatrixAt(idx, m);
      });
      this.group.add(posts);
    }
  }

  /**
   * Builds solid structural box-girder road decks, side skirts, under-deck neon strips,
   * and concrete/steel twin support piers along elevated sections (`y > 0.45m`).
   */
  buildViaductStructure() {
    const N = this.sampleCount;
    const half = this.trackWidth / 2;
    const outerX = half + 0.44;
    const bellyX = half * 0.68;
    const girderDepth = 1.25;

    const girderMat = new THREE.MeshStandardMaterial({
      color: this.def.id === 'volcano' ? 0x2a1c1a : this.def.id === 'snow' ? 0x4b5c74 : 0x262d3d,
      roughness: 0.65,
      metalness: 0.35,
      side: THREE.DoubleSide
    });
    const pierMat = new THREE.MeshStandardMaterial({
      color: this.def.id === 'volcano' ? 0x241716 : 0x353e52,
      roughness: 0.72,
      metalness: 0.25
    });
    const underNeonMat = new THREE.MeshBasicMaterial({ color: this.theme.railB ?? 0x00f3ff });

    // Extract contiguous spans where road height > 0.35m
    const spans = [];
    let cur = null;
    for (let i = 0; i < N; i++) {
      if (this.samplePos[i].y > 0.35) {
        if (!cur) cur = [i, i];
        else cur[1] = i;
      } else if (cur) {
        spans.push(cur);
        cur = null;
      }
    }
    if (cur) spans.push(cur);

    const pierPlacements = [];
    const pierStride = Math.max(10, Math.round(28 / this.sampleSpacing));

    spans.forEach(([s0, s1]) => {
      // Extend 1 sample past each end to blend cleanly into terrain
      const start = Math.max(0, s0 - 1);
      const end = Math.min(N - 1, s1 + 1);
      const verts = [];
      const indices = [];
      const count = end - start + 1;
      for (let k = 0; k < count; k++) {
        const i = (start + k) % N;
        const p = this.samplePos[i];
        const n = this.sampleNorm[i];
        const topY = p.y + 0.02;
        const botY = Math.max(-0.4, p.y - girderDepth);
        // 4 cross-section points: top-left, bottom-left belly, bottom-right belly, top-right
        verts.push(
          p.x - n.x * outerX, topY, p.z - n.z * outerX,
          p.x - n.x * bellyX, botY, p.z - n.z * bellyX,
          p.x + n.x * bellyX, botY, p.z + n.z * bellyX,
          p.x + n.x * outerX, topY, p.z + n.z * outerX
        );
        if (k < count - 1) {
          const b = k * 4;
          const nb = (k + 1) * 4;
          // Left haunch wall, bottom soffit, right haunch wall
          indices.push(
            b, b + 1, nb, b + 1, nb + 1, nb,
            b + 1, b + 2, nb + 1, b + 2, nb + 2, nb + 1,
            b + 2, b + 3, nb + 2, b + 3, nb + 3, nb + 2
          );
        }
      }
      const girderGeo = new THREE.BufferGeometry();
      girderGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      girderGeo.setIndex(indices);
      girderGeo.computeVertexNormals();
      const girderMesh = new THREE.Mesh(girderGeo, girderMat);
      girderMesh.castShadow = true;
      girderMesh.receiveShadow = true;
      this.group.add(girderMesh);

      // Under-bridge glowing neon accent trim along both outer belly edges (when elevated enough)
      const highPtsL = [];
      const highPtsR = [];
      for (let i = s0; i <= s1; i += 2) {
        const p = this.samplePos[i];
        if (p.y > 2.2) {
          const n = this.sampleNorm[i];
          highPtsL.push(new THREE.Vector3(p.x - n.x * (bellyX + 0.25), p.y - girderDepth + 0.15, p.z - n.z * (bellyX + 0.25)));
          highPtsR.push(new THREE.Vector3(p.x + n.x * (bellyX + 0.25), p.y - girderDepth + 0.15, p.z + n.z * (bellyX + 0.25)));
        }
      }
      [highPtsL, highPtsR].forEach(pts => {
        if (pts.length >= 3) {
          const curve = new THREE.CatmullRomCurve3(pts, false);
          this.group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, 0.11, 4, false), underNeonMat));
        }
      });

      // Collect clean support pier columns (never intersecting a lower track deck!)
      for (let i = s0 + 2; i <= s1 - 2; i += pierStride) {
        const p = this.samplePos[i];
        if (p.y < 1.8) continue;
        if (this.hasOtherSectionNear(i, half + 7.5)) continue;
        pierPlacements.push(i);
      }
    });

    if (pierPlacements.length) {
      const capGeo = new THREE.BoxGeometry(this.trackWidth * 0.78, 0.9, 1.5);
      const colGeo = new THREE.BoxGeometry(1.4, 1, 1.4);
      const caps = new THREE.InstancedMesh(capGeo, pierMat, pierPlacements.length);
      const cols = new THREE.InstancedMesh(colGeo, pierMat, pierPlacements.length * 2);
      caps.castShadow = true;
      caps.receiveShadow = true;
      cols.castShadow = true;
      cols.receiveShadow = true;

      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      const pos = new THREE.Vector3();
      const colOffset = half * 0.48;

      pierPlacements.forEach((idx, k) => {
        const p = this.samplePos[idx];
        const n = this.sampleNorm[idx];
        const tan = this.sampleTan[idx];
        q.setFromUnitVectors(Z_AXIS, tan);

        const capY = p.y - girderDepth - 0.35;
        pos.set(p.x, capY, p.z);
        s.set(1, 1, 1);
        m.compose(pos, q, s);
        caps.setMatrixAt(k, m);

        const colH = Math.max(1.5, capY + 1.2);
        [-colOffset, colOffset].forEach((lat, side) => {
          pos.set(p.x + n.x * lat, colH * 0.5 - 1.0, p.z + n.z * lat);
          s.set(1, colH, 1);
          m.compose(pos, q, s);
          cols.setMatrixAt(k * 2 + side, m);
        });
      });
      this.group.add(caps, cols);
    }
  }

  /**
   * Overhead illuminated timing portals at Sector 2 & Sector 3 checkpoints.
   */
  buildSectorPortals() {
    const half = this.trackWidth / 2 + 1.1;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x202634, metalness: 0.85, roughness: 0.25 });
    const trimMat = new THREE.MeshBasicMaterial({ color: this.theme.railB ?? 0x00f3ff });
    const tunnelRange = this.def.tunnel;

    [
      { baseT: 0.34, label: 'SECTOR 2' },
      { baseT: 0.67, label: 'SECTOR 3' }
    ].forEach(({ baseT, label }) => {
      let t = baseT;
      if (tunnelRange && t >= tunnelRange[0] - 0.04 && t <= tunnelRange[1] + 0.04) {
        t = (tunnelRange[1] + 0.06) % 1;
      }
      const idx = this.indexFromT(t);
      if (this.hasOtherSectionNear(idx, half + 6)) return;

      const p = this.samplePos[idx];
      const tan = this.sampleTan[idx];
      const n = this.sampleNorm[idx];
      const gate = new THREE.Group();
      gate.position.set(p.x, p.y, p.z);
      gate.quaternion.setFromUnitVectors(Z_AXIS, tan);

      const colGeo = new THREE.CylinderGeometry(0.28, 0.36, 9.6, 8);
      const colL = new THREE.Mesh(colGeo, poleMat);
      colL.position.set(-half, 4.8, 0);
      const colR = new THREE.Mesh(colGeo, poleMat);
      colR.position.set(half, 4.8, 0);
      colL.castShadow = true;
      colR.castShadow = true;

      const span = half * 2 + 1.2;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 0.75, 0.9), poleMat);
      beam.position.set(0, 9.5, 0);
      beam.castShadow = true;

      const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(span * 0.96, 0.16, 1.0), trimMat);
      glowStrip.position.set(0, 9.1, 0);

      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 96;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#0b101d';
      ctx.fillRect(0, 0, 512, 96);
      ctx.strokeStyle = this.theme.railB ? `#${this.theme.railB.toString(16).padStart(6, '0')}` : '#00f3ff';
      ctx.lineWidth = 5;
      ctx.strokeRect(4, 4, 504, 88);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${label}  //  ${this.def.name.toUpperCase()}`, 256, 48);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(14, this.roadWidth * 0.78), 2.1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      sign.position.set(0, 10.7, 0);

      gate.add(colL, colR, beam, glowStrip, sign);
      this.group.add(gate);
    });
  }

  buildStartFinishLine() {
    const pt = this.samplePos[0];
    const tangent = this.sampleTan[0];
    const normal = this.sampleNorm[0];

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
    checkerTex.colorSpace = THREE.SRGBColorSpace;

    // Plane: X across the track, length along travel direction
    const finishGeo = new THREE.PlaneGeometry(this.roadWidth, 4);
    finishGeo.rotateX(-Math.PI / 2);
    const finishMesh = new THREE.Mesh(finishGeo, new THREE.MeshStandardMaterial({
      map: checkerTex,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    }));
    finishMesh.quaternion.setFromUnitVectors(Z_AXIS, tangent);
    finishMesh.position.set(pt.x, 0.07, pt.z);
    finishMesh.receiveShadow = true;
    this.group.add(finishMesh);

    // Painted grid boxes behind the line
    const boxMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    for (let g = 0; g < 8; g++) {
      const row = Math.floor(g / 2);
      const col = g % 2 === 0 ? -1 : 1;
      const lateral = col * this.trackWidth * 0.2;
      const back = 12 + row * 10;
      const pos = pt.clone().addScaledVector(tangent, -back).addScaledVector(normal, lateral);
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.35).rotateX(-Math.PI / 2), boxMat);
      bar.quaternion.setFromUnitVectors(Z_AXIS, tangent);
      bar.position.set(pos.x, 0.07, pos.z).addScaledVector(tangent, 2.6);
      this.group.add(bar);
    }

    this.buildStartGantry(pt, tangent, normal);
  }

  buildStartGantry(pt, tangent, normal) {
    const gantry = new THREE.Group();
    const halfWidth = this.trackWidth / 2 + 1.2;
    const facing = tangent.clone().negate(); // face the grid (cars approach from behind)

    const steelMat = new THREE.MeshStandardMaterial({ color: 0x5c667d, metalness: 0.72, roughness: 0.34 });
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.8, roughness: 0.25 });
    const accentMat = new THREE.MeshBasicMaterial({ color: this.theme.railB ?? 0x00f3ff });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff5db });

    const colGeo = new THREE.CylinderGeometry(0.55, 0.7, 10.6, 12);
    const colL = new THREE.Mesh(colGeo, steelMat);
    colL.position.copy(pt).addScaledVector(normal, -halfWidth);
    colL.position.y = 5.3;
    colL.castShadow = true;
    colL.receiveShadow = true;
    const colR = new THREE.Mesh(colGeo, steelMat);
    colR.position.copy(pt).addScaledVector(normal, halfWidth);
    colR.position.y = 5.3;
    colR.castShadow = true;
    colR.receiveShadow = true;

    // 3D double-chord overhead steel truss
    const beamLower = new THREE.Mesh(new THREE.BoxGeometry(this.trackWidth + 4.4, 0.75, 1.5), steelMat);
    beamLower.position.set(pt.x, 9.2, pt.z);
    beamLower.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), normal);
    beamLower.castShadow = true;
    beamLower.receiveShadow = true;

    const beamUpper = new THREE.Mesh(new THREE.BoxGeometry(this.trackWidth + 4.4, 0.55, 1.5), steelMat);
    beamUpper.position.set(pt.x, 10.6, pt.z);
    beamUpper.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), normal);
    beamUpper.castShadow = true;
    beamUpper.receiveShadow = true;

    const trussGroup = new THREE.Group();
    trussGroup.position.set(pt.x, 9.9, pt.z);
    trussGroup.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), normal);
    const strutGeo = new THREE.BoxGeometry(0.24, 1.55, 1.1);
    let strutIdx = 0;
    for (let sx = -this.trackWidth * 0.5; sx <= this.trackWidth * 0.5; sx += 2.4) {
      const strut = new THREE.Mesh(strutGeo, steelMat);
      strut.position.set(sx, 0, 0);
      strut.rotation.z = strutIdx % 2 === 0 ? 0.38 : -0.38;
      strut.castShadow = true;
      trussGroup.add(strut);
      strutIdx++;
    }

    // Overhead stadium floodlight pods pointing onto start grid
    const floodGroup = new THREE.Group();
    floodGroup.position.set(pt.x, 9.0, pt.z);
    floodGroup.quaternion.setFromUnitVectors(Z_AXIS, facing);
    [-6.8, -3.4, 3.4, 6.8].forEach(lx => {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 0.6), housingMat);
      pod.position.set(lx, 0.35, 1.1);
      pod.rotation.x = 0.48;
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), lampMat);
      lens.position.set(0, 0, 0.31);
      pod.add(lens);
      floodGroup.add(pod);
    });
    const edgeGlow = new THREE.Mesh(new THREE.BoxGeometry(this.trackWidth + 4.4, 0.12, 1.58), accentMat);
    edgeGlow.position.set(pt.x, 8.85, pt.z);
    edgeGlow.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), normal);

    // Subtle illuminated spotlight glow pool on start/finish grid asphalt
    const poolC = document.createElement('canvas');
    poolC.width = 128;
    poolC.height = 128;
    const pctx = poolC.getContext('2d');
    const pg = pctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    pg.addColorStop(0, 'rgba(255, 245, 215, 0.28)');
    pg.addColorStop(0.55, 'rgba(0, 220, 255, 0.10)');
    pg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    pctx.fillStyle = pg;
    pctx.fillRect(0, 0, 128, 128);
    const poolTex = new THREE.CanvasTexture(poolC);
    poolTex.colorSpace = THREE.SRGBColorSpace;
    const gridPool = new THREE.Mesh(
      new THREE.PlaneGeometry(this.roadWidth * 1.1, 22).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    gridPool.position.set(pt.x, 0.08, pt.z).addScaledVector(facing, 6);
    gridPool.quaternion.setFromUnitVectors(Z_AXIS, facing);

    // F1 style start lights (5 pods) - driven by setStartLights()
    const lightsGroup = new THREE.Group();
    const bulbGeo = new THREE.CircleGeometry(0.35, 16);
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x220004 });
      this.startLightMats.push(mat);
      const pod = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.5), housingMat);
      pod.position.set((i - 2) * 1.8, 0, 0.85);
      pod.castShadow = true;
      const b1 = new THREE.Mesh(bulbGeo, mat);
      b1.position.set(0, 0.4, 0.26);
      const b2 = new THREE.Mesh(bulbGeo, mat);
      b2.position.set(0, -0.4, 0.26);
      pod.add(b1, b2);
      lightsGroup.add(pod);
    }
    lightsGroup.position.set(pt.x, 8.2, pt.z);
    lightsGroup.quaternion.setFromUnitVectors(Z_AXIS, facing);

    // Banner
    const bannerCanvas = document.createElement('canvas');
    bannerCanvas.width = 512;
    bannerCanvas.height = 128;
    const bctx = bannerCanvas.getContext('2d');
    bctx.fillStyle = '#0a0d18';
    bctx.fillRect(0, 0, 512, 128);
    bctx.strokeStyle = '#00f3ff';
    bctx.lineWidth = 6;
    bctx.strokeRect(6, 6, 500, 116);
    bctx.textAlign = 'center';
    let size = 36;
    bctx.font = `bold ${size}px sans-serif`;
    const title = this.def.name.toUpperCase();
    while (bctx.measureText(title).width > 470 && size > 16) {
      size -= 2;
      bctx.font = `bold ${size}px sans-serif`;
    }
    bctx.fillStyle = '#ff0055';
    bctx.fillText(title, 256, 56);
    bctx.font = 'bold 22px sans-serif';
    bctx.fillStyle = '#00f3ff';
    bctx.fillText('START / FINISH', 256, 96);

    const bannerTex = new THREE.CanvasTexture(bannerCanvas);
    bannerTex.colorSpace = THREE.SRGBColorSpace;
    const bannerHousing = new THREE.Mesh(new THREE.BoxGeometry(12.4, 2.5, 0.4), housingMat);
    bannerHousing.position.set(pt.x, 12.1, pt.z).addScaledVector(facing, 0.6);
    bannerHousing.quaternion.setFromUnitVectors(Z_AXIS, facing);
    bannerHousing.castShadow = true;

    const bannerMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 2.2),
      new THREE.MeshBasicMaterial({ map: bannerTex })
    );
    bannerMesh.position.set(pt.x, 12.1, pt.z).addScaledVector(facing, 0.82);
    bannerMesh.quaternion.setFromUnitVectors(Z_AXIS, facing);

    gantry.add(colL, colR, beamLower, beamUpper, trussGroup, floodGroup, edgeGlow, gridPool, lightsGroup, bannerHousing, bannerMesh);
    this.group.add(gantry);
  }

  /**
   * Start lights: `count` red pods lit (0..5). `green` turns all pods green (GO).
   */
  setStartLights(count, green = false) {
    this.startLightMats.forEach((m, i) => {
      if (green) m.color.setHex(0x00ff66);
      else m.color.setHex(i < count ? 0xff0022 : 0x220004);
    });
  }

  /** Finds the sharpest corners (local curvature peaks) - used for markers & AI. */
  findCorners(maxCount = 5, minCurv = 0.012) {
    const N = this.sampleCount;
    const window = Math.round(60 / this.sampleSpacing);
    const corners = [];
    for (let i = 0; i < N; i++) {
      const c = Math.abs(this.sampleCurv[i]);
      if (c < minCurv) continue;
      let isPeak = true;
      for (let k = -window; k <= window; k++) {
        if (k === 0) continue;
        if (Math.abs(this.sampleCurv[(i + k + N) % N]) > c) { isPeak = false; break; }
      }
      if (isPeak) corners.push({ index: i, curv: this.sampleCurv[i] });
    }
    corners.sort((a, b) => Math.abs(b.curv) - Math.abs(a.curv));
    return corners.slice(0, maxCount);
  }

  buildBrakeDistanceMarkers() {
    const corners = this.findCorners(5, 0.015);
    this.brakeZones = corners;
    const half = this.trackWidth / 2;
    const boardGeo = new THREE.BoxGeometry(1.6, 1.4, 0.2);
    const texCache = {};

    corners.forEach(corner => {
      // Corner turns towards sign(curv) side -> markers go on the outside
      const outsideSign = -Math.sign(corner.curv) || 1;
      [150, 100, 50].forEach(distM => {
        const i = this.wrapIndex(corner.index - distM / this.sampleSpacing - 25 / this.sampleSpacing);
        const p = this.samplePos[i];
        const tan = this.sampleTan[i];
        const n = this.sampleNorm[i];

        if (!texCache[distM]) {
          const c = document.createElement('canvas');
          c.width = 128;
          c.height = 128;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 128, 128);
          ctx.fillStyle = '#000000';
          ctx.font = '900 64px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${distM}`, 64, 64);
          texCache[distM] = new THREE.CanvasTexture(c);
          texCache[distM].colorSpace = THREE.SRGBColorSpace;
        }

        const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.8, 8);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x606878, metalness: 0.8, roughness: 0.3 });

        const bx = p.x + n.x * outsideSign * (half + 1.4);
        const bz = p.z + n.z * outsideSign * (half + 1.4);
        const q = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, tan.clone().negate());

        const board = new THREE.Mesh(boardGeo, new THREE.MeshStandardMaterial({ map: texCache[distM] }));
        board.position.set(bx, p.y + 1.85, bz);
        board.quaternion.copy(q);
        board.castShadow = true;
        board.receiveShadow = true;

        const post = new THREE.Mesh(poleGeo, poleMat);
        post.position.set(bx, p.y + 0.9, bz);
        post.castShadow = true;

        this.group.add(board, post);
      });
    });
  }

  buildCornerChevrons() {
    const corners = this.findCorners(7, 0.014);
    if (!corners.length) return;
    const half = this.trackWidth / 2;

    // Group left-turn vs right-turn illuminated chevron canvas texture (reused across all posts)
    const makeChevronTex = (dir) => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 96;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#111622';
      ctx.fillRect(0, 0, 128, 96);
      const accent = this.theme.railB ? `#${this.theme.railB.toString(16).padStart(6, '0')}` : '#ffdd00';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      ctx.strokeRect(3, 3, 122, 90);
      ctx.fillStyle = '#ffd500';
      ctx.beginPath();
      const s = dir >= 0 ? 1 : -1;
      for (const cx of [38, 78]) {
        ctx.moveTo(cx - 16 * s, 18);
        ctx.lineTo(cx + 16 * s, 48);
        ctx.lineTo(cx - 16 * s, 78);
        ctx.lineTo(cx - 2 * s, 78);
        ctx.lineTo(cx + 28 * s, 48);
        ctx.lineTo(cx - 2 * s, 18);
      }
      ctx.closePath();
      ctx.fill();
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    const texRight = makeChevronTex(1);
    const texLeft = makeChevronTex(-1);
    const matRight = new THREE.MeshBasicMaterial({ map: texRight });
    const matLeft = new THREE.MeshBasicMaterial({ map: texLeft });
    const backMat = new THREE.MeshStandardMaterial({ color: 0x222836, metalness: 0.7, roughness: 0.35 });
    const boardGeo = new THREE.BoxGeometry(2.1, 1.35, 0.16);
    const legGeo = new THREE.CylinderGeometry(0.07, 0.09, 1.85, 6);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x4b5568, metalness: 0.8, roughness: 0.25 });

    const leftBoards = [];
    const rightBoards = [];
    const allLegs = [];

    corners.forEach(corner => {
      const turnSign = Math.sign(corner.curv) || 1;
      const outsideSign = -turnSign;
      const list = turnSign > 0 ? leftBoards : rightBoards;
      for (let s = -2; s <= 2; s++) {
        const idx = this.wrapIndex(corner.index + s * (7 / this.sampleSpacing));
        if (this.hasOtherSectionNear(idx, half + 6)) continue;
        const p = this.samplePos[idx];
        const n = this.sampleNorm[idx];
        const bx = p.x + n.x * outsideSign * (half + 2.0);
        const bz = p.z + n.z * outsideSign * (half + 2.0);
        const faceDir = this.sampleTan[idx].clone().negate();
        const item = { bx, y: p.y, bz, faceDir };
        list.push(item);
        allLegs.push(item);
      }
    });

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();

    const addInst = (items, geo, mat, yOff, rotateFace) => {
      if (!items.length) return;
      const inst = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((it, k) => {
        if (rotateFace) q.setFromUnitVectors(Z_AXIS, it.faceDir);
        else q.identity();
        pos.set(it.bx, it.y + yOff, it.bz);
        m.compose(pos, q, s);
        inst.setMatrixAt(k, m);
      });
      this.group.add(inst);
    };

    addInst(leftBoards, boardGeo, [backMat, backMat, backMat, backMat, matLeft, backMat], 1.95, true);
    addInst(rightBoards, boardGeo, [backMat, backMat, backMat, backMat, matRight, backMat], 1.95, true);
    addInst(allLegs, legGeo, legMat, 0.92, false);
  }

  buildTireBarriers() {
    const tireMatDark = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.88 });
    const tireMatRed = new THREE.MeshStandardMaterial({ color: 0xd92638, roughness: 0.55 });
    const tireMatWhite = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.55 });
    const tireGeo = new THREE.TorusGeometry(0.42, 0.17, 6, 12);
    tireGeo.rotateX(Math.PI / 2);
    const half = this.trackWidth / 2;

    const darkPos = [];
    const redPos = [];
    const whitePos = [];

    this.brakeZones.forEach(corner => {
      const outsideSign = -Math.sign(corner.curv) || 1;
      for (let s = -3; s <= 3; s++) {
        const i = this.wrapIndex(corner.index + s * (4 / this.sampleSpacing));
        if (this.hasOtherSectionNear(i, half + 5)) continue;
        const p = this.samplePos[i];
        const n = this.sampleNorm[i];
        const bx = p.x + n.x * outsideSign * (half + 1.15);
        const bz = p.z + n.z * outsideSign * (half + 1.15);
        const midList = (s + 3) % 2 === 0 ? redPos : whitePos;
        for (let row = 0; row < 3; row++) {
          (row === 1 ? midList : darkPos).push(new THREE.Vector3(bx, p.y + 0.17 + row * 0.32, bz));
        }
      }
    });

    const m = new THREE.Matrix4();
    [
      [darkPos, tireMatDark],
      [redPos, tireMatRed],
      [whitePos, tireMatWhite]
    ].forEach(([pts, mat]) => {
      if (!pts.length) return;
      const inst = new THREE.InstancedMesh(tireGeo, mat, pts.length);
      pts.forEach((pt, k) => {
        m.makeTranslation(pt.x, pt.y, pt.z);
        inst.setMatrixAt(k, m);
      });
      this.group.add(inst);
    });
  }

  buildCheckpoints() {
    this.checkpoints = [];
    for (let i = 0; i < this.sectorCount; i++) {
      const t = i / this.sectorCount;
      const idx = this.indexFromT(t);
      this.checkpoints.push({
        index: i,
        t,
        position: this.samplePos[idx],
        tangent: this.sampleTan[idx],
        normal: this.sampleNorm[idx]
      });
    }
  }

  buildBoostPads() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,40,60,0.6)';
    ctx.fillRect(0, 0, 128, 256);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    for (let y = 40; y < 240; y += 70) {
      ctx.beginPath();
      ctx.moveTo(25, y + 30);
      ctx.lineTo(64, y);
      ctx.lineTo(103, y + 30);
      ctx.stroke();
    }
    const boostTex = new THREE.CanvasTexture(canvas);
    boostTex.colorSpace = THREE.SRGBColorSpace;
    boostTex.wrapS = THREE.ClampToEdgeWrapping;
    boostTex.wrapT = THREE.RepeatWrapping;

    const padMat = new THREE.MeshBasicMaterial({
      map: boostTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.boostPadMat = padMat;
    // Texture "up" (arrow tip) must point along +Z (travel direction)
    const padGeo = new THREE.PlaneGeometry(6, 12);
    padGeo.rotateX(Math.PI / 2);

    const railGeo = new THREE.BoxGeometry(0.22, 0.08, 12.2);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x006688, metalness: 0.8, roughness: 0.2 });

    (this.def.boostPads || []).forEach((t, k) => {
      const i = this.indexFromT(t);
      const lateral = (k % 3 - 1) * (this.roadWidth * 0.22);
      const p = this.samplePos[i].clone().addScaledVector(this.sampleNorm[i], lateral);
      const slopeTan = this.sampleTan3D ? this.sampleTan3D[i] : this.sampleTan[i];
      const qPad = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, slopeTan);
      const mesh = new THREE.Mesh(padGeo, padMat);
      mesh.quaternion.copy(qPad);
      mesh.position.set(p.x, p.y + 0.11, p.z);
      this.group.add(mesh);

      [-3.1, 3.1].forEach(sideOff => {
        const bezel = new THREE.Mesh(railGeo, railMat);
        bezel.position.set(p.x + this.sampleNorm[i].x * sideOff, p.y + 0.11, p.z + this.sampleNorm[i].z * sideOff);
        bezel.quaternion.copy(qPad);
        this.group.add(bezel);
      });

      this.boostPads.push({ mesh, position: new THREE.Vector3(p.x, p.y + 0.35, p.z), tangent: this.sampleTan[i], radius: 4.2 });
    });
  }

  update(delta) {
    if (this.boostPadMat && this.boostPadMat.map) {
      this.boostPadMat.map.offset.y = (this.boostPadMat.map.offset.y - delta * 1.2) % 1;
    }
  }

  dispose() {
    disposeObject3D(this.group);
    this.scene.remove(this.group);
  }
}

/** Disposes geometries, materials and (non-shared) textures of an object tree. */
export function disposeObject3D(root) {
  const geos = new Set();
  const mats = new Set();
  root.traverse(obj => {
    if (obj.geometry) geos.add(obj.geometry);
    if (obj.material) {
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => mats.add(m));
    }
  });
  geos.forEach(g => g.dispose());
  mats.forEach(m => {
    ['map', 'emissiveMap', 'alphaMap', 'bumpMap', 'roughnessMap'].forEach(key => {
      const tex = m[key];
      if (tex && !(tex.userData && tex.userData.shared)) tex.dispose();
    });
    m.dispose();
  });
}
