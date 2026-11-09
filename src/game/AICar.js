import * as THREE from 'three';
import { Car } from './Car.js';

export class AICar extends Car {
  constructor(carConfig, skinFileName, bodyColor, aiName, laneOffset = 0, skill = 0.85) {
    super(carConfig, skinFileName, bodyColor, false);
    this.name = aiName;
    this.laneOffset = laneOffset; // lateral offset across track (-5 to +5)
    this.skill = skill;
    this.targetT = 0;
    this.lookAheadDistance = 0.035; // t lookahead on spline
  }

  updateAI(delta, track, playerCar) {
    if (!track || !track.spline) return;

    // Determine current spline progress t
    const closest = track.getClosestPointAndT(this.position);
    this.currentT = closest.t;

    // Target a point slightly ahead on the spline
    const targetT = (closest.t + this.lookAheadDistance) % 1;
    const centerTarget = track.spline.getPointAt(targetT);
    const tangent = track.spline.getTangentAt(targetT).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();

    // Offset target into AI's designated lane
    const targetPoint = centerTarget.clone().addScaledVector(normal, this.laneOffset);

    // Vector to target point
    const toTarget = new THREE.Vector3().subVectors(targetPoint, this.position);
    toTarget.y = 0;

    // Angle to target
    const currentHeading = new THREE.Vector3(Math.sin(this.rotationY), 0, Math.cos(this.rotationY));
    const targetHeading = toTarget.clone().normalize();

    const cross = new THREE.Vector3().crossVectors(currentHeading, targetHeading);
    const dot = currentHeading.dot(targetHeading);
    const angleDiff = Math.atan2(cross.y, dot);

    // Steer towards target
    this.inputs.steer = THREE.MathUtils.clamp(angleDiff * 2.8, -1, 1);

    // Speed / Throttle control based on upcoming track curvature
    const curvature = Math.abs(angleDiff);
    if (curvature > 0.42) {
      // Sharp turn: throttle down or drift!
      this.inputs.throttle = 0.70;
      if (this.speed > 16 && Math.random() < 0.06) {
        this.inputs.drift = true;
      }
    } else {
      this.inputs.throttle = 1.0;
      this.inputs.drift = false;

      // Random nitro boost on straightaways
      if (curvature < 0.12 && Math.random() < 0.015 && this.nitroFuel > 40) {
        this.inputs.boost = true;
      } else {
        this.inputs.boost = false;
      }
    }

    // Call base physics & visual update
    super.update(delta, track);
  }
}

