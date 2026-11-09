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

  createCar(carType = 'gt', skinFileName = null, bodyColor = '#ff2255', isRival = false) {
    const root = new THREE.Group();
    root.name = 'CarRoot';

    const skinTexture = skinFileName ? this.loadSkinTexture(skinFileName) : null;
    const parsedColor = new THREE.Color(bodyColor);

    // Materials
    const bodyMat = new THREE.MeshStandardMaterial({
      color: parsedColor,
      metalness: 0.8,
      roughness: 0.25,
      clearcoat: 0.6,
      clearcoatRoughness: 0.1
    });

    const decalMat = skinTexture ? new THREE.MeshStandardMaterial({
      map: skinTexture,
      roughness: 0.4,
      metalness: 0.2,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    }) : bodyMat;

    const blackTrimMat = new THREE.MeshStandardMaterial({
      color: 0x151518,
      roughness: 0.7,
      metalness: 0.3
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x112233,
      metalness: 0.1,
      roughness: 0.1,
      transmission: 0.7,
      transparent: true,
      opacity: 0.85
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.95,
      roughness: 0.1
    });

    const lightGlowMat = new THREE.MeshBasicMaterial({ color: 0x88e5ff });
    const brakeLightMat = new THREE.MeshBasicMaterial({ color: 0xff1122 });

    const wheelTireMat = new THREE.MeshStandardMaterial({
      color: 0x18181c,
      roughness: 0.85
    });

    const wheelRimMat = new THREE.MeshStandardMaterial({
      color: 0xddeeff,
      metalness: 0.9,
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

    // Underglow Neon
    const underglowGeo = new THREE.PlaneGeometry(1.6, 3.2);
    const underglowCanvas = document.createElement('canvas');
    underglowCanvas.width = 128;
    underglowCanvas.height = 256;
    const ctx = underglowCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 128, 10, 64, 128, 64);
    grad.addColorStop(0, bodyColor);
    grad.addColorStop(0.5, bodyColor + 'aa');
    grad.addColorStop(1, '#00000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 256);
    const underglowTex = new THREE.CanvasTexture(underglowCanvas);

    const underglowMat = new THREE.MeshBasicMaterial({
      map: underglowTex,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const underglowMesh = new THREE.Mesh(underglowGeo, underglowMat);
    underglowMesh.rotation.x = -Math.PI / 2;
    underglowMesh.position.y = 0.08;
    root.add(underglowMesh);

    // Build specific car body
    if (carType === 'kart') {
      this.buildKartBody(chassis, bodyMat, decalMat, blackTrimMat, glassMat, chromeMat, lightGlowMat, brakeLightMat);
      wheels.frontLeft = this.createWheel(wheelTireMat, wheelRimMat, 0.24, 0.2, frontWheelSteerGroupL, -0.7, 0.24, 0.9);
      wheels.frontRight = this.createWheel(wheelTireMat, wheelRimMat, 0.24, 0.2, frontWheelSteerGroupR, 0.7, 0.24, 0.9);
      wheels.rearLeft = this.createWheel(wheelTireMat, wheelRimMat, 0.32, 0.28, chassis, -0.75, 0.32, -0.85);
      wheels.rearRight = this.createWheel(wheelTireMat, wheelRimMat, 0.32, 0.28, chassis, 0.75, 0.32, -0.85);
    } else if (carType === 'truck') {
      this.buildTruckBody(chassis, bodyMat, decalMat, blackTrimMat, glassMat, chromeMat, lightGlowMat, brakeLightMat);
      wheels.frontLeft = this.createWheel(wheelTireMat, wheelRimMat, 0.45, 0.32, frontWheelSteerGroupL, -0.92, 0.45, 1.3);
      wheels.frontRight = this.createWheel(wheelTireMat, wheelRimMat, 0.45, 0.32, frontWheelSteerGroupR, 0.92, 0.45, 1.3);
      wheels.rearLeft = this.createWheel(wheelTireMat, wheelRimMat, 0.45, 0.32, chassis, -0.92, 0.45, -1.3);
      wheels.rearRight = this.createWheel(wheelTireMat, wheelRimMat, 0.45, 0.32, chassis, 0.92, 0.45, -1.3);
    } else if (carType === 'f1') {
      this.buildF1Body(chassis, bodyMat, decalMat, blackTrimMat, chromeMat, lightGlowMat, brakeLightMat);
      wheels.frontLeft = this.createWheel(wheelTireMat, wheelRimMat, 0.32, 0.26, frontWheelSteerGroupL, -0.88, 0.32, 1.45);
      wheels.frontRight = this.createWheel(wheelTireMat, wheelRimMat, 0.32, 0.26, frontWheelSteerGroupR, 0.88, 0.32, 1.45);
      wheels.rearLeft = this.createWheel(wheelTireMat, wheelRimMat, 0.38, 0.36, chassis, -0.92, 0.38, -1.3);
      wheels.rearRight = this.createWheel(wheelTireMat, wheelRimMat, 0.38, 0.36, chassis, 0.92, 0.38, -1.3);
    } else if (carType === 'muscle') {
      this.buildMuscleBody(chassis, bodyMat, decalMat, blackTrimMat, glassMat, chromeMat, lightGlowMat, brakeLightMat);
      wheels.frontLeft = this.createWheel(wheelTireMat, wheelRimMat, 0.36, 0.28, frontWheelSteerGroupL, -0.85, 0.36, 1.25);
      wheels.frontRight = this.createWheel(wheelTireMat, wheelRimMat, 0.36, 0.28, frontWheelSteerGroupR, 0.85, 0.36, 1.25);
      wheels.rearLeft = this.createWheel(wheelTireMat, wheelRimMat, 0.4, 0.34, chassis, -0.88, 0.4, -1.15);
      wheels.rearRight = this.createWheel(wheelTireMat, wheelRimMat, 0.4, 0.34, chassis, 0.88, 0.4, -1.15);
    } else {
      // Default: GT Supercar
      this.buildGTBody(chassis, bodyMat, decalMat, blackTrimMat, glassMat, chromeMat, lightGlowMat, brakeLightMat);
      wheels.frontLeft = this.createWheel(wheelTireMat, wheelRimMat, 0.35, 0.26, frontWheelSteerGroupL, -0.82, 0.35, 1.2);
      wheels.frontRight = this.createWheel(wheelTireMat, wheelRimMat, 0.35, 0.26, frontWheelSteerGroupR, 0.82, 0.35, 1.2);
      wheels.rearLeft = this.createWheel(wheelTireMat, wheelRimMat, 0.38, 0.3, chassis, -0.85, 0.38, -1.18);
      wheels.rearRight = this.createWheel(wheelTireMat, wheelRimMat, 0.38, 0.3, chassis, 0.85, 0.38, -1.18);
    }

    // Driver Avatar Billboard / Cutout
    if (skinTexture) {
      this.addDriverBobblehead(chassis, skinTexture, carType);
    }

    // Exhaust Pipes
    const exhaustPipes = this.createExhaustPipes(chassis, carType);

    // Headlight Spotlights for night / tunnel
    const headLightL = new THREE.SpotLight(0xfff5dd, 2, 35, Math.PI / 5, 0.3);
    headLightL.position.set(-0.6, 0.5, 2.0);
    headLightL.target.position.set(-0.6, 0, 15);
    chassis.add(headLightL);
    chassis.add(headLightL.target);

    const headLightR = new THREE.SpotLight(0xfff5dd, 2, 35, Math.PI / 5, 0.3);
    headLightR.position.set(0.6, 0.5, 2.0);
    headLightR.target.position.set(0.6, 0, 15);
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

  createWheel(tireMat, rimMat, radius, width, parent, posX, posY, posZ) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(posX, posY, posZ);

    const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 24);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMesh = new THREE.Mesh(tireGeo, tireMat);
    tireMesh.castShadow = true;
    wheelGroup.add(tireMesh);

    const rimGeo = new THREE.CylinderGeometry(radius * 0.65, radius * 0.65, width * 1.05, 12);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    wheelGroup.add(rimMesh);

    // Spokes
    const spokeCount = 5;
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI;
      const spokeGeo = new THREE.BoxGeometry(width * 1.06, radius * 1.1, 0.04);
      const spokeMesh = new THREE.Mesh(spokeGeo, rimMat);
      spokeMesh.rotation.x = angle;
      wheelGroup.add(spokeMesh);
    }

    parent.add(wheelGroup);
    return wheelGroup;
  }

  addDriverBobblehead(chassis, skinTexture, carType) {
    const driverGroup = new THREE.Group();
    driverGroup.name = 'DriverAvatar';

    // Position according to car type
    if (carType === 'kart') {
      driverGroup.position.set(0, 0.65, -0.1);
    } else if (carType === 'f1') {
      driverGroup.position.set(0, 0.55, 0.1);
    } else if (carType === 'truck') {
      driverGroup.position.set(-0.35, 1.1, 0.1);
    } else {
      driverGroup.position.set(-0.35, 0.75, -0.1);
    }

    // Ashi photo in a sleek stylized circle / cutout badge or 3D helmet
    const avatarGeo = new THREE.CircleGeometry(0.32, 32);
    const avatarMat = new THREE.MeshBasicMaterial({
      map: skinTexture,
      side: THREE.DoubleSide
    });
    const avatarMesh = new THREE.Mesh(avatarGeo, avatarMat);
    avatarMesh.rotation.y = 0;
    driverGroup.add(avatarMesh);

    // Frame ring
    const ringGeo = new THREE.RingGeometry(0.32, 0.35, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffdd00, side: THREE.DoubleSide });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    driverGroup.add(ringMesh);

    // Racing cap / helmet accent on top
    const capGeo = new THREE.ConeGeometry(0.18, 0.18, 16);
    capGeo.rotateX(Math.PI / 2);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xff0044 });
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.position.set(0, 0.32, 0.05);
    driverGroup.add(capMesh);

    chassis.add(driverGroup);
  }

  createExhaustPipes(chassis, carType) {
    const pipes = [];
    const pipeGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.25, 12);
    pipeGeo.rotateX(Math.PI / 2);
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.2 });

    const pipeZ = carType === 'truck' ? -2.2 : (carType === 'f1' ? -1.8 : -1.9);
    const pipeY = carType === 'truck' ? 0.35 : 0.25;

    const leftPipe = new THREE.Mesh(pipeGeo, pipeMat);
    leftPipe.position.set(-0.35, pipeY, pipeZ);
    chassis.add(leftPipe);

    const rightPipe = new THREE.Mesh(pipeGeo, pipeMat);
    rightPipe.position.set(0.35, pipeY, pipeZ);
    chassis.add(rightPipe);

    pipes.push(leftPipe, rightPipe);
    return pipes;
  }

  // --- 1. GT Supercar ---
  buildGTBody(chassis, bodyMat, decalMat, trimMat, glassMat, chromeMat, lightMat, brakeMat) {
    // Main lower body
    const lowerBodyGeo = new THREE.BoxGeometry(1.5, 0.35, 3.8);
    const lowerBody = new THREE.Mesh(lowerBodyGeo, bodyMat);
    lowerBody.position.set(0, 0.36, 0);
    chassis.add(lowerBody);

    // Hood decal with Ashi Skin!
    const hoodDecalGeo = new THREE.PlaneGeometry(1.2, 1.4);
    const hoodDecal = new THREE.Mesh(hoodDecalGeo, decalMat);
    hoodDecal.rotation.x = -Math.PI / 2 - 0.05;
    hoodDecal.position.set(0, 0.54, 0.85);
    chassis.add(hoodDecal);

    // Cabin / Roof
    const cabinGeo = new THREE.BoxGeometry(1.2, 0.38, 1.6);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 0.68, -0.2);
    chassis.add(cabin);

    // Roof Top with secondary Ashi decal
    const roofDecalGeo = new THREE.PlaneGeometry(1.0, 1.1);
    const roofDecal = new THREE.Mesh(roofDecalGeo, decalMat);
    roofDecal.rotation.x = -Math.PI / 2;
    roofDecal.position.set(0, 0.88, -0.2);
    chassis.add(roofDecal);

    // Front Bumper & Splitter
    const splitterGeo = new THREE.BoxGeometry(1.55, 0.08, 0.4);
    const splitter = new THREE.Mesh(splitterGeo, trimMat);
    splitter.position.set(0, 0.22, 1.85);
    chassis.add(splitter);

    // Headlights
    const hlGeo = new THREE.BoxGeometry(0.3, 0.1, 0.1);
    const hlLeft = new THREE.Mesh(hlGeo, lightMat);
    hlLeft.position.set(-0.55, 0.42, 1.86);
    const hlRight = new THREE.Mesh(hlGeo, lightMat);
    hlRight.position.set(0.55, 0.42, 1.86);
    chassis.add(hlLeft, hlRight);

    // Taillights
    const tlGeo = new THREE.BoxGeometry(1.2, 0.08, 0.06);
    const tl = new THREE.Mesh(tlGeo, brakeMat);
    tl.position.set(0, 0.48, -1.9);
    chassis.add(tl);

    // Rear GT Wing / Spoiler
    const wingStandL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.1), trimMat);
    wingStandL.position.set(-0.55, 0.65, -1.7);
    const wingStandR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.1), trimMat);
    wingStandR.position.set(0.55, 0.65, -1.7);
    const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.35), bodyMat);
    wingBlade.position.set(0, 0.8, -1.7);
    chassis.add(wingStandL, wingStandR, wingBlade);
  }

  // --- 2. Ashi Go-Kart ---
  buildKartBody(chassis, bodyMat, decalMat, trimMat, glassMat, chromeMat, lightMat, brakeMat) {
    // Pipe frame chassis
    const frameGeo = new THREE.BoxGeometry(1.1, 0.15, 2.2);
    const frame = new THREE.Mesh(frameGeo, trimMat);
    frame.position.set(0, 0.25, 0);
    chassis.add(frame);

    // Front Nosecone with Ashi Decal
    const noseGeo = new THREE.ConeGeometry(0.5, 0.9, 4);
    noseGeo.rotateX(Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, bodyMat);
    nose.position.set(0, 0.28, 0.85);
    chassis.add(nose);

    const noseDecalGeo = new THREE.PlaneGeometry(0.65, 0.65);
    const noseDecal = new THREE.Mesh(noseDecalGeo, decalMat);
    noseDecal.rotation.x = -Math.PI / 2.5;
    noseDecal.position.set(0, 0.38, 0.85);
    chassis.add(noseDecal);

    // Sidepods with Ashi photos
    const sidePodGeo = new THREE.BoxGeometry(0.28, 0.25, 1.1);
    const podL = new THREE.Mesh(sidePodGeo, bodyMat);
    podL.position.set(-0.6, 0.25, 0);
    const podR = new THREE.Mesh(sidePodGeo, bodyMat);
    podR.position.set(0.6, 0.25, 0);
    chassis.add(podL, podR);

    // Racing Seat
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.45), trimMat);
    seatBase.position.set(0, 0.28, -0.2);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.1), trimMat);
    seatBack.position.set(0, 0.5, -0.42);
    seatBack.rotation.x = 0.2;
    chassis.add(seatBase, seatBack);

    // Steering Column & Wheel
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4), chromeMat);
    column.position.set(0, 0.45, 0.2);
    column.rotation.x = -0.6;
    const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 8, 16), trimMat);
    steeringWheel.position.set(0, 0.58, 0.1);
    steeringWheel.rotation.x = -0.6;
    chassis.add(column, steeringWheel);

    // Rear Bumper & Light
    const rb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.06), brakeMat);
    rb.position.set(0, 0.3, -1.05);
    chassis.add(rb);
  }

  // --- 3. Ashi Cyber Truck ---
  buildTruckBody(chassis, bodyMat, decalMat, trimMat, glassMat, chromeMat, lightMat, brakeMat) {
    // Angular cyber body
    const bodyBase = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 4.4), bodyMat);
    bodyBase.position.set(0, 0.6, 0);
    chassis.add(bodyBase);

    // Sloped angular roof
    const roofGeo = new THREE.ConeGeometry(1.3, 1.2, 4);
    roofGeo.rotateY(Math.PI / 4);
    roofGeo.scale(1.2, 0.6, 2.2);
    const roof = new THREE.Mesh(roofGeo, glassMat);
    roof.position.set(0, 1.15, -0.2);
    chassis.add(roof);

    // Huge Hood Decal with Ashi Skin!
    const hoodDecalGeo = new THREE.PlaneGeometry(1.4, 1.5);
    const hoodDecal = new THREE.Mesh(hoodDecalGeo, decalMat);
    hoodDecal.rotation.x = -Math.PI / 2.3;
    hoodDecal.position.set(0, 0.95, 1.15);
    chassis.add(hoodDecal);

    // Side Decal Left & Right
    const sideDecalGeo = new THREE.PlaneGeometry(1.8, 0.5);
    const sideL = new THREE.Mesh(sideDecalGeo, decalMat);
    sideL.position.set(-0.86, 0.65, -0.1);
    sideL.rotation.y = -Math.PI / 2;
    const sideR = new THREE.Mesh(sideDecalGeo, decalMat);
    sideR.position.set(0.86, 0.65, -0.1);
    sideR.rotation.y = Math.PI / 2;
    chassis.add(sideL, sideR);

    // Cyber LED Lightbar
    const ledBar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.05), lightMat);
    ledBar.position.set(0, 0.85, 2.18);
    chassis.add(ledBar);

    // Tail LED Lightbar
    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.05), brakeMat);
    tailBar.position.set(0, 0.85, -2.18);
    chassis.add(tailBar);

    // Bull Bar
    const bullBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.1), trimMat);
    bullBar.position.set(0, 0.45, 2.25);
    chassis.add(bullBar);
  }

  // --- 4. Formula-X ---
  buildF1Body(chassis, bodyMat, decalMat, trimMat, chromeMat, lightMat, brakeMat) {
    // Narrow sleek monocoque
    const monoGeo = new THREE.BoxGeometry(0.7, 0.32, 4.2);
    const mono = new THREE.Mesh(monoGeo, bodyMat);
    mono.position.set(0, 0.32, 0);
    chassis.add(mono);

    // Front Wing
    const fwMain = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.5), trimMat);
    fwMain.position.set(0, 0.2, 2.1);
    const fwEndplateL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.55), bodyMat);
    fwEndplateL.position.set(-0.9, 0.26, 2.1);
    const fwEndplateR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.55), bodyMat);
    fwEndplateR.position.set(0.9, 0.26, 2.1);
    chassis.add(fwMain, fwEndplateL, fwEndplateR);

    // Nose Cone with Decal
    const noseDecalGeo = new THREE.PlaneGeometry(0.55, 1.4);
    const noseDecal = new THREE.Mesh(noseDecalGeo, decalMat);
    noseDecal.rotation.x = -Math.PI / 2.15;
    noseDecal.position.set(0, 0.44, 1.25);
    chassis.add(noseDecal);

    // Halo Safety Ring
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 16, Math.PI), trimMat);
    halo.position.set(0, 0.65, 0.1);
    halo.rotation.x = -Math.PI / 2;
    chassis.add(halo);

    // Air Intake Scoop
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.6), bodyMat);
    scoop.position.set(0, 0.65, -0.4);
    chassis.add(scoop);

    // Giant Rear F1 Wing with Ashi Skin!
    const rwWing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.4), decalMat);
    rwWing.position.set(0, 0.88, -1.85);
    const rwPillarL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.1), trimMat);
    rwPillarL.position.set(-0.4, 0.65, -1.8);
    const rwPillarR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.1), trimMat);
    rwPillarR.position.set(0.4, 0.65, -1.8);
    chassis.add(rwWing, rwPillarL, rwPillarR);

    // F1 Rain Light
    const rainLight = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.05), brakeMat);
    rainLight.position.set(0, 0.35, -2.12);
    chassis.add(rainLight);
  }

  // --- 5. Ashi Muscle V8 ---
  buildMuscleBody(chassis, bodyMat, decalMat, trimMat, glassMat, chromeMat, lightMat, brakeMat) {
    // Classic muscle body
    const bodyBase = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 4.0), bodyMat);
    bodyBase.position.set(0, 0.42, 0);
    chassis.add(bodyBase);

    // Fastback Cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 1.8), glassMat);
    cabin.position.set(0, 0.75, -0.3);
    chassis.add(cabin);

    // Big Hood Scoop & Blower
    const blower = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.4), chromeMat);
    blower.position.set(0, 0.72, 0.9);
    chassis.add(blower);

    // Hood Decal with Ashi Skin!
    const hoodDecalGeo = new THREE.PlaneGeometry(1.3, 1.2);
    const hoodDecal = new THREE.Mesh(hoodDecalGeo, decalMat);
    hoodDecal.rotation.x = -Math.PI / 2;
    hoodDecal.position.set(0, 0.65, 1.1);
    chassis.add(hoodDecal);

    // Dual Round Retro Headlights
    const hlMat = lightMat;
    const hl1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16), hlMat);
    hl1.rotation.x = Math.PI / 2;
    hl1.position.set(-0.55, 0.45, 2.02);
    const hl2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16), hlMat);
    hl2.rotation.x = Math.PI / 2;
    hl2.position.set(-0.35, 0.45, 2.02);
    const hr1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16), hlMat);
    hr1.rotation.x = Math.PI / 2;
    hr1.position.set(0.35, 0.45, 2.02);
    const hr2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16), hlMat);
    hr2.rotation.x = Math.PI / 2;
    hr2.position.set(0.55, 0.45, 2.02);
    chassis.add(hl1, hl2, hr1, hr2);

    // Triple bar rear brake lights
    const tl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.05), brakeMat);
    tl.position.set(0, 0.48, -2.01);
    chassis.add(tl);

    // Ducktail spoiler
    const ducktail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.2), trimMat);
    ducktail.position.set(0, 0.68, -1.95);
    ducktail.rotation.x = -0.2;
    chassis.add(ducktail);
  }
}

