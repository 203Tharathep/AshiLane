import * as THREE from 'three';

export class Car {
  constructor(carConfig, skinFileName, bodyColor, isPlayer = true) {
    this.config = carConfig;
    this.physics = carConfig.physics;
    this.isPlayer = isPlayer;
    this.skinFileName = skinFileName;
    this.bodyColor = bodyColor;
    this.game = null;

    // Kinematics
    this.position = new THREE.Vector3(0, 0.4, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.speed = 0; // forward speed in m/s
    this.steeringAngle = 0;
    this.rotationY = 0;
    this.pitch = 0;
    this.roll = 0;

    // Drift & Boost
    this.isDrifting = false;
    this.driftDirection = 0; // -1 left, +1 right
    this.driftTimer = 0;
    this.driftLevel = 0; // 0 none, 1 blue, 2 orange, 3 purple
    this.boostTimer = 0;
    this.nitroFuel = 100;
    this.isNitroActive = false;

    // Item System status
    this.currentItem = null;
    this.isInvincible = false;
    this.isSpinning = false;

    // Track Progress
    this.currentCheckpoint = 0;
    this.lap = 1;
    this.lapProgress = 0; // 0 to 1
    this.totalDistance = 0;
    this.lapTimes = [];
    this.currentLapTime = 0;
    this.bestLapTime = null;
    this.isFinished = false;
    this.finishRank = 1;

    // Visual Mesh model reference
    this.model = null;
    this.wheels = null;
    this.steerGroups = null;
    this.exhaustPipes = null;
    this.brakeLightMat = null;

    // Inputs
    this.inputs = {
      throttle: 0,
      steer: 0,
      drift: false,
      boost: false,
      reset: false
    };

    this.wheelRotation = 0;
  }

  setModel(builtModel) {
    this.model = builtModel.root;
    this.chassis = builtModel.chassis;
    this.wheels = builtModel.wheels;
    this.steerGroups = builtModel.steerGroups;
    this.exhaustPipes = builtModel.exhaustPipes;
    this.brakeLightMat = builtModel.brakeLightMat;
    this.underglowMat = builtModel.underglowMat;
  }

  update(delta, track) {
    if (this.isFinished && this.speed > 10) {
      this.inputs.throttle = 0.2;
    }

    this.handleInputs(delta);
    this.updatePhysics(delta, track);
    this.updateVisuals(delta);
    this.updateTrackProgress(delta, track);
  }

  handleInputs(delta) {
    // Nitro Boost Trigger
    if (this.inputs.boost && this.nitroFuel > 10 && this.boostTimer <= 0) {
      this.boostTimer = 2.0;
      this.nitroFuel = Math.max(0, this.nitroFuel - 35);
      this.isNitroActive = true;
    }

    if (this.boostTimer > 0) {
      this.boostTimer -= delta;
      if (this.boostTimer <= 0) {
        this.isNitroActive = false;
      }
    } else {
      this.nitroFuel = Math.min(100, this.nitroFuel + delta * 6);
    }

    // Drift handling
    const isMovingForward = this.speed > 8;
    if (this.inputs.drift && isMovingForward && Math.abs(this.inputs.steer) > 0.1) {
      if (!this.isDrifting) {
        this.isDrifting = true;
        this.driftDirection = Math.sign(this.inputs.steer);
        this.driftTimer = 0;
      }
      this.driftTimer += delta;

      if (this.driftTimer > 2.2) {
        this.driftLevel = 3;
      } else if (this.driftTimer > 1.3) {
        this.driftLevel = 2;
      } else if (this.driftTimer > 0.6) {
        this.driftLevel = 1;
      } else {
        this.driftLevel = 0;
      }
    } else {
      if (this.isDrifting) {
        if (this.driftLevel > 0) {
          const miniTurboDurations = [0, 0.7, 1.2, 1.8];
          this.boostTimer = Math.max(this.boostTimer, miniTurboDurations[this.driftLevel]);
          this.nitroFuel = Math.min(100, this.nitroFuel + this.driftLevel * 12);
        }
        this.isDrifting = false;
        this.driftTimer = 0;
        this.driftLevel = 0;
      }
    }

    // Manual Respawn
    if (this.inputs.reset) {
      this.respawn(track);
    }
  }

  updatePhysics(delta, track) {
    const p = this.physics;
    let maxSpeed = p.maxSpeed;
    let accelRate = p.accelRate;

    if (this.boostTimer > 0) {
      maxSpeed *= 1.45;
      accelRate *= 2.0;
    }

    // Acceleration & Braking
    if (this.inputs.throttle > 0) {
      if (this.speed < maxSpeed) {
        this.speed += this.inputs.throttle * accelRate * delta;
      }
    } else if (this.inputs.throttle < 0) {
      if (this.speed > 0) {
        this.speed -= p.brakeRate * delta;
        if (this.speed < 0) this.speed = 0;
      } else {
        if (this.speed > -maxSpeed * 0.35) {
          this.speed -= p.accelRate * 0.5 * delta;
        }
      }
    } else {
      const friction = this.isDrifting ? 4 : 8;
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - friction * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + friction * delta);
      }
    }

