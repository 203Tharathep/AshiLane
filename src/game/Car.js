import * as THREE from 'three';

export class Car {
  constructor(carConfig, skinFileName, bodyColor, isPlayer = true) {
    this.config = carConfig;
    this.physics = carConfig.physics || {};
    this.isPlayer = isPlayer;
    this.skinFileName = skinFileName;
    this.bodyColor = bodyColor;
    this.game = null;

    // Kinematics
    this.position = new THREE.Vector3(0, 0.35, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.speed = 0; // forward speed in m/s
    this.steeringAngle = 0;
    this.rotationY = 0;
    this.pitch = 0;
    this.roll = 0;

    // Fast track lookup cache
    this.sampleIndexHint = -1;

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
    this.spinTimer = 0;

    // Track Progress
    this.totalLaps = 3;
    this.lap = 1;
    this.currentCheckpoint = 0;
    this.hasPassedHalfway = false;
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
    this.underglowMat = null;

    // Inputs
    this.inputs = {
      throttle: 0,
      steer: 0,
      drift: false,
      boost: false,
      reset: false
    };

    this.wheelRotation = 0;
    this.lastBounceTime = 0;
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
    if (this.isFinished && this.speed > 8) {
      this.inputs.throttle = 0.25;
    }

    // Spinout handling from banana / missile hit
    if (this.spinTimer > 0) {
      this.spinTimer -= delta;
      this.isSpinning = true;
      this.rotationY += delta * 14;
      this.speed = Math.max(0, this.speed - delta * 25);
      this.velocity.set(0, 0, 0);
      if (this.spinTimer <= 0) {
        this.isSpinning = false;
      }
      this.updateVisuals(delta);
      this.updateTrackProgress(delta, track);
      return;
    }

    this.handleInputs(delta, track);
    this.updatePhysics(delta, track);
    this.updateVisuals(delta);
    this.updateTrackProgress(delta, track);
  }

  handleInputs(delta, track) {
    // Nitro Boost Trigger
    if (this.inputs.boost && this.nitroFuel > 12 && this.boostTimer <= 0) {
      this.boostTimer = 2.0;
      this.nitroFuel = Math.max(0, this.nitroFuel - 34);
      this.isNitroActive = true;
    }

    if (this.boostTimer > 0) {
      this.boostTimer -= delta;
      if (this.boostTimer <= 0) {
        this.isNitroActive = false;
      }
    } else {
      this.nitroFuel = Math.min(100, this.nitroFuel + delta * 6.5);
    }

    // Drift handling
    const isMovingForward = this.speed > 7;
    if (this.inputs.drift && isMovingForward && Math.abs(this.inputs.steer) > 0.08) {
      if (!this.isDrifting) {
        this.isDrifting = true;
        this.driftDirection = Math.sign(this.inputs.steer);
        this.driftTimer = 0;
      }
      this.driftTimer += delta;

      if (this.driftTimer > 2.0) {
        this.driftLevel = 3;
      } else if (this.driftTimer > 1.2) {
        this.driftLevel = 2;
      } else if (this.driftTimer > 0.55) {
        this.driftLevel = 1;
      } else {
        this.driftLevel = 0;
      }
    } else {
      if (this.isDrifting) {
        if (this.driftLevel > 0) {
          const miniTurboDurations = [0, 0.75, 1.3, 1.9];
          this.boostTimer = Math.max(this.boostTimer, miniTurboDurations[this.driftLevel]);
          this.nitroFuel = Math.min(100, this.nitroFuel + this.driftLevel * 14);
          if (this.game && this.game.audio) {
            this.game.audio.playBoostSound();
          }
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
    let maxSpeed = p.maxSpeed || 23;
    let accelRate = p.accelRate || 15;

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
        const brakeRate = p.brakeRate || 24;
        this.speed -= brakeRate * delta;
        if (this.speed < 0) this.speed = 0;
      } else {
        if (this.speed > -maxSpeed * 0.35) {
          this.speed -= accelRate * 0.5 * delta;
        }
      }
    } else {
      const friction = this.isDrifting ? 4.5 : 8.0;
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - friction * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + friction * delta);
      }
    }

    // Steering
    const targetSteer = this.inputs.steer;
    this.steeringAngle = THREE.MathUtils.lerp(this.steeringAngle, targetSteer, delta * 12);

    const speedRatio = Math.min(1, Math.abs(this.speed) / (maxSpeed * 0.45));
    const turnRate = p.turnRate || 2.8;
    let turnSpeed = turnRate * this.steeringAngle * speedRatio * Math.sign(this.speed || 1);

    if (this.isDrifting) {
      turnSpeed *= 1.38;
    }

    this.rotationY += turnSpeed * delta;

    // Forward Direction vector
    const forward = new THREE.Vector3(
      Math.sin(this.rotationY),
      0,
      Math.cos(this.rotationY)
    );

    let moveDir = forward.clone();
    if (this.isDrifting && Math.abs(this.speed) > 4) {
      const slideAngle = this.driftDirection * 0.36;
      moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), slideAngle);
    }

    this.velocity.copy(moveDir).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, delta);

    // Track barrier guiding & elastic rebound
    if (track) {
      const closest = track.getClosest(this.position, this.sampleIndexHint);
      this.sampleIndexHint = closest.index;

      const barrierLimit = track.maxAllowedLateral || (track.trackWidth / 2 - 0.9);
      const lateralDist = closest.lateral;

      if (Math.abs(lateralDist) > barrierLimit) {
        const wallSide = Math.sign(lateralDist);
        const penetration = Math.abs(lateralDist) - barrierLimit;

        // 1. Gently bounce car inward away from the barrier (no clipping, no wild rotation)
        const gentleBounce = penetration + 0.08;
        this.position.addScaledVector(closest.normal, -wallSide * gentleBounce);

        // 2. DO NOT override rotationY! Car heading stays under player control.

        // 3. Speed preservation / damping
        const forward = new THREE.Vector3(Math.sin(this.rotationY), 0, Math.cos(this.rotationY));
        const intoWall = forward.dot(closest.normal) * wallSide;
        if (intoWall > 0.6) {
          // Driving hard face-first into wall
          this.speed = Math.max(0, this.speed * 0.92);
        } else {
          // Normal glancing collision: slide along smoothly
          this.speed = Math.max(0, this.speed * 0.99);
        }

        // 4. Audio & sparks
        if (this.game) {
          const now = performance.now();
          if (this.game.audio && (!this.lastBounceTime || now - this.lastBounceTime > 300)) {
            this.lastBounceTime = now;
            this.game.audio.playCollision();
          }
          if (this.game.particles && Math.abs(this.speed) > 5) {
            const sparkPos = this.position.clone().addScaledVector(closest.normal, wallSide * 0.6);
            this.game.particles.emitDriftSparks(sparkPos, 1);
          }
        }
      }

      // Ground plane clamping
      const targetY = closest.point.y + 0.35;
      this.position.y = THREE.MathUtils.lerp(this.position.y, targetY, delta * 16);

      // Boost pads check
      if (track.boostPads && track.boostPads.length > 0) {
        for (let i = 0; i < track.boostPads.length; i++) {
          const pad = track.boostPads[i];
          if (this.position.distanceTo(pad.position) < pad.radius && this.boostTimer < 2.0) {
            this.boostTimer = 2.6;
            this.speed = Math.max(this.speed, (p.maxSpeed || 23) * 1.35);
            this.nitroFuel = Math.min(100, this.nitroFuel + 25);
            if (this.isPlayer && this.game && this.game.audio) {
              this.game.audio.playBoostSound();
              if (this.game.hud) this.game.hud.showReaction('🚀 บูสต์เร่งความเร็ว!', 1200);
            }
            break;
          }
        }
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
        if (w && w.children.length >= 2) {
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
    if (!track || this.isFinished) return;

    this.currentLapTime += delta;

    const closest = track.getClosest(this.position, this.sampleIndexHint);
    this.sampleIndexHint = closest.index;
    const t = closest.t;

    // Track halfway point to ensure forward lap completion
    if (t > 0.4 && t < 0.6) {
      this.hasPassedHalfway = true;
    }

    // Finish line cross check (wrapping from > 0.85 to < 0.15)
    if (this.hasPassedHalfway && t < 0.15) {
      this.hasPassedHalfway = false;
      this.lapTimes.push(this.currentLapTime);
      if (!this.bestLapTime || this.currentLapTime < this.bestLapTime) {
        this.bestLapTime = this.currentLapTime;
      }
      this.currentLapTime = 0;

      const maxLaps = this.totalLaps || 3;
      if (this.lap >= maxLaps) {
        this.isFinished = true;
      } else {
        this.lap += 1;
        if (this.isPlayer && this.game && this.game.hud) {
          this.game.hud.showNotification(`รอบที่ ${this.lap} / ${maxLaps}!`);
        }
      }
    }

    // Monotonic continuous distance calculation
    this.totalDistance = (this.lap - 1) + t;
  }

  respawn(track) {
    if (!track) return;
    const closest = track.getClosest(this.position, this.sampleIndexHint);
    const respawnTransform = track.getRespawnTransform(closest.t);

    this.position.copy(respawnTransform.position);
    this.rotationY = respawnTransform.rotationY;
    this.speed = 0;
    this.velocity.set(0, 0, 0);
    this.boostTimer = 0;
    this.isDrifting = false;
    this.isSpinning = false;
    this.spinTimer = 0;
    this.sampleIndexHint = respawnTransform.index;
  }

  getSpeedKmh() {
    return Math.max(0, Math.round(Math.abs(this.speed) * 3.6));
  }
}
