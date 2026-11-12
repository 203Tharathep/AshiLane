import * as THREE from 'three';
import { disposeObject3D } from './Track.js';
import { SKINS } from '../data/skinsData.js';

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const UP_AXIS = new THREE.Vector3(0, 1, 0);

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
    fogDensity: 0.0021,
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
    sunDir: [-48, 44, 34],
    sunColor: 0xffaa66,
    sunIntensity: 1.48,
    ambientColor: 0x5c2a1e,
    ambientIntensity: 0.45,
    hemiSky: 0x5c2418,
    hemiGround: 0xff4500,
    hemiIntensity: 0.88,
    rimColor: 0xff3d00,
    rimIntensity: 1.05,
    rimDir: [42, 12, -42],
    fogColor: 0x2b0b08,
    fogDensity: 0.0028,
    exposure: 1.16,
    skyTop: '#0b0305',
    skyMid: '#3d0e09',
    skyHorizon: '#b5360e',
    sunDisc: '#ff8833',
    sunGlow: '#ff2a00',
    sunScale: 44,
    stars: 0.35,
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
    const radius = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.5 + 115;

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
      // Urban paddock blocks & crisp circuit grid lines
      ctx.strokeStyle = detail;
      ctx.lineWidth = 2;
      for (let i = 0; i <= 512; i += 64) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0, 243, 255, 0.08)';
      for (let x = 0; x < 512; x += 64) {
        for (let y = 0; y < 512; y += 64) {
          if (((x + y) / 64) % 3 === 0) ctx.fillRect(x + 6, y + 6, 52, 52);
        }
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
          bumpScale: 0.4,
          color: 0x1aa3c8,
          roughness: 0.16,
          metalness: 0.45
        })
      );
      ocean.rotation.x = -Math.PI / 2;
      ocean.position.set(bounds.cx, -0.68, bounds.cz);
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
      const far = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(10, radius - 5), 1020, 64),
        farIsEmissive
          ? new THREE.MeshBasicMaterial({ color: this.theme.farGround ?? 0xcc3300 })
          : new THREE.MeshStandardMaterial({ color: this.theme.farGround ?? 0x05060c, roughness: 0.55, metalness: 0.25 })
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
      const spot = this.findClearSpot(bounds, radius * 0.48, 72, [], 0) || { x: bounds.cx + 120, z: bounds.cz };
      const volcanoX = spot.x;
      const volcanoZ = spot.z;

      const coneMat = new THREE.MeshStandardMaterial({ color: 0x241412, roughness: 0.92, flatShading: true });
      const cone = new THREE.Mesh(this.createCraggyConeGeo(24, 96, 98, 28, 8, 0.22), coneMat);
      cone.position.set(volcanoX, 49, volcanoZ);
      cone.castShadow = true;
      cone.receiveShadow = true;
      this.group.add(cone);

      // Glowing caldera top lava core + skyward glow column
      const lavaTop = new THREE.Mesh(
        new THREE.CircleGeometry(23, 28),
        new THREE.MeshBasicMaterial({ color: 0xff5a00 })
      );
      lavaTop.rotation.x = -Math.PI / 2;
      lavaTop.position.set(volcanoX, 95, volcanoZ);
      this.group.add(lavaTop);
      this.lavaTop = lavaTop;

      const glowColumn = new THREE.Mesh(
        new THREE.CylinderGeometry(36, 18, 65, 20, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xff4500,
          transparent: true,
          opacity: 0.14,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      glowColumn.position.set(volcanoX, 126, volcanoZ);
      this.group.add(glowColumn);
      this.volcanoGlowCol = glowColumn;

      // Lava rivers flowing down volcano ridges
      const riverMat = new THREE.MeshBasicMaterial({ color: 0xff4c00 });
      for (let r = 0; r < 7; r++) {
        const ang = (r / 7) * Math.PI * 2 + 0.3;
        const river = new THREE.Mesh(new THREE.BoxGeometry(3.2, 114, 1.8), riverMat);
        river.position.set(volcanoX + Math.cos(ang) * 56, 47, volcanoZ + Math.sin(ang) * 56);
        river.lookAt(volcanoX, 47, volcanoZ);
        river.rotateX(0.58);
        this.group.add(river);
        this.lavaRivers.push(river);
      }

      // Towering jagged obsidian rock spires around caldera & perimeter
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x1b1111, roughness: 0.85, flatShading: true });
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
      for (let i = 0; i < N; i += 8) {
        const p = track.samplePos[i];
        const n = track.sampleNorm[i];
        const side = (i / 8) % 2 === 0 ? 1 : -1;
        const dist = half + 6 + this.rand() * 14;
        const x = p.x + n.x * side * dist;
        const z = p.z + n.z * side * dist;
        if (track.distanceToCentreLine(x, z, 2) < half + 5.5) continue;
        palmSpots.push({ x, z, scale: 0.85 + this.rand() * 0.55, yaw: this.rand() * Math.PI * 2, lean: 0.08 + this.rand() * 0.14 });
      }
      if (palmSpots.length) {
        const count = palmSpots.length;
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7c5333, roughness: 0.9 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x229944, roughness: 0.65, side: THREE.DoubleSide });
        const cocoMat = new THREE.MeshStandardMaterial({ color: 0x4e2d18, roughness: 0.7 });

        const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.36, 7.2, 7), trunkMat, count);
        trunks.castShadow = true;
        trunks.receiveShadow = true;

        // 6 arched 3D frond blades per palm using InstancedMesh
        const frondGeo = new THREE.BoxGeometry(0.65, 0.08, 3.6);
        frondGeo.translate(0, 0, 1.7);
        const fronds = new THREE.InstancedMesh(frondGeo, leafMat, count * 6);
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

          for (let f = 0; f < 6; f++) {
            const frondYaw = pt.yaw + (f / 6) * Math.PI * 2 + 0.15;
            e.set(0.32 + (f % 2) * 0.12, frondYaw, 0, 'YXZ');
            q.setFromEuler(e);
            s.set(pt.scale, pt.scale, pt.scale);
            m.compose(topPos, q, s);
            fronds.setMatrixAt(k * 6 + f, m);
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
      for (let i = 0; i < N; i += 7) {
        const p = track.samplePos[i];
        const n = track.sampleNorm[i];
        const side = (i / 7) % 2 === 0 ? 1 : -1;
        const dist = half + 6 + this.rand() * 14;
        const x = p.x + n.x * side * dist;
        const z = p.z + n.z * side * dist;
        if (track.distanceToCentreLine(x, z, 2) < half + 5.5) continue;
        pineSpots.push({ x, z, scale: 0.8 + this.rand() * 0.65 });
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
        [tier1, tier2, tier3, snow1, snow2].forEach(mesh => {
          mesh.castShadow = true;
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
      }
    } else if (style === 'lamps') {
      const lampSpots = [];
      for (let i = 0; i < N; i += 14) {
        const p = track.samplePos[i];
        const n = track.sampleNorm[i];
        const tan = track.sampleTan[i];
        for (const side of [-1, 1]) {
          const x = p.x + n.x * side * (half + 1.8);
          const z = p.z + n.z * side * (half + 1.8);
          lampSpots.push({ x, z, side, nx: n.x, nz: n.z, tx: tan.x, tz: tan.z });
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

          pos.set(l.x, 4.6, l.z);
          m.compose(pos, q, s);
          masts.setMatrixAt(k, m);

          pos.set(l.x + dir.x * 1.15, 9.2, l.z + dir.z * 1.15);
          m.compose(pos, q, s);
          arms.setMatrixAt(k, m);

          pos.set(l.x + dir.x * 2.1, 9.05, l.z + dir.z * 2.1);
          m.compose(pos, q, s);
          heads.setMatrixAt(k, m);

          pos.set(l.x + dir.x * 3.8, 0.08, l.z + dir.z * 3.8);
          m.compose(pos, q, s);
          pools.setMatrixAt(k, m);
        });
        this.group.add(masts, arms, heads, pools);
      }
    } else if (style === 'rocks') {
      const rockSpots = [];
      for (let i = 0; i < N; i += 9) {
        const p = track.samplePos[i];
        const n = track.sampleNorm[i];
        const side = (i / 9) % 2 === 0 ? 1 : -1;
        const dist = half + 6 + this.rand() * 14;
        const x = p.x + n.x * side * dist;
        const z = p.z + n.z * side * dist;
        if (track.distanceToCentreLine(x, z, 2) < half + 5.5) continue;
        rockSpots.push({ x, z, scale: 0.75 + this.rand() * 1.15, rot: this.rand() * Math.PI });
      }
      if (rockSpots.length) {
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x281c1a, roughness: 0.88, flatShading: true });
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
          pos = new THREE.Vector3(x, 0, z);
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

      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 1, h + 1, 0.9), frameMat);
      frame.position.set(0, 8 + h / 2, 0);
      frame.castShadow = true;
      frame.receiveShadow = true;
      const border = new THREE.Mesh(new THREE.BoxGeometry(w + 1.3, h + 1.3, 0.22), neonMat);
      border.position.set(0, 8 + h / 2, -0.36);
      group.add(frame, border);

      // Upper floodlight brackets illuminating billboard
      [-4, 0, 4].forEach(lx => {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.8), poleMat);
        arm.position.set(lx, 8 + h + 0.55, 0.8);
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.3), lightLampMat);
        bulb.position.set(lx, 8 + h + 0.48, 1.6);
        group.add(arm, bulb);
      });

      const tex = this.textureLoader.load(`/assets/ashi/${cfg.file}`);
      tex.colorSpace = THREE.SRGBColorSpace;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
      screen.position.set(0, 8 + h / 2, 0.47);
      group.add(screen);

      const look = p.clone().addScaledVector(tan, -30);
      group.lookAt(look.x, 0, look.z);
      this.group.add(group);
    }
  }

  // ------------------------------------------------------------------
  // 3D Structural Arch Tunnel with Neon Ribs & Skylight Canopy
  // ------------------------------------------------------------------
  buildTunnel() {
    const range = this.def.tunnel;
    if (!range) return;
    const track = this.track;
    const [startT, endT] = range;
    const len = (endT - startT) * track.trackLength;
    const ringsCount = Math.max(8, Math.round(len / 7));
    const radius = track.trackWidth / 2 + 1.5;

    const frameGeo = new THREE.TorusGeometry(radius + 0.45, 0.42, 6, 24, Math.PI);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1e28, metalness: 0.85, roughness: 0.3 });
    const ringGeo = new THREE.TorusGeometry(radius, 0.28, 6, 24, Math.PI);
    const matA = new THREE.MeshBasicMaterial({ color: this.theme.railB ?? 0x00f0ff });
    const matB = new THREE.MeshBasicMaterial({ color: this.theme.railA ?? 0xff0066 });

    // Translucent dark-tinted aerodynamic tunnel canopy connecting ribs
    const canopyGeo = new THREE.CylinderGeometry(radius + 0.35, radius + 0.35, (len / ringsCount) * 1.05, 18, 1, true, 0, Math.PI);
    canopyGeo.rotateZ(Math.PI / 2);
    canopyGeo.rotateY(Math.PI / 2);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x0d1220,
      roughness: 0.25,
      metalness: 0.75,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide
    });

    for (let k = 0; k <= ringsCount; k++) {
      const t = startT + (k / ringsCount) * (endT - startT);
      const i = track.indexFromT(t);
      const p = track.samplePos[i];
      const q = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, track.sampleTan[i]);

      const outerRib = new THREE.Mesh(frameGeo, frameMat);
      outerRib.position.set(p.x, 0, p.z);
      outerRib.quaternion.copy(q);
      outerRib.castShadow = true;
      outerRib.receiveShadow = true;
      this.group.add(outerRib);

      const ring = new THREE.Mesh(ringGeo, k % 2 === 0 ? matA : matB);
      ring.position.set(p.x, 0, p.z);
      ring.quaternion.copy(q);
      this.group.add(ring);

      if (k < ringsCount) {
        const nextT = startT + ((k + 0.5) / ringsCount) * (endT - startT);
        const ni = track.indexFromT(nextT);
        const np = track.samplePos[ni];
        const canopy = new THREE.Mesh(canopyGeo, canopyMat);
        canopy.position.set(np.x, 0, np.z);
        canopy.quaternion.setFromUnitVectors(Z_AXIS, track.sampleTan[ni]);
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
    const standMat = new THREE.MeshStandardMaterial({ color: 0x242836, roughness: 0.65, metalness: 0.2 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x161922, roughness: 0.35, metalness: 0.85 });
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
      mesh.position.set(p.x, 6.5, p.z);
      this.group.add(mesh);
      this.holograms.push(mesh);
    });
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
      this.volcanoGlowCol.material.opacity = 0.1 + pulse * 0.07;
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