    // Steering
    const targetSteer = this.inputs.steer;
    this.steeringAngle = THREE.MathUtils.lerp(this.steeringAngle, targetSteer, delta * 10);

    const speedRatio = Math.min(1, Math.abs(this.speed) / (maxSpeed * 0.5));
    let turnSpeed = p.turnRate * this.steeringAngle * speedRatio * Math.sign(this.speed || 1);

    if (this.isDrifting) {
      turnSpeed *= 1.4;
    }

    this.rotationY += turnSpeed * delta;

    // Forward Direction vector
    const forward = new THREE.Vector3(
      Math.sin(this.rotationY),
      0,
      Math.cos(this.rotationY)
    );

    let moveDir = forward.clone();
    if (this.isDrifting && Math.abs(this.speed) > 5) {
      const slideAngle = this.driftDirection * 0.38;
      moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), slideAngle);
    }

    this.velocity.copy(moveDir).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, delta);

    // Track barrier guiding & elastic rebound
    if (track && track.spline) {
      const closest = track.getClosestPointAndT(this.position);
      const tangent = track.spline.getTangentAt(closest.t).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();

      // Project car displacement across track normal
      const toCar = new THREE.Vector3().subVectors(this.position, closest.point);
      const lateralDist = toCar.dot(normal);

      // Soft Elastic Barrier Rebound (no locking/halting, gentle bounce back into the lane!)
      const barrierLimit = track.maxAllowedLateral || 9.2;

      if (Math.abs(lateralDist) > barrierLimit) {
        const wallSide = Math.sign(lateralDist);
        const penetration = Math.abs(lateralDist) - barrierLimit;

        // 1. Gently nudge position inward (soft elastic bounce impulse)
        const bounceForce = Math.min(penetration + 0.35, 1.2);
        this.position.addScaledVector(normal, -wallSide * bounceForce);

        // 2. Smoothly deflect heading away from barrier back into the track
        const trackAngle = Math.atan2(tangent.x, tangent.z);
        const diff = this.rotationY - trackAngle;
        const normDiff = Math.atan2(Math.sin(diff), Math.cos(diff));

        // If car is angled toward the wall, smoothly redirect parallel/inward
        if (normDiff * wallSide > 0) {
          this.rotationY = THREE.MathUtils.lerp(this.rotationY, trackAngle - wallSide * 0.15, delta * 9.0);
        } else {
          this.rotationY -= wallSide * delta * 4.0;
        }

        // 3. Keep car moving forward! Never halt or stall!
        // Gentle bounce maintains speed smoothly
        this.speed = Math.max(0, this.speed * 0.985);

        // 4. Soft bounce audio & sparks
        if (this.game) {
          if (this.game.audio && (!this.lastBounceTime || performance.now() - this.lastBounceTime > 320)) {
            this.lastBounceTime = performance.now();
            this.game.audio.playCollision();
          }
          if (this.game.particles && Math.abs(this.speed) > 6) {
            const sparkPos = this.position.clone().addScaledVector(normal, wallSide * 0.8);
            this.game.particles.emitDriftSparks(sparkPos, 1);
          }
        }
      }

      // 100% Flat surface clamping (y = 0.35, smooth and grounded)
      const targetY = closest.point.y + 0.35;
      this.position.y = THREE.MathUtils.lerp(this.position.y, targetY, delta * 15);

      // Boost pads
      if (track.boostPads) {
        track.boostPads.forEach(pad => {
          if (this.position.distanceTo(pad.position) < pad.radius && this.boostTimer < 2.2) {
            this.boostTimer = 2.6;
            this.speed = Math.max(this.speed, p.maxSpeed * 1.35);
            this.nitroFuel = Math.min(100, this.nitroFuel + 25);
          }
        });
      }
    }
  }

  updateVisuals(delta) {
    if (!this.model) return;

    this.model.position.copy(this.position);

    const targetRoll = this.isDrifting
      ? -this.driftDirection * 0.12
      : -this.steeringAngle * 0.08 * (Math.abs(this.speed) / 30);
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, delta * 8);

    const targetPitch = (this.inputs.throttle > 0 ? -0.04 : (this.inputs.throttle < 0 ? 0.06 : 0));
    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, delta * 8);

    this.model.rotation.set(this.pitch, this.rotationY, this.roll, 'YXZ');

    // Steer front wheels
    if (this.steerGroups) {
      const maxWheelAngle = 0.45;
      const wheelAngle = this.steeringAngle * maxWheelAngle;
      this.steerGroups.forEach(g => {
        g.rotation.y = wheelAngle;
      });
    }

    // Spin wheels
    this.wheelRotation += (this.speed / 0.35) * delta;
    if (this.wheels) {
      Object.values(this.wheels).forEach(w => {
        if (w) {
          w.children[0].rotation.x = this.wheelRotation;
          w.children[1].rotation.x = this.wheelRotation;
        }
      });
    }

    // Brake lights
    if (this.brakeLightMat) {
      if (this.inputs.throttle < 0 || (this.inputs.drift && this.speed > 5)) {
        this.brakeLightMat.color.setHex(0xff0022);
      } else {
        this.brakeLightMat.color.setHex(0x550011);
      }
    }
  }

  updateTrackProgress(delta, track) {
    if (!track || !track.spline || this.isFinished) return;

    this.currentLapTime += delta;
    const cpCount = track.checkpoints.length;
    const nextCpIndex = (this.currentCheckpoint + 1) % cpCount;
    const nextCp = track.checkpoints[nextCpIndex];

    const distToNext = this.position.distanceTo(nextCp.position);
    if (distToNext < nextCp.radius) {
      this.currentCheckpoint = nextCpIndex;

      if (this.currentCheckpoint === 0) {
        this.lapTimes.push(this.currentLapTime);
        if (!this.bestLapTime || this.currentLapTime < this.bestLapTime) {
          this.bestLapTime = this.currentLapTime;
        }
        this.currentLapTime = 0;

        if (this.lap >= 3) {
          this.isFinished = true;
        } else {
          this.lap += 1;
        }
      }
    }

    // Monotonic distance calculation
    const currCp = track.checkpoints[this.currentCheckpoint];
    const segmentLen = currCp.position.distanceTo(nextCp.position) || 1;
    const segProgress = Math.max(0, Math.min(1, 1 - (distToNext / segmentLen)));

    this.totalDistance = (this.lap - 1) * cpCount + this.currentCheckpoint + segProgress;
  }

  respawn(track) {
    if (!track || !track.spline) return;
    const closest = track.getClosestPointAndT(this.position);
    const respawnTransform = track.getRespawnTransform(closest.t);

    this.position.copy(respawnTransform.position);
    this.rotationY = respawnTransform.rotationY;
    this.speed = 0;
    this.velocity.set(0, 0, 0);
    this.boostTimer = 0;
    this.isDrifting = false;
  }

  getSpeedKmh() {
    return Math.max(0, Math.round(Math.abs(this.speed) * 3.6));
  }
}
