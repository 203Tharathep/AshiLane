import * as THREE from 'three';
import { disposeObject3D } from './Track.js';
import { SKINS } from '../data/skinsData.js';

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const SHARED_TEXTURE_CACHE = new Map();
const SHARED_TEXTURE_LOADER = new THREE.TextureLoader();

function getSharedAssetTexture(url) {
  if (SHARED_TEXTURE_CACHE.has(url)) {
    return SHARED_TEXTURE_CACHE.get(url);
  }
  const tex = SHARED_TEXTURE_LOADER.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData = { ...(tex.userData || {}), shared: true };
  SHARED_TEXTURE_CACHE.set(url, tex);
  return tex;
}

export function preloadBillboardTextures() {
  SKINS.slice(0, 12).forEach(s => {
    if (s && s.file) getSharedAssetTexture(`/assets/ashi/${s.file}`);
  });
}

/**
 * Rich per-stage 3D atmosphere, lighting, sky dome, and shadow direction presets.
 * Shared between Game.js (lights & shadows) and TrackDecorations.js (sky & props)
 * so the visible sun/moon in the sky aligns accurately with real-time shadows.
 */
export const STAGE_ATMOSPHERE = {
  beach: {
    sunDir: [68, 28, 42],
    sunColor: 0xffd296,
    sunIntensity: 1.85,
    ambientColor: 0xffdfc2,
    ambientIntensity: 0.44,
    hemiSky: 0xffb88c,
    hemiGround: 0x3b4860,
    hemiIntensity: 0.88,
    rimColor: 0x26c6da,
    rimIntensity: 0.58,
    rimDir: [-55, 18, -36],
    fogColor: 0xd99b78,
    fogDensity: 0.0017,
    exposure: 1.12,
    skyTop: '#163973',
    skyMid: '#dc7862',
    skyHorizon: '#ffd088',
    sunDisc: '#fff4d2',
    sunGlow: '#ff8a3d',
    sunScale: 52,
    stars: 0.16,
    hasOcean: true
  },
  buriram: {
    sunDir: [-44, 62, 34],
    sunColor: 0xcbe4ff,
    sunIntensity: 1.62,
    ambientColor: 0x6f8cbe,
    ambientIntensity: 0.48,
    hemiSky: 0x3b5c99,
    hemiGround: 0x160c24,
    hemiIntensity: 0.80,
    rimColor: 0xff1e7a,
    rimIntensity: 0.82,
    rimDir: [52, 22, -40],
    fogColor: 0x11152c,
    fogDensity: 0.0026,
    exposure: 1.18,
    skyTop: '#030612',
    skyMid: '#0e1538',
    skyHorizon: '#2a1648',
    sunDisc: '#e4f0ff',
    sunGlow: '#4da6ff',
    sunScale: 34,
    stars: 0.92,
    hasOcean: false
  },
  snow: {
    sunDir: [54, 44, -34],
    sunColor: 0xfff5e8,
    sunIntensity: 1.78,
    ambientColor: 0xaad4ff,
    ambientIntensity: 0.54,
    hemiSky: 0x8cc8ff,
    hemiGround: 0x3a587a,
    hemiIntensity: 0.92,
    rimColor: 0x4fc3f7,
    rimIntensity: 0.65,
    rimDir: [-48, 16, 42],
    fogColor: 0xbce0ff,
    fogDensity: 0.0022,
    exposure: 1.04,
    skyTop: '#1a559c',
    skyMid: '#68b0f0',
    skyHorizon: '#d9f1ff',
    sunDisc: '#ffffff',
    sunGlow: '#99ddff',
    sunScale: 42,
    stars: 0.0,
    hasOcean: false
  },
  volcano: {
    sunDir: [-48, 48, 38],
    sunColor: 0xffbc78,
    sunIntensity: 1.95,
    ambientColor: 0x7a3828,
    ambientIntensity: 0.68,
    hemiSky: 0x7d3222,
    hemiGround: 0xff5a18,
    hemiIntensity: 1.05,
    rimColor: 0xff4500,
    rimIntensity: 1.15,
    rimDir: [44, 16, -40],
    fogColor: 0x2e0d09,
    fogDensity: 0.0023,
    exposure: 1.24,
    skyTop: '#100407',
    skyMid: '#4c130c',
    skyHorizon: '#cc4212',
    sunDisc: '#ff9944',
    sunGlow: '#ff3800',
    sunScale: 46,
    stars: 0.42,
    hasOcean: false
  }
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class TrackDecorations {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.def = track.def;
    this.theme = track.def.theme || {};
    this.atmo = STAGE_ATMOSPHERE[this.def.id] || STAGE_ATMOSPHERE.beach;

    this.group = new THREE.Group();
    this.group.name = `Decorations:${this.def.id}`;
    this.scene.add(this.group);

    this.holograms = [];
    this.lavaRivers = [];
    this.lavaPools = [];
    this.yachts = [];
    this.gondolas = [];
    this.auroraMeshes = [];
    this.volcanoSmoke = [];
    this.lighthouseBeam = null;
    this.blimpGroup = null;
    this.waterRing = null;
    this.waterTex = null;
    this.skyDomeGroup = null;
    this.textureLoader = new THREE.TextureLoader();
    this.rand = mulberry32(this.def.id.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7));

    this.buildSkyDome();
    this.buildGround();
    this.buildSkyline();
    this.buildRoadsideProps();
    this.buildAshiBillboards();
    this.buildTunnel();
    this.buildGrandstands();
    this.buildStageLandmarks();
    if (this.theme.holograms) this.buildFloatingHolograms();
    if (this.theme.weather) this.buildWeather(this.theme.weather);
  }

  // ------------------------------------------------------------------
  // 3D Sky Dome + Celestial Sun / Moon aligned with directional light
  // ------------------------------------------------------------------
  buildSkyDome() {
    const atmo = this.atmo;
    const skyGroup = new THREE.Group();

    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, atmo.skyTop);
    grad.addColorStop(0.38, atmo.skyMid);
    grad.addColorStop(0.51, atmo.skyHorizon);
    grad.addColorStop(0.56, atmo.skyHorizon);
    grad.addColorStop(1.0, atmo.skyTop);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle procedural stars in the upper hemisphere
    if (atmo.stars > 0) {
      const starCount = Math.round(280 * atmo.stars);
      for (let i = 0; i < starCount; i++) {
        const x = this.rand() * 512;
        const y = this.rand() * 210;
        const alpha = (0.35 + this.rand() * 0.65) * atmo.stars;
        const sz = this.rand() > 0.85 ? 2 : 1.1;
        ctx.fillStyle = `rgba(240,248,255,${alpha.toFixed(2)})`;
        ctx.fillRect(x, y, sz, sz);
      }
    }

    // Soft layered horizon clouds
    ctx.save();
    for (let i = 0; i < 38; i++) {
      const cx = this.rand() * 512;
      const cy = 195 + this.rand() * 64;
      const rx = 24 + this.rand() * 58;
      const ry = 4 + this.rand() * 10;
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, rx);
      const isNight = this.def.id === 'buriram' || this.def.id === 'volcano';
      const cloudCol = isNight ? 'rgba(255,140,120,0.08)' : 'rgba(255,245,235,0.18)';
      g.addColorStop(0, cloudCol);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const skyTex = new THREE.CanvasTexture(c);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const domeGeo = new THREE.SphereGeometry(1020, 32, 20);
    const domeMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.renderOrder = -10;
    skyGroup.add(dome);

    // Sun / Moon disc + atmospheric halo placed directly along sunDir
    const sunVec = new THREE.Vector3(...atmo.sunDir).normalize();
    const sunPos = sunVec.clone().multiplyScalar(860);

    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = 128;
    haloCanvas.height = 128;
    const hctx = haloCanvas.getContext('2d');
    const hg = hctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    hg.addColorStop(0, atmo.sunDisc);
    hg.addColorStop(0.28, atmo.sunGlow);
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    hctx.fillStyle = hg;
    hctx.fillRect(0, 0, 128, 128);
    const haloTex = new THREE.CanvasTexture(haloCanvas);
    haloTex.colorSpace = THREE.SRGBColorSpace;

    const haloMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(atmo.sunScale * 5.2, atmo.sunScale * 5.2),
      new THREE.MeshBasicMaterial({
        map: haloTex,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide
      })
    );
    haloMesh.position.copy(sunPos);
    haloMesh.lookAt(0, 0, 0);
    skyGroup.add(haloMesh);

    const discMesh = new THREE.Mesh(
      new THREE.CircleGeometry(atmo.sunScale, 32),
      new THREE.MeshBasicMaterial({
        color: atmo.sunDisc,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide
      })
    );
    discMesh.position.copy(sunVec.clone().multiplyScalar(850));
    discMesh.lookAt(0, 0, 0);
    skyGroup.add(discMesh);

    this.skyDomeGroup = skyGroup;
    this.group.add(skyGroup);
  }

  // ------------------------------------------------------------------
  // Ground + Textured Bump + Tropical Ocean / Ice Patches / Magma Sea
  // ------------------------------------------------------------------
  buildGround() {
    const bounds = this.track.getBounds();
    const spanRadius = Math.hypot((bounds.maxX - bounds.minX) * 0.5, (bounds.maxZ - bounds.minZ) * 0.5);
    const radius = spanRadius + (this.atmo.hasOcean ? 42 : 95);

    // Color map
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = this.theme.ground || '#0b0c14';
    ctx.fillRect(0, 0, 512, 512);

    // Grayscale bump map for micro terrain relief
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 256;
    bumpCanvas.height = 256;
    const bctx = bumpCanvas.getContext('2d');
    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, 256, 256);

    const detail = this.theme.groundDetail || '#1b2238';
    if (this.theme.skyline === 'city') {
      // Urban paddock blocks, emerald circuit turf pockets & neon light grid
      ctx.fillStyle = '#12182b';
      ctx.fillRect(0, 0, 512, 512);
      for (let x = 0; x < 512; x += 64) {
        for (let y = 0; y < 512; y += 64) {
          const checker = ((x + y) / 64) % 2 === 0;
          ctx.fillStyle = checker ? '#182238' : '#132830';
          ctx.fillRect(x + 3, y + 3, 58, 58);
          if (((x + y) / 64) % 3 === 0) {
            ctx.strokeStyle = 'rgba(0, 243, 255, 0.22)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 7, y + 7, 50, 50);
          }
        }
      }
      ctx.strokeStyle = '#25314d';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 512; i += 64) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
      }
      bctx.strokeStyle = '#b0b0b0';
      bctx.lineWidth = 2;
      for (let i = 0; i <= 256; i += 32) {
        bctx.beginPath(); bctx.moveTo(i, 0); bctx.lineTo(i, 256); bctx.stroke();
        bctx.beginPath(); bctx.moveTo(0, i); bctx.lineTo(256, i); bctx.stroke();
      }
    } else if (this.theme.skyline === 'volcano') {
      // Cooling basalt with glowing orange magma cracks
      ctx.strokeStyle = '#ff4b00';
      ctx.lineWidth = 2.6;
      bctx.strokeStyle = '#252525';
      bctx.lineWidth = 4;
      for (let i = 0; i < 90; i++) {
        const x = this.rand() * 512;
        const y = this.rand() * 512;
        const dx = (this.rand() - 0.5) * 85;
        const dy = (this.rand() - 0.5) * 85;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx * 0.5 + (this.rand() - 0.5) * 16, y + dy * 0.5 + (this.rand() - 0.5) * 16);
        ctx.lineTo(x + dx, y + dy);
        ctx.stroke();

        bctx.beginPath();
        bctx.moveTo(x * 0.5, y * 0.5);
        bctx.lineTo((x + dx) * 0.5, (y + dy) * 0.5);
        bctx.stroke();
      }
    } else if (this.theme.skyline === 'mountains') {
      // Wind-swept snowdrifts & icy streaks
      for (let i = 0; i < 650; i++) {
        ctx.fillStyle = i % 3 === 0 ? '#ffffff' : detail;
        ctx.globalAlpha = 0.25 + this.rand() * 0.35;
        ctx.beginPath();
        ctx.ellipse(this.rand() * 512, this.rand() * 512, 12 + this.rand() * 24, 3 + this.rand() * 5, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 400; i++) {
        bctx.fillStyle = i % 2 === 0 ? '#b8b8b8' : '#585858';
        bctx.globalAlpha = 0.28;
        bctx.beginPath();
        bctx.ellipse(this.rand() * 256, this.rand() * 256, 8 + this.rand() * 14, 2 + this.rand() * 4, 0.2, 0, Math.PI * 2);
        bctx.fill();
      }
      bctx.globalAlpha = 1;
    } else {
      // Beach sand ripples & organic coastal speckles
      for (let i = 0; i < 1200; i++) {
        ctx.fillStyle = detail;
        ctx.globalAlpha = 0.22 + this.rand() * 0.28;
        ctx.fillRect(this.rand() * 512, this.rand() * 512, 5 + this.rand() * 8, 2 + this.rand() * 4);
      }
      ctx.globalAlpha = 1;
      for (let y = 0; y < 256; y += 6) {
        bctx.strokeStyle = y % 12 === 0 ? '#9c9c9c' : '#686868';
        bctx.beginPath();
        bctx.moveTo(0, y);
        bctx.bezierCurveTo(85, y + 3, 170, y - 3, 256, y);
        bctx.stroke();
      }
    }

    const groundTex = new THREE.CanvasTexture(canvas);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(radius / 26, radius / 26);
    groundTex.colorSpace = THREE.SRGBColorSpace;

    const bumpTex = new THREE.CanvasTexture(bumpCanvas);
    bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
    bumpTex.repeat.set(radius / 22, radius / 22);

    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      bumpMap: bumpTex,
      bumpScale: this.theme.skyline === 'volcano' ? 0.55 : 0.35,
      roughness: this.theme.skyline === 'city' ? 0.62 : this.theme.skyline === 'mountains' ? 0.58 : 0.90,
      metalness: this.theme.skyline === 'city' ? 0.22 : 0.05
    });

    const ground = new THREE.Mesh(new THREE.CircleGeometry(radius, 72), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(bounds.cx, -0.02, bounds.cz);
    ground.receiveShadow = true;
    this.group.add(ground);

    if (this.atmo.hasOcean) {
      // Sculpted coastal beach rim sloping down to shimmering 3D sunset ocean
      const shoreRim = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 2.2, 8, 72),
        new THREE.MeshStandardMaterial({ color: 0xffe0b2, roughness: 0.95 })
      );
      shoreRim.rotation.x = Math.PI / 2;
      shoreRim.scale.set(1, 1, 0.35);
      shoreRim.position.set(bounds.cx, -0.35, bounds.cz);
      shoreRim.receiveShadow = true;
      this.group.add(shoreRim);

      const waveC = document.createElement('canvas');
      waveC.width = 256;
      waveC.height = 256;
      const wctx = waveC.getContext('2d');
      wctx.fillStyle = '#086088';
      wctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 320; i++) {
        wctx.fillStyle = i % 2 === 0 ? '#0e8cb5' : '#054463';
        wctx.globalAlpha = 0.45;
        wctx.fillRect(this.rand() * 256, this.rand() * 256, 18 + this.rand() * 24, 3);
      }
      wctx.globalAlpha = 1;
      const waveTex = new THREE.CanvasTexture(waveC);
      waveTex.wrapS = waveTex.wrapT = THREE.RepeatWrapping;
      waveTex.repeat.set(36, 36);
      waveTex.colorSpace = THREE.SRGBColorSpace;
      this.waterTex = waveTex;

      const ocean = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(10, radius - 4), 1020, 72),
        new THREE.MeshStandardMaterial({
          map: waveTex,
          bumpMap: waveTex,
          bumpScale: 0.45,
          color: 0x16add4,
          emissive: 0x05283a,
          emissiveIntensity: 0.55,
          roughness: 0.14,
          metalness: 0.55
        })
      );
      ocean.rotation.x = -Math.PI / 2;
      ocean.position.set(bounds.cx, -0.35, bounds.cz);
      ocean.receiveShadow = true;
      this.waterRing = ocean;
      this.group.add(ocean);

      // Distant volcanic tropical sea-stack islands along the horizon
      const islandRockMat = new THREE.MeshStandardMaterial({ color: 0x24483a, roughness: 0.85, flatShading: true });
      for (let k = 0; k < 7; k++) {
        const ang = (k / 7) * Math.PI * 2 + 0.4;
        const dist = radius + 160 + (k % 3) * 85;
        const h = 28 + (k % 3) * 18;
        const r = 36 + (k % 4) * 14;
        const peak = new THREE.Mesh(this.createCraggyConeGeo(r * 0.25, r, h, 14, 4, 0.22), islandRockMat);
        peak.position.set(bounds.cx + Math.cos(ang) * dist, h * 0.42 - 1.5, bounds.cz + Math.sin(ang) * dist);
        this.group.add(peak);
      }
    } else {
      const farIsEmissive = this.theme.skyline === 'volcano';
      const farColor = this.theme.skyline === 'city' ? 0x0d1224 : (this.theme.farGround ?? 0x05060c);
      const far = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(10, radius - 5), 1020, 64),
        farIsEmissive
          ? new THREE.MeshBasicMaterial({ color: this.theme.farGround ?? 0xcc3300 })
          : new THREE.MeshStandardMaterial({ color: farColor, roughness: 0.65, metalness: 0.22 })
      );
      far.rotation.x = -Math.PI / 2;
      far.position.set(bounds.cx, -0.45, bounds.cz);
      this.group.add(far);
    }

    // Frozen reflective ice patches in clear infield areas on Frosty Peak
    if (this.theme.skyline === 'mountains') {
      const iceMat = new THREE.MeshStandardMaterial({
        color: 0xa6e1ff,
        roughness: 0.12,
        metalness: 0.45
      });
      for (let p = 0; p < 10; p++) {
        const spot = this.findClearSpot(bounds, radius * 0.8, 22, [], 0);
        if (!spot) continue;
        const pond = new THREE.Mesh(new THREE.CircleGeometry(7 + this.rand() * 9, 16), iceMat);
        pond.rotation.x = -Math.PI / 2;
        pond.position.set(spot.x, 0.01, spot.z);
        pond.receiveShadow = true;
        this.group.add(pond);
      }
    }

    this.bounds = bounds;
    this.groundRadius = radius;
  }

  /** Creates a rugged organically displaced cone/frustum geometry for peaks & volcanoes. */
  createCraggyConeGeo(topR, botR, height, radialSegs = 20, heightSegs = 6, jitter = 0.22) {
    const geo = new THREE.CylinderGeometry(topR, botR, height, radialSegs, heightSegs, topR > 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r > 0.01) {
        const ang = Math.atan2(z, x);
        const hNorm = (y + height * 0.5) / height;
        const ridge = Math.sin(ang * 5 + hNorm * 3.1) * 0.55 + Math.cos(ang * 9 - hNorm * 2.2) * 0.45;
        const scale = 1 + ridge * jitter * (0.4 + (1 - hNorm) * 0.6);
        pos.setX(i, x * scale);
        pos.setZ(i, z * scale);
      }
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Picks a spot on the map clear of the track and other spots of the same group
  findClearSpot(bounds, radius, minDistFromTrack, existing, minGap) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const ang = this.rand() * Math.PI * 2;
      const dist = radius * (0.25 + this.rand() * 0.72);
      const x = bounds.cx + Math.cos(ang) * dist;
      const z = bounds.cz + Math.sin(ang) * dist;
      if (this.track.distanceToCentreLine(x, z, 2) < minDistFromTrack) continue;
      let tooClose = false;
      for (const e of existing) {
        if ((e.x - x) ** 2 + (e.z - z) ** 2 < minGap * minGap) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) return { x, z };
    }
    return null;
  }

  // ------------------------------------------------------------------
  // 3D Skyline landmarks & detailed illuminated buildings
  // ------------------------------------------------------------------
  createBuildingWindowTex(isCity) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = isCity ? '#0c1020' : '#f2dfc8';
    ctx.fillRect(0, 0, 128, 256);

    const cols = 8;
    const rows = 20;
    const cw = 128 / cols;
    const rh = 256 / rows;
    for (let r = 1; r < rows - 1; r++) {
      for (let col = 1; col < cols - 1; col++) {
        const rnd = this.rand();
        if (isCity) {
          if (rnd > 0.35) {
            const palette = ['#00f3ff', '#ffe28a', '#ff4488', '#8be9fd', '#ffffff'];
            ctx.fillStyle = palette[Math.floor(rnd * palette.length * 4) % palette.length];
            ctx.fillRect(col * cw + 2, r * rh + 2, cw - 4, rh - 5);
          } else {
            ctx.fillStyle = '#151b30';
            ctx.fillRect(col * cw + 2, r * rh + 2, cw - 4, rh - 5);
          }
        } else {
          // Beach resort warm glass balconies
          ctx.fillStyle = rnd > 0.3 ? '#ffe099' : '#3a627d';
          ctx.fillRect(col * cw + 2, r * rh + 2, cw - 4, rh - 6);
          ctx.fillStyle = '#d6bfa8';
          ctx.fillRect(col * cw, r * rh + rh - 3, cw, 2);
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  buildSkyline() {
    const style = this.theme.skyline;
    const { bounds, groundRadius: radius } = this;
    const track = this.track;

    if (style === 'city' || style === 'resort') {
      const isCity = style === 'city';
      const count = isCity ? 72 : 44;
      const placements = [];
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + (this.rand() - 0.5) * 0.08;
        const dist = radius * (0.76 + (i % 3) * 0.14);
        const x = bounds.cx + Math.cos(ang) * dist;
        const z = bounds.cz + Math.sin(ang) * dist;
        if (track.distanceToCentreLine(x, z, 2) < track.trackWidth * 0.8 + 16) continue;
        placements.push({
          x,
          z,
          w: isCity ? 10 + (i % 4) * 4 : 11 + (i % 3) * 4,
          d: isCity ? 10 + ((i + 2) % 4) * 4 : 9 + (i % 3) * 3,
          h: isCity ? 30 + (i % 6) * 16 + this.rand() * 24 : 16 + (i % 4) * 8 + this.rand() * 10,
          rot: this.rand() * Math.PI * 0.5,
          col: isCity ? 0x2a3250 : 0xffe4c4
        });
      }

      if (placements.length) {
        const winTex = this.createBuildingWindowTex(isCity);
        const bodyMat = isCity
          ? new THREE.MeshStandardMaterial({
              map: winTex,
              emissiveMap: winTex,
              emissive: new THREE.Color(0x99ccff),
              emissiveIntensity: 0.72,
              roughness: 0.35,
              metalness: 0.5
            })
          : new THREE.MeshStandardMaterial({
              map: winTex,
              emissiveMap: winTex,
              emissive: new THREE.Color(0xffb866),
              emissiveIntensity: 0.25,
              roughness: 0.55,
              metalness: 0.15
            });

        const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bodyMat, placements.length);
        bodies.castShadow = true;
        bodies.receiveShadow = true;

        const trims = new THREE.InstancedMesh(
          new THREE.BoxGeometry(1.06, 0.7, 1.06),
          new THREE.MeshBasicMaterial({ color: isCity ? 0x00f3ff : 0xff7043 }),
          placements.length
        );

        const spires = new THREE.InstancedMesh(
          new THREE.CylinderGeometry(0.08, 0.22, 1, 6),
          new THREE.MeshStandardMaterial({ color: isCity ? 0xff0066 : 0xfff0d4, metalness: 0.7, roughness: 0.3 }),
          placements.length
        );

        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        const p = new THREE.Vector3();
        const c = new THREE.Color();

        placements.forEach((b, k) => {
          q.setFromAxisAngle(UP_AXIS, b.rot);
          p.set(b.x, b.h / 2, b.z);
          s.set(b.w, b.h, b.d);
          m.compose(p, q, s);
          bodies.setMatrixAt(k, m);
          bodies.setColorAt(k, c.setHex(0xffffff).lerp(c.clone().setHex(b.col), 0.25));

          p.set(b.x, b.h + 0.35, b.z);
          s.set(b.w, 1, b.d);
          m.compose(p, q, s);
          trims.setMatrixAt(k, m);

          const spireH = isCity ? 6 + (k % 4) * 3 : 2.5;
          p.set(b.x, b.h + spireH * 0.5, b.z);
          s.set(1, spireH, 1);
          m.compose(p, q, s);
          spires.setMatrixAt(k, m);
        });
        this.group.add(bodies, trims, spires);

        // Stepped upper penthouses & blinking rooftop beacons for richer skyline silhouettes
        const pentMat = isCity
          ? new THREE.MeshStandardMaterial({ color: 0x192138, emissive: 0x0d2642, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.6 })
          : new THREE.MeshStandardMaterial({ color: 0xffe9d2, roughness: 0.55 });
        const pents = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), pentMat, placements.length);
        const beacons = new THREE.InstancedMesh(
          new THREE.SphereGeometry(0.45, 6, 6),
          new THREE.MeshBasicMaterial({ color: isCity ? 0xff2266 : 0xffd54f }),
          placements.length
        );
        placements.forEach((b, k) => {
          q.setFromAxisAngle(UP_AXIS, b.rot);
          const ph = isCity ? 6 + (k % 3) * 4 : 3.2;
          p.set(b.x, b.h + ph * 0.5 + 0.5, b.z);
          s.set(b.w * 0.62, ph, b.d * 0.62);
          m.compose(p, q, s);
          pents.setMatrixAt(k, m);

          const spireH = isCity ? 6 + (k % 4) * 3 : 2.5;
          p.set(b.x, b.h + spireH + 0.4, b.z);
          s.set(1, 1, 1);
          m.compose(p, q, s);
          beacons.setMatrixAt(k, m);
        });
        this.group.add(pents, beacons);
      }
    } else if (style === 'mountains') {
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x3b4d63, roughness: 0.88, flatShading: true });
      const snowMat = new THREE.MeshStandardMaterial({ color: 0xf4faff, roughness: 0.45, metalness: 0.08, flatShading: true });
      const peakCount = 26;
      for (let i = 0; i < peakCount; i++) {
        const ang = (i / peakCount) * Math.PI * 2;
        const isInner = i % 2 === 0;
        const dist = radius * (isInner ? 0.84 : 1.06) + (i % 3) * 28;
        const x = bounds.cx + Math.cos(ang) * dist;
        const z = bounds.cz + Math.sin(ang) * dist;
        if (track.distanceToCentreLine(x, z, 2) < 42) continue;
        const h = (isInner ? 55 : 92) + (i % 4) * 24;
        const r = h * 0.72;

        const peak = new THREE.Mesh(this.createCraggyConeGeo(0, r, h, 12, 5, 0.28), rockMat);
        peak.position.set(x, h / 2 - 2, z);
        peak.castShadow = isInner;
        peak.receiveShadow = true;

        const snow = new THREE.Mesh(this.createCraggyConeGeo(0, r * 0.46, h * 0.46, 12, 4, 0.24), snowMat);
        snow.position.set(x, h * 0.78 - 1.2, z);
        snow.castShadow = isInner;
        snow.receiveShadow = true;

        this.group.add(peak, snow);
      }
    } else if (style === 'volcano') {
      // Place hero Volcano deterministically along the forward sightline ahead of the Start Line
      const sPos = track.samplePos[0];
      const sTan = track.sampleTan[0];
      const sNorm = track.sampleNorm[0];
      let spot = null;
      const candidates = [
        [230, 105], [230, -105], [275, 70], [275, -70], [320, 0]
      ];
      for (const [fwd, lat] of candidates) {
        const vx = sPos.x + sTan.x * fwd + sNorm.x * lat;
        const vz = sPos.z + sTan.z * fwd + sNorm.z * lat;
        if (track.distanceToCentreLine(vx, vz, 2) >= 74) {
          spot = { x: vx, z: vz };
          break;
        }
      }
      if (!spot) {
        spot = this.findClearSpot(bounds, radius * 0.65, 74, [], 0) || { x: bounds.cx + 180, z: bounds.cz };
      }
      const volcanoX = spot.x;
      const volcanoZ = spot.z;

      const coneMat = new THREE.MeshStandardMaterial({ color: 0x45241f, roughness: 0.88, flatShading: true });
      const cone = new THREE.Mesh(this.createCraggyConeGeo(24, 108, 114, 30, 8, 0.24), coneMat);
      cone.position.set(volcanoX, 55, volcanoZ);
      cone.castShadow = true;
      cone.receiveShadow = true;
      this.group.add(cone);

      // Glowing caldera top lava core + bright fiery crater rim ring
      const lavaTop = new THREE.Mesh(
        new THREE.CircleGeometry(22.5, 28),
        new THREE.MeshBasicMaterial({ color: 0xff6a00 })
      );
      lavaTop.rotation.x = -Math.PI / 2;
      lavaTop.position.set(volcanoX, 104, volcanoZ);
      this.group.add(lavaTop);
      this.lavaTop = lavaTop;

      const calderaRimGlow = new THREE.Mesh(
        new THREE.TorusGeometry(23.5, 1.8, 8, 28),
        new THREE.MeshBasicMaterial({ color: 0xff4500 })
      );
      calderaRimGlow.rotation.x = Math.PI / 2;
      calderaRimGlow.position.set(volcanoX, 111.5, volcanoZ);
      this.group.add(calderaRimGlow);

      const glowColumn = new THREE.Mesh(
        new THREE.CylinderGeometry(42, 20, 82, 20, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xff5200,
          transparent: true,
          opacity: 0.24,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      glowColumn.position.set(volcanoX, 145, volcanoZ);
      this.group.add(glowColumn);
      this.volcanoGlowCol = glowColumn;

      // Drifting volcanic smoke rings above crater
      const smokeGeo = new THREE.TorusGeometry(18, 5.5, 6, 16);
      const smokeMat = new THREE.MeshBasicMaterial({ color: 0x4a2018, transparent: true, opacity: 0.35, depthWrite: false });
      for (let sm = 0; sm < 4; sm++) {
        const puff = new THREE.Mesh(smokeGeo, smokeMat);
        puff.rotation.x = Math.PI / 2;
        puff.position.set(volcanoX + (sm % 2 - 0.5) * 6, 120 + sm * 18, volcanoZ);
        this.group.add(puff);
        this.volcanoSmoke.push({ mesh: puff, baseX: volcanoX, baseZ: volcanoZ, phase: sm * 0.25 });
      }

      // Tapered magma fissures cascading smoothly down volcano cone ridges
      const riverGeo = new THREE.CylinderGeometry(1.4, 5.4, 112, 5);
      const riverMat = new THREE.MeshBasicMaterial({ color: 0xff5e00 });
      for (let r = 0; r < 8; r++) {
        const ang = (r / 8) * Math.PI * 2 + 0.15;
        const river = new THREE.Mesh(riverGeo, riverMat);
        river.position.set(volcanoX + Math.cos(ang) * 58, 52, volcanoZ + Math.sin(ang) * 58);
        river.lookAt(volcanoX, 52, volcanoZ);
        river.rotateX(0.62);
        this.group.add(river);
        this.lavaRivers.push(river);
      }

      // Towering jagged obsidian rock spires around caldera & perimeter
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x311c1a, roughness: 0.85, flatShading: true });
      for (let i = 0; i < 22; i++) {
        const ang = (i / 22) * Math.PI * 2;
        const dist = radius * (0.72 + (i % 3) * 0.14);
        const x = bounds.cx + Math.cos(ang) * dist;
        const z = bounds.cz + Math.sin(ang) * dist;
        if (track.distanceToCentreLine(x, z, 2) < 35) continue;
        const h = 28 + (i % 4) * 18;
        const spire = new THREE.Mesh(this.createCraggyConeGeo(0.5, 11 + (i % 3) * 4, h, 8, 4, 0.34), rockMat);
        spire.position.set(x, h / 2, z);
        spire.castShadow = true;
        spire.receiveShadow = true;
        this.group.add(spire);
      }
    }
  }

  /** Builds a gracefully arched, V-folded tapered 3D palm frond blade. */
  createPalmFrondGeo() {
    const segs = 6;
    const len = 3.9;
    const verts = [];
    const idx = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const z = t * len;
      // Arches gently up then droops gracefully toward tip
      const y = Math.sin(t * Math.PI * 0.85) * 0.48 - t * t * 0.95;
      // Leaf width: narrow stalk -> broad mid blade -> pointed tip
      const w = t < 0.12 ? 0.08 + t * 2.2 : Math.sin(Math.min(1, t) * Math.PI) * 0.52 + 0.04;
      const wingDrop = w * 0.28;
      verts.push(
        -w, y - wingDrop, z,
        0, y, z,
        w, y - wingDrop, z
      );
      if (s < segs) {
        const b = s * 3;
        idx.push(
          b, b + 1, b + 3, b + 1, b + 4, b + 3,
          b + 1, b + 2, b + 4, b + 2, b + 5, b + 4
        );
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  // ------------------------------------------------------------------
  // Rich 3D Roadside Props (Multi-frond Palms, Snow Pines, Light Towers, Lava Rocks)
  // ------------------------------------------------------------------
  buildRoadsideProps() {
    const style = this.theme.props;
    const track = this.track;
    const N = track.sampleCount;
    const half = track.trackWidth / 2;

    if (style === 'palms') {
      const palmSpots = [];
      for (let i = 0; i < N; i += 7) {
        const p = track.samplePos[i];
        if (p.y > 2.2) continue;
        const n = track.sampleNorm[i];
        const side = (i / 7) % 2 === 0 ? 1 : -1;
        const dist = half + 6 + this.rand() * 16;
        const x = p.x + n.x * side * dist;
        const z = p.z + n.z * side * dist;
        if (track.distanceToCentreLine(x, z, 2) < half + 5.5) continue;
        palmSpots.push({ x, z, scale: 0.85 + this.rand() * 0.65, yaw: this.rand() * Math.PI * 2, lean: 0.08 + this.rand() * 0.14 });
      }
      if (palmSpots.length) {
        const count = palmSpots.length;
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7c5333, roughness: 0.9 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x269e46, roughness: 0.58, flatShading: true, side: THREE.DoubleSide });
        const cocoMat = new THREE.MeshStandardMaterial({ color: 0x4e2d18, roughness: 0.7 });

        const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.36, 7.2, 7), trunkMat, count);
        trunks.castShadow = true;
        trunks.receiveShadow = true;

        // 7 arched tapered 3D frond blades per palm using InstancedMesh
        const frondGeo = this.createPalmFrondGeo();
        const frondsPerTree = 7;
        const fronds = new THREE.InstancedMesh(frondGeo, leafMat, count * frondsPerTree);
        fronds.castShadow = true;
        fronds.receiveShadow = true;

        const cocos = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.22, 0), cocoMat, count * 3);
        cocos.castShadow = true;

        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const e = new THREE.Euler();
        const s = new THREE.Vector3();
        const pos = new THREE.Vector3();
        const topPos = new THREE.Vector3();

        palmSpots.forEach((pt, k) => {
          const h = 7.2 * pt.scale;
          e.set(pt.lean, pt.yaw, 0, 'YXZ');
          q.setFromEuler(e);
          const leanOffset = new THREE.Vector3(0, h * 0.5, 0).applyQuaternion(q);
          pos.set(pt.x + leanOffset.x, leanOffset.y, pt.z + leanOffset.z);
          s.set(pt.scale, pt.scale, pt.scale);
          m.compose(pos, q, s);
          trunks.setMatrixAt(k, m);

          const tip = new THREE.Vector3(0, h, 0).applyQuaternion(q);
          topPos.set(pt.x + tip.x, tip.y, pt.z + tip.z);

          for (let f = 0; f < frondsPerTree; f++) {
            const frondYaw = pt.yaw + (f / frondsPerTree) * Math.PI * 2 + 0.12;
            e.set((f % 2) * 0.14 - 0.06, frondYaw, 0, 'YXZ');
            q.setFromEuler(e);
            s.set(pt.scale, pt.scale, pt.scale);
            m.compose(topPos, q, s);
            fronds.setMatrixAt(k * frondsPerTree + f, m);
          }

          for (let c = 0; c < 3; c++) {
            const ang = pt.yaw + (c / 3) * Math.PI * 2;
            pos.set(topPos.x + Math.cos(ang) * 0.28, topPos.y - 0.35, topPos.z + Math.sin(ang) * 0.28);
            q.identity();
            s.set(pt.scale, pt.scale, pt.scale);
            m.compose(pos, q, s);
            cocos.setMatrixAt(k * 3 + c, m);
          }
        });
        this.group.add(trunks, fronds, cocos);

        // Colorful 3D beach umbrellas scattered outside curves
        const umbrellaColors = [0xff2a55, 0x00d2ff, 0xffd700, 0xff7043];
        const poleMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.4, metalness: 0.5 });
        const canopyGeo = new THREE.ConeGeometry(2.1, 0.9, 8);
        for (let b = 0; b < N; b += 42) {
          const p = track.samplePos[b];
          if (p.y > 1.5) continue;
          const n = track.sampleNorm[b];
          const x = p.x + n.x * (half + 8.5);
          const z = p.z + n.z * (half + 8.5);
          if (track.distanceToCentreLine(x, z, 2) < half + 7) continue;
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.7, 6), poleMat);
          pole.position.set(x, 1.35, z);
          pole.castShadow = true;
          const top = new THREE.Mesh(
            canopyGeo,
            new THREE.MeshStandardMaterial({ color: umbrellaColors[(b / 42) % umbrellaColors.length], roughness: 0.5 })
          );
          top.position.set(x, 2.6, z);
          top.castShadow = true;
          top.receiveShadow = true;
          this.group.add(pole, top);
        }
      }
    } else if (style === 'pines') {
      const pineSpots = [];
      for (let i = 0; i < N; i += 6) {
        const p = track.samplePos[i];
        const n = track.sampleNorm[i];
        const side = (i / 6) % 2 === 0 ? 1 : -1;
        const dist = half + (p.y > 2.5 ? 10 : 6) + this.rand() * 15;
        const x = p.x + n.x * side * dist;
        const z = p.z + n.z * side * dist;
        if (track.distanceToCentreLine(x, z, 2) < half + 5.5) continue;
        pineSpots.push({ x, z, scale: (p.y > 4 ? 1.15 : 0.85) + this.rand() * 0.65 });
      }
      if (pineSpots.length) {
        const count = pineSpots.length;
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2416, roughness: 0.9 });
        const pineMat = new THREE.MeshStandardMaterial({ color: 0x164a32, roughness: 0.85, flatShading: true });
        const snowMat = new THREE.MeshStandardMaterial({ color: 0xf4faff, roughness: 0.45, flatShading: true });

        const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.24, 0.4, 3.0, 6), trunkMat, count);
        trunks.castShadow = true;

        const tier1 = new THREE.InstancedMesh(new THREE.ConeGeometry(2.5, 4.0, 8), pineMat, count);
        const tier2 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.9, 3.6, 8), pineMat, count);
        const tier3 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.25, 3.0, 8), pineMat, count);
        const snow1 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 2.0, 8), snowMat, count);
        const snow2 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.05, 1.8, 8), snowMat, count);
        [tier1, tier2].forEach(mesh => {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });
        [tier3, snow1, snow2].forEach(mesh => {
          mesh.receiveShadow = true;
        });

        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        const pos = new THREE.Vector3();

        pineSpots.forEach((pt, k) => {
          const sc = pt.scale;
          s.set(sc, sc, sc);
          pos.set(pt.x, 1.5 * sc, pt.z); m.compose(pos, q, s); trunks.setMatrixAt(k, m);
          pos.set(pt.x, 4.1 * sc, pt.z); m.compose(pos, q, s); tier1.setMatrixAt(k, m);
          pos.set(pt.x, 6.2 * sc, pt.z); m.compose(pos, q, s); tier2.setMatrixAt(k, m);
          pos.set(pt.x, 8.0 * sc, pt.z); m.compose(pos, q, s); tier3.setMatrixAt(k, m);
          pos.set(pt.x, 6.9 * sc, pt.z); m.compose(pos, q, s); snow1.setMatrixAt(k, m);
          pos.set(pt.x, 8.4 * sc, pt.z); m.compose(pos, q, s); snow2.setMatrixAt(k, m);
        });
        this.group.add(trunks, tier1, tier2, tier3, snow1, snow2);

        // Translucent glowing alpine ice crystals scattered outside barriers
        const iceMat = new THREE.MeshStandardMaterial({
          color: 0xb6ebff,
          emissive: 0x0a3855,
          emissiveIntensity: 0.45,
          roughness: 0.15,
          metalness: 0.35,
          flatShading: true
        });
        const crystalGeo = new THREE.OctahedronGeometry(1.1, 0);
        for (let cIdx = 0; cIdx < N; cIdx += 28) {
          const p = track.samplePos[cIdx];
          const n = track.sampleNorm[cIdx];
          const side = (cIdx / 28) % 2 === 0 ? 1 : -1;
          const x = p.x + n.x * side * (half + 5.2);
          const z = p.z + n.z * side * (half + 5.2);
          if (track.distanceToCentreLine(x, z, 2) < half + 4.5) continue;
          const cr = new THREE.Mesh(crystalGeo, iceMat);
          cr.position.set(x, 1.1, z);
          cr.scale.set(0.75, 1.6 + (cIdx % 3) * 0.4, 0.75);
          cr.rotation.set(0.15 * side, cIdx, 0.12);
          cr.castShadow = true;
          this.group.add(cr);
        }
      }
    } else if (style === 'lamps') {
      const lampSpots = [];
      for (let i = 0; i < N; i += 14) {
        if (track.hasOtherSectionNear(i, half + 6)) continue;
        const p = track.samplePos[i];
        const n = track.sampleNorm[i];
        const tan = track.sampleTan[i];
        for (const side of [-1, 1]) {
          const x = p.x + n.x * side * (half + 1.8);
          const z = p.z + n.z * side * (half + 1.8);
          lampSpots.push({ x, y: p.y, z, side, nx: n.x, nz: n.z, tx: tan.x, tz: tan.z });
        }
      }
      if (lampSpots.length) {
        const count = lampSpots.length;
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x262c3a, metalness: 0.85, roughness: 0.25 });
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xb8f3ff });

        const masts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.22, 9.2, 8), poleMat, count);
        masts.castShadow = true;

        const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.18, 0.2), poleMat, count);
        arms.castShadow = true;

        const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.22, 0.45), glowMat, count);

        // Ground light pools casting nocturnal illumination onto road & kerb edge
        const poolCanvas = document.createElement('canvas');
        poolCanvas.width = 64;
        poolCanvas.height = 64;
        const pctx = poolCanvas.getContext('2d');
        const pg = pctx.createRadialGradient(32, 32, 2, 32, 32, 32);
        pg.addColorStop(0, 'rgba(130, 225, 255, 0.36)');
        pg.addColorStop(0.55, 'rgba(0, 175, 255, 0.14)');
        pg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        pctx.fillStyle = pg;
        pctx.fillRect(0, 0, 64, 64);
        const poolTex = new THREE.CanvasTexture(poolCanvas);
        poolTex.colorSpace = THREE.SRGBColorSpace;

        const poolGeo = new THREE.PlaneGeometry(11, 13);
        poolGeo.rotateX(-Math.PI / 2);
        const pools = new THREE.InstancedMesh(
          poolGeo,
          new THREE.MeshBasicMaterial({
            map: poolTex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          }),
          count
        );

        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3(1, 1, 1);
        const pos = new THREE.Vector3();
        const dir = new THREE.Vector3();

        lampSpots.forEach((l, k) => {
          dir.set(-l.nx * l.side, 0, -l.nz * l.side).normalize();
          q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);

          pos.set(l.x, l.y + 4.6, l.z);
          m.compose(pos, q, s);
          masts.setMatrixAt(k, m);

          pos.set(l.x + dir.x * 1.15, l.y + 9.2, l.z + dir.z * 1.15);
          m.compose(pos, q, s);
          arms.setMatrixAt(k, m);

          pos.set(l.x + dir.x * 2.1, l.y + 9.05, l.z + dir.z * 2.1);
          m.compose(pos, q, s);
          heads.setMatrixAt(k, m);

          pos.set(l.x + dir.x * 3.8, l.y + 0.08, l.z + dir.z * 3.8);
          m.compose(pos, q, s);
          pools.setMatrixAt(k, m);
        });
        this.group.add(masts, arms, heads, pools);
      }
    } else if (style === 'rocks') {
      const rockSpots = [];
      for (let i = 0; i < N; i += 8) {
        const p = track.samplePos[i];
        if (p.y > 2.2) continue;
        const n = track.sampleNorm[i];
        const side = (i / 8) % 2 === 0 ? 1 : -1;
        const dist = half + 6 + this.rand() * 14;
        const x = p.x + n.x * side * dist;
        const z = p.z + n.z * side * dist;
        if (track.distanceToCentreLine(x, z, 2) < half + 5.5) continue;
        rockSpots.push({ x, z, scale: 0.75 + this.rand() * 1.15, rot: this.rand() * Math.PI });
      }
      if (rockSpots.length) {
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x3b2420, roughness: 0.86, flatShading: true });
        const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.9, 1), rockMat, rockSpots.length);
        rocks.castShadow = true;
        rocks.receiveShadow = true;

        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        const pos = new THREE.Vector3();
        rockSpots.forEach((r, k) => {
          q.setFromAxisAngle(UP_AXIS, r.rot);
          pos.set(r.x, 0.85 * r.scale, r.z);
          s.set(r.scale * 1.15, r.scale * 0.9, r.scale);
          m.compose(pos, q, s);
          rocks.setMatrixAt(k, m);
        });
        this.group.add(rocks);

        // Glowing ember magma crystals clustered near basalt rocks
        const emberGeo = new THREE.ConeGeometry(0.55, 2.2, 5);
        const emberMat = new THREE.MeshBasicMaterial({ color: 0xff5a00 });
        const emberCount = Math.min(rockSpots.length, 36);
        const embers = new THREE.InstancedMesh(emberGeo, emberMat, emberCount);
        rockSpots.slice(0, emberCount).forEach((r, k) => {
          q.setFromEuler(new THREE.Euler(0.25, r.rot, 0.15));
          pos.set(r.x + 1.2, 0.85, r.z - 1.0);
          s.set(r.scale * 0.8, r.scale, r.scale * 0.8);
          m.compose(pos, q, s);
          embers.setMatrixAt(k, m);
        });
        this.group.add(embers);
      }

      // Sculpted rimmed glowing lava pools scattered in volcano infield
      const poolRimMat = new THREE.MeshStandardMaterial({ color: 0x1b1110, roughness: 0.9, flatShading: true });
      const { bounds, groundRadius: radius } = this;
      const poolPlaced = [];
      for (let p = 0; p < 12; p++) {
        const spot = this.findClearSpot(bounds, radius * 0.75, half + 20, poolPlaced, 32);
        if (!spot) continue;
        poolPlaced.push(spot);
        const rSize = 8 + this.rand() * 8;
        const pool = new THREE.Mesh(
          new THREE.CircleGeometry(rSize, 22),
          new THREE.MeshBasicMaterial({ color: 0xff4e00 })
        );
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(spot.x, 0.04, spot.z);

        const rim = new THREE.Mesh(new THREE.TorusGeometry(rSize, 1.15, 7, 22), poolRimMat);
        rim.rotation.x = Math.PI / 2;
        rim.scale.set(1, 1, 0.55);
        rim.position.set(spot.x, 0.15, spot.z);
        rim.castShadow = true;
        rim.receiveShadow = true;

        this.lavaPools.push(pool);
        this.group.add(pool, rim);
      }
    }
  }

  // ------------------------------------------------------------------
  // 3D Framed Ashi Billboards with overhead LED lights & real shadows
  // ------------------------------------------------------------------
  buildAshiBillboards() {
    const track = this.track;
    const files = SKINS.slice(0, 12).map(s => ({ file: s.file, title: s.name }));
    const count = Math.max(6, Math.min(10, Math.round(track.trackLength / 200)));
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x181a20, metalness: 0.85, roughness: 0.28 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x333742, metalness: 0.9, roughness: 0.22 });
    const neonMat = new THREE.MeshBasicMaterial({ color: this.theme.railB ?? 0x00f3ff });
    const lightLampMat = new THREE.MeshBasicMaterial({ color: 0xfff8e0 });
    const half = track.trackWidth / 2;

    for (let b = 0; b < count; b++) {
      const t = (b + 0.35) / count;
      const i = track.indexFromT(t);
      const p = track.samplePos[i];
      if (p.y > 2.4 || track.hasOtherSectionNear(i, half + 12)) continue;
      const tan = track.sampleTan[i];
      const n = track.sampleNorm[i];
      const w = 14;
      const h = 9;
      const prefer = -Math.sign(track.sampleCurv[i]) || (b % 2 === 0 ? 1 : -1);
      let pos = null;
      for (const side of [prefer, -prefer]) {
        const dist = half + 9;
        const x = p.x + n.x * side * dist;
        const z = p.z + n.z * side * dist;
        if (track.distanceToCentreLine(x, z, 1) > half + 7.5) {
          pos = new THREE.Vector3(x, p.y, z);
          break;
        }
      }
      if (!pos) continue;

      const cfg = files[b % files.length];
      const group = new THREE.Group();
      group.position.copy(pos);

      const poleGeo = new THREE.CylinderGeometry(0.32, 0.38, 10, 10);
      const poleL = new THREE.Mesh(poleGeo, poleMat);
      poleL.position.set(-w * 0.35, 5, 0);
      poleL.castShadow = true;
      poleL.receiveShadow = true;
      const poleR = new THREE.Mesh(poleGeo, poleMat);
      poleR.position.set(w * 0.35, 5, 0);
      poleR.castShadow = true;
      poleR.receiveShadow = true;
      group.add(poleL, poleR);

      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 1, h + 1, 0.95), frameMat);
      frame.position.set(0, 8 + h / 2, 0);
      frame.castShadow = true;
      frame.receiveShadow = true;
      const border = new THREE.Mesh(new THREE.BoxGeometry(w + 1.35, h + 1.35, 0.45), neonMat);
      border.position.set(0, 8 + h / 2, 0);
      group.add(frame, border);

      // Upper floodlight brackets illuminating billboard on both faces
      [-4, 0, 4].forEach(lx => {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.8), poleMat);
        arm.position.set(lx, 8 + h + 0.55, 0.8);
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.3), lightLampMat);
        bulb.position.set(lx, 8 + h + 0.48, 1.6);
        group.add(arm, bulb);
      });

      const tex = getSharedAssetTexture(`/assets/ashi/${cfg.file}`);
      const screenMat = new THREE.MeshBasicMaterial({ map: tex });
      const screenFront = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat);
      screenFront.position.set(0, 8 + h / 2, 0.49);
      const screenBack = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat);
      screenBack.rotation.y = Math.PI;
      screenBack.position.set(0, 8 + h / 2, -0.49);
      group.add(screenFront, screenBack);

      const look = p.clone().addScaledVector(tan, -30);
      group.lookAt(look.x, pos.y, look.z);
      this.group.add(group);
    }
  }

  // ------------------------------------------------------------------
  // 3D Structural Arch Tunnel with Neon Ribs & Skylight Canopy (follows elevation)
  // ------------------------------------------------------------------
  buildTunnel() {
    const range = this.def.tunnel;
    if (!range) return;
    const track = this.track;
    const [startT, endT] = range;
    const len = (endT - startT) * track.trackLength;
    const ringsCount = Math.max(8, Math.round(len / 7));
    const radius = track.trackWidth / 2 + 1.5;

    const isIceTunnel = this.def.id === 'snow';
    const isVolcanoTunnel = this.def.id === 'volcano';
    const frameGeo = new THREE.TorusGeometry(radius + 0.45, isIceTunnel ? 0.52 : 0.42, 6, 24, Math.PI);
    const frameMat = new THREE.MeshStandardMaterial({
      color: isIceTunnel ? 0x89d6ff : isVolcanoTunnel ? 0x261412 : 0x1a1e28,
      metalness: isIceTunnel ? 0.25 : 0.85,
      roughness: isIceTunnel ? 0.18 : 0.3
    });
    const ringGeo = new THREE.TorusGeometry(radius, 0.28, 6, 24, Math.PI);
    const matA = new THREE.MeshBasicMaterial({ color: this.theme.railB ?? 0x00f0ff });
    const matB = new THREE.MeshBasicMaterial({ color: this.theme.railA ?? 0xff0066 });

    // Translucent dark-tinted aerodynamic / ice crystal / basalt tunnel canopy connecting ribs
    const canopyGeo = new THREE.CylinderGeometry(radius + 0.35, radius + 0.35, (len / ringsCount) * 1.05, 18, 1, true, 0, Math.PI);
    canopyGeo.rotateZ(Math.PI / 2);
    canopyGeo.rotateY(Math.PI / 2);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: isIceTunnel ? 0x62c6f7 : isVolcanoTunnel ? 0x200a06 : 0x0d1220,
      roughness: isIceTunnel ? 0.14 : 0.25,
      metalness: isIceTunnel ? 0.15 : 0.75,
      transparent: true,
      opacity: isIceTunnel ? 0.42 : 0.58,
      side: THREE.DoubleSide
    });

    for (let k = 0; k <= ringsCount; k++) {
      const t = startT + (k / ringsCount) * (endT - startT);
      const i = track.indexFromT(t);
      const p = track.samplePos[i];
      const tanVec = track.sampleTan3D ? track.sampleTan3D[i] : track.sampleTan[i];
      const q = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, tanVec);

      const outerRib = new THREE.Mesh(frameGeo, frameMat);
      outerRib.position.set(p.x, p.y, p.z);
      outerRib.quaternion.copy(q);
      outerRib.castShadow = true;
      outerRib.receiveShadow = true;
      this.group.add(outerRib);

      const ring = new THREE.Mesh(ringGeo, k % 2 === 0 ? matA : matB);
      ring.position.set(p.x, p.y, p.z);
      ring.quaternion.copy(q);
      this.group.add(ring);

      if (k < ringsCount) {
        const nextT = startT + ((k + 0.5) / ringsCount) * (endT - startT);
        const ni = track.indexFromT(nextT);
        const np = track.samplePos[ni];
        const nTan = track.sampleTan3D ? track.sampleTan3D[ni] : track.sampleTan[ni];
        const canopy = new THREE.Mesh(canopyGeo, canopyMat);
        canopy.position.set(np.x, np.y, np.z);
        canopy.quaternion.setFromUnitVectors(Z_AXIS, nTan);
        canopy.receiveShadow = true;
        this.group.add(canopy);
      }
    }
  }

  // ------------------------------------------------------------------
  // 3D Motorsport Grandstands with Pillars, Lights & Crowd Shadows
  // ------------------------------------------------------------------
  buildGrandstands() {
    const track = this.track;
    const half = track.trackWidth / 2;
    const standColor = this.def.id === 'beach' ? 0x6f685f : this.def.id === 'snow' ? 0x5c6d84 : 0x3b435a;
    const standMat = new THREE.MeshStandardMaterial({ color: standColor, roughness: 0.65, metalness: 0.18 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x58627a, roughness: 0.35, metalness: 0.72 });
    const roofMat = new THREE.MeshStandardMaterial({ color: this.theme.railA ?? 0xff0044, roughness: 0.35, metalness: 0.3 });
    const crowdColors = [0xff2255, 0x00d2ff, 0xffd700, 0x00ff88, 0xffffff, 0x9d4edd];
    const crowdGeo = new THREE.BoxGeometry(0.6, 0.9, 0.6);
    const crowdMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });

    [-1, 1].forEach(side => {
      const i = track.wrapIndex(30 / track.sampleSpacing);
      const p = track.samplePos[i];
      const n = track.sampleNorm[i];
      const tan = track.sampleTan[i];
      const dist = half + 11;
      const pos = new THREE.Vector3(p.x + n.x * side * dist, 0, p.z + n.z * side * dist);
      if (track.distanceToCentreLine(pos.x, pos.z, 1) < half + 8) return;

      const group = new THREE.Group();
      group.position.copy(pos);
      group.quaternion.setFromUnitVectors(Z_AXIS, tan);

      for (let row = 0; row < 4; row++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5 + row * 1.5, 56), standMat);
        step.position.set(side * row * 3, (1.5 + row * 1.5) / 2, 0);
        step.castShadow = true;
        step.receiveShadow = true;
        group.add(step);
      }

      // Back enclosure wall + support columns for canopy roof
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 10, 56), standMat);
      backWall.position.set(side * 10.6, 5, 0);
      backWall.castShadow = true;
      backWall.receiveShadow = true;
      group.add(backWall);

      const pillarGeo = new THREE.CylinderGeometry(0.28, 0.32, 10.5, 8);
      for (let pz = -26; pz <= 26; pz += 13) {
        const pillar = new THREE.Mesh(pillarGeo, steelMat);
        pillar.position.set(side * 9.8, 5.25, pz);
        pillar.castShadow = true;
        group.add(pillar);
      }

      const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.6, 58), roofMat);
      roof.position.set(side * 4.5, 10.3, 0);
      roof.rotation.z = side * 0.12;
      roof.castShadow = true;
      roof.receiveShadow = true;
      group.add(roof);

      // Stadium light strip under roof lip
      const roofLight = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.25, 54),
        new THREE.MeshBasicMaterial({ color: this.theme.railB ?? 0xffffff })
      );
      roofLight.position.set(side * -1.8, 9.6, 0);
      group.add(roofLight);

      const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, 4 * 40);
      crowd.receiveShadow = true;
      const m = new THREE.Matrix4();
      const c = new THREE.Color();
      let k = 0;
      for (let row = 0; row < 4; row++) {
        for (let j = 0; j < 40; j++) {
          m.makeTranslation(side * row * 3, 1.5 + row * 1.5 + 0.45, -26 + j * 1.3 + this.rand() * 0.4);
          crowd.setMatrixAt(k, m);
          crowd.setColorAt(k, c.setHex(crowdColors[(k * 7 + row) % crowdColors.length]));
          k++;
        }
      }
      group.add(crowd);
      this.group.add(group);
    });
  }

  buildFloatingHolograms() {
    const holoGeo = new THREE.OctahedronGeometry(1.2, 0);
    const holoMat = new THREE.MeshBasicMaterial({ color: 0xffdd00, wireframe: true, transparent: true, opacity: 0.8 });
    [0.08, 0.26, 0.46, 0.68, 0.88].forEach(t => {
      const p = this.track.getPositionAt(t);
      const mesh = new THREE.Mesh(holoGeo, holoMat);
      mesh.position.set(p.x, p.y + 6.5, p.z);
      this.group.add(mesh);
      this.holograms.push(mesh);
    });
  }

  // ------------------------------------------------------------------
  // Signature 3D Stage Landmarks, Cliffs, Pit Complex & Animated Props
  // ------------------------------------------------------------------
  buildStageLandmarks() {
    this.buildElevatedHillButtresses();
    if (this.def.id === 'beach') this.buildBeachLandmarks();
    else if (this.def.id === 'buriram') this.buildCityLandmarks();
    else if (this.def.id === 'snow') this.buildSnowLandmarks();
    else if (this.def.id === 'volcano') this.buildVolcanoLandmarks();
  }

  /** Anchors broad tapered hill/plateau shoulders cleanly beneath outer elevated road curves. */
  buildElevatedHillButtresses() {
    if (this.def.id === 'buriram') return; // Modern GP uses clean concrete piers instead of earth mounds
    const track = this.track;
    const N = track.sampleCount;
    const half = track.trackWidth / 2;
    const spots = [];
    for (let i = 0; i < N; i += 16) {
      const p = track.samplePos[i];
      if (p.y < 4.5) continue;
      if (track.hasOtherSectionNear(i, half + 20)) continue;
      const n = track.sampleNorm[i];
      for (const side of [-1, 1]) {
        const dist = half + 15 + (i % 3) * 4;
        const x = p.x + n.x * side * dist;
        const z = p.z + n.z * side * dist;
        if (track.distanceToCentreLine(x, z, 2) < half + 11) continue;
        spots.push({ x, z, h: Math.max(2.5, p.y * 0.72), r: 12 + this.rand() * 5 });
      }
    }
    if (!spots.length) return;
    const colorMap = {
      beach: 0x9b825e,
      snow: 0x526784,
      volcano: 0x38201d
    };
    const mat = new THREE.MeshStandardMaterial({
      color: colorMap[this.def.id] || 0x444444,
      roughness: 0.9,
      flatShading: true
    });
    const inst = new THREE.InstancedMesh(this.createCraggyConeGeo(5.2, 11.5, 1, 10, 3, 0.22), mat, spots.length);
    inst.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    spots.forEach((pt, k) => {
      q.setFromAxisAngle(UP_AXIS, k * 1.1);
      pos.set(pt.x, pt.h * 0.5 - 0.5, pt.z);
      s.set(pt.r / 11.5, pt.h, pt.r / 11.5);
      m.compose(pos, q, s);
      inst.setMatrixAt(k, m);
    });
    this.group.add(inst);
  }

  buildBeachLandmarks() {
    const track = this.track;
    const { bounds, groundRadius: radius } = this;
    const half = track.trackWidth / 2;

    // 1. Coastal Striped Lighthouse overlooking cliff bend & sunset bay
    let lhSpot = null;
    const coastPt = track.getPositionAt(0.24);
    const coastNorm = track.sampleNorm[track.indexFromT(0.24)];
    for (const side of [1, -1]) {
      const cand = { x: coastPt.x + coastNorm.x * side * 42, z: coastPt.z + coastNorm.z * side * 42 };
      if (track.distanceToCentreLine(cand.x, cand.z, 2) >= half + 28) {
        lhSpot = cand;
        break;
      }
    }
    if (!lhSpot) lhSpot = this.findClearSpot(bounds, radius * 0.85, half + 26, [], 0);
    if (lhSpot) {
      const lh = new THREE.Group();
      lh.position.set(lhSpot.x, 0, lhSpot.z);

      const rockBase = new THREE.Mesh(
        this.createCraggyConeGeo(5.5, 11.5, 5.5, 14, 3, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x6c655c, roughness: 0.92, flatShading: true })
      );
      rockBase.position.y = 2.6;
      rockBase.castShadow = true;
      rockBase.receiveShadow = true;
      lh.add(rockBase);

      const whiteMat = new THREE.MeshStandardMaterial({ color: 0xfbf7f0, roughness: 0.5 });
      const redMat = new THREE.MeshStandardMaterial({ color: 0xd92638, roughness: 0.5 });
      for (let b = 0; b < 5; b++) {
        const rBot = 3.2 - b * 0.28;
        const rTop = rBot - 0.24;
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, 4.4, 16), b % 2 === 0 ? whiteMat : redMat);
        seg.position.y = 7.0 + b * 4.4;
        seg.castShadow = true;
        seg.receiveShadow = true;
        lh.add(seg);
      }

      const gallery = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 2.2, 0.9, 16),
        new THREE.MeshStandardMaterial({ color: 0x1e2530, metalness: 0.7, roughness: 0.35 })
      );
      gallery.position.y = 27.2;
      const lantern = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.6, 2.8, 12),
        new THREE.MeshBasicMaterial({ color: 0xfff0a0 })
      );
      lantern.position.y = 29.0;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 2.2, 14), redMat);
      roof.position.y = 31.3;
      lh.add(gallery, lantern, roof);

      // Rotating volumetric golden searchlight beam
      const beamPivot = new THREE.Group();
      beamPivot.position.y = 29.0;
      const beamGeo = new THREE.ConeGeometry(16, 85, 16, 1, true);
      beamGeo.translate(0, -42.5, 0);
      beamGeo.rotateX(-Math.PI / 2);
      const beamMesh = new THREE.Mesh(
        beamGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffdf7a,
          transparent: true,
          opacity: 0.08,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      beamMesh.rotation.x = 0.09;
      beamPivot.add(beamMesh);
      lh.add(beamPivot);
      this.lighthouseBeam = beamPivot;
      this.group.add(lh);
    }

    // 2. Luxury Ocean Marina Yachts & Wooden Jetties outside shoreline
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.2 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xa66e3d, roughness: 0.75 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x112b3c, roughness: 0.12, metalness: 0.8 });
    const cabinGlow = new THREE.MeshBasicMaterial({ color: 0xffd27a });

    for (let y = 0; y < 4; y++) {
      const ang = (y / 4) * Math.PI * 2 + 0.35;
      const dist = radius + 24 + (y % 2) * 18;
      const yx = bounds.cx + Math.cos(ang) * dist;
      const yz = bounds.cz + Math.sin(ang) * dist;
      if (track.distanceToCentreLine(yx, yz, 3) < half + 30) continue;

      const yacht = new THREE.Group();
      yacht.position.set(yx, 0.2, yz);
      yacht.rotation.y = ang + Math.PI * 0.5;

      const hull = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.2, 16), hullMat);
      hull.position.y = 0.8;
      hull.castShadow = true;
      const bow = new THREE.Mesh(new THREE.ConeGeometry(2.75, 5.2, 4), hullMat);
      bow.rotation.set(Math.PI / 2, Math.PI / 4, 0);
      bow.position.set(0, 0.85, 10.6);
      const teak = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.25, 14.5), deckMat);
      teak.position.y = 1.98;
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.2, 7.2), hullMat);
      bridge.position.set(0, 3.1, -1.0);
      const wind = new THREE.Mesh(new THREE.BoxGeometry(4.08, 1.1, 4.8), glassMat);
      wind.position.set(0, 3.25, -0.4);
      const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.3, 10), cabinGlow);
      lightStrip.position.set(0, 1.3, 0);

      yacht.add(hull, bow, teak, bridge, wind, lightStrip);
      this.group.add(yacht);
      this.yachts.push({ group: yacht, baseY: 0.2, phase: y * 1.4 });
    }
  }

  buildCityLandmarks() {
    const track = this.track;
    const { bounds, groundRadius: radius } = this;
    const half = track.trackWidth / 2;

    // 1. Sleek Race Control Glass Tower & Pit Paddock opposite start straight
    const idx0 = track.wrapIndex(10 / track.sampleSpacing);
    const p0 = track.samplePos[idx0];
    const n0 = track.sampleNorm[idx0];
    const tan0 = track.sampleTan[idx0];
    const pitX = p0.x - n0.x * (half + 20);
    const pitZ = p0.z - n0.z * (half + 20);
    if (track.distanceToCentreLine(pitX, pitZ, 2) >= half + 15) {
      const tower = new THREE.Group();
      tower.position.set(pitX, 0, pitZ);
      tower.quaternion.setFromUnitVectors(Z_AXIS, tan0);

      const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.8, roughness: 0.3 });
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a2e47, emissive: 0x004a77, emissiveIntensity: 0.65, metalness: 0.85, roughness: 0.15 });
      const neonMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });

      const base = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 36), darkMetal);
      base.position.set(-4, 3, 0);
      base.castShadow = true;
      base.receiveShadow = true;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, 22, 12), darkMetal);
      shaft.position.set(-4, 15, 0);
      shaft.castShadow = true;
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 5.2, 4.2, 16), glassMat);
      deck.position.set(-4, 27, 0);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(6.9, 0.22, 6, 28), neonMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.set(-4, 29.2, 0);
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.25, 8, 6), neonMat);
      spire.position.set(-4, 33, 0);
      tower.add(base, shaft, deck, halo, spire);
      this.group.add(tower);
    }

    // 2. Four Tall Stadium Floodlight Towers casting dramatic nocturnal light cones
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x8be9ff,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x262e42, metalness: 0.82, roughness: 0.28 });
    const headGlowMat = new THREE.MeshBasicMaterial({ color: 0xe6f9ff });

    for (let f = 0; f < 4; f++) {
      const ang = (f / 4) * Math.PI * 2 + 0.65;
      const dist = radius * 0.66;
      const fx = bounds.cx + Math.cos(ang) * dist;
      const fz = bounds.cz + Math.sin(ang) * dist;
      if (track.distanceToCentreLine(fx, fz, 2) < half + 18) continue;

      const pylon = new THREE.Group();
      pylon.position.set(fx, 0, fz);
      pylon.lookAt(bounds.cx, 0, bounds.cz);

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.9, 44, 8), pylonMat);
      mast.position.y = 22;
      mast.castShadow = true;
      const bank = new THREE.Mesh(new THREE.BoxGeometry(10, 4.2, 1.1), headGlowMat);
      bank.position.set(0, 44, 1.0);
      bank.rotation.x = 0.45;
      const coneGeo = new THREE.ConeGeometry(28, 72, 14, 1, true);
      coneGeo.translate(0, -36, 0);
      const cone = new THREE.Mesh(coneGeo, beamMat);
      cone.position.set(0, 43, 1.5);
      cone.rotation.x = -0.82;
      pylon.add(mast, bank, cone);
      this.group.add(pylon);
    }

    // 3. Orbiting Illuminated "ASHI GP" Blimp / Airship
    const blimp = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(6.5, 22, 10, 18),
      new THREE.MeshStandardMaterial({ color: 0x1c253d, metalness: 0.6, roughness: 0.3 })
    );
    body.rotation.x = Math.PI / 2;
    const bandA = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.35, 6, 24), new THREE.MeshBasicMaterial({ color: 0x00f3ff }));
    bandA.position.z = 5;
    const bandB = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.35, 6, 24), new THREE.MeshBasicMaterial({ color: 0xff1e7a }));
    bandB.position.z = -5;
    const finMat = new THREE.MeshStandardMaterial({ color: 0xff1e7a, roughness: 0.4 });
    const finTop = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6.5, 6), finMat);
    finTop.position.set(0, 6.2, -11);
    const finSide = new THREE.Mesh(new THREE.BoxGeometry(13, 0.4, 5.5), finMat);
    finSide.position.set(0, 0, -11);
    const gondola = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 8.5), new THREE.MeshBasicMaterial({ color: 0xffe484 }));
    gondola.position.set(0, -7.2, 0);
    blimp.add(body, bandA, bandB, finTop, finSide, gondola);
    blimp.position.set(bounds.cx, 66, bounds.cz);
    this.group.add(blimp);
    this.blimpGroup = { group: blimp, cx: bounds.cx, cz: bounds.cz, rx: Math.max(95, radius * 0.45), rz: Math.max(85, radius * 0.40), angle: 0 };
  }

  buildSnowLandmarks() {
    const track = this.track;
    const { bounds, groundRadius: radius } = this;
    const half = track.trackWidth / 2;

    // 1. Aurora Borealis Sky Ribbons shimmering above alpine horizon
    const aurC = document.createElement('canvas');
    aurC.width = 256;
    aurC.height = 128;
    const actx = aurC.getContext('2d');
    const g = actx.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0.0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(0.25, 'rgba(0, 255, 168, 0.65)');
    g.addColorStop(0.65, 'rgba(56, 210, 255, 0.38)');
    g.addColorStop(1.0, 'rgba(130, 80, 255, 0)');
    actx.fillStyle = g;
    actx.fillRect(0, 0, 256, 128);
    const aurTex = new THREE.CanvasTexture(aurC);
    aurTex.wrapS = THREE.RepeatWrapping;
    aurTex.colorSpace = THREE.SRGBColorSpace;
    this.auroraTex = aurTex;

    const aurMat = new THREE.MeshBasicMaterial({
      map: aurTex,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide
    });
    for (let r = 0; r < 2; r++) {
      const geo = new THREE.CylinderGeometry(540 + r * 60, 560 + r * 60, 95, 40, 1, true, Math.PI * 0.15 + r * 0.7, Math.PI * 0.95);
      const mesh = new THREE.Mesh(geo, aurMat);
      mesh.position.set(bounds.cx, 165 + r * 28, bounds.cz);
      mesh.rotation.z = (r === 0 ? 1 : -1) * 0.08;
      this.group.add(mesh);
      this.auroraMeshes.push(mesh);
    }

    // 2. Warm Timber Ski Chalets nestled in clear snow valley pockets
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5d3820, roughness: 0.85 });
    const snowRoofMat = new THREE.MeshStandardMaterial({ color: 0xf4f9ff, roughness: 0.45, flatShading: true });
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffd269 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x586270, roughness: 0.9 });
    const placedChalets = [];
    for (let ch = 0; ch < 5; ch++) {
      const spot = this.findClearSpot(bounds, radius * 0.76, half + 20, placedChalets, 38);
      if (!spot) continue;
      placedChalets.push(spot);
      const chalet = new THREE.Group();
      chalet.position.set(spot.x, 0, spot.z);
      chalet.rotation.y = this.rand() * Math.PI * 2;

      const body = new THREE.Mesh(new THREE.BoxGeometry(9.5, 5.2, 12), woodMat);
      body.position.y = 2.6;
      body.castShadow = true;
      body.receiveShadow = true;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(8.8, 5.0, 4), snowRoofMat);
      roof.position.y = 7.6;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      const win1 = new THREE.Mesh(new THREE.BoxGeometry(9.7, 1.5, 7.5), winMat);
      win1.position.y = 2.8;
      const win2 = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.5, 12.2), winMat);
      win2.position.y = 2.8;
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.2, 1.4), stoneMat);
      chimney.position.set(2.4, 8.0, -2.0);
      chalet.add(body, roof, win1, win2, chimney);
      this.group.add(chalet);
    }

    // 3. Animated Alpine Ski-Lift Cableway & Moving Gondola Cabins
    const sA = this.findClearSpot(bounds, radius * 0.65, half + 22, placedChalets, 30);
    let sB = null;
    if (sA) {
      for (let tryAng = 0; tryAng < 12; tryAng++) {
        const ang = (tryAng / 12) * Math.PI * 2 + this.rand() * 0.4;
        const cand = { x: sA.x + Math.cos(ang) * 145, z: sA.z + Math.sin(ang) * 145 };
        if (track.distanceToCentreLine(cand.x, cand.z, 2) >= half + 22) {
          sB = cand;
          break;
        }
      }
    }
    if (sA && sB) {
      const pA = new THREE.Vector3(sA.x, 24, sA.z);
      const pB = new THREE.Vector3(sB.x, 38, sB.z);
      const steelMat = new THREE.MeshStandardMaterial({ color: 0x3b4859, metalness: 0.75, roughness: 0.35 });

      [pA, pB].forEach(pt => {
        const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.25, pt.y, 8), steelMat);
        pylon.position.set(pt.x, pt.y * 0.5, pt.z);
        pylon.castShadow = true;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.7, 0.7), steelMat);
        bar.position.copy(pt);
        this.group.add(pylon, bar);
      });

      const cableCurve = new THREE.LineCurve3(pA, pB);
      const cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 8, 0.14, 5, false), steelMat);
      this.group.add(cable);

      const gondolaCols = [0xff2a55, 0x00d2ff, 0xffcc00, 0x38d9a9];
      for (let gIdx = 0; gIdx < 5; gIdx++) {
        const cabin = new THREE.Group();
        const pod = new THREE.Mesh(
          new THREE.BoxGeometry(2.6, 2.8, 3.2),
          new THREE.MeshStandardMaterial({ color: gondolaCols[gIdx % gondolaCols.length], roughness: 0.35, metalness: 0.25 })
        );
        pod.position.y = -2.2;
        const win = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.1, 2.4), new THREE.MeshBasicMaterial({ color: 0xfff2b2 }));
        win.position.y = -1.9;
        const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 6), steelMat);
        hanger.position.y = -0.8;
        cabin.add(pod, win, hanger);
        this.group.add(cabin);
        this.gondolas.push({ group: cabin, pA, pB, phase: gIdx / 5 });
      }
    }
  }

  buildVolcanoLandmarks() {
    const track = this.track;
    const { bounds, groundRadius: radius } = this;
    const half = track.trackWidth / 2;

    // 1. Subterranean Magma Gorge Channels passing visibly under elevated bridges & bends
    const magmaMat = new THREE.MeshBasicMaterial({ color: 0xff6200 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x221412, roughness: 0.9, flatShading: true });
    let lastGorgeIdx = -999;
    let gorgeCount = 0;
    for (let i = 0; i < track.sampleCount; i += 16) {
      if (i - lastGorgeIdx < 50) continue;
      const p = track.samplePos[i];
      if (p.y < 11.0) continue;
      const n = track.sampleNorm[i];
      // Verify the lava channel stays well away from any low ground track segment
      const tipA = { x: p.x + n.x * 26, z: p.z + n.z * 26 };
      const tipB = { x: p.x - n.x * 26, z: p.z - n.z * 26 };
      if (track.distanceToCentreLine(tipA.x, tipA.z, 2) < half + 4 && p.y < 12) continue;
      lastGorgeIdx = i;
      gorgeCount++;

      const len = 76;
      const river = new THREE.Mesh(new THREE.PlaneGeometry(18, len), magmaMat);
      river.rotation.x = -Math.PI / 2;
      const ang = Math.atan2(n.x, n.z);
      river.rotation.z = -ang;
      river.position.set(p.x, 0.12, p.z);
      this.group.add(river);
      this.lavaPools.push(river);

      [-10.2, 10.2].forEach(side => {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, len), rimMat);
        curb.rotation.y = ang;
        curb.position.set(
          p.x + track.sampleTan[i].x * side,
          0.6,
          p.z + track.sampleTan[i].z * side
        );
        this.group.add(curb);
      });
      if (gorgeCount >= 2) break;
    }

    // 2. Industrial Steel Obsidian Mining Cranes & Hazard Beacons
    const placed = [];
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x262932, metalness: 0.78, roughness: 0.32 });
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
    for (let c = 0; c < 4; c++) {
      const spot = this.findClearSpot(bounds, radius * 0.74, half + 20, placed, 55);
      if (!spot) continue;
      placed.push(spot);

      const crane = new THREE.Group();
      crane.position.set(spot.x, 0, spot.z);
      crane.rotation.y = this.rand() * Math.PI * 2;

      const tower = new THREE.Mesh(new THREE.BoxGeometry(3.2, 34, 3.2), ironMat);
      tower.position.y = 17;
      tower.castShadow = true;
      const boom = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 26), ironMat);
      boom.position.set(0, 34, 8);
      boom.rotation.x = -0.22;
      boom.castShadow = true;
      const counterWeight = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.2, 5.0), ironMat);
      counterWeight.position.set(0, 32, -6);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8), beaconMat);
      beacon.position.set(0, 36.2, 0);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 14, 6), ironMat);
      cable.position.set(0, 29, 19);
      const bucket = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.4, 3.0, 8), beaconMat);
      bucket.position.set(0, 21.5, 19);

      crane.add(tower, boom, counterWeight, beacon, cable, bucket);
      this.group.add(crane);
    }
  }

  buildWeather(type) {
    const count = type === 'snow' ? 2200 : 900;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    this.weatherBox = { w: 160, h: 50 };
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * this.weatherBox.w;
      positions[i * 3 + 1] = Math.random() * this.weatherBox.h;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.weatherBox.w;
      speeds[i] = 0.6 + Math.random() * 0.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);

    const mat = new THREE.PointsMaterial({
      size: type === 'snow' ? 0.45 : 0.35,
      map: tex,
      color: type === 'snow' ? 0xffffff : 0xff7a1a,
      transparent: true,
      depthWrite: false,
      blending: type === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.group.add(points);
    this.weather = { type, points, positions, speeds, count, time: 0 };
  }

  update(delta, camera) {
    if (this.skyDomeGroup && camera) {
      this.skyDomeGroup.position.set(camera.position.x, 0, camera.position.z);
    }

    if (this.waterTex) {
      this.waterTex.offset.x = (this.waterTex.offset.x + delta * 0.015) % 1;
      this.waterTex.offset.y = (this.waterTex.offset.y + delta * 0.009) % 1;
    }

    this.holograms.forEach(h => {
      h.rotation.y += delta * 2;
      h.rotation.x += delta * 1.5;
    });

    const pulse = 0.75 + Math.sin(performance.now() * 0.002) * 0.25;
    if (this.lavaTop) {
      this.lavaTop.material.color.setRGB(1, 0.3 * pulse + 0.05, 0);
    }
    if (this.volcanoGlowCol) {
      this.volcanoGlowCol.material.opacity = 0.14 + pulse * 0.09;
    }

    if (this.lighthouseBeam) {
      this.lighthouseBeam.rotation.y += delta * 0.65;
    }
    if (this.yachts.length) {
      const nowSec = performance.now() * 0.0014;
      this.yachts.forEach(y => {
        y.group.position.y = y.baseY + Math.sin(nowSec + y.phase) * 0.32;
        y.group.rotation.z = Math.sin(nowSec * 0.8 + y.phase) * 0.04;
      });
    }
    if (this.blimpGroup) {
      const b = this.blimpGroup;
      b.angle += delta * 0.085;
      const nx = b.cx + Math.cos(b.angle) * b.rx;
      const nz = b.cz + Math.sin(b.angle) * b.rz;
      const dx = -Math.sin(b.angle) * b.rx;
      const dz = Math.cos(b.angle) * b.rz;
      b.group.position.set(nx, 66 + Math.sin(b.angle * 3) * 2.5, nz);
      b.group.rotation.y = Math.atan2(dx, dz);
    }
    if (this.gondolas.length) {
      const nowT = performance.now() * 0.00008;
      this.gondolas.forEach(g => {
        const pingPong = 0.5 - 0.5 * Math.cos((nowT + g.phase) * Math.PI * 2);
        g.group.position.lerpVectors(g.pA, g.pB, pingPong);
      });
    }
    if (this.auroraTex) {
      this.auroraTex.offset.x = (this.auroraTex.offset.x + delta * 0.025) % 1;
    }
    if (this.volcanoSmoke.length) {
      const nowS = performance.now() * 0.00025;
      this.volcanoSmoke.forEach(sm => {
        const t = (nowS + sm.phase) % 1;
        sm.mesh.position.y = 114 + t * 68;
        const sc = 0.7 + t * 1.45;
        sm.mesh.scale.set(sc, sc, 1);
      });
    }

    const w = this.weather;
    if (w && camera) {
      w.time += delta;
      const p = w.positions;
      const box = this.weatherBox;
      const cx = camera.position.x;
      const cz = camera.position.z;
      const dir = w.type === 'snow' ? -1 : 1;
      for (let i = 0; i < w.count; i++) {
        const ix = i * 3;
        p[ix + 1] += dir * w.speeds[i] * delta * (w.type === 'snow' ? 4 : 3);
        p[ix] += Math.sin(w.time + i) * delta * 0.8;
        if (p[ix + 1] < 0) p[ix + 1] += box.h;
        if (p[ix + 1] > box.h) p[ix + 1] -= box.h;
      }
      w.points.position.set(cx, 0, cz);
      for (let i = 0; i < w.count; i++) {
        const ix = i * 3;
        if (p[ix] > box.w / 2) p[ix] -= box.w;
        if (p[ix] < -box.w / 2) p[ix] += box.w;
      }
      w.points.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() {
    disposeObject3D(this.group);
    this.scene.remove(this.group);
  }
}
