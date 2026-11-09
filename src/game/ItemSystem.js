import * as THREE from 'three';

export class ItemSystem {
  constructor(scene, track, particles, audio, hud) {
    this.scene = scene;
    this.track = track;
    this.particles = particles;
    this.audio = audio;
    this.hud = hud;

    this.itemBoxes = [];
    this.activeBananas = [];
    this.activeMissiles = [];

    this.itemTypes = ['boost', 'banana', 'missile', 'shield'];

    this.initItemBoxes();
  }

  initItemBoxes() {
    // Spawn item box clusters along the track at t = 0.18, 0.42, 0.65, 0.82
    const clusters = [0.18, 0.42, 0.65, 0.82];
    const boxGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);

    // Glowing question mark canvas texture
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff0077aa';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 120, 120);
    ctx.font = 'bold 80px sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 64, 64);
    const boxTex = new THREE.CanvasTexture(canvas);

    const boxMat = new THREE.MeshBasicMaterial({
      map: boxTex,
      transparent: true,
      opacity: 0.85
    });

    clusters.forEach(t => {
      const pt = this.track.spline.getPointAt(t);
      const tangent = this.track.spline.getTangentAt(t).normalize();
      const normal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();

      // 3 boxes side-by-side across the track
      [-5, 0, 5].forEach(offset => {
        const pos = pt.clone().addScaledVector(normal, offset);
        pos.y = pt.y + 1.2;

        const mesh = new THREE.Mesh(boxGeo, boxMat);
        mesh.position.copy(pos);
        this.scene.add(mesh);

        this.itemBoxes.push({
          mesh,
          pos,
          active: true,
          respawnTimer: 0
        });
      });
    });
  }

  update(delta, playerCar, otherCars = []) {
    // 1. Rotate & Animate Item Boxes
    this.itemBoxes.forEach(box => {
      if (box.active) {
        box.mesh.rotation.y += delta * 2.5;
        box.mesh.rotation.x += delta * 1.5;
        box.mesh.visible = true;

        // Check collision with player
        if (playerCar && !playerCar.currentItem && playerCar.position.distanceTo(box.pos) < 2.2) {
          this.pickupItem(playerCar, box);
        }

        // Check collision with other cars (AI or friends)
        otherCars.forEach(car => {
          if (!car.currentItem && car.position.distanceTo(box.pos) < 2.2) {
            box.active = false;
            box.respawnTimer = 6.0;
            box.mesh.visible = false;
            car.currentItem = this.itemTypes[Math.floor(Math.random() * this.itemTypes.length)];
          }
        });
      } else {
        box.respawnTimer -= delta;
        if (box.respawnTimer <= 0) {
          box.active = true;
          box.mesh.visible = true;
        }
      }
    });

    // 2. Update Bananas
    for (let i = this.activeBananas.length - 1; i >= 0; i--) {
      const b = this.activeBananas[i];
      b.mesh.rotation.y += delta * 1.5;

      // Check collision with player
      if (playerCar && !playerCar.isInvincible && playerCar.position.distanceTo(b.pos) < 2.0) {
        this.triggerSpinOut(playerCar);
        this.removeBanana(i);
        continue;
      }

      // Check collision with other cars
      for (const car of otherCars) {
        if (!car.isInvincible && car.position.distanceTo(b.pos) < 2.0) {
          this.triggerSpinOut(car);
          this.removeBanana(i);
          break;
        }
      }
    }

    // 3. Update Missiles
    for (let i = this.activeMissiles.length - 1; i >= 0; i--) {
      const m = this.activeMissiles[i];
      m.life -= delta;

      if (m.life <= 0) {
        this.removeMissile(i);
        continue;
      }

      // Move forward
      m.pos.addScaledVector(m.velocity, delta);
      m.mesh.position.copy(m.pos);

      // Check hit on player
      if (m.owner !== playerCar && playerCar && !playerCar.isInvincible && playerCar.position.distanceTo(m.pos) < 2.5) {
        this.triggerSpinOut(playerCar);
        this.particles.emitExhaustFlame([m.mesh], true);
        this.removeMissile(i);
        continue;
      }

      // Check hit on other cars
      let hit = false;
      for (const car of otherCars) {
        if (m.owner !== car && !car.isInvincible && car.position.distanceTo(m.pos) < 2.5) {
          this.triggerSpinOut(car);
          hit = true;
          break;
        }
      }
      if (hit) {
        this.removeMissile(i);
      }
    }
  }

  pickupItem(car, box) {
    box.active = false;
    box.respawnTimer = 6.0;
    box.mesh.visible = false;

    // Pick random item
    const picked = this.itemTypes[Math.floor(Math.random() * this.itemTypes.length)];
    car.currentItem = picked;

    this.audio.playCountdown(600, 0.1);
    this.hud.setItem(picked);
  }

  useItem(car) {
    if (!car || !car.currentItem) return;
    const item = car.currentItem;
    car.currentItem = null;
    this.hud.setItem(null);

    if (item === 'boost') {
      car.boostTimer = 3.5;
      car.isInvincible = true;
      setTimeout(() => { car.isInvincible = false; }, 3500);
      this.audio.playBoostSound();
      this.hud.showReaction('⚡ ซูเปอร์ไนโตรติดสปีด!', 1500);
    } else if (item === 'banana') {
      this.dropBanana(car);
      this.hud.showReaction('🍌 วางเปลือกกล้วยดักหลัง!', 1500);
    } else if (item === 'missile') {
      this.fireMissile(car);
      this.hud.showReaction('🚀 ยิงจรวดอาชิมิสไซล์!', 1500);
    } else if (item === 'shield') {
      car.isInvincible = true;
      setTimeout(() => { car.isInvincible = false; }, 5000);
      this.hud.showReaction('🛡️ โล่ป้องกัน 5 วินาที!', 1500);
    }
  }

  dropBanana(car) {
    const behind = new THREE.Vector3(0, 0.2, -2.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotationY);
    const pos = car.position.clone().add(behind);

    const geo = new THREE.ConeGeometry(0.35, 0.7, 8);
    geo.rotateZ(Math.PI / 4);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffdd00, roughness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);

    this.activeBananas.push({ mesh, pos });
  }

  removeBanana(index) {
    const b = this.activeBananas[index];
    if (b) {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
      this.activeBananas.splice(index, 1);
    }
  }

  fireMissile(car) {
    const forward = new THREE.Vector3(Math.sin(car.rotationY), 0, Math.cos(car.rotationY)).normalize();
    const pos = car.position.clone().addScaledVector(forward, 2.5);
    pos.y += 0.5;

    const geo = new THREE.CylinderGeometry(0.18, 0.18, 1.0, 12);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0044, metalness: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.y = car.rotationY;
    this.scene.add(mesh);

    this.activeMissiles.push({
      mesh,
      pos,
      velocity: forward.multiplyScalar(65),
      owner: car,
      life: 3.5
    });
  }

  removeMissile(index) {
    const m = this.activeMissiles[index];
    if (m) {
      this.scene.remove(m.mesh);
      m.mesh.geometry.dispose();
      m.mesh.material.dispose();
      this.activeMissiles.splice(index, 1);
    }
  }

  triggerSpinOut(car) {
    if (car.isSpinning) return;
    car.isSpinning = true;
    car.speed *= 0.25;

    let elapsed = 0;
    const startRot = car.rotationY;
    const spinInterval = setInterval(() => {
      elapsed += 0.05;
      car.rotationY += 0.7;
      if (elapsed >= 1.0) {
        clearInterval(spinInterval);
        car.isSpinning = false;
      }
    }, 50);

    if (car.isPlayer) {
      this.hud.showReaction('😵 แว้นหลุดโค้ง โดนไอเทม!', 1500);
    }
  }
}

