import * as THREE from 'three';
import { Car } from './Car.js';

export class AICar extends Car {
  constructor(carConfig, skinFileName, bodyColor, aiName, laneOffset = 0, skill = 0.88) {
    super(carConfig, skinFileName, bodyColor, false);
    this.name = aiName;
    this.laneOffset = laneOffset; // lateral offset across track (-4 to +4)
    this.skill = skill;
    this.currentT = 0;
    this.lookAheadDistance = 0.035; // t lookahead on track

    this.stuckTimer = 0;
    this.itemThinkTimer = 0;
    this.aiDifficultyMul = 1.0;
  }

  setDifficulty(mul = 1.0) {
    this.aiDifficultyMul = mul;
  }

  updateAI(delta, track, playerCar, allCars = []) {
    if (!track) return;

    // บอทไม่ออกรถไปก่อน: ถ้ายังอยู่ในช่วงนับถอยหลัง ให้หยุดนิ่ง 100% จนกว่าจะ GO
    if (this.game && !this.game.isRacing) {
      this.speed = 0;
      this.inputs.throttle = 0;
      this.inputs.steer = 0;
      this.inputs.boost = false;
      this.inputs.drift = false;
      this.updateVisuals(delta);
      return;
    }

    // Fast track lookup
    const closest = track.getClosest(this.position, this.sampleIndexHint);
    this.sampleIndexHint = closest.index;
    this.currentT = closest.t;

    const trackLen = Math.max(400, track.trackLength || 1500);
    const halfW = (track.trackWidth || 18) * 0.5;
    const safeMargin = Math.max(4.0, halfW - 2.3);
    const lateralPos =
      (this.position.x - closest.point.x) * closest.normal.x +
      (this.position.z - closest.point.z) * closest.normal.z;

    // Sample upcoming curvature in meters so speed & steering anticipate corners consistently across track lengths
    const idx12 = track.indexFromT((closest.t + 12 / trackLen) % 1);
    const idx28 = track.indexFromT((closest.t + 28 / trackLen) % 1);
    const idx48 = track.indexFromT((closest.t + 48 / trackLen) % 1);
    const upcomingCurv = Math.max(
      Math.abs(track.sampleCurv[idx12] || 0),
      Math.abs(track.sampleCurv[idx28] || 0),
      Math.abs(track.sampleCurv[idx48] || 0) * 0.85
    );

    const wallRatio = Math.abs(lateralPos) / safeMargin;
    const nearWall = this.isHittingBarrier || wallRatio > 0.72;

    // Pull racing line decisively away from barrier walls and tighten lookahead during recovery
    let desiredLane = THREE.MathUtils.clamp(this.laneOffset, -safeMargin * 0.65, safeMargin * 0.65);
    if (nearWall) {
      const pullStrength = this.isHittingBarrier
        ? 0.95
        : THREE.MathUtils.clamp((wallRatio - 0.72) / 0.35, 0, 0.95);
      const safeInsideOffset = -Math.sign(lateralPos || 1) * Math.min(3.5, safeMargin * 0.45);
      desiredLane = THREE.MathUtils.lerp(desiredLane, safeInsideOffset, pullStrength);
    }

    const baseLookMeters = nearWall || Math.abs(this.speed) < 16
      ? THREE.MathUtils.clamp(13 + Math.abs(this.speed) * 0.25, 12, 22)
      : THREE.MathUtils.clamp(15 + Math.abs(this.speed) * 0.44 - upcomingCurv * 650, 14, 34);
    const lookAhead = baseLookMeters / trackLen;
    const targetT = (closest.t + lookAhead) % 1;
    const targetIdx = track.indexFromT(targetT);
    const centerTarget = track.samplePos[targetIdx];
    const normal = track.sampleNorm[targetIdx];

    const targetPoint = centerTarget.clone().addScaledVector(normal, desiredLane);
    targetPoint.y = centerTarget.y + 0.05;

    // Heading calculation
    const toTarget = new THREE.Vector3().subVectors(targetPoint, this.position);
    toTarget.y = 0;

    const currentHeading = new THREE.Vector3(Math.sin(this.rotationY), 0, Math.cos(this.rotationY));
    const targetHeading = toTarget.clone().normalize();

    const cross = new THREE.Vector3().crossVectors(currentHeading, targetHeading);
    const dot = currentHeading.dot(targetHeading);
    const angleDiff = Math.atan2(cross.y, dot);

    // Stronger steering response on wall recovery & apex entries
    const steerGain = nearWall ? 4.2 : 3.1;
    this.inputs.steer = THREE.MathUtils.clamp(angleDiff * steerGain, -1, 1);

    // Speed / Throttle control (AI เลี้ยงความเร็วตามความโค้งของแทร็กข้างหน้า)
    const trackCurv = Math.max(Math.abs(track.sampleCurv[targetIdx] || 0), upcomingCurv);
    const turnSeverity = Math.max(Math.abs(angleDiff), trackCurv * 40);

    const baseTrackMul = track.def?.aiSpeedMul || 1.0;
    const effectiveSkill = this.skill * this.aiDifficultyMul * baseTrackMul;

    if (nearWall && Math.abs(angleDiff) > 0.28) {
      // Moderate speed briefly while turning cleanly off a barrier
      this.inputs.throttle = 0.65 * effectiveSkill;
      this.inputs.drift = false;
      this.inputs.boost = false;
    } else if (turnSeverity > 0.45) {
      // Sharp corner: AI lifts off throttle to feather speed into the apex
      this.inputs.throttle = 0.28 * effectiveSkill;
      this.inputs.boost = false;
      if (this.speed > 22 && Math.random() < 0.2) {
        this.inputs.drift = true;
      }
    } else if (turnSeverity > 0.22) {
      // Medium corner: partial throttle
      this.inputs.throttle = 0.68 * effectiveSkill;
      this.inputs.drift = false;
      this.inputs.boost = false;
    } else {
      // Straightaway: full gas
      this.inputs.throttle = 1.0 * effectiveSkill;
      this.inputs.drift = false;

      // Smart boost on genuine straightaways (never right before a sharp turn)
      if (turnSeverity < 0.12 && upcomingCurv < 0.0025 && this.nitroFuel > 40 && Math.random() < 0.02) {
        this.inputs.boost = true;
      } else {
        this.inputs.boost = false;
      }
    }

    // AI Item Usage
    this.itemThinkTimer += delta;
    if (this.itemThinkTimer > 0.8) {
      this.itemThinkTimer = 0;
      this.thinkAndUseItem(track, playerCar, allCars);
    }

    // Stuck detection & recovery
    if (Math.abs(this.speed) < 2.5 && this.inputs.throttle > 0.3) {
      this.stuckTimer += delta;
      if (this.stuckTimer > 2.5) {
        this.respawn(track);
        this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - delta * 2);
    }

    // Call base physics & visual update
    super.update(delta, track);
  }

  thinkAndUseItem(track, playerCar, allCars) {
    if (!this.currentItem || !this.game || !this.game.items) return;

    const item = this.currentItem;

    if (item === 'boost') {
      // Boost on straight
      if (Math.abs(this.steeringAngle) < 0.2) {
        this.game.items.useItem(this);
      }
    } else if (item === 'banana') {
      // Drop banana if someone is right behind
      const behindDist = 18;
      const someoneBehind = allCars.some(c => {
        if (c === this) return false;
        const d = this.position.distanceTo(c.position);
        return d < behindDist && (this.totalDistance > c.totalDistance);
      });
      if (someoneBehind || Math.random() < 0.25) {
        this.game.items.useItem(this);
      }
    } else if (item === 'missile') {
      // Fire missile if someone is in front
      const someoneAhead = allCars.some(c => {
        if (c === this) return false;
        const d = this.position.distanceTo(c.position);
        return d < 40 && (c.totalDistance > this.totalDistance);
      });
      if (someoneAhead || Math.random() < 0.35) {
        this.game.items.useItem(this);
      }
    } else if (item === 'shield') {
      this.game.items.useItem(this);
    }
  }
}
