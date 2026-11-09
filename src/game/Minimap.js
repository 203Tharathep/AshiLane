export class Minimap {
  constructor(canvasElement, spline) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.spline = spline;
    this.width = this.canvas.width;
    this.height = this.canvas.height;

    this.bounds = this.computeBounds();
  }

  computeBounds() {
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i <= 200; i++) {
      const pt = this.spline.getPointAt(i / 200);
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minZ = Math.min(minZ, pt.z);
      maxZ = Math.max(maxZ, pt.z);
    }

    const padding = 25;
    const rangeX = (maxX - minX) + padding * 2;
    const rangeZ = (maxZ - minZ) + padding * 2;
    const maxRange = Math.max(rangeX, rangeZ);
    const midX = (minX + maxX) / 2;
    const midZ = (minZ + maxZ) / 2;

    return {
      minX, maxX, minZ, maxZ,
      midX, midZ,
      maxRange
    };
  }

  worldToMap(worldX, worldZ) {
    const usableSize = this.width - 24;
    // Normalized 0 to 1 with 1:1 aspect ratio centered
    const normX = (worldX - (this.bounds.midX - this.bounds.maxRange / 2)) / this.bounds.maxRange;
    // Invert Z so forward on home straight (+Z) points UP on the minimap
    const normZ = ((this.bounds.midZ + this.bounds.maxRange / 2) - worldZ) / this.bounds.maxRange;

    return {
      x: normX * usableSize + 12,
      y: normZ * usableSize + 12
    };
  }

  render(playerCar, otherCars = []) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Track path background glow
    ctx.strokeStyle = '#1a2238';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.drawPath(ctx);

    // Track road outline
    ctx.strokeStyle = '#324060';
    ctx.lineWidth = 7;
    this.drawPath(ctx);

    // Start / Finish marker
    const startPt = this.spline.getPointAt(0);
    const startMap = this.worldToMap(startPt.x, startPt.z);
    ctx.fillStyle = '#00f3ff';
    ctx.fillRect(startMap.x - 6, startMap.y - 2, 12, 4);

    // Render other racers (AI or Friends)
    otherCars.forEach((car) => {
      if (!car.position) return;
      const m = this.worldToMap(car.position.x, car.position.z);
      ctx.fillStyle = car.bodyColor || '#ffaa00';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Render Player with directional arrow
    if (playerCar && playerCar.position) {
      const pm = this.worldToMap(playerCar.position.x, playerCar.position.z);
      ctx.save();
      ctx.translate(pm.x, pm.y);

      // Pulse ring
      ctx.strokeStyle = '#00f0ff88';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.stroke();

      // Heading arrow: Inverted rotation so that rotationY = 0 points UP
      const angle = -playerCar.rotationY;
      ctx.rotate(angle);
      ctx.fillStyle = '#00f3ff';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  drawPath(ctx) {
    ctx.beginPath();
    const samples = 120;
    for (let i = 0; i <= samples; i++) {
      const pt = this.spline.getPointAt(i / samples);
      const m = this.worldToMap(pt.x, pt.z);
      if (i === 0) ctx.moveTo(m.x, m.y);
      else ctx.lineTo(m.x, m.y);
    }
    ctx.closePath();
    ctx.stroke();
  }
}
