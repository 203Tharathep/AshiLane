export class HUD {
  constructor() {
    this.container = document.getElementById('hud');
    this.speedText = document.getElementById('hud-speed');
    this.gearText = document.getElementById('hud-gear');
    this.nitroBar = document.getElementById('hud-nitro-bar');
    this.driftBar = document.getElementById('hud-drift-bar');
    this.lapText = document.getElementById('hud-lap');
    this.rankText = document.getElementById('hud-rank');
    this.timeText = document.getElementById('hud-time');
    this.bestText = document.getElementById('hud-best');
    this.stageText = document.getElementById('hud-stage-name');
    this.driverPortrait = document.getElementById('hud-driver-img');
    this.driverName = document.getElementById('hud-driver-name');
    this.reactionBubble = document.getElementById('hud-reaction-bubble');

    this.itemSlot = document.getElementById('hud-item-slot');
    this.itemIcon = document.getElementById('hud-item-icon');

    this.countdownOverlay = document.getElementById('countdown-overlay');
    this.countdownText = document.getElementById('countdown-text');

    this.notificationBox = document.getElementById('hud-notifications');
    this.momentumBadge = document.getElementById('hud-momentum-badge');

    // Finish 10s Countdown elements
    this.finishCountdownBanner = document.getElementById('hud-finish-countdown');
    this.finishTimerText = document.getElementById('hud-finish-timer');
    this.finishBarFill = document.getElementById('hud-finish-bar');
    this.finishTitleText = document.getElementById('hud-finish-title');
    this.finishSubText = document.getElementById('hud-finish-subtext');

    this.reactionTimeout = null;
  }

  show() {
    if (this.container) this.container.classList.remove('hidden');
  }

  hide() {
    if (this.container) this.container.classList.add('hidden');
  }

  setStage(stageName) {
    if (this.stageText) {
      this.stageText.textContent = stageName || '';
    }
  }

  setItem(itemType) {
    const touchItemBtn = document.getElementById('btn-touch-item');
    const touchItemIcon = document.getElementById('btn-touch-item-icon');

    if (!itemType) {
      if (this.itemSlot) this.itemSlot.classList.add('hidden');
      if (touchItemBtn) {
        touchItemBtn.classList.remove('has-item');
      }
      if (touchItemIcon) {
        touchItemIcon.textContent = 'ITEM';
      }
      return;
    }

    if (this.itemSlot) this.itemSlot.classList.remove('hidden');
    const icons = {
      boost: '⚡',
      banana: '🍌',
      missile: '🚀',
      shield: '🛡️'
    };
    const icon = icons[itemType] || '❓';
    if (this.itemIcon) this.itemIcon.textContent = icon;

    if (touchItemBtn) {
      touchItemBtn.classList.add('has-item');
    }
    if (touchItemIcon) {
      touchItemIcon.textContent = icon;
    }
  }

  update(playerCar, rank = 1, totalRacers = 1) {
    if (!playerCar) return;

    // Speed & Gear
    const kmh = playerCar.getSpeedKmh();
    if (this.speedText) this.speedText.textContent = kmh;

    let gear = '1';
    if (playerCar.speed < 0) gear = 'R';
    else if (kmh < 1) gear = 'N';
    else if (kmh < 48) gear = '1';
    else if (kmh < 95) gear = '2';
    else if (kmh < 140) gear = '3';
    else if (kmh < 185) gear = '4';
    else if (kmh < 230) gear = '5';
    else if (kmh < 270) gear = '6';
    else gear = '7';
    if (this.gearText) this.gearText.textContent = gear;

    // Momentum / Speed Feathering Badge
    if (this.momentumBadge) {
      if (playerCar.apexBonusTimer > 0) {
        this.momentumBadge.textContent = '⚡ APEX EXIT! สปีดพุ่ง!';
        this.momentumBadge.className = 'momentum-badge apex-active';
      } else if (playerCar.isFeathering) {
        this.momentumBadge.textContent = '🎯 เลี้ยงความเร็ว (CARVING)';
        this.momentumBadge.className = 'momentum-badge feathering-active';
      } else {
        this.momentumBadge.className = 'momentum-badge hidden';
      }
    }

    // Nitro Bar
    if (this.nitroBar) {
      this.nitroBar.style.width = `${playerCar.nitroFuel}%`;
      if (playerCar.boostTimer > 0) {
        this.nitroBar.classList.add('boosting');
      } else {
        this.nitroBar.classList.remove('boosting');
      }
    }

    // Drift Mini-Turbo Bar
    if (this.driftBar) {
      if (playerCar.isDrifting) {
        this.driftBar.parentElement.style.opacity = '1';
        const pct = Math.min(100, (playerCar.driftTimer / 2.0) * 100);
        this.driftBar.style.width = `${pct}%`;
        if (playerCar.driftLevel === 3) {
          this.driftBar.style.background = '#dd00ff';
        } else if (playerCar.driftLevel === 2) {
          this.driftBar.style.background = '#ff9900';
        } else if (playerCar.driftLevel === 1) {
          this.driftBar.style.background = '#00e5ff';
        } else {
          this.driftBar.style.background = '#ffffff';
        }
      } else {
        this.driftBar.parentElement.style.opacity = '0';
        this.driftBar.style.width = '0%';
      }
    }

    // Lap
    const maxLaps = playerCar.totalLaps || 3;
    if (this.lapText) {
      this.lapText.textContent = `LAP ${Math.min(maxLaps, playerCar.lap)} / ${maxLaps}`;
    }

    // Rank
    if (this.rankText) {
      const suffixes = ['th', 'st', 'nd', 'rd'];
      const suffix = (rank <= 3 && rank > 0) ? suffixes[rank] : 'th';
      this.rankText.innerHTML = `${rank}<span>${suffix}</span>`;
    }

    // Time
    if (this.timeText) {
      this.timeText.textContent = this.formatTime(playerCar.currentLapTime);
    }
    if (this.bestText && playerCar.bestLapTime) {
      this.bestText.textContent = `BEST: ${this.formatTime(playerCar.bestLapTime)}`;
    }
  }

  showReaction(text, duration = 2000) {
    if (!this.reactionBubble) return;
    this.reactionBubble.textContent = text;
    this.reactionBubble.classList.add('visible');

    if (this.reactionTimeout) clearTimeout(this.reactionTimeout);
    this.reactionTimeout = setTimeout(() => {
      this.reactionBubble.classList.remove('visible');
    }, duration);
  }

  showNotification(text, duration = 3000) {
    if (!this.notificationBox) return;
    const item = document.createElement('div');
    item.className = 'notif-item';
    item.textContent = text;
    this.notificationBox.appendChild(item);
    setTimeout(() => {
      item.remove();
    }, duration);
  }

  setDriverAvatar(skinFileName, driverName = 'Ashi') {
    if (this.driverPortrait && skinFileName) {
      this.driverPortrait.src = `/assets/ashi/${skinFileName}`;
    }
    if (this.driverName) {
      this.driverName.textContent = driverName;
    }
  }

  playCountdown(onStep, callback, delayMs = 0) {
    if (!this.countdownOverlay || !this.countdownText) {
      if (onStep) onStep('GO');
      if (callback) callback();
      return;
    }

    this.countdownOverlay.classList.remove('hidden');
    let count = 3;

    const tick = () => {
      if (count > 0) {
        this.countdownText.textContent = count;
        this.countdownText.className = 'countdown-num pulse';
        if (onStep) onStep(count);
        count--;
        setTimeout(tick, 900);
      } else if (count === 0) {
        this.countdownText.textContent = 'GO!';
        this.countdownText.className = 'countdown-num go pulse';
        if (onStep) onStep('GO');
        count--;
        if (callback) callback();
        setTimeout(() => {
          this.countdownOverlay.classList.add('hidden');
        }, 1000);
      }
    };

    if (delayMs > 12) {
      this.countdownText.textContent = 'READY';
      this.countdownText.className = 'countdown-num pulse';
      setTimeout(tick, Math.min(2000, delayMs));
    } else {
      tick();
    }
  }

  showFinishCountdown(winnerName, isPlayerWinner = false) {
    if (!this.finishCountdownBanner) {
      this.finishCountdownBanner = document.getElementById('hud-finish-countdown');
      this.finishTimerText = document.getElementById('hud-finish-timer');
      this.finishBarFill = document.getElementById('hud-finish-bar');
      this.finishTitleText = document.getElementById('hud-finish-title');
      this.finishSubText = document.getElementById('hud-finish-subtext');
    }
    if (!this.finishCountdownBanner) return;

    if (this.finishTitleText) {
      this.finishTitleText.innerHTML = isPlayerWinner
        ? '👑 <span>คุณเข้าเส้นชัยอันดับ 1!</span> 🏆'
        : `🏁 <span>${winnerName} เข้าเส้นชัยอันดับ 1!</span> 🏁`;
    }
    if (this.finishSubText) {
      this.finishSubText.textContent = isPlayerWinner
        ? 'กำลังรอรถคันอื่นเข้าเส้นชัยใน 10 วินาที...'
        : 'เร่งด่วน! คันที่ไม่ทันจะจัดอันดับตามระยะห่างจากเส้นชัย';
    }

    this.finishCountdownBanner.classList.remove('hidden', 'critical');
    this.updateFinishCountdown(10.0);
  }

  updateFinishCountdown(secondsLeft) {
    if (!this.finishCountdownBanner) {
      this.finishCountdownBanner = document.getElementById('hud-finish-countdown');
      this.finishTimerText = document.getElementById('hud-finish-timer');
      this.finishBarFill = document.getElementById('hud-finish-bar');
    }
    if (!this.finishCountdownBanner) return;

    const s = Math.max(0, secondsLeft);
    if (this.finishTimerText) {
      this.finishTimerText.innerHTML = `${s.toFixed(1)}<span>s</span>`;
    }
    if (this.finishBarFill) {
      const pct = (s / 10.0) * 100;
      this.finishBarFill.style.width = `${pct}%`;
    }
    if (s <= 3.0) {
      this.finishCountdownBanner.classList.add('critical');
    } else {
      this.finishCountdownBanner.classList.remove('critical');
    }
  }

  hideFinishCountdown() {
    if (!this.finishCountdownBanner) {
      this.finishCountdownBanner = document.getElementById('hud-finish-countdown');
    }
    if (this.finishCountdownBanner) {
      this.finishCountdownBanner.classList.add('hidden');
      this.finishCountdownBanner.classList.remove('critical');
    }
  }

  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }
}
