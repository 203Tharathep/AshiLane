import * as THREE from 'three';

export class CarModelBuilder {
  constructor() {
    this.textureLoader = new THREE.TextureLoader();
    this.textureCache = new Map();
  }

  loadSkinTexture(fileName) {
    if (!fileName) return null;
    const url = `/assets/ashi/${fileName}`;
    if (this.textureCache.has(url)) {
      return this.textureCache.get(url);
    }
    const texture = this.textureLoader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    this.textureCache.set(url, texture);
    return texture;
  }

  makeSideDecal(width, height, isLeft = false) {
    const geo = new THREE.PlaneGeometry(width, height);
    if (isLeft) {
      const uvs = geo.attributes.uv;
      for (let i = 0; i < uvs.count; i++) {
        uvs.setX(i, 1 - uvs.getX(i));
      }
      uvs.needsUpdate = true;
    }
    return geo;
  }

  makeFramedLivery(width, height, decalMat, frameMat, isLeft = false, withSpeedStreaks = false) {
    const group = new THREE.Group();
    // 1. Sleek metallic/carbon vinyl wrap backing frame
    const frameGeo = new THREE.PlaneGeometry(width * 1.04, height * 1.08);
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    group.add(frameMesh);

    // 2. Main Character Decal
    const decalGeo = this.makeSideDecal(width, height, isLeft);
    const decalMesh = new THREE.Mesh(decalGeo, decalMat);
    decalMesh.position.z = 0.002;
    group.add(decalMesh);

    // 3. Speed Streak Chevrons for aerodynamic livery integration
    if (withSpeedStreaks) {
      const dir = isLeft ? 1 : -1;
      const streak1 = new THREE.Mesh(new THREE.PlaneGeometry(0.52, height * 0.24), frameMat);
      streak1.position.set(dir * (width * 0.54), 0, 0.001);
      streak1.rotation.z = dir * 0.22;

      const streak2 = new THREE.Mesh(new THREE.PlaneGeometry(0.36, height * 0.14), frameMat);
      streak2.position.set(dir * (width * 0.68), -height * 0.18, 0.001);
      streak2.rotation.z = dir * 0.22;

      group.add(streak1, streak2);
    }

    return group;
  }

