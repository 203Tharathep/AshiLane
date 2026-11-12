import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Path to imageio-ffmpeg binary
const ffmpegExe = 'C:\\Users\\admin\\AppData\\Local\\Programs\\Python\\Python312\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v9.0.2.exe';

const PORT = 4592;
const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const TOTAL_FRAMES = 300; // Exactly 10.0 seconds

// 1. Static file server for dist/
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  let filePath = path.join(projectRoot, 'dist', reqPath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(projectRoot, 'dist', 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  const mimes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.mov': 'video/quicktime'
  };
  res.writeHead(200, { 'Content-Type': mimes[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}...`);

  try {
    const browser = await puppeteer.launch({
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: 'new',
      args: [
        '--no-sandbox',
        '--enable-webgl',
        '--use-gl=angle',
        '--use-angle=d3d11',
        `--window-size=${WIDTH},${HEIGHT}`
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT });
    await page.goto(`http://localhost:${PORT}`);
    await new Promise(r => setTimeout(r, 1500));

    // Prepare game instance & inject Cinematic Overlay
    await page.evaluate(() => {
      // Take control of rendering loop
      if (window.game) {
        window.game.animate = () => {};
        if (window.game.hud) {
          window.game.hud.playCountdown = () => {};
        }
      }

      // Hide all standard overlays
      document.getElementById('hud')?.classList.add('hidden');
      document.getElementById('touch-controls')?.remove();
      document.getElementById('landscape-prompt')?.remove();
      document.getElementById('countdown-overlay')?.remove();
      document.getElementById('countdown-text')?.remove();
      document.getElementById('hud-finish-countdown')?.remove();
      document.querySelectorAll('.ui-view').forEach(v => v.classList.add('hidden'));

      // Inject Cinematic Trailer Overlay
      const overlay = document.createElement('div');
      overlay.id = 'cinematic-trailer-overlay';
      overlay.innerHTML = `
        <style>
          #cinematic-trailer-overlay {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 99999;
            font-family: 'Orbitron', 'Kanit', sans-serif;
            overflow: hidden;
          }
          /* Letterbox black bars */
          .trailer-bar-top {
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 48px;
            background: #020408;
            border-bottom: 2px solid rgba(0, 243, 255, 0.4);
            box-shadow: 0 4px 20px rgba(0,0,0,0.8);
          }
          .trailer-bar-bottom {
            position: absolute;
            bottom: 0; left: 0; right: 0;
            height: 48px;
            background: #020408;
            border-top: 2px solid rgba(255, 0, 119, 0.4);
            box-shadow: 0 -4px 20px rgba(0,0,0,0.8);
          }
          /* Live Teaser Banners */
          .trailer-tag-pill {
            position: absolute;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(10, 14, 28, 0.88);
            border: 1px solid #00f3ff;
            color: #00f3ff;
            font-size: 14px;
            font-weight: 800;
            letter-spacing: 3px;
            padding: 6px 22px;
            border-radius: 20px;
            text-transform: uppercase;
            box-shadow: 0 0 20px rgba(0, 243, 255, 0.5);
            white-space: nowrap;
          }
          .trailer-headline {
            position: absolute;
            bottom: 60px;
            left: 50%;
            transform: translateX(-50%);
            text-align: center;
            width: 90%;
            text-shadow: 0 0 20px rgba(0,0,0,0.9), 0 2px 4px #000;
          }
          .trailer-headline-title {
            font-size: 32px;
            font-weight: 900;
            color: #ffffff;
            letter-spacing: 2px;
            text-transform: uppercase;
          }
          .trailer-headline-sub {
            font-family: 'Kanit', sans-serif;
            font-size: 19px;
            font-weight: 700;
            color: #ffd700;
            margin-top: 4px;
            text-shadow: 0 0 12px rgba(255, 215, 0, 0.6);
          }
          /* Speedometer HUD badge */
          .trailer-speed-badge {
            position: absolute;
            bottom: 60px;
            right: 40px;
            background: rgba(10, 14, 28, 0.88);
            border: 2px solid #00ff88;
            border-radius: 12px;
            padding: 6px 16px;
            text-align: center;
            box-shadow: 0 0 20px rgba(0, 255, 136, 0.35);
          }
          .trailer-speed-val {
            font-size: 28px;
            font-weight: 900;
            color: #00ff88;
            line-height: 1;
          }
          .trailer-speed-unit {
            font-size: 11px;
            color: #a7f3d0;
            font-weight: 700;
          }
          /* Warp Nitro Speedlines */
          .nitro-speedlines {
            position: absolute;
            inset: 0;
            background: radial-gradient(ellipse at center, transparent 40%, rgba(0, 243, 255, 0.22) 100%);
            opacity: 0;
            transition: opacity 0.2s ease;
          }
          /* Final Master Title Screen */
          .trailer-final-card {
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at center, rgba(14, 20, 38, 0.96) 0%, rgba(4, 6, 12, 0.99) 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
          }
          .final-logo-main {
            font-size: 84px;
            font-weight: 900;
            letter-spacing: 6px;
            color: #00f3ff;
            text-shadow: 0 0 35px rgba(0, 243, 255, 0.8), 0 0 70px rgba(0, 243, 255, 0.4);
            line-height: 1;
          }
          .final-logo-main span {
            color: #ff0077;
            text-shadow: 0 0 35px rgba(255, 0, 119, 0.8);
          }
          .final-tagline {
            font-family: 'Kanit', sans-serif;
            font-size: 28px;
            font-weight: 700;
            color: #ffd700;
            margin-top: 10px;
            letter-spacing: 2px;
            text-shadow: 0 0 18px rgba(255, 215, 0, 0.6);
          }
          .final-desc {
            font-size: 15px;
            letter-spacing: 4px;
            color: #cbd5e1;
            margin-top: 6px;
            text-transform: uppercase;
          }
          .final-cta-btn {
            margin-top: 30px;
            background: linear-gradient(135deg, #00f3ff, #0072ff);
            color: #000;
            font-size: 18px;
            font-weight: 900;
            padding: 12px 38px;
            border-radius: 30px;
            letter-spacing: 2px;
            box-shadow: 0 0 30px rgba(0, 243, 255, 0.7);
          }
          .final-badges-row {
            margin-top: 16px;
            display: flex;
            gap: 20px;
            font-size: 13px;
            color: #94a3b8;
            font-weight: 600;
          }
        </style>
        <div class="nitro-speedlines" id="t-speedlines"></div>
        <div class="trailer-bar-top"></div>
        <div class="trailer-bar-bottom"></div>
        <div class="trailer-tag-pill" id="t-tag">★ ASHILANE 3D ★</div>
        <div class="trailer-headline" id="t-headline">
          <div class="trailer-headline-title" id="t-title">THE ULTIMATE MEME DRIFT SIMULATOR</div>
          <div class="trailer-headline-sub" id="t-sub">360° GARAGE & 41+ ASHI SKINS</div>
        </div>
        <div class="trailer-speed-badge" id="t-speed" style="display:none;">
          <div class="trailer-speed-val" id="t-speed-val">0</div>
          <div class="trailer-speed-unit">KM/H</div>
        </div>
        <div class="trailer-final-card" id="t-final">
          <div class="final-logo-main">ASHI<span>LANE</span></div>
          <div class="final-tagline">ซิ่งทะลุมิติกับอาชิ 3D</div>
          <div class="final-desc">THE ULTIMATE MEME DRIFT SIMULATOR</div>
          <div class="final-cta-btn">🏁 PLAY FREE ON WEB & MOBILE 🏁</div>
          <div class="final-badges-row">
            <span>✨ 41+ MEME SKINS</span>
            <span>⚡ REAL-TIME MULTIPLAYER</span>
            <span>📱 BROWSER & MOBILE READY</span>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    });

    console.log(`Starting FFmpeg video pipe (${WIDTH}x${HEIGHT} @ ${FPS}fps)...`);
    const tempVideoPath = path.join(projectRoot, 'video', 'teaser_temp.mp4');

    const ffmpegProc = spawn(ffmpegExe, [
      '-y',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-r', `${FPS}`,
      '-i', '-',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-crf', '18',
      tempVideoPath
    ]);

    ffmpegProc.stderr.on('data', () => {}); // swallow logs

    // 2. Deterministic 300-Frame Choreography Loop
    for (let f = 0; f < TOTAL_FRAMES; f++) {
      const progress = f / TOTAL_FRAMES;
      const sec = f / FPS;

      await page.evaluate((frameIdx, totalFrames, s) => {
        const game = window.game;
        const tag = document.getElementById('t-tag');
        const title = document.getElementById('t-title');
        const sub = document.getElementById('t-sub');
        const speedPill = document.getElementById('t-speed');
        const speedVal = document.getElementById('t-speed-val');
        const speedlines = document.getElementById('t-speedlines');
        const finalCard = document.getElementById('t-final');

        // Always remove intrusive game overlays
        document.getElementById('hud')?.classList.add('hidden');
        document.getElementById('countdown-overlay')?.remove();
        document.getElementById('countdown-text')?.remove();
        document.getElementById('hud-finish-countdown')?.remove();
        document.querySelectorAll('.ui-view').forEach(v => v.classList.add('hidden'));

        // ============================================================
        // ACT 1: Frames 0 - 65 (0.0s - 2.16s) - 360° GARAGE SHOWCASE
        // ============================================================
        if (frameIdx <= 65) {
          if (frameIdx === 0) {
            game.enterGaragePreview('gt', 'Gemini_Generated_Image_4g9dic4g9dic4g9d.jpg', '#00f3ff');
            game.state = 'TRAILER';
          }
          tag.textContent = '★ 360° GARAGE SHOWCASE ★';
          title.textContent = 'THE ULTIMATE MEME DRIFT SIMULATOR';
          sub.textContent = 'สกินมีมอาชิระดับตำนานกว่า 41 แบบ & แต่งรถอิสระ';
          speedPill.style.display = 'none';
          speedlines.style.opacity = '0';
          finalCard.style.opacity = '0';

          const tNorm = frameIdx / 65;
          // Cinematic camera orbit around car
          const angle = 0.2 + tNorm * 1.8;
          const pitch = 0.16 + Math.sin(tNorm * Math.PI) * 0.14;
          const dist = 5.2 + Math.sin(tNorm * Math.PI) * 0.5;
          const cx = 0.0, cy = 0.65, cz = 0.0;
          const hDist = dist * Math.cos(pitch);

          game.camera.position.set(cx + Math.sin(angle) * hDist, cy + dist * Math.sin(pitch), cz + Math.cos(angle) * hDist);
          game.camera.lookAt(cx, cy, cz);
          game.camera.fov = 58;
          game.camera.updateProjectionMatrix();

          if (game.garageCarMesh && game.garageCarMesh.root) {
            game.garageCarMesh.root.position.set(cx, 0.25, cz);
          }
        }

        // ============================================================
        // ACT 2: Frames 66 - 150 (2.2s - 5.0s) - SUNSET BEACH SPEEDWAY DRIFT
        // ============================================================
        else if (frameIdx <= 150) {
          if (frameIdx === 66) {
            game.startSinglePlayer('gp', 'beach', 'normal', 3);
            game.finishGridIntro();
            game.countdownActive = false;
            game.isRacing = true;
            game.state = 'TRAILER';
            document.getElementById('hud')?.classList.add('hidden');
            document.getElementById('countdown-overlay')?.remove();
            document.querySelectorAll('.ui-view').forEach(v => v.classList.add('hidden'));
            document.querySelectorAll('.notification-box, .broadcast-lowerthird').forEach(v => v?.remove());
          }
          tag.textContent = '⚡ SUNSET BEACH SPEEDWAY ⚡';
          title.textContent = 'APEX DRIFT & HIGH-SPEED SLIPSTREAM';
          sub.textContent = 'ดริฟต์เข้าโค้งความเร็วสูง เบียดแซงชิงอันดับ 1';
          speedPill.style.display = 'block';
          speedlines.style.opacity = '0';

          const tNorm = (frameIdx - 66) / 84;
          const speed = Math.floor(215 + tNorm * 52);
          speedVal.textContent = speed;

          // Advance car on track along Turn 1 curve
          const carT = (0.09 + tNorm * 0.16) % 1.0;
          const tf = game.track.getRespawnTransform(carT, 0.2);
          const carYaw = tf.rotationY + 0.35; // Drift counter-steer angle!

          game.playerCar.position.set(tf.position.x, tf.position.y + 0.08, tf.position.z);
          game.playerCar.rotationY = carYaw;
          if (game.playerCar.model) {
            game.playerCar.model.position.copy(game.playerCar.position);
            game.playerCar.model.rotation.set(0, carYaw, 0);
          }
          game.playerCar.isDrifting = true;

          // AI rivals trailing
          if (game.aiCars && game.aiCars.length >= 2) {
            const ai1Tf = game.track.getRespawnTransform((carT - 0.022 + 1.0) % 1.0, 2.2);
            game.aiCars[0].position.set(ai1Tf.position.x, ai1Tf.position.y + 0.08, ai1Tf.position.z);
            game.aiCars[0].rotationY = ai1Tf.rotationY + 0.1;
            if (game.aiCars[0].model) {
              game.aiCars[0].model.position.copy(game.aiCars[0].position);
              game.aiCars[0].model.rotation.set(0, ai1Tf.rotationY + 0.1, 0);
            }

            const ai2Tf = game.track.getRespawnTransform((carT - 0.038 + 1.0) % 1.0, -2.0);
            game.aiCars[1].position.set(ai2Tf.position.x, ai2Tf.position.y + 0.08, ai2Tf.position.z);
            game.aiCars[1].rotationY = ai2Tf.rotationY;
            if (game.aiCars[1].model) {
              game.aiCars[1].model.position.copy(game.aiCars[1].position);
              game.aiCars[1].model.rotation.set(0, ai2Tf.rotationY, 0);
            }
          }

          // Dynamic chase camera showcasing the full drifting car + tire smoke + trailing rivals
          const chaseDist = 5.6;
          const chaseCamYaw = carYaw - 0.22; // Offset angle for three-quarter rear drift angle
          game.camera.position.set(
            game.playerCar.position.x - Math.sin(chaseCamYaw) * chaseDist,
            game.playerCar.position.y + 2.1,
            game.playerCar.position.z - Math.cos(chaseCamYaw) * chaseDist
          );
          game.camera.lookAt(game.playerCar.position.x, game.playerCar.position.y + 0.9, game.playerCar.position.z);
          game.camera.fov = 70;
          game.camera.updateProjectionMatrix();

          // Spawn drift smoke
          if (game.particles && game.particles.emitTireSmoke) {
            game.particles.emitTireSmoke(game.playerCar.position);
          }
        }

        // ============================================================
        // ACT 3: Frames 151 - 235 (5.03s - 7.83s) - BURIRAM NIGHT GP NITRO
        // ============================================================
        else if (frameIdx <= 235) {
          if (frameIdx === 151) {
            game.startSinglePlayer('gp', 'buriram', 'normal', 3);
            game.finishGridIntro();
            game.countdownActive = false;
            game.isRacing = true;
            game.state = 'TRAILER';
            document.getElementById('hud')?.classList.add('hidden');
            document.getElementById('countdown-overlay')?.remove();
            document.querySelectorAll('.ui-view').forEach(v => v.classList.add('hidden'));
            document.querySelectorAll('.notification-box, .broadcast-lowerthird').forEach(v => v?.remove());
            game.playerCar.boostTimer = 5.0;
          }
          tag.textContent = '🚀 BURIRAM NIGHT GP 🚀';
          title.textContent = '⚡ NITRO OVERDRIVE ENGAGED ⚡';
          sub.textContent = 'สนามกลางคืนแสงนีออน อุโมงค์ไฟ & สปีดทะลุ 280+ KM/H';
          speedPill.style.display = 'block';
          speedlines.style.opacity = '0.9';

          const tNorm = (frameIdx - 151) / 84;
          const speed = Math.floor(255 + tNorm * 34);
          speedVal.textContent = speed;

          // Rocketing down Buriram main straight through the neon tunnel
          const carT = (0.42 + tNorm * 0.22) % 1.0;
          const tf = game.track.getRespawnTransform(carT, 0);
          const carYaw = tf.rotationY;

          game.playerCar.position.set(tf.position.x, tf.position.y + 0.08, tf.position.z);
          game.playerCar.rotationY = carYaw;
          if (game.playerCar.model) {
            game.playerCar.model.position.copy(game.playerCar.position);
            game.playerCar.model.rotation.set(0, carYaw, 0);
          }

          // Hyperspace FOV expansion (65 -> 86)
          game.camera.fov = 65 + tNorm * 21;
          game.camera.updateProjectionMatrix();

          // Intense close front hood / low chase camera
          const chaseOffsetDist = 5.0;
          game.camera.position.set(
            game.playerCar.position.x - Math.sin(carYaw) * chaseOffsetDist,
            game.playerCar.position.y + 1.9,
            game.playerCar.position.z - Math.cos(carYaw) * chaseOffsetDist
          );
          game.camera.lookAt(game.playerCar.position.x, game.playerCar.position.y + 0.9, game.playerCar.position.z);

          // Nitro exhaust flame
          if (game.particles && game.particles.emitExhaustFlame) {
            game.particles.emitExhaustFlame(game.playerCar.exhaustPipes, true);
          }
        }

        // ============================================================
        // ACT 4: Frames 236 - 265 (7.86s - 8.83s) - FINISH LINE VICTORY
        // ============================================================
        else if (frameIdx <= 265) {
          tag.textContent = '🏆 1ST PLACE CHAMPION 🏆';
          title.textContent = '🏁 เข้าเส้นชัยคว้าแชมป์อันดับ 1! 🏁';
          sub.textContent = 'ASHILANE GRAND PRIX WINNER';
          speedPill.style.display = 'none';
          speedlines.style.opacity = '0';
          finalCard.style.opacity = '0';

          const tNorm = (frameIdx - 236) / 29;
          // Car crossing finish line
          const carT = (0.98 + tNorm * 0.06) % 1.0;
          const tf = game.track.getRespawnTransform(carT, 0);
          const carYaw = tf.rotationY;

          game.playerCar.position.set(tf.position.x, tf.position.y + 0.08, tf.position.z);
          game.playerCar.rotationY = carYaw;
          if (game.playerCar.model) {
            game.playerCar.model.position.copy(game.playerCar.position);
            game.playerCar.model.rotation.set(0, carYaw, 0);
          }

          // Celebratory slow-mo orbit cam around car crossing finish line
          const orbitAngle = carYaw + Math.PI * 0.4 + tNorm * 0.8;
          game.camera.position.set(
            game.playerCar.position.x + Math.sin(orbitAngle) * 5.5,
            game.playerCar.position.y + 2.2,
            game.playerCar.position.z + Math.cos(orbitAngle) * 5.5
          );
          game.camera.lookAt(game.playerCar.position.x, game.playerCar.position.y + 0.8, game.playerCar.position.z);
          game.camera.fov = 62;
          game.camera.updateProjectionMatrix();

          // Celebration fireworks
          if (game.particles && game.particles.emitCelebrationFirework) {
            game.particles.emitCelebrationFirework(game.playerCar.position);
          }
        }

        // ============================================================
        // ACT 5: Frames 266 - 300 (8.86s - 10.0s) - GRAND TITLE DROP
        // ============================================================
        else {
          tag.style.display = 'none';
          document.getElementById('t-headline').style.display = 'none';
          speedPill.style.display = 'none';
          speedlines.style.opacity = '0';
          finalCard.style.opacity = '1';
        }

        // Update decorations & particles and render
        if (game.decorations && game.decorations.update) {
          game.decorations.update(0.033, game.camera);
        }
        if (game.particles && game.particles.update) {
          game.particles.update(0.033, game.camera);
        }
        if (game.renderer && game.scene && game.camera) {
          game.renderer.render(game.scene, game.camera);
        }
      }, f, TOTAL_FRAMES, sec);

      // Capture frame and pipe to FFmpeg
      const frameBuffer = await page.screenshot({ type: 'jpeg', quality: 90 });
      ffmpegProc.stdin.write(frameBuffer);

      if (f % 30 === 0 || f === TOTAL_FRAMES - 1) {
        console.log(`Rendered frame ${f + 1}/${TOTAL_FRAMES} (${((f + 1) / FPS).toFixed(1)}s / 10.0s)`);
      }
    }

    // End ffmpeg video stream
    ffmpegProc.stdin.end();

    await new Promise((resolve) => {
      ffmpegProc.on('close', resolve);
    });

    console.log(`Video stream finished -> ${tempVideoPath}`);
    await browser.close();

    // 3. Mux Video + Audio Soundtrack with FFmpeg
    console.log('Muxing video with soundtrack...');
    const audioPath = path.join(projectRoot, 'video', 'teaser_soundtrack.wav');
    const finalVideoPath = path.join(projectRoot, 'video', 'AshiLane_Teaser.mp4');
    const finalShortVideoPath = path.join(projectRoot, 'video', 'teaser.mp4');

    const muxArgs = [
      '-y',
      '-i', tempVideoPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      finalVideoPath
    ];

    const muxProc = spawn(ffmpegExe, muxArgs);
    muxProc.on('close', (code) => {
      console.log(`Mux completed with exit code: ${code}`);
      // Duplicate to teaser.mp4 for convenience
      fs.copyFileSync(finalVideoPath, finalShortVideoPath);
      console.log(`Final teaser created successfully at:`);
      console.log(` - ${finalVideoPath} (${fs.statSync(finalVideoPath).size} bytes)`);
      console.log(` - ${finalShortVideoPath} (${fs.statSync(finalShortVideoPath).size} bytes)`);

      // Clean up temporary files
      if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);

      server.close();
      process.exit(0);
    });

  } catch (err) {
    console.error('Render error:', err);
    server.close();
    process.exit(1);
  }
});