  createCar(carType = 'gt', skinFileName = null, bodyColor = '#ff2255', isRival = false, addons = null) {
    if (typeof isRival === 'object' && isRival !== null && addons === null) {
      addons = isRival;
      isRival = false;
    }

    const root = new THREE.Group();
    root.name = 'CarRoot';

    const skinTexture = skinFileName ? this.loadSkinTexture(skinFileName) : null;
    const parsedColor = new THREE.Color(bodyColor);

    // --- Premium Automotive Shader Materials ---
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: parsedColor,
      metalness: 0.52,
      roughness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      reflectivity: 0.92
    });

    const decalMat = skinTexture ? new THREE.MeshStandardMaterial({
      map: skinTexture,
      roughness: 0.35,
      metalness: 0.20,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    }) : bodyMat;

    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x141418,
      roughness: 0.4,
      metalness: 0.5
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x111114,
      roughness: 0.7,
      metalness: 0.2
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x101c28,
      metalness: 0.2,
      roughness: 0.06,
      transmission: 0.82,
      transparent: true,
      opacity: 0.88,
      reflectivity: 0.95
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf8f9fa,
      metalness: 0.98,
      roughness: 0.08
    });

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.92,
      roughness: 0.18
    });

    // Lights
    const lightGlowMat = new THREE.MeshBasicMaterial({ color: 0xddf8ff });
    const drlMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const brakeLightMat = new THREE.MeshBasicMaterial({ color: 0xff002e });
    const amberLightMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

    // Wheels & Brakes
    const wheelTireMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.92,
      metalness: 0.1
    });

    const wheelRimMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.94,
      roughness: 0.14
    });

    const brakeDiscMat = new THREE.MeshStandardMaterial({
      color: 0xb0b8c4,
      metalness: 0.95,
      roughness: 0.25
    });

    const caliperMat = new THREE.MeshStandardMaterial({
      color: 0xff1030,
      metalness: 0.75,
      roughness: 0.2
    });

    // Sub-groups for animation
    const chassis = new THREE.Group();
    chassis.name = 'Chassis';
    root.add(chassis);

    const wheels = {
      frontLeft: null,
      frontRight: null,
      rearLeft: null,
      rearRight: null
    };

    const frontWheelSteerGroupL = new THREE.Group();
    const frontWheelSteerGroupR = new THREE.Group();
    chassis.add(frontWheelSteerGroupL);
    chassis.add(frontWheelSteerGroupR);

    // Custom Underglow Color Support
    let underglowColorHex = bodyColor;
    if (addons?.underglow) {
      if (addons.underglow === 'none') {
        underglowColorHex = null;
      } else if (addons.underglow !== 'body_match') {
        underglowColorHex = addons.underglow;
      }
    }

    let underglowMesh = null;
    let underglowMat = null;
    if (underglowColorHex) {
      const underglowParsed = new THREE.Color(underglowColorHex);
      const underglowGeo = new THREE.PlaneGeometry(1.8, 3.6);
      underglowMat = new THREE.MeshBasicMaterial({
        color: underglowParsed,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      if (typeof document !== 'undefined') {
        const underglowCanvas = document.createElement('canvas');
        underglowCanvas.width = 128;
        underglowCanvas.height = 256;
        const ctx = underglowCanvas.getContext('2d');
        if (ctx) {
          const grad = ctx.createRadialGradient(64, 128, 8, 64, 128, 64);
          grad.addColorStop(0, underglowColorHex);
          grad.addColorStop(0.55, underglowColorHex + 'aa');
          grad.addColorStop(1, '#00000000');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 128, 256);
          const underglowTex = new THREE.CanvasTexture(underglowCanvas);
          underglowMat = new THREE.MeshBasicMaterial({
            map: underglowTex,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          });
        }
      }

      underglowMesh = new THREE.Mesh(underglowGeo, underglowMat);
      underglowMesh.rotation.x = -Math.PI / 2;
      underglowMesh.position.y = 0.08;
      root.add(underglowMesh);
    }

    const rimStyle = addons?.wheels || 'stock';
    const makeW = (r, w, p, x, y, z) => this.createWheel(wheelTireMat, wheelRimMat, r, w, p, x, y, z, brakeDiscMat, caliperMat, rimStyle);

    // Dispatch to specific car body builder
    if (carType === 'kart') {
      this.buildKartBody(chassis, bodyMat, decalMat, trimMat, carbonMat, chromeMat, goldMat, lightGlowMat, brakeLightMat);
      wheels.frontLeft = makeW(0.24, 0.22, frontWheelSteerGroupL, -0.72, 0.24, 0.92);
      wheels.frontRight = makeW(0.24, 0.22, frontWheelSteerGroupR, 0.72, 0.24, 0.92);
      wheels.rearLeft = makeW(0.32, 0.30, chassis, -0.78, 0.32, -0.85);
      wheels.rearRight = makeW(0.32, 0.30, chassis, 0.78, 0.32, -0.85);
    } else if (carType === 'truck') {
      this.buildTruckBody(chassis, bodyMat, decalMat, trimMat, carbonMat, glassMat, chromeMat, lightGlowMat, drlMat, brakeLightMat, amberLightMat);
      wheels.frontLeft = makeW(0.46, 0.34, frontWheelSteerGroupL, -0.96, 0.46, 1.35);
      wheels.frontRight = makeW(0.46, 0.34, frontWheelSteerGroupR, 0.96, 0.46, 1.35);
      wheels.rearLeft = makeW(0.46, 0.34, chassis, -0.96, 0.46, -1.35);
      wheels.rearRight = makeW(0.46, 0.34, chassis, 0.96, 0.46, -1.35);
    } else if (carType === 'f1') {
      this.buildF1Body(chassis, bodyMat, decalMat, trimMat, carbonMat, chromeMat, lightGlowMat, brakeLightMat);
      wheels.frontLeft = makeW(0.33, 0.28, frontWheelSteerGroupL, -0.92, 0.33, 1.48);
      wheels.frontRight = makeW(0.33, 0.28, frontWheelSteerGroupR, 0.92, 0.33, 1.48);
      wheels.rearLeft = makeW(0.39, 0.38, chassis, -0.96, 0.39, -1.32);
      wheels.rearRight = makeW(0.39, 0.38, chassis, 0.96, 0.39, -1.32);
    } else if (carType === 'muscle') {
      this.buildMuscleBody(chassis, bodyMat, decalMat, trimMat, carbonMat, chromeMat, glassMat, lightGlowMat, brakeLightMat);
      wheels.frontLeft = makeW(0.36, 0.28, frontWheelSteerGroupL, -0.86, 0.36, 1.25);
      wheels.frontRight = makeW(0.36, 0.28, frontWheelSteerGroupR, 0.86, 0.36, 1.25);
      wheels.rearLeft = makeW(0.41, 0.35, chassis, -0.88, 0.41, -1.18);
      wheels.rearRight = makeW(0.41, 0.35, chassis, 0.88, 0.41, -1.18);
    } else if (carType === 'hyper') {
      this.buildHyperBody(chassis, bodyMat, decalMat, trimMat, carbonMat, glassMat, chromeMat, lightGlowMat, drlMat, brakeLightMat);
      wheels.frontLeft = makeW(0.35, 0.28, frontWheelSteerGroupL, -0.86, 0.35, 1.30);
      wheels.frontRight = makeW(0.35, 0.28, frontWheelSteerGroupR, 0.86, 0.35, 1.30);
      wheels.rearLeft = makeW(0.40, 0.36, chassis, -0.90, 0.40, -1.25);
      wheels.rearRight = makeW(0.40, 0.36, chassis, 0.90, 0.40, -1.25);
    } else if (carType === 'rally') {
      this.buildRallyBody(chassis, bodyMat, decalMat, trimMat, carbonMat, glassMat, lightGlowMat, amberLightMat, brakeLightMat);
      wheels.frontLeft = makeW(0.35, 0.28, frontWheelSteerGroupL, -0.86, 0.35, 1.15);
      wheels.frontRight = makeW(0.35, 0.28, frontWheelSteerGroupR, 0.86, 0.35, 1.15);
      wheels.rearLeft = makeW(0.35, 0.28, chassis, -0.86, 0.35, -1.15);
      wheels.rearRight = makeW(0.35, 0.28, chassis, 0.86, 0.35, -1.15);
    } else if (carType === 'speedster') {
      this.buildSpeedsterBody(chassis, bodyMat, decalMat, trimMat, carbonMat, chromeMat, glassMat, lightGlowMat, brakeLightMat);
      wheels.frontLeft = makeW(0.34, 0.24, frontWheelSteerGroupL, -0.80, 0.34, 1.20);
      wheels.frontRight = makeW(0.34, 0.24, frontWheelSteerGroupR, 0.80, 0.34, 1.20);
      wheels.rearLeft = makeW(0.36, 0.26, chassis, -0.82, 0.36, -1.15);
      wheels.rearRight = makeW(0.36, 0.26, chassis, 0.82, 0.36, -1.15);
    } else {
      // Default: GT Supercar
      this.buildGTBody(chassis, bodyMat, decalMat, trimMat, carbonMat, glassMat, chromeMat, lightGlowMat, drlMat, brakeLightMat);
      wheels.frontLeft = makeW(0.35, 0.26, frontWheelSteerGroupL, -0.84, 0.35, 1.22);
      wheels.frontRight = makeW(0.35, 0.26, frontWheelSteerGroupR, 0.84, 0.35, 1.22);
      wheels.rearLeft = makeW(0.38, 0.30, chassis, -0.86, 0.38, -1.18);
      wheels.rearRight = makeW(0.38, 0.30, chassis, 0.86, 0.38, -1.18);
    }

    // Driver Avatar Bobblehead
    if (skinTexture) {
      this.addDriverBobblehead(chassis, skinTexture, carType);
    }

    // High-performance Exhaust Pipes (with custom addon support)
    const exhaustStyle = addons?.exhaust || 'stock';
    const exhaustPipes = this.createExhaustPipes(chassis, carType, chromeMat, exhaustStyle);

    // Apply User Custom Addons (Spoiler, Roof/Hood)
    if (addons) {
      if (addons.spoiler && addons.spoiler !== 'stock') {
        this.applySpoilerAddon(chassis, carType, addons.spoiler, bodyMat, carbonMat, chromeMat, decalMat);
      }
      const roofItem = addons.roof_hood || addons.roofHood;
      if (roofItem && roofItem !== 'none') {
        this.applyRoofHoodAddon(chassis, carType, roofItem, bodyMat, carbonMat, chromeMat);
      }
    }

    // Dual Projector Driving Spotlights
    const headLightL = new THREE.SpotLight(0xfff6e5, 2.2, 38, Math.PI / 4.8, 0.35);
    headLightL.position.set(-0.6, 0.52, 2.0);
    headLightL.target.position.set(-0.6, 0, 16);
    chassis.add(headLightL);
    chassis.add(headLightL.target);

    const headLightR = new THREE.SpotLight(0xfff6e5, 2.2, 38, Math.PI / 4.8, 0.35);
    headLightR.position.set(0.6, 0.52, 2.0);
    headLightR.target.position.set(0.6, 0, 16);
    chassis.add(headLightR);
    chassis.add(headLightR.target);

    return {
      root,
      chassis,
      wheels,
      steerGroups: [frontWheelSteerGroupL, frontWheelSteerGroupR],
      exhaustPipes,
      brakeLightMat,
      underglowMat,
      bodyMat,
      decalMat
    };
  }

  // --- High-Detail 3D Alloy Wheel with Ventilated Rotor & Red Caliper ---
  createWheel(tireMat, rimMat, radius, width, parent, posX, posY, posZ, discMat, caliperMat, rimStyle = 'stock') {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(posX, posY, posZ);

    // 1. Rubber Tire with Chamfer Profile
    const tireGeo = new THREE.CylinderGeometry(radius, radius, width * 0.92, 28);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMesh = new THREE.Mesh(tireGeo, tireMat);
    tireMesh.castShadow = true;
    wheelGroup.add(tireMesh);

    // Rounded Outer Sidewall Torus
    const sidewallGeo = new THREE.TorusGeometry(radius * 0.94, width * 0.12, 10, 24);
    sidewallGeo.rotateY(Math.PI / 2);
    const sidewall = new THREE.Mesh(sidewallGeo, tireMat);
    wheelGroup.add(sidewall);

    // Dynamic Rim Material based on selected Addon Style
    let effectiveRimMat = rimMat;
    if (rimStyle === 'gold_mesh') {
      effectiveRimMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.92, roughness: 0.22 });
    } else if (rimStyle === 'deep_dish') {
      effectiveRimMat = new THREE.MeshStandardMaterial({ color: 0xf4f7fb, metalness: 0.98, roughness: 0.06 });
    }

    const rimRadius = radius * 0.68;

    if (rimStyle === 'turbofan') {
      // Aerodynamic closed turbofan disc
      const turboGeo = new THREE.CylinderGeometry(rimRadius, rimRadius, width * 0.98, 28);
      turboGeo.rotateZ(Math.PI / 2);
      const turboMesh = new THREE.Mesh(turboGeo, new THREE.MeshStandardMaterial({ color: 0x161822, metalness: 0.82, roughness: 0.3 }));
      wheelGroup.add(turboMesh);

      // Radial turbine extractor vanes
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        const vane = new THREE.Mesh(new THREE.BoxGeometry(width * 1.02, rimRadius * 0.45, 0.02), effectiveRimMat);
        vane.position.set(0, Math.sin(ang) * rimRadius * 0.55, Math.cos(ang) * rimRadius * 0.55);
        vane.rotation.x = ang + 0.35;
        wheelGroup.add(vane);
      }
      // Center lock bullet cap
      const bullet = new THREE.Mesh(new THREE.ConeGeometry(rimRadius * 0.25, width * 0.4, 16), effectiveRimMat);
      bullet.rotateZ(posX > 0 ? -Math.PI / 2 : Math.PI / 2);
      bullet.position.x = (posX > 0) ? width * 0.45 : -width * 0.45;
      wheelGroup.add(bullet);

    } else if (rimStyle === 'gold_mesh') {
      // Outer stepped rim barrel
      const rimGeo = new THREE.CylinderGeometry(rimRadius, rimRadius * 0.88, width * 0.96, 24);
      rimGeo.rotateZ(Math.PI / 2);
      wheelGroup.add(new THREE.Mesh(rimGeo, effectiveRimMat));

      // Cross-laced mesh spokes (10 pairs)
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        const s1 = new THREE.Mesh(new THREE.BoxGeometry(width * 0.98, rimRadius * 0.88, 0.022), effectiveRimMat);
        s1.rotation.x = ang + 0.18;
        const s2 = new THREE.Mesh(new THREE.BoxGeometry(width * 0.98, rimRadius * 0.88, 0.022), effectiveRimMat);
        s2.rotation.x = ang - 0.18;
        wheelGroup.add(s1, s2);
      }

      // Red anodized center-lock nut
      const nut = new THREE.Mesh(new THREE.CylinderGeometry(rimRadius * 0.22, rimRadius * 0.22, width * 1.04, 12), new THREE.MeshStandardMaterial({ color: 0xff0033, metalness: 0.9, roughness: 0.2 }));
      nut.rotateZ(Math.PI / 2);
      wheelGroup.add(nut);

    } else if (rimStyle === 'deep_dish') {
      // Stepped polished deep dish barrel
      const lipRadius = rimRadius * 1.02;
      const rimGeo = new THREE.CylinderGeometry(lipRadius, rimRadius * 0.72, width * 0.98, 24);
      rimGeo.rotateZ(Math.PI / 2);
      wheelGroup.add(new THREE.Mesh(rimGeo, effectiveRimMat));

      // 6-spoke concave dish star
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, rimRadius * 0.82, 0.038), effectiveRimMat);
        spoke.rotation.x = ang;
        wheelGroup.add(spoke);
      }

      // Deep recessed center cap
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(rimRadius * 0.26, rimRadius * 0.26, width * 0.98, 16), effectiveRimMat);
      cap.rotateZ(Math.PI / 2);
      wheelGroup.add(cap);

    } else {
      // Default: sport_5spoke
      const rimGeo = new THREE.CylinderGeometry(rimRadius, rimRadius * 0.92, width * 0.96, 20);
      rimGeo.rotateZ(Math.PI / 2);
      wheelGroup.add(new THREE.Mesh(rimGeo, effectiveRimMat));

      // 5-Spoke Star Blades
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(width * 0.98, rimRadius * 0.92, 0.038), effectiveRimMat);
        spoke.rotation.x = angle;
        wheelGroup.add(spoke);
      }

      // Center Hub Nut
      const centerCap = new THREE.Mesh(new THREE.CylinderGeometry(rimRadius * 0.28, rimRadius * 0.28, width * 1.02, 16), effectiveRimMat);
      centerCap.rotateZ(Math.PI / 2);
      wheelGroup.add(centerCap);
    }

    // Ventilated Brake Disc Rotor
    if (discMat) {
      const discGeo = new THREE.CylinderGeometry(radius * 0.54, radius * 0.54, 0.02, 18);
      discGeo.rotateZ(Math.PI / 2);
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.x = (posX > 0) ? -width * 0.22 : width * 0.22;
      wheelGroup.add(disc);

      // Sport Red Brake Caliper
      if (caliperMat) {
        const caliperGeo = new THREE.BoxGeometry(0.048, radius * 0.32, radius * 0.24);
        const caliper = new THREE.Mesh(caliperGeo, caliperMat);
        caliper.position.set((posX > 0) ? -width * 0.22 : width * 0.22, radius * 0.34, 0);
        wheelGroup.add(caliper);
      }
    }

    parent.add(wheelGroup);
    return wheelGroup;
  }

  // --- 3D Racing Helmet & Ashi Pilot Silhouette ---
  addDriverBobblehead(chassis, skinTexture, carType) {
    const driverGroup = new THREE.Group();
    driverGroup.name = 'DriverAvatar';

    let posX = -0.32;
    let posY = 0.72;
    let posZ = -0.12;

    if (carType === 'kart') {
      posX = 0; posY = 0.62; posZ = -0.16;
    } else if (carType === 'f1') {
      posX = 0; posY = 0.55; posZ = 0.05;
    } else if (carType === 'hyper') {
      posX = 0; posY = 0.68; posZ = -0.10;
    } else if (carType === 'truck') {
      posX = -0.38; posY = 1.05; posZ = 0.05;
    } else if (carType === 'speedster') {
      posX = -0.30; posY = 0.66; posZ = -0.14;
    }

    driverGroup.position.set(posX, posY, posZ);

    // 1. Aerodynamic Racing Helmet Shell
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0x181822,
      metalness: 0.85,
      roughness: 0.18,
      clearcoat: 1.0
    });
    const helmetGeo = new THREE.SphereGeometry(0.24, 20, 16);
    helmetGeo.scale(1.0, 1.06, 1.14);
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    driverGroup.add(helmet);

    // 2. Glossy Mirrored Cyan/Gold Visor
    const visorMat = new THREE.MeshPhysicalMaterial({
      color: 0x00e5ff,
      metalness: 0.95,
      roughness: 0.05,
      clearcoat: 1.0
    });
    const visorGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.12, 16, 1, false, -Math.PI / 3, (2 * Math.PI) / 3);
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.rotation.y = -Math.PI / 2;
    visor.position.set(0, 0.02, 0.08);
    driverGroup.add(visor);

    // 3. Holographic Ashi Portrait Badge on chest
    const badgeGeo = new THREE.CircleGeometry(0.18, 24);
    const badgeMat = new THREE.MeshBasicMaterial({
      map: skinTexture,
      side: THREE.DoubleSide
    });
    const badge = new THREE.Mesh(badgeGeo, badgeMat);
    badge.position.set(0, -0.05, 0.26);
    driverGroup.add(badge);

    const ringGeo = new THREE.RingGeometry(0.18, 0.20, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd700, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, -0.05, 0.262);
    driverGroup.add(ring);

    // Racing shoulders
    const shoulderGeo = new THREE.BoxGeometry(0.56, 0.22, 0.26);
    const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x16161e, roughness: 0.65 });
    const shoulders = new THREE.Mesh(shoulderGeo, shoulderMat);
    shoulders.position.set(0, -0.22, 0);
    driverGroup.add(shoulders);

    chassis.add(driverGroup);
  }

  // --- Exhaust Pipes per Vehicle Archetype with Addon Customization ---
  createExhaustPipes(chassis, carType, chromeMat, exhaustStyle = 'stock') {
    const pipes = [];
    let pipeMat = chromeMat || new THREE.MeshStandardMaterial({ color: 0xddeeff, metalness: 0.95, roughness: 0.1 });

    if (exhaustStyle === 'burnt_titanium') {
      pipeMat = new THREE.MeshPhysicalMaterial({
        color: 0x3d66eb,
        metalness: 0.95,
        roughness: 0.15,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08
      });
    } else if (exhaustStyle === 'quad_carbon') {
      pipeMat = new THREE.MeshStandardMaterial({
        color: 0x16161a,
        metalness: 0.5,
        roughness: 0.4
      });
    }

    const createSinglePipe = (x, y, z, r = 0.07, len = 0.28) => {
      const geo = new THREE.CylinderGeometry(r * 0.85, r, len, 16);
      geo.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, pipeMat);
      mesh.position.set(x, y, z);

      // Inner hollow black depth
      const innerGeo = new THREE.CylinderGeometry(r * 0.7, r * 0.7, 0.05, 12);
      innerGeo.rotateX(Math.PI / 2);
      const innerMesh = new THREE.Mesh(innerGeo, new THREE.MeshBasicMaterial({ color: 0x050505 }));
      innerMesh.position.set(0, 0, len * 0.48);
      mesh.add(innerMesh);

      chassis.add(mesh);
      pipes.push(mesh);
      return mesh;
    };

    if (exhaustStyle === 'side_pipes') {
      // Dual side-exit rocker pipes exiting under the doors
      createSinglePipe(-0.84, 0.22, 0.3, 0.065, 1.4);
      createSinglePipe(0.84, 0.22, 0.3, 0.065, 1.4);
      return pipes;
    } else if (exhaustStyle === 'quad_carbon') {
      createSinglePipe(-0.46, 0.28, -1.94, 0.072, 0.28);
      createSinglePipe(-0.30, 0.28, -1.94, 0.072, 0.28);
      createSinglePipe(0.30, 0.28, -1.94, 0.072, 0.28);
      createSinglePipe(0.46, 0.28, -1.94, 0.072, 0.28);
      return pipes;
    } else if (exhaustStyle === 'burnt_titanium') {
      createSinglePipe(-0.36, 0.28, -1.94, 0.088, 0.30);
      createSinglePipe(0.36, 0.28, -1.94, 0.088, 0.30);
      return pipes;
    }

    // Default per vehicle type ('stock')
    if (carType === 'hyper') {
      // Quad center exhaust diamond cluster
      createSinglePipe(-0.09, 0.48, -1.95, 0.05, 0.25);
      createSinglePipe(0.09, 0.48, -1.95, 0.05, 0.25);
      createSinglePipe(0, 0.58, -1.95, 0.055, 0.25);
      createSinglePipe(0, 0.38, -1.95, 0.055, 0.25);
    } else if (carType === 'gt') {
      // Quad twin tips (left pair, right pair)
      createSinglePipe(-0.46, 0.28, -1.92, 0.065, 0.26);
      createSinglePipe(-0.32, 0.28, -1.92, 0.065, 0.26);
      createSinglePipe(0.32, 0.28, -1.92, 0.065, 0.26);
      createSinglePipe(0.46, 0.28, -1.92, 0.065, 0.26);
    } else if (carType === 'f1') {
      // Center high-mount jet exhaust
      createSinglePipe(0, 0.42, -1.95, 0.095, 0.30);
    } else if (carType === 'speedster') {
      // Chrome side rocker pipes
      createSinglePipe(-0.84, 0.22, 0.3, 0.06, 1.4);
      createSinglePipe(0.84, 0.22, 0.3, 0.06, 1.4);
    } else if (carType === 'rally') {
      // Single fat angled rally exhaust on right
      createSinglePipe(0.48, 0.26, -1.88, 0.085, 0.32);
    } else if (carType === 'truck') {
      // Heavy dual square-exit pipes
      createSinglePipe(-0.52, 0.38, -2.25, 0.09, 0.30);
      createSinglePipe(0.52, 0.38, -2.25, 0.09, 0.30);
    } else {
      // Muscle / Kart dual pipes
      createSinglePipe(-0.38, 0.28, -1.90, 0.075, 0.28);
      createSinglePipe(0.38, 0.28, -1.90, 0.075, 0.28);
    }

    return pipes;
  }

  // --- Modular Custom Addon Spoilers / Wings ---
  applySpoilerAddon(chassis, carType, spoilerType, bodyMat, carbonMat, chromeMat, decalMat = null) {
    const existing = chassis.getObjectByName('CarSpoiler');
    if (existing) {
      chassis.remove(existing);
    }
    if (!spoilerType || spoilerType === 'none') return;

    const spoilerGroup = new THREE.Group();
    spoilerGroup.name = 'CarSpoiler';

    let tailY = 0.72;
    let tailZ = -1.75;
    if (carType === 'truck') { tailY = 0.98; tailZ = -2.15; }
    else if (carType === 'f1') { tailY = 0.65; tailZ = -1.85; }
    else if (carType === 'kart') { tailY = 0.55; tailZ = -0.98; }
    else if (carType === 'speedster') { tailY = 0.52; tailZ = -1.62; }
    else if (carType === 'muscle') { tailY = 0.68; tailZ = -1.95; }
    else if (carType === 'hyper') { tailY = 0.78; tailZ = -1.90; }

    if (spoilerType === 'gt_wing') {
      // Swan-neck carbon GT Wing
      const pL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.38, 0.20), carbonMat);
      pL.position.set(-0.52, tailY + 0.19, tailZ);
      const pR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.38, 0.20), carbonMat);
      pR.position.set(0.52, tailY + 0.19, tailZ);

      const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.05, 0.42), bodyMat);
      wingBlade.position.set(0, tailY + 0.38, tailZ - 0.04);
      wingBlade.rotation.x = 0.10;

      if (decalMat) {
        const wingDecal = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.36), decalMat);
        wingDecal.rotation.x = -Math.PI / 2 + 0.10;
        wingDecal.position.set(0, tailY + 0.41, tailZ - 0.04);
        spoilerGroup.add(wingDecal);
      }

      const endL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.46), bodyMat);
      endL.position.set(-0.91, tailY + 0.38, tailZ - 0.04);
      const endR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.46), bodyMat);
      endR.position.set(0.91, tailY + 0.38, tailZ - 0.04);

      spoilerGroup.add(pL, pR, wingBlade, endL, endR);
    } else if (spoilerType === 'ducktail') {
      // Body-colored street ducktail
      const dtMesh = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.14, 0.18), bodyMat);
      dtMesh.position.set(0, tailY + 0.06, tailZ + 0.06);
      dtMesh.rotation.x = -0.34;

      if (decalMat) {
        const dtDecal = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.12), decalMat);
        dtDecal.position.set(0, tailY + 0.075, tailZ + 0.07);
        dtDecal.rotation.x = -0.34;
        spoilerGroup.add(dtDecal);
      }

      const dtLip = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.03, 0.08), carbonMat);
      dtLip.position.set(0, tailY + 0.12, tailZ + 0.01);
      dtLip.rotation.x = -0.34;

      spoilerGroup.add(dtMesh, dtLip);
    } else if (spoilerType === 'hyper_fin') {
      // Twin Le Mans shark aero fins with neon tips
      const finL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.36, 0.85), bodyMat);
      finL.position.set(-0.62, tailY + 0.16, tailZ + 0.30);
      const finR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.36, 0.85), bodyMat);
      finR.position.set(0.62, tailY + 0.16, tailZ + 0.30);

      const ledMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
      const ledL = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.82), ledMat);
      ledL.position.set(-0.62, tailY + 0.34, tailZ + 0.30);
      const ledR = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.82), ledMat);
      ledR.position.set(0.62, tailY + 0.34, tailZ + 0.30);

      spoilerGroup.add(finL, finR, ledL, ledR);
    } else if (spoilerType === 'drag_wing') {
      // Extended Pro-Mod drag wing with body-matching deck & livery
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.04, 0.62), bodyMat);
      deck.position.set(0, tailY + 0.08, tailZ - 0.22);
      deck.rotation.x = 0.06;

      if (decalMat) {
        const dragDecal = new THREE.Mesh(new THREE.PlaneGeometry(1.50, 0.54), decalMat);
        dragDecal.rotation.x = -Math.PI / 2 + 0.06;
        dragDecal.position.set(0, tailY + 0.105, tailZ - 0.22);
        spoilerGroup.add(dragDecal);
      }

      const strutL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42), chromeMat);
      strutL.position.set(-0.5, tailY - 0.12, tailZ - 0.3);
      strutL.rotation.x = 0.6;
      const strutR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42), chromeMat);
      strutR.position.set(0.5, tailY - 0.12, tailZ - 0.3);
      strutR.rotation.x = 0.6;

      const spillL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.65), bodyMat);
      spillL.position.set(-0.79, tailY + 0.14, tailZ - 0.22);
      const spillR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.65), bodyMat);
      spillR.position.set(0.79, tailY + 0.14, tailZ - 0.22);

      spoilerGroup.add(deck, strutL, strutR, spillL, spillR);
    }

    chassis.add(spoilerGroup);
  }

  // --- Modular Custom Addon Roof & Hood Equipment ---
  applyRoofHoodAddon(chassis, carType, addonType, bodyMat, carbonMat, chromeMat) {
    const existing = chassis.getObjectByName('CarRoofHood');
    if (existing) {
      chassis.remove(existing);
    }
    if (!addonType || addonType === 'none') return;

    const group = new THREE.Group();
    group.name = 'CarRoofHood';

    let roofY = 1.15;
    let roofZ = 0.05;
    let hoodY = 0.68;
    let hoodZ = 1.15;

    if (carType === 'truck') { roofY = 1.62; roofZ = 0.25; hoodY = 1.05; hoodZ = 1.35; }
    else if (carType === 'kart') { roofY = 0.85; roofZ = 0.0; hoodY = 0.42; hoodZ = 0.65; }
    else if (carType === 'f1') { roofY = 0.72; roofZ = -0.3; hoodY = 0.48; hoodZ = 0.85; }
    else if (carType === 'speedster') { roofY = 0.68; roofZ = -0.2; hoodY = 0.58; hoodZ = 1.05; }
    else if (carType === 'muscle') { roofY = 1.10; roofZ = -0.1; hoodY = 0.72; hoodZ = 1.25; }

    if (addonType === 'roof_scoop') {
      // Body-matching aerodynamic roof intake scoop
      const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.62), bodyMat);
      scoop.position.set(0, roofY + 0.08, roofZ);
      scoop.rotation.x = -0.15;

      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: 0x050505 }));
      mouth.position.set(0, roofY + 0.09, roofZ + 0.30);

      group.add(scoop, mouth);
    } else if (addonType === 'blower_scoop') {
      // Chrome V8 Supercharger Blower with 3 red butterfly valves
      const blower = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.52), chromeMat);
      blower.position.set(0, hoodY + 0.14, hoodZ);

      const redMat = new THREE.MeshBasicMaterial({ color: 0xff0022 });
      [-0.12, 0, 0.12].forEach(ox => {
        const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16), redMat);
        valve.rotateX(Math.PI / 2);
        valve.position.set(ox, hoodY + 0.18, hoodZ + 0.27);
        group.add(valve);
      });

      group.add(blower);
    } else if (addonType === 'rally_lightbar') {
      // Quad rally LED light bar across roof brow
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.08), carbonMat);
      bar.position.set(0, roofY + 0.06, roofZ + 0.45);

      const ledGlow = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
      [-0.36, -0.12, 0.12, 0.36].forEach(ox => {
        const pod = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.08), carbonMat);
        pod.position.set(ox, roofY + 0.09, roofZ + 0.46);
        const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.08), ledGlow);
        lens.position.set(ox, roofY + 0.09, roofZ + 0.51);
        group.add(pod, lens);
      });

      group.add(bar);
    }

    chassis.add(group);
  }

  // ==========================================
  // CAR 1: Ashi GT Supercar
  // ==========================================
  buildGTBody(chassis, bodyMat, decalMat, trimMat, carbonMat, glassMat, chromeMat, lightMat, drlMat, brakeMat) {
    // 1. Lower Main Body Shell
    const mainBody = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.36, 3.85), bodyMat);
    mainBody.position.set(0, 0.38, 0);
    chassis.add(mainBody);

    // Sculpted Widebody Front & Rear Fender Flares
    const frontFenders = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.34, 1.1), bodyMat);
    frontFenders.position.set(0, 0.38, 1.2);
    const rearFenders = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.38, 1.2), bodyMat);
    rearFenders.position.set(0, 0.40, -1.18);
    chassis.add(frontFenders, rearFenders);

    // Front Carbon Splitter with Red Pin-Stripe & Aero Canards
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.06, 0.5), carbonMat);
    splitter.position.set(0, 0.22, 1.95);
    const canardL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.3), carbonMat);
    canardL.position.set(-0.84, 0.30, 1.92);
    const canardR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.3), carbonMat);
    canardR.position.set(0.84, 0.30, 1.92);
    chassis.add(splitter, canardL, canardR);

    // Carbon Side Skirts
    const skirtL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.2), carbonMat);
    skirtL.position.set(-0.84, 0.22, 0);
    const skirtR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.2), carbonMat);
    skirtR.position.set(0.84, 0.22, 0);
    chassis.add(skirtL, skirtR);

    // Hood with Cooling Air Vents & Framed Ashi Livery Wrap
    const hoodDecal = this.makeFramedLivery(1.22, 1.35, decalMat, carbonMat);
    hoodDecal.rotation.x = -Math.PI / 2 - 0.05;
    hoodDecal.position.set(0, 0.575, 0.90);
    chassis.add(hoodDecal);

    // Twin Hood Extraction Vents
    const ventL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.45), carbonMat);
    ventL.position.set(-0.35, 0.58, 0.65);
    const ventR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.45), carbonMat);
    ventR.position.set(0.35, 0.58, 0.65);
    chassis.add(ventL, ventR);

    // Sleek Cabin Cockpit Glass with Body Color Roof Panel
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.38, 1.65), glassMat);
    cabin.position.set(0, 0.70, -0.18);

    const roofPanel = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.04, 1.25), bodyMat);
    roofPanel.position.set(0, 0.885, -0.18);
    chassis.add(cabin, roofPanel);

    // Roof Panel with Secondary Livery
    const roofDecal = this.makeFramedLivery(1.02, 1.15, decalMat, carbonMat);
    roofDecal.rotation.x = -Math.PI / 2;
    roofDecal.position.set(0, 0.912, -0.18);
    chassis.add(roofDecal);

    // Aero Wing Mirrors
    const mirrorL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.12), carbonMat);
    mirrorL.position.set(-0.72, 0.68, 0.45);
    const mirrorR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.12), carbonMat);
    mirrorR.position.set(0.72, 0.68, 0.45);
    chassis.add(mirrorL, mirrorR);

    // Projector LED Headlights + Cyan DRL Eyebrows
    const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.08), lightMat);
    hlL.position.set(-0.56, 0.44, 1.94);
    const drlL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.05), drlMat);
    drlL.position.set(-0.56, 0.49, 1.95);

    const hlR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.08), lightMat);
    hlR.position.set(0.56, 0.44, 1.94);
    const drlR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.05), drlMat);
    drlR.position.set(0.56, 0.49, 1.95);
    chassis.add(hlL, drlL, hlR, drlR);

    // Full-Body Ashi Liveries: Side Doors with Speed Chevrons & Rear Trunk Panels
    const doorDecalL = this.makeFramedLivery(1.65, 0.35, decalMat, carbonMat, true, true);
    doorDecalL.position.set(-0.78, 0.39, 0.05);
    doorDecalL.rotation.y = -Math.PI / 2;

    const doorDecalR = this.makeFramedLivery(1.65, 0.35, decalMat, carbonMat, false, true);
    doorDecalR.position.set(0.78, 0.39, 0.05);
    doorDecalR.rotation.y = Math.PI / 2;

    const rearTrunkDecal = this.makeFramedLivery(1.22, 0.28, decalMat, carbonMat);
    rearTrunkDecal.position.set(0, 0.42, -1.93);
    rearTrunkDecal.rotation.y = Math.PI;

    chassis.add(doorDecalL, doorDecalR, rearTrunkDecal);

    // Rear Seamless 3D LED Lightbar
    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.06, 0.05), brakeMat);
    tailBar.position.set(0, 0.50, -1.94);
    chassis.add(tailBar);

    // Carbon Swan-Neck GT Rear Wing (Stock)
    const defaultWing = new THREE.Group();
    defaultWing.name = 'CarSpoiler';
    const pL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.14), carbonMat);
    pL.position.set(-0.54, 0.72, -1.72);
    pL.rotation.x = -0.2;
    const pR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.14), carbonMat);
    pR.position.set(0.54, 0.72, -1.72);
    pR.rotation.x = -0.2;
    const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.05, 0.38), carbonMat);
    wingBlade.position.set(0, 0.88, -1.75);

    const wingDecal = new THREE.Mesh(new THREE.PlaneGeometry(1.58, 0.32), decalMat);
    wingDecal.position.set(0, 0.91, -1.75);
    wingDecal.rotation.x = -Math.PI / 2;
    defaultWing.add(wingDecal);

    const endL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.42), bodyMat);
    endL.position.set(-0.86, 0.88, -1.75);
    const endR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.42), bodyMat);
    endR.position.set(0.86, 0.88, -1.75);
    defaultWing.add(pL, pR, wingBlade, endL, endR);
    chassis.add(defaultWing);

    // Rear Aero Diffuser with 4 Vertical Fins
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.4), carbonMat);
    diffuser.position.set(0, 0.20, -1.82);
    for (let f = -0.45; f <= 0.45; f += 0.30) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.42), carbonMat);
      fin.position.set(f, 0.20, -1.82);
      chassis.add(fin);
    }
    chassis.add(diffuser);
  }

  // ==========================================
  // CAR 2: Ashi Go-Kart 500
  // ==========================================
  buildKartBody(chassis, bodyMat, decalMat, trimMat, carbonMat, chromeMat, goldMat, lightMat, brakeMat) {
    // Tubular Steel Spaceframe Chassis
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0x222228, metalness: 0.9, roughness: 0.3 });
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 12), tubeMat);
    spine.rotateX(Math.PI / 2);
    spine.position.set(0, 0.22, 0);
    chassis.add(spine);

    // Front Aerodynamic Wedge Nosecone with Ashi Livery
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.95, 4), bodyMat);
    nose.rotateX(Math.PI / 2);
    nose.position.set(0, 0.28, 0.88);
    chassis.add(nose);

    const noseDecal = this.makeFramedLivery(0.72, 0.72, decalMat, carbonMat);
    noseDecal.rotation.x = -Math.PI / 2.4;
    noseDecal.position.set(0, 0.395, 0.88);
    chassis.add(noseDecal);

    // Front Chrome Bumper
    const frontBumper = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.035, 8, 20, Math.PI), chromeMat);
    frontBumper.rotation.x = Math.PI / 2;
    frontBumper.position.set(0, 0.20, 1.05);
    chassis.add(frontBumper);

    // Left & Right Sidepods with Racing Number & Livery Decals
    const podL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 1.15), bodyMat);
    podL.position.set(-0.62, 0.26, 0);
    const podR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 1.15), bodyMat);
    podR.position.set(0.62, 0.26, 0);

    const podDecalL = this.makeFramedLivery(1.05, 0.20, decalMat, carbonMat, true, true);
    podDecalL.position.set(-0.785, 0.26, 0);
    podDecalL.rotation.y = -Math.PI / 2;

    const podDecalR = this.makeFramedLivery(1.05, 0.20, decalMat, carbonMat, false, true);
    podDecalR.position.set(0.785, 0.26, 0);
    podDecalR.rotation.y = Math.PI / 2;

    chassis.add(podL, podR, podDecalL, podDecalR);

    // High-Back Racing Bucket Seat
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.48), trimMat);
    seatBase.position.set(0, 0.28, -0.22);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.54, 0.10), trimMat);
    seatBack.position.set(0, 0.52, -0.45);
    seatBack.rotation.x = 0.22;

    const seatDecal = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), decalMat);
    seatDecal.position.set(0, 0.52, -0.51);
    seatDecal.rotation.y = Math.PI;
    chassis.add(seatBase, seatBack, seatDecal);

    // Steering Column & 3-Spoke Racing Wheel
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45), chromeMat);
    column.position.set(0, 0.45, 0.22);
    column.rotation.x = -0.55;
    const stWheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 8, 16), trimMat);
    stWheel.position.set(0, 0.59, 0.11);
    stWheel.rotation.x = -0.55;
    chassis.add(column, stWheel);

    // Exposed 2-Stroke Racing Engine Block at Rear
    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.32), chromeMat);
    engineBlock.position.set(0.28, 0.34, -0.65);
    const goldCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 12), goldMat);
    goldCylinder.position.set(0.28, 0.52, -0.65);
    const airFilter = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 12), new THREE.MeshStandardMaterial({ color: 0xff0044 }));
    airFilter.rotateZ(Math.PI / 2);
    airFilter.position.set(0.48, 0.42, -0.65);
    chassis.add(engineBlock, goldCylinder, airFilter);

    // Rear Chrome Bumper & LED Light
    const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.06, 0.06), chromeMat);
    rearBumper.position.set(0, 0.28, -1.08);
    const tailLight = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 0.04), brakeMat);
    tailLight.position.set(0, 0.34, -1.09);
    chassis.add(rearBumper, tailLight);
  }

  // ==========================================
  // CAR 3: Ashi Cyber Truck
  // ==========================================
  buildTruckBody(chassis, bodyMat, decalMat, trimMat, carbonMat, glassMat, chromeMat, lightMat, drlMat, brakeMat, amberMat) {
    // Heavy Angular Cyber Lower Hull
    const mainHull = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.68, 4.45), bodyMat);
    mainHull.position.set(0, 0.62, 0);
    chassis.add(mainHull);

    // Massive Off-Road Flared Wheel Arches
    const frontFlares = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.52, 1.25), trimMat);
    frontFlares.position.set(0, 0.62, 1.35);
    const rearFlares = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.52, 1.25), trimMat);
    rearFlares.position.set(0, 0.62, -1.35);
    chassis.add(frontFlares, rearFlares);

    // Sloped Cyber Roof
    const roofGeo = new THREE.ConeGeometry(1.4, 1.25, 4);
    roofGeo.rotateY(Math.PI / 4);
    roofGeo.scale(1.25, 0.62, 2.25);
    const roof = new THREE.Mesh(roofGeo, glassMat);
    roof.position.set(0, 1.20, -0.22);
    chassis.add(roof);

    // Huge Hood Decal with Ashi Skin!
    const hoodDecal = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.55), decalMat);
    hoodDecal.rotation.x = -Math.PI / 2.3;
    hoodDecal.position.set(0, 0.98, 1.20);
    chassis.add(hoodDecal);

    // Full-Width Cyber Horizon LED Lightbar
    const horizonBar = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.06, 0.06), lightMat);
    horizonBar.position.set(0, 0.88, 2.24);
    chassis.add(horizonBar);

    // Steel Heavy Bullbar with Dual Red Recovery Hooks
    const bullBar = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.38, 0.12), trimMat);
    bullBar.position.set(0, 0.46, 2.30);
    const hookL = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 12), new THREE.MeshBasicMaterial({ color: 0xff0033 }));
    hookL.position.set(-0.45, 0.32, 2.36);
    const hookR = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 12), new THREE.MeshBasicMaterial({ color: 0xff0033 }));
    hookR.position.set(0.45, 0.32, 2.36);
    chassis.add(bullBar, hookL, hookR);

    // Roof-Mounted Offroad LED Amber Pods
    const roofLightbar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.08), trimMat);
    roofLightbar.position.set(0, 1.48, 0.45);
    for (let i = -0.45; i <= 0.45; i += 0.30) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.04), amberMat);
      pod.position.set(i, 1.48, 0.50);
      chassis.add(pod);
    }
    chassis.add(roofLightbar);

    // Cyber Tail Laser Lightbar
    const tailLaser = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.07, 0.06), brakeMat);
    tailLaser.position.set(0, 0.88, -2.24);
    chassis.add(tailLaser);

    // Angled Rear Bed Roll-Cage Bars
    const cageL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.8), trimMat);
    cageL.position.set(-0.68, 1.05, -1.1);
    cageL.rotation.x = -0.55;
    const cageR = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.8), trimMat);
    cageR.position.set(0.68, 1.05, -1.1);
    cageR.rotation.x = -0.55;
    chassis.add(cageL, cageR);

    // Full-Body Truck Liveries: Massive Side Doors & Tailgate
    const doorDecalL = this.makeFramedLivery(2.0, 0.58, decalMat, carbonMat, true, true);
    doorDecalL.position.set(-0.90, 0.65, 0.15);
    doorDecalL.rotation.y = -Math.PI / 2;

    const doorDecalR = this.makeFramedLivery(2.0, 0.58, decalMat, carbonMat, false, true);
    doorDecalR.position.set(0.90, 0.65, 0.15);
    doorDecalR.rotation.y = Math.PI / 2;

    const tailgateDecal = this.makeFramedLivery(1.58, 0.52, decalMat, carbonMat);
    tailgateDecal.position.set(0, 0.62, -2.235);
    tailgateDecal.rotation.y = Math.PI;

    chassis.add(doorDecalL, doorDecalR, tailgateDecal);
  }

  // ==========================================
  // CAR 4: Ashi Formula-X
  // ==========================================
  buildF1Body(chassis, bodyMat, decalMat, trimMat, carbonMat, chromeMat, lightMat, brakeMat) {
    // Narrow High-Downforce Monocoque
    const mono = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.34, 4.3), bodyMat);
    mono.position.set(0, 0.34, 0);
    chassis.add(mono);

    // 3-Tier Stepped Front Aerodynamic Wing
    const fwMain = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.05, 0.52), carbonMat);
    fwMain.position.set(0, 0.20, 2.15);
    const fwUpper = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.04, 0.35), bodyMat);
    fwUpper.position.set(0, 0.26, 2.10);
    const endL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.58), bodyMat);
    endL.position.set(-0.94, 0.28, 2.15);
    const endR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.58), bodyMat);
    endR.position.set(0.94, 0.28, 2.15);
    chassis.add(fwMain, fwUpper, endL, endR);

    // Slender Nosecone with Ashi Livery
    const noseDecal = this.makeFramedLivery(0.58, 1.45, decalMat, carbonMat);
    noseDecal.rotation.x = -Math.PI / 2.14;
    noseDecal.position.set(0, 0.465, 1.30);
    chassis.add(noseDecal);

    // Left & Right Radiator Sidepods with Ashi Racing Livery
    const podL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 1.55), bodyMat);
    podL.position.set(-0.54, 0.35, -0.2);
    const podR = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 1.55), bodyMat);
    podR.position.set(0.54, 0.35, -0.2);

    const podDecalL = this.makeFramedLivery(1.48, 0.28, decalMat, carbonMat, true, true);
    podDecalL.position.set(-0.755, 0.35, -0.2);
    podDecalL.rotation.y = -Math.PI / 2;

    const podDecalR = this.makeFramedLivery(1.48, 0.28, decalMat, carbonMat, false, true);
    podDecalR.position.set(0.755, 0.35, -0.2);
    podDecalR.rotation.y = Math.PI / 2;

    chassis.add(podL, podR, podDecalL, podDecalR);

    // Titanium Halo Cockpit Safety Ring
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 8, 16, Math.PI), trimMat);
    halo.position.set(0, 0.68, 0.12);
    halo.rotation.x = -Math.PI / 2;
    chassis.add(halo);

    // Engine Airbox Scoop (Above driver head)
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.65), bodyMat);
    scoop.position.set(0, 0.68, -0.42);
    chassis.add(scoop);

    // Giant 2-Tier Rear DRS Wing with Ashi Skin Livery (Stock)
    const defaultWing = new THREE.Group();
    defaultWing.name = 'CarSpoiler';
    const rwMain = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.06, 0.42), decalMat);
    rwMain.position.set(0, 0.92, -1.88);
    const rwFlap = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.04, 0.22), carbonMat);
    rwFlap.position.set(0, 1.02, -1.94);
    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.48, 0.12), carbonMat);
    pillarL.position.set(-0.42, 0.68, -1.82);
    const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.48, 0.12), carbonMat);
    pillarR.position.set(0.42, 0.68, -1.82);
    defaultWing.add(rwMain, rwFlap, pillarL, pillarR);
    chassis.add(defaultWing);

    // FIA Flashing Red Rain Light at Rear Diffuser
    const rainLight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.06), brakeMat);
    rainLight.position.set(0, 0.34, -2.14);
    chassis.add(rainLight);
  }

  // ==========================================
  // CAR 5: Ashi Muscle V8
  // ==========================================
  buildMuscleBody(chassis, bodyMat, decalMat, trimMat, carbonMat, chromeMat, glassMat, lightMat, brakeMat) {
    // Wide Muscular Fastback Body
    const mainBody = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.46, 4.08), bodyMat);
    mainBody.position.set(0, 0.44, 0);
    chassis.add(mainBody);

    // Bulging Muscle Fenders
    const fFenders = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.44, 1.15), bodyMat);
    fFenders.position.set(0, 0.44, 1.25);
    const rFenders = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.48, 1.25), bodyMat);
    rFenders.position.set(0, 0.46, -1.18);
    chassis.add(fFenders, rFenders);

    // Chrome Supercharger Blower with Triple Red Butterflies
    const blower = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.24, 0.46), chromeMat);
    blower.position.set(0, 0.76, 0.92);
    const scoopFlap1 = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshBasicMaterial({ color: 0xff002b }));
    scoopFlap1.position.set(-0.12, 0.78, 1.16);
    const scoopFlap2 = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshBasicMaterial({ color: 0xff002b }));
    scoopFlap2.position.set(0, 0.78, 1.16);
    const scoopFlap3 = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshBasicMaterial({ color: 0xff002b }));
    scoopFlap3.position.set(0.12, 0.78, 1.16);
    chassis.add(blower, scoopFlap1, scoopFlap2, scoopFlap3);

    // Hood with Ashi Skin Livery & Twin Racing Stripes
    const hoodDecal = this.makeFramedLivery(1.35, 1.25, decalMat, carbonMat);
    hoodDecal.rotation.x = -Math.PI / 2;
    hoodDecal.position.set(0, 0.685, 1.12);
    chassis.add(hoodDecal);

    // Fastback Roof with Body Color Panels & Roof Decal
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.40, 1.80), glassMat);
    cabin.position.set(0, 0.77, -0.32);

    const roofPanel = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.04, 1.40), bodyMat);
    roofPanel.position.set(0, 0.985, -0.30);
    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 1.65), bodyMat);
    pillarL.position.set(-0.64, 0.76, -0.32);
    const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 1.65), bodyMat);
    pillarR.position.set(0.64, 0.76, -0.32);

    const roofDecal = this.makeFramedLivery(1.10, 1.25, decalMat, carbonMat);
    roofDecal.position.set(0, 1.015, -0.30);
    roofDecal.rotation.x = -Math.PI / 2;
    chassis.add(cabin, roofPanel, pillarL, pillarR, roofDecal);

    // Full-Body Muscle Car Side Liveries with Speed Chevrons & Rear Trunk Decal
    const doorDecalL = this.makeFramedLivery(1.85, 0.42, decalMat, carbonMat, true, true);
    doorDecalL.position.set(-0.83, 0.45, 0.05);
    doorDecalL.rotation.y = -Math.PI / 2;

    const doorDecalR = this.makeFramedLivery(1.85, 0.42, decalMat, carbonMat, false, true);
    doorDecalR.position.set(0.83, 0.45, 0.05);
    doorDecalR.rotation.y = Math.PI / 2;

    const trunkDecal = this.makeFramedLivery(1.35, 0.30, decalMat, carbonMat);
    trunkDecal.position.set(0, 0.46, -2.05);
    trunkDecal.rotation.y = Math.PI;

    chassis.add(doorDecalL, doorDecalR, trunkDecal);

    // Classic Recessed Black Mesh Grille with Quad Round Headlights
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.28, 0.08), trimMat);
    grille.position.set(0, 0.46, 2.05);
    chassis.add(grille);

    const makeRoundHeadlight = (x) => {
      const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 16), lightMat);
      hl.rotateX(Math.PI / 2);
      hl.position.set(x, 0.46, 2.08);
      chassis.add(hl);
    };
    makeRoundHeadlight(-0.58);
    makeRoundHeadlight(-0.36);
    makeRoundHeadlight(0.36);
    makeRoundHeadlight(0.58);

    // Classic Ducktail Rear Spoiler (Stock)
    const defaultWing = new THREE.Group();
    defaultWing.name = 'CarSpoiler';
    const ducktail = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.12, 0.22), bodyMat);
    ducktail.position.set(0, 0.72, -2.00);
    ducktail.rotation.x = -0.22;
    defaultWing.add(ducktail);
    chassis.add(defaultWing);

    // Triple-Bar Classic Tail Lights
    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.16, 0.06), brakeMat);
    tailBar.position.set(0, 0.50, -2.05);
    chassis.add(tailBar);
  }

  // ==========================================
  // CAR 6: Ashi Valkyrie Hypercar (NEW!)
  // ==========================================
  buildHyperBody(chassis, bodyMat, decalMat, trimMat, carbonMat, glassMat, chromeMat, lightMat, drlMat, brakeMat) {
    // Ultra-low sculpted Le Mans prototype monocoque
    const mono = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.32, 4.2), bodyMat);
    mono.position.set(0, 0.35, 0);
    chassis.add(mono);

    // Teardrop Cockpit Canopy with Panoramic Curved Glass
    const cockpitGeo = new THREE.SphereGeometry(0.68, 20, 16);
    cockpitGeo.scale(0.95, 0.65, 2.1);
    const cockpit = new THREE.Mesh(cockpitGeo, glassMat);
    cockpit.position.set(0, 0.65, -0.15);
    chassis.add(cockpit);

    // Long Aerodynamic Shark Fin
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 1.8), carbonMat);
    fin.position.set(0, 0.78, -0.95);
    chassis.add(fin);

    // Dual-Deck Carbon Aero Splitter with Winglets
    const fSplitter = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.05, 0.55), carbonMat);
    fSplitter.position.set(0, 0.18, 2.1);
    chassis.add(fSplitter);

    // Hood with Deep Venturi Air Tunnels & Framed Ashi Livery
    const hoodDecal = this.makeFramedLivery(1.18, 1.35, decalMat, carbonMat);
    hoodDecal.rotation.x = -Math.PI / 2.2;
    hoodDecal.position.set(0, 0.525, 1.15);
    chassis.add(hoodDecal);

    // Futuristic Y-Shaped Cyber Matrix Headlights
    const hlL1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.05), drlMat);
    hlL1.position.set(-0.62, 0.44, 2.05);
    hlL1.rotation.z = 0.35;
    const hlR1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.05), drlMat);
    hlR1.position.set(0.62, 0.44, 2.05);
    hlR1.rotation.z = -0.35;
    chassis.add(hlL1, hlR1);

    // Giant Curved Active Rear Wing with Cyan Wingtip LEDs & Ashi Livery (Stock)
    const defaultWing = new THREE.Group();
    defaultWing.name = 'CarSpoiler';
    const rw = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.05, 0.42), bodyMat);
    rw.position.set(0, 0.88, -1.95);

    const wingDecal = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.36), decalMat);
    wingDecal.position.set(0, 0.91, -1.95);
    wingDecal.rotation.x = -Math.PI / 2;
    defaultWing.add(wingDecal);

    const ledL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.44), drlMat);
    ledL.position.set(-0.91, 0.88, -1.95);
    const ledR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.44), drlMat);
    ledR.position.set(0.91, 0.88, -1.95);
    defaultWing.add(rw, ledL, ledR);
    chassis.add(defaultWing);

    // Full-Body Sculpted Flanks & Rear Deck Livery
    const doorDecalL = this.makeFramedLivery(1.95, 0.30, decalMat, carbonMat, true, true);
    doorDecalL.position.set(-0.80, 0.36, 0.05);
    doorDecalL.rotation.y = -Math.PI / 2;

    const doorDecalR = this.makeFramedLivery(1.95, 0.30, decalMat, carbonMat, false, true);
    doorDecalR.position.set(0.80, 0.36, 0.05);
    doorDecalR.rotation.y = Math.PI / 2;

    const rearDecal = this.makeFramedLivery(1.25, 0.22, decalMat, carbonMat);
    rearDecal.position.set(0, 0.40, -2.11);
    rearDecal.rotation.y = Math.PI;

    chassis.add(doorDecalL, doorDecalR, rearDecal);

    // Rear Under-Diffuser with Neon Brake Outline
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.45), carbonMat);
    diffuser.position.set(0, 0.20, -1.95);
    const brakeStrip = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.04), brakeMat);
    brakeStrip.position.set(0, 0.32, -2.12);
    chassis.add(diffuser, brakeStrip);
  }

  // ==========================================
  // CAR 7: Ashi WRC Rally Beast (NEW!)
  // ==========================================
  buildRallyBody(chassis, bodyMat, decalMat, trimMat, carbonMat, glassMat, lightMat, amberMat, brakeMat) {
    // Compact Aggressive Widebody Rally Hatchback
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.52, 3.75), bodyMat);
    body.position.set(0, 0.48, 0);
    chassis.add(body);

    // Flared Boxy Rally Wheel Arches
    const fArches = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.46, 1.15), bodyMat);
    fArches.position.set(0, 0.48, 1.15);
    const rArches = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.48, 1.15), bodyMat);
    rArches.position.set(0, 0.50, -1.15);
    chassis.add(fArches, rArches);

    // Quad Front Rally Fog Light Pods on Hood
    const podBar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.18), trimMat);
    podBar.position.set(0, 0.78, 1.65);
    chassis.add(podBar);

    for (let i = -0.36; i <= 0.36; i += 0.24) {
      const podLight = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16), lightMat);
      podLight.rotateX(Math.PI / 2);
      podLight.position.set(i, 0.78, 1.75);
      chassis.add(podLight);
    }

    // Front Metal Skid Plate
    const skid = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.05, 0.45), carbonMat);
    skid.position.set(0, 0.22, 1.85);
    skid.rotation.x = -0.3;
    chassis.add(skid);

    // Roof Air Intake Scoop
    const roofScoop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.45), carbonMat);
    roofScoop.position.set(0, 1.08, 0.25);
    chassis.add(roofScoop);

    // Large Dual-Plane WRC Rear Wing with Ashi Skin Livery (Stock)
    const defaultWing = new THREE.Group();
    defaultWing.name = 'CarSpoiler';
    const rwLower = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.05, 0.32), carbonMat);
    rwLower.position.set(0, 0.95, -1.65);
    const rwUpper = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.05, 0.38), decalMat);
    rwUpper.position.set(0, 1.15, -1.78);
    const wingPillarL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.32), carbonMat);
    wingPillarL.position.set(-0.65, 1.05, -1.72);
    const wingPillarR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.32), carbonMat);
    wingPillarR.position.set(0.65, 1.05, -1.72);
    defaultWing.add(rwLower, rwUpper, wingPillarL, wingPillarR);
    chassis.add(defaultWing);

    // Bright Red Rally Mudflaps behind wheels
    const flapMat = new THREE.MeshBasicMaterial({ color: 0xff002b });
    const makeMudflap = (x, z) => {
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.03), flapMat);
      flap.position.set(x, 0.22, z);
      chassis.add(flap);
    };
    makeMudflap(-0.84, 0.85);
    makeMudflap(0.84, 0.85);
    makeMudflap(-0.86, -1.45);
    makeMudflap(0.86, -1.45);

    // Tail Lights
    const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.32, 0.06), brakeMat);
    tailL.position.set(-0.65, 0.65, -1.88);
    const tailR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.32, 0.06), brakeMat);
    tailR.position.set(0.65, 0.65, -1.88);
    chassis.add(tailL, tailR);

    // Full-Body WRC Rally Beast Livery Wrap: Hood, Roof, Doors with Chevrons & Rear Hatch
    const hoodDecal = this.makeFramedLivery(1.28, 1.25, decalMat, carbonMat);
    hoodDecal.position.set(0, 0.755, 0.95);
    hoodDecal.rotation.x = -Math.PI / 2.2;

    const roofDecal = this.makeFramedLivery(1.15, 1.25, decalMat, carbonMat);
    roofDecal.position.set(0, 1.055, -0.3);
    roofDecal.rotation.x = -Math.PI / 2;

    const doorDecalL = this.makeFramedLivery(1.65, 0.46, decalMat, carbonMat, true, true);
    doorDecalL.position.set(-0.82, 0.48, 0.05);
    doorDecalL.rotation.y = -Math.PI / 2;

    const doorDecalR = this.makeFramedLivery(1.65, 0.46, decalMat, carbonMat, false, true);
    doorDecalR.position.set(0.82, 0.48, 0.05);
    doorDecalR.rotation.y = Math.PI / 2;

    const rearDecal = this.makeFramedLivery(1.25, 0.35, decalMat, carbonMat);
    rearDecal.position.set(0, 0.58, -1.88);
    rearDecal.rotation.y = Math.PI;

    chassis.add(hoodDecal, roofDecal, doorDecalL, doorDecalR, rearDecal);
  }

  // ==========================================
  // CAR 8: Ashi Retro Speedster (NEW!)
  // ==========================================
  buildSpeedsterBody(chassis, bodyMat, decalMat, trimMat, carbonMat, chromeMat, glassMat, lightMat, brakeMat) {
    // Curvaceous Vintage Roadster Shell
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.42, 3.82), bodyMat);
    body.position.set(0, 0.42, 0);
    chassis.add(body);

    // Rounded Vintage Wheel Arches
    const archGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.22, 16, 1, false, 0, Math.PI);
    archGeo.rotateZ(Math.PI / 2);
    const fArchL = new THREE.Mesh(archGeo, bodyMat);
    fArchL.position.set(-0.72, 0.42, 1.20);
    const fArchR = new THREE.Mesh(archGeo, bodyMat);
    fArchR.position.set(0.72, 0.42, 1.20);
    const rArchL = new THREE.Mesh(archGeo, bodyMat);
    rArchL.position.set(-0.72, 0.42, -1.15);
    const rArchR = new THREE.Mesh(archGeo, bodyMat);
    rArchR.position.set(0.72, 0.42, -1.15);
    chassis.add(fArchL, fArchR, rArchL, rArchR);

    // Curving Low-Cut Speedster Frameless Windshield
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.22, 16, 1, false, -Math.PI / 3, (2 * Math.PI) / 3), glassMat);
    shield.position.set(0, 0.68, 0.25);
    shield.rotation.x = 0.35;
    chassis.add(shield);

    // Streamlined Aerodynamic Headrest Fairing behind Driver
    const fairingGeo = new THREE.ConeGeometry(0.24, 0.85, 16);
    fairingGeo.rotateX(-Math.PI / 2);
    const fairing = new THREE.Mesh(fairingGeo, bodyMat);
    fairing.position.set(-0.30, 0.68, -0.45);
    chassis.add(fairing);

    // Chrome Bullet Side Mirrors
    const bMirrorL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), chromeMat);
    bMirrorL.position.set(-0.72, 0.66, 0.32);
    const bMirrorR = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), chromeMat);
    bMirrorR.position.set(0.72, 0.66, 0.32);
    chassis.add(bMirrorL, bMirrorR);

    // Classic Twin Round Chrome Headlights
    const hlL = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16), lightMat);
    hlL.rotateX(Math.PI / 2);
    hlL.position.set(-0.52, 0.48, 1.92);
    const hlRingL = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 16), chromeMat);
    hlRingL.position.set(-0.52, 0.48, 1.94);

    const hlR = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16), lightMat);
    hlR.rotateX(Math.PI / 2);
    hlR.position.set(0.52, 0.48, 1.92);
    const hlRingR = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 16), chromeMat);
    hlRingR.position.set(0.52, 0.48, 1.94);
    chassis.add(hlL, hlRingL, hlR, hlRingR);

    // Hood with Ashi Livery & Center Chrome Spine
    const hoodDecal = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.35), decalMat);
    hoodDecal.rotation.x = -Math.PI / 2.2;
    hoodDecal.position.set(0, 0.58, 0.95);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1.45), chromeMat);
    spine.position.set(0, 0.60, 0.95);
    chassis.add(hoodDecal, spine);

    // Classic Dual Rear Bumperettes & Round Tail Lights
    const tlL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16), brakeMat);
    tlL.rotateX(Math.PI / 2);
    tlL.position.set(-0.54, 0.46, -1.92);
    const tlR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16), brakeMat);
    tlR.rotateX(Math.PI / 2);
    tlR.position.set(0.54, 0.46, -1.92);
    chassis.add(tlL, tlR);

    // Full-Body Retro Speedster Side & Rear Fairing Liveries
    const sideL = this.makeFramedLivery(1.65, 0.38, decalMat, chromeMat, true, true);
    sideL.position.set(-0.77, 0.42, 0.05);
    sideL.rotation.y = -Math.PI / 2;

    const sideR = this.makeFramedLivery(1.65, 0.38, decalMat, chromeMat, false, true);
    sideR.position.set(0.77, 0.42, 0.05);
    sideR.rotation.y = Math.PI / 2;

    const rearDeckDecal = this.makeFramedLivery(1.18, 0.34, decalMat, chromeMat);
    rearDeckDecal.position.set(0, 0.48, -1.91);
    rearDeckDecal.rotation.y = Math.PI;

    chassis.add(sideL, sideR, rearDeckDecal);
  }
}
