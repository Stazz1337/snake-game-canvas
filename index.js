const CONFIG = {
  CANVAS_SIZE: 400,
  TILE_COUNT: 20,
  get TILE_SIZE() {
    return this.CANVAS_SIZE / this.TILE_COUNT;
  },
  get CELL_SIZE() {
    return this.TILE_SIZE - 2;
  },
  INITIAL_SPEED: 7,
  SPEED_LEVELS: [
    [0, 7],
    [2, 10],
    [4, 15],
    [7, 20],
  ],
  BG_LEVELS: [
    [0, 0],
    [4, 1],
    [7, 2],
  ],
  OBSTACLE_LEVELS: [
    [5, 1],
    [10, 2],
    [15, 3],
  ],
  INITIAL_HEAD: { x: 10, y: 10 },
  INITIAL_TAIL_LENGTH: 2,
  POWERUP_CHANCE: 0.2,
  POWERUP_MIN_SCORE: 3,
  POWERUP_FIELD_DURATION: 7000,
  POWERUP_EFFECT_DURATION: 5000,
  COLORS: {
    snakeHead: '#ff8c00',
    snakeBodyStart: '#006400',
    snakeBodyEnd: '#00b400',
    apple: '#e74c3c',
    score: '#ffffff',
    overlay: 'rgba(0, 0, 0, 0.7)',
    eyeWhite: '#ffffff',
    eyePupil: '#000000',
    obstacle: '#555555',
    obstacleBorder: '#333333',
  },
  STORAGE_KEY: 'snakeHighScore',
  STORAGE_MUTE_KEY: 'snakeMuted',
};

const POWERUP_TYPES = {
  slow: { color: '#3498db', label: 'S', name: 'Slow' },
  x2: { color: '#f1c40f', label: 'x2', name: 'x2' },
  shrink: { color: '#9b59b6', label: '-3', name: 'Shrink' },
};

class SnakePart {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}

class Game {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    this.images = [new Image(), new Image(), new Image()];
    this.images[0].src = './images/cat.jpg';
    this.images[1].src = './images/moon2.jpg';
    this.images[2].src = './images/moon.jpg';

    this.sounds = {
      eat: new Audio('./sounds/eat.mp3'),
      fail: new Audio('./sounds/fail.mp3'),
      bgm: new Audio('./sounds/md-ost.mp3'),
    };
    this.sounds.bgm.loop = true;
    this.sounds.bgm.volume = 0.3;
    this.bgmStarted = false;

    this.bgPatterns = [null, null, null];
    this.images.forEach((img, i) => {
      img.onload = () => {
        this.bgPatterns[i] = this.ctx.createPattern(img, 'repeat');
      };
    });

    this.highScore = this.loadHighScore();
    this.muted = this.loadMuted();
    this.applyMute();

    this.state = 'menu';
    this.animationFrameId = null;
    this.lastUpdateTime = 0;
    this.lastTimestamp = 0;

    // Touch detection
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Particles
    this.particles = [];

    // Screen shake
    this.shakeTime = 0;
    this.shakeIntensity = 0;
    this.shakeStart = 0;

    // Power-ups
    this.powerUp = null;
    this.activePowerUp = null;
    this.baseSpeed = CONFIG.INITIAL_SPEED;

    // Obstacles
    this.obstacles = [];

    this.init();
    this.bindKeyboard();
    this.bindTouchControls();
    this.bindSwipeControls();
    this.bindCanvasTap();
    this.bindMuteButton();
    this.loop(0);
  }

  init() {
    this.headX = CONFIG.INITIAL_HEAD.x;
    this.headY = CONFIG.INITIAL_HEAD.y;
    this.xVelocity = 0;
    this.yVelocity = 0;
    this.snakeParts = [];
    this.tailLength = CONFIG.INITIAL_TAIL_LENGTH;
    this.score = 0;
    this.speed = CONFIG.INITIAL_SPEED;
    this.baseSpeed = CONFIG.INITIAL_SPEED;
    this.appleX = 5;
    this.appleY = 5;
    this.particles = [];
    this.shakeTime = 0;
    this.powerUp = null;
    this.activePowerUp = null;
    this.obstacles = [];
  }

  start() {
    this.state = 'playing';
    this.lastUpdateTime = performance.now();
    this.sounds.bgm.play();
    this.bgmStarted = true;
  }

  pause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.sounds.bgm.pause();
    }
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.lastUpdateTime = performance.now();
      this.sounds.bgm.play();
    }
  }

  onGameOver() {
    this.state = 'gameOver';
    this.sounds.bgm.pause();
    this.sounds.fail.play();
    this.shakeTime = 500;
    this.shakeIntensity = 8;
    this.shakeStart = performance.now();
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.saveHighScore();
    }
  }

  restart() {
    this.sounds.bgm.currentTime = 0;
    this.init();
    this.start();
  }

  // --- Game Loop ---

  loop(timestamp) {
    this.animationFrameId = requestAnimationFrame((t) => this.loop(t));
    const dt = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    this.updateParticles(dt);
    this.render(timestamp);

    if (this.state !== 'playing') return;

    const elapsed = timestamp - this.lastUpdateTime;
    if (elapsed < 1000 / this.speed) return;

    this.lastUpdateTime = timestamp;
    this.update();
  }

  update() {
    if (this.xVelocity === 0 && this.yVelocity === 0) return;

    // Track tail BEFORE moving (current head becomes body)
    this.snakeParts.push(new SnakePart(this.headX, this.headY));
    if (this.snakeParts.length > this.tailLength) {
      this.snakeParts.shift();
    }

    this.moveSnake();

    if (
      this.checkWallCollision() ||
      this.checkSelfCollision() ||
      this.checkObstacleCollision()
    ) {
      this.onGameOver();
      return;
    }

    this.checkAppleCollision();
    this.checkPowerUpCollision();
    this.updatePowerUpTimers();
    this.updateSpeed();
  }

  render(timestamp) {
    const { ctx } = this;

    // Screen shake
    const shaking = this.shakeTime > 0;
    if (shaking) {
      const elapsed = performance.now() - this.shakeStart;
      const remaining = Math.max(0, this.shakeTime - elapsed);
      if (remaining <= 0) {
        this.shakeTime = 0;
      } else {
        const factor = remaining / this.shakeTime;
        const intensity = this.shakeIntensity * factor;
        const ox = (Math.random() - 0.5) * 2 * intensity;
        const oy = (Math.random() - 0.5) * 2 * intensity;
        ctx.save();
        ctx.translate(ox, oy);
      }
    }

    this.drawBackground();

    if (this.state === 'menu') {
      this.drawMenuScreen();
      if (shaking && this.shakeTime > 0) ctx.restore();
      return;
    }

    this.drawLighting();
    this.drawObstacles();
    this.drawApple();
    this.drawPowerUp();
    this.drawSnake();
    this.drawParticles();
    this.drawScore();

    if (this.state === 'paused') {
      this.drawPauseOverlay();
    }

    if (this.state === 'gameOver') {
      this.drawGameOverScreen();
    }

    if (shaking && this.shakeTime > 0) ctx.restore();
  }

  // --- Logic ---

  moveSnake() {
    this.headX += this.xVelocity;
    this.headY += this.yVelocity;
  }

  checkWallCollision() {
    return (
      this.headX < 0 ||
      this.headX >= CONFIG.TILE_COUNT ||
      this.headY < 0 ||
      this.headY >= CONFIG.TILE_COUNT
    );
  }

  checkSelfCollision() {
    for (let i = 0; i < this.snakeParts.length; i++) {
      const part = this.snakeParts[i];
      if (part.x === this.headX && part.y === this.headY) {
        return true;
      }
    }
    return false;
  }

  checkObstacleCollision() {
    for (const obs of this.obstacles) {
      if (obs.x === this.headX && obs.y === this.headY) {
        return true;
      }
    }
    return false;
  }

  checkAppleCollision() {
    if (this.appleX === this.headX && this.appleY === this.headY) {
      const ts = CONFIG.TILE_SIZE;
      const px = this.appleX * ts + ts / 2;
      const py = this.appleY * ts + ts / 2;
      this.spawnParticles(px, py, CONFIG.COLORS.apple, 12);

      const points = this.activePowerUp?.type === 'x2' ? 2 : 1;
      this.tailLength++;
      this.score += points;
      this.sounds.eat.currentTime = 0;
      this.sounds.eat.play();
      this.spawnApple();
      this.updateObstacles();
      this.trySpawnPowerUp();
    }
  }

  checkPowerUpCollision() {
    if (!this.powerUp) return;
    if (this.powerUp.x === this.headX && this.powerUp.y === this.headY) {
      const ts = CONFIG.TILE_SIZE;
      const px = this.powerUp.x * ts + ts / 2;
      const py = this.powerUp.y * ts + ts / 2;
      const info = POWERUP_TYPES[this.powerUp.type];
      this.spawnParticles(px, py, info.color, 10);

      if (this.powerUp.type === 'shrink') {
        this.tailLength = Math.max(2, this.tailLength - 3);
        while (this.snakeParts.length > this.tailLength) {
          this.snakeParts.shift();
        }
      } else {
        this.activePowerUp = {
          type: this.powerUp.type,
          endTime: performance.now() + CONFIG.POWERUP_EFFECT_DURATION,
        };
        if (this.powerUp.type === 'slow') {
          this.speed = Math.max(4, Math.floor(this.baseSpeed * 0.5));
        }
      }
      this.powerUp = null;
    }
  }

  updatePowerUpTimers() {
    if (this.powerUp) {
      if (performance.now() - this.powerUp.spawnTime > CONFIG.POWERUP_FIELD_DURATION) {
        this.powerUp = null;
      }
    }
    if (this.activePowerUp) {
      if (performance.now() > this.activePowerUp.endTime) {
        if (this.activePowerUp.type === 'slow') {
          this.speed = this.baseSpeed;
        }
        this.activePowerUp = null;
      }
    }
  }

  isOccupied(x, y) {
    if (this.headX === x && this.headY === y) return true;
    if (this.snakeParts.some((p) => p.x === x && p.y === y)) return true;
    if (this.appleX === x && this.appleY === y) return true;
    if (this.obstacles.some((o) => o.x === x && o.y === y)) return true;
    if (this.powerUp && this.powerUp.x === x && this.powerUp.y === y) return true;
    return false;
  }

  isOnSnake(x, y) {
    if (this.headX === x && this.headY === y) return true;
    return this.snakeParts.some((part) => part.x === x && part.y === y);
  }

  spawnApple() {
    let attempts = 0;
    do {
      this.appleX = Math.floor(Math.random() * CONFIG.TILE_COUNT);
      this.appleY = Math.floor(Math.random() * CONFIG.TILE_COUNT);
      attempts++;
    } while (this.isOccupied(this.appleX, this.appleY) && attempts < 400);
  }

  // --- Obstacles ---

  getTargetObstacleCount() {
    let count = 0;
    for (const [minScore, c] of CONFIG.OBSTACLE_LEVELS) {
      if (this.score >= minScore) count = c;
    }
    return count;
  }

  updateObstacles() {
    const target = this.getTargetObstacleCount();
    while (this.obstacles.length < target) {
      this.spawnObstacle();
    }
  }

  spawnObstacle() {
    let attempts = 0;
    let x, y;
    do {
      x = Math.floor(Math.random() * CONFIG.TILE_COUNT);
      y = Math.floor(Math.random() * CONFIG.TILE_COUNT);
      attempts++;
    } while (this.isOccupied(x, y) && attempts < 400);
    if (attempts < 400) {
      this.obstacles.push({ x, y });
    }
  }

  // --- Power-ups ---

  trySpawnPowerUp() {
    if (this.powerUp) return;
    if (this.score < CONFIG.POWERUP_MIN_SCORE) return;
    if (Math.random() > CONFIG.POWERUP_CHANCE) return;

    const types = Object.keys(POWERUP_TYPES);
    const type = types[Math.floor(Math.random() * types.length)];
    let x, y;
    let attempts = 0;
    do {
      x = Math.floor(Math.random() * CONFIG.TILE_COUNT);
      y = Math.floor(Math.random() * CONFIG.TILE_COUNT);
      attempts++;
    } while (this.isOccupied(x, y) && attempts < 400);

    if (attempts < 400) {
      this.powerUp = { x, y, type, spawnTime: performance.now() };
    }
  }

  updateSpeed() {
    for (const [minScore, speed] of CONFIG.SPEED_LEVELS) {
      if (this.score >= minScore) {
        this.baseSpeed = speed;
      }
    }
    if (!this.activePowerUp || this.activePowerUp.type !== 'slow') {
      this.speed = this.baseSpeed;
    }
  }

  // --- Particles ---

  spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 1 + Math.random() * 2.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        life: 400 + Math.random() * 200,
        age: 0,
        color,
        radius: 2 + Math.random() * 2,
      });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.alpha = 1 - p.age / p.life;
    }
  }

  drawParticles() {
    const { ctx } = this;
    for (const p of this.particles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- Drawing ---

  drawBackground() {
    const { ctx } = this;
    const size = CONFIG.CANVAS_SIZE;

    let bgIndex = 0;
    for (const [minScore, idx] of CONFIG.BG_LEVELS) {
      if (this.score >= minScore) {
        bgIndex = idx;
      }
    }

    const pattern = this.bgPatterns[bgIndex];
    if (pattern) {
      ctx.fillStyle = pattern;
    } else {
      ctx.fillStyle = '#1a1a2e';
    }
    ctx.fillRect(0, 0, size, size);

    // Subtle grid
    const ts = CONFIG.TILE_SIZE;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < CONFIG.TILE_COUNT; i++) {
      const pos = i * ts;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }

    // Vignette
    const vg = ctx.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, size, size);
  }

  drawLighting() {
    const { ctx } = this;
    const ts = CONFIG.TILE_SIZE;
    const hx = this.headX * ts + ts / 2;
    const hy = this.headY * ts + ts / 2;
    const radius = 120;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createRadialGradient(hx, hy, 0, hx, hy, radius);
    lg.addColorStop(0, 'rgba(255, 200, 100, 0.08)');
    lg.addColorStop(0.5, 'rgba(255, 180, 80, 0.03)');
    lg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, CONFIG.CANVAS_SIZE, CONFIG.CANVAS_SIZE);
    ctx.restore();
  }

  drawSnake() {
    const { ctx } = this;
    const ts = CONFIG.TILE_SIZE;
    const cs = CONFIG.CELL_SIZE;
    const len = this.snakeParts.length;

    // Shadows first (under everything)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    for (let i = 0; i < len; i++) {
      const part = this.snakeParts[i];
      const sx = part.x * ts + 3;
      const sy = part.y * ts + 4;
      ctx.beginPath();
      ctx.ellipse(sx + cs / 2, sy + cs / 2 + 2, cs / 2 - 1, cs / 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Head shadow
    const hsx = this.headX * ts + 3;
    const hsy = this.headY * ts + 4;
    ctx.beginPath();
    ctx.ellipse(hsx + cs / 2, hsy + cs / 2 + 2, cs / 2, cs / 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body segments with 3D gradient
    for (let i = 0; i < len; i++) {
      const part = this.snakeParts[i];
      const ratio = len > 1 ? i / (len - 1) : 0;
      const g = Math.floor(100 * (1 - ratio) + 180 * ratio);
      const x = part.x * ts + 1;
      const y = part.y * ts + 1;
      const cx = x + cs / 2;
      const cy = y + cs / 2;

      // Radial gradient for 3D volume
      const grad = ctx.createRadialGradient(cx - cs * 0.15, cy - cs * 0.15, 1, cx, cy, cs * 0.6);
      grad.addColorStop(0, `rgb(${Math.min(80, g)}, ${Math.min(255, g + 80)}, ${Math.min(80, g)})`);
      grad.addColorStop(1, `rgb(0, ${Math.max(40, g - 60)}, 0)`);
      ctx.fillStyle = grad;
      this.drawRoundedRect(x, y, cs, cs, 4);

      // Highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.ellipse(cx - cs * 0.1, cy - cs * 0.15, cs * 0.2, cs * 0.12, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Head with 3D gradient
    const hx = this.headX * ts + 1;
    const hy = this.headY * ts + 1;
    const hcx = hx + cs / 2;
    const hcy = hy + cs / 2;

    const headGrad = ctx.createRadialGradient(hcx - cs * 0.15, hcy - cs * 0.15, 1, hcx, hcy, cs * 0.6);
    headGrad.addColorStop(0, '#ffb840');
    headGrad.addColorStop(1, '#cc6600');
    ctx.fillStyle = headGrad;
    this.drawRoundedRect(hx, hy, cs, cs, 5);

    // Head glow
    ctx.save();
    ctx.shadowColor = '#ff8c00';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(255, 140, 0, 0.01)';
    this.drawRoundedRect(hx, hy, cs, cs, 5);
    ctx.restore();

    // Head highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.ellipse(hcx - cs * 0.1, hcy - cs * 0.15, cs * 0.22, cs * 0.13, -0.5, 0, Math.PI * 2);
    ctx.fill();

    this.drawEyes(hx, hy, cs);
  }

  drawEyes(hx, hy, size) {
    const { ctx } = this;
    const eyeRadius = size * 0.15;
    const pupilRadius = size * 0.08;
    let leftEye, rightEye;
    const cx = hx + size / 2;
    const cy = hy + size / 2;

    if (this.xVelocity === 1) {
      leftEye = { x: cx + size * 0.15, y: cy - size * 0.2 };
      rightEye = { x: cx + size * 0.15, y: cy + size * 0.2 };
    } else if (this.xVelocity === -1) {
      leftEye = { x: cx - size * 0.15, y: cy - size * 0.2 };
      rightEye = { x: cx - size * 0.15, y: cy + size * 0.2 };
    } else if (this.yVelocity === -1) {
      leftEye = { x: cx - size * 0.2, y: cy - size * 0.15 };
      rightEye = { x: cx + size * 0.2, y: cy - size * 0.15 };
    } else {
      leftEye = { x: cx - size * 0.2, y: cy + size * 0.15 };
      rightEye = { x: cx + size * 0.2, y: cy + size * 0.15 };
    }

    for (const eye of [leftEye, rightEye]) {
      ctx.fillStyle = CONFIG.COLORS.eyeWhite;
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, eyeRadius, 0, Math.PI * 2);
      ctx.fill();
      const px = eye.x + this.xVelocity * pupilRadius * 0.4;
      const py = eye.y + this.yVelocity * pupilRadius * 0.4;
      ctx.fillStyle = CONFIG.COLORS.eyePupil;
      ctx.beginPath();
      ctx.arc(px, py, pupilRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawApple() {
    const { ctx } = this;
    const ts = CONFIG.TILE_SIZE;
    const cs = CONFIG.CELL_SIZE;
    const x = this.appleX * ts + 1;
    const y = this.appleY * ts + 1;
    const acx = x + cs / 2;
    const acy = y + cs / 2;

    const pulse = Math.sin(performance.now() / 200) * 1.5;
    const radius = cs / 2 + pulse;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(acx + 1, acy + 4, radius * 0.8, radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // RTX light rays
    ctx.save();
    const rayAngle = performance.now() / 2000;
    const rayCount = 6;
    for (let i = 0; i < rayCount; i++) {
      const angle = rayAngle + (Math.PI * 2 * i) / rayCount;
      const rayLen = 30 + pulse * 3;
      const rg = ctx.createLinearGradient(acx, acy, acx + Math.cos(angle) * rayLen, acy + Math.sin(angle) * rayLen);
      rg.addColorStop(0, 'rgba(231, 76, 60, 0.3)');
      rg.addColorStop(1, 'rgba(231, 76, 60, 0)');
      ctx.strokeStyle = rg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(acx, acy);
      ctx.lineTo(acx + Math.cos(angle) * rayLen, acy + Math.sin(angle) * rayLen);
      ctx.stroke();
    }
    ctx.restore();

    // Glow
    ctx.save();
    ctx.shadowColor = CONFIG.COLORS.apple;
    ctx.shadowBlur = 18 + pulse * 3;

    // 3D apple with radial gradient
    const appleGrad = ctx.createRadialGradient(acx - radius * 0.25, acy - radius * 0.25, 1, acx, acy, radius);
    appleGrad.addColorStop(0, '#ff6b5b');
    appleGrad.addColorStop(0.7, '#e74c3c');
    appleGrad.addColorStop(1, '#a0220f');
    ctx.fillStyle = appleGrad;
    ctx.beginPath();
    ctx.arc(acx, acy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.ellipse(acx - radius * 0.2, acy - radius * 0.25, radius * 0.3, radius * 0.18, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // Leaf
    ctx.fillStyle = '#27ae60';
    ctx.beginPath();
    ctx.ellipse(acx + 2, y + 2, 4, 2, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPowerUp() {
    if (!this.powerUp) return;
    const { ctx } = this;
    const ts = CONFIG.TILE_SIZE;
    const cs = CONFIG.CELL_SIZE;
    const info = POWERUP_TYPES[this.powerUp.type];

    const cx = this.powerUp.x * ts + ts / 2;
    const cy = this.powerUp.y * ts + ts / 2;
    const half = cs / 2;

    // Blink effect — fade in/out
    const age = performance.now() - this.powerUp.spawnTime;
    const timeLeft = CONFIG.POWERUP_FIELD_DURATION - age;
    let alpha = 1;
    if (timeLeft < 2000) {
      alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(performance.now() / 100));
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    // Pulsating outer glow
    const glowPulse = Math.sin(performance.now() / 300) * 0.3 + 0.7;
    ctx.save();
    ctx.globalAlpha = alpha * glowPulse * 0.3;
    ctx.fillStyle = info.color;
    ctx.beginPath();
    ctx.arc(cx, cy, half + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Shadow
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + 4, half * 0.7, half * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = info.color;
    ctx.shadowBlur = 15;

    // Diamond shape with gradient
    const pgr = ctx.createRadialGradient(cx - half * 0.2, cy - half * 0.2, 1, cx, cy, half);
    pgr.addColorStop(0, '#ffffff');
    pgr.addColorStop(0.4, info.color);
    pgr.addColorStop(1, info.color);
    ctx.fillStyle = pgr;
    ctx.beginPath();
    ctx.moveTo(cx, cy - half);
    ctx.lineTo(cx + half, cy);
    ctx.lineTo(cx, cy + half);
    ctx.lineTo(cx - half, cy);
    ctx.closePath();
    ctx.fill();

    // Label
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(info.label, cx, cy);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    ctx.restore();
  }

  drawObstacles() {
    const { ctx } = this;
    const ts = CONFIG.TILE_SIZE;
    const cs = CONFIG.CELL_SIZE;

    for (const obs of this.obstacles) {
      const x = obs.x * ts + 1;
      const y = obs.y * ts + 1;
      const ocx = x + cs / 2;
      const ocy = y + cs / 2;

      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(ocx + 1, ocy + 4, cs / 2 - 1, cs / 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // 3D gradient
      const obsGrad = ctx.createRadialGradient(ocx - cs * 0.15, ocy - cs * 0.15, 1, ocx, ocy, cs * 0.6);
      obsGrad.addColorStop(0, '#777777');
      obsGrad.addColorStop(1, '#2a2a2a');
      ctx.fillStyle = obsGrad;
      this.drawRoundedRect(x, y, cs, cs, 3);

      // X mark
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.5)';
      ctx.lineWidth = 1.5;
      const margin = cs * 0.25;
      ctx.beginPath();
      ctx.moveTo(x + margin, y + margin);
      ctx.lineTo(x + cs - margin, y + cs - margin);
      ctx.moveTo(x + cs - margin, y + margin);
      ctx.lineTo(x + margin, y + cs - margin);
      ctx.stroke();

      // Highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.ellipse(ocx - cs * 0.1, ocy - cs * 0.15, cs * 0.18, cs * 0.1, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawScore() {
    const { ctx } = this;
    ctx.fillStyle = CONFIG.COLORS.score;
    ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Score: ${this.score}`, CONFIG.CANVAS_SIZE - 10, 20);

    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`Best: ${this.highScore}`, CONFIG.CANVAS_SIZE - 10, 36);

    // Active power-up indicator
    if (this.activePowerUp) {
      const info = POWERUP_TYPES[this.activePowerUp.type];
      const remaining = Math.max(0, this.activePowerUp.endTime - performance.now());
      const secs = (remaining / 1000).toFixed(1);

      ctx.fillStyle = info.color;
      ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`${info.name}: ${secs}s`, CONFIG.CANVAS_SIZE - 10, 52);
    }

    ctx.textAlign = 'left';
  }

  drawRoundedRect(x, y, w, h, r) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  // --- Screens ---

  drawOverlay() {
    const { ctx } = this;
    ctx.fillStyle = CONFIG.COLORS.overlay;
    ctx.fillRect(0, 0, CONFIG.CANVAS_SIZE, CONFIG.CANVAS_SIZE);
  }

  drawMenuScreen() {
    this.drawOverlay();
    const { ctx } = this;
    const cx = CONFIG.CANVAS_SIZE / 2;

    ctx.textAlign = 'center';

    ctx.fillStyle = CONFIG.COLORS.snakeHead;
    ctx.font = 'bold 42px Georgia, serif';
    ctx.fillText('Solid Snake', cx, 120);

    ctx.fillStyle = '#00b400';
    ctx.font = '50px serif';
    ctx.fillText('\u{1F40D}', cx, 185);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '15px "Segoe UI", Arial, sans-serif';
    const lines = this.isTouchDevice
      ? ['Swipe / buttons  \u2014  movement']
      : [
          '\u2190 \u2191 \u2193 \u2192  /  W A S D  \u2014  movement',
          'Space  \u2014  pause',
        ];
    lines.forEach((line, i) => {
      ctx.fillText(line, cx, 230 + i * 24);
    });

    ctx.fillStyle = CONFIG.COLORS.snakeHead;
    ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400);
    ctx.globalAlpha = 0.4 + 0.6 * pulse;
    const startText = this.isTouchDevice ? 'Tap to start' : 'Press any key to start';
    ctx.fillText(startText, cx, 330);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  drawPauseOverlay() {
    this.drawOverlay();
    const { ctx } = this;
    const cx = CONFIG.CANVAS_SIZE / 2;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px Georgia, serif';
    ctx.fillText('PAUSED', cx, CONFIG.CANVAS_SIZE / 2 - 10);

    ctx.font = '16px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const pauseText = this.isTouchDevice ? 'Tap to continue' : 'Press Space to continue';
    ctx.fillText(pauseText, cx, CONFIG.CANVAS_SIZE / 2 + 30);
    ctx.textAlign = 'left';
  }

  drawGameOverScreen() {
    this.drawOverlay();
    const { ctx } = this;
    const cx = CONFIG.CANVAS_SIZE / 2;

    ctx.textAlign = 'center';

    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 44px Georgia, serif';
    ctx.fillText('GAME OVER', cx, 140);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`Score: ${this.score}`, cx, 200);

    ctx.font = '18px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`Best: ${this.highScore}`, cx, 232);

    if (this.score >= this.highScore && this.score > 0) {
      ctx.fillStyle = CONFIG.COLORS.snakeHead;
      ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
      ctx.fillText('New Record!', cx, 264);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '16px "Segoe UI", Arial, sans-serif';
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400);
    ctx.globalAlpha = 0.4 + 0.6 * pulse;
    const restartText = this.isTouchDevice ? 'Tap to restart' : 'Press Enter to restart';
    ctx.fillText(restartText, cx, 320);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // --- Input ---

  bindKeyboard() {
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  handleKeyDown(event) {
    const key = event.key;

    if (this.state === 'menu') {
      this.start();
      return;
    }

    if (this.state === 'gameOver') {
      if (key === 'Enter') {
        this.restart();
      }
      return;
    }

    if (key === ' ') {
      event.preventDefault();
      if (this.state === 'playing') {
        this.pause();
      } else if (this.state === 'paused') {
        this.resume();
      }
      return;
    }

    if (this.state !== 'playing') return;

    this.applyDirection(key);
  }

  applyDirection(key) {
    switch (key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        if (this.yVelocity === 1) return;
        this.yVelocity = -1;
        this.xVelocity = 0;
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        if (this.yVelocity === -1) return;
        this.yVelocity = 1;
        this.xVelocity = 0;
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        if (this.xVelocity === 1) return;
        this.yVelocity = 0;
        this.xVelocity = -1;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        if (this.xVelocity === -1) return;
        this.yVelocity = 0;
        this.xVelocity = 1;
        break;
      default:
        return;
    }
    this.updateDirectionButtons();
  }

  setDirection(xv, yv) {
    if (xv === 1 && this.xVelocity === -1) return;
    if (xv === -1 && this.xVelocity === 1) return;
    if (yv === 1 && this.yVelocity === -1) return;
    if (yv === -1 && this.yVelocity === 1) return;
    this.xVelocity = xv;
    this.yVelocity = yv;
    this.updateDirectionButtons();
  }

  updateDirectionButtons() {
    const map = {
      '0,-1': 'keyboard_key_up',
      '0,1': 'keyboard_key_down',
      '-1,0': 'keyboard_key_left',
      '1,0': 'keyboard_key_right',
    };
    const activeId = map[`${this.xVelocity},${this.yVelocity}`];
    for (const id of Object.values(map)) {
      const btn = document.getElementById(id);
      if (btn) btn.classList.toggle('active-direction', id === activeId);
    }
  }

  bindCanvasTap() {
    this.canvas.addEventListener('click', () => {
      if (this.state === 'menu') this.start();
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'gameOver') this.restart();
    });
  }

  bindTouchControls() {
    const directions = {
      keyboard_key_up: { xv: 0, yv: -1 },
      keyboard_key_down: { xv: 0, yv: 1 },
      keyboard_key_left: { xv: -1, yv: 0 },
      keyboard_key_right: { xv: 1, yv: 0 },
    };

    for (const [id, dir] of Object.entries(directions)) {
      const btn = document.getElementById(id);
      if (!btn) continue;

      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (this.state === 'menu') {
          this.start();
          return;
        }
        if (this.state === 'gameOver') {
          this.restart();
          return;
        }
        if (this.state !== 'playing') return;
        this.setDirection(dir.xv, dir.yv);
      };

      btn.addEventListener('touchstart', handler);
      btn.addEventListener('click', handler);
    }
  }

  bindSwipeControls() {
    let startX = 0;
    let startY = 0;

    this.canvas.addEventListener(
      'touchstart',
      (e) => {
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
      },
      { passive: true }
    );

    this.canvas.addEventListener(
      'touchend',
      (e) => {
        const touch = e.changedTouches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        const minSwipe = 30;

        if (Math.abs(dx) < minSwipe && Math.abs(dy) < minSwipe) return;

        if (this.state === 'menu') {
          this.start();
          return;
        }
        if (this.state === 'gameOver') {
          this.restart();
          return;
        }
        if (this.state !== 'playing') return;

        if (Math.abs(dx) > Math.abs(dy)) {
          this.setDirection(dx > 0 ? 1 : -1, 0);
        } else {
          this.setDirection(0, dy > 0 ? 1 : -1);
        }
      },
      { passive: true }
    );
  }

  // --- Mute ---

  bindMuteButton() {
    const btn = document.getElementById('mute-btn');
    if (!btn) return;
    this.muteBtn = btn;
    this.updateMuteButton();

    btn.addEventListener('click', () => {
      this.muted = !this.muted;
      this.applyMute();
      this.saveMuted();
      this.updateMuteButton();
    });
  }

  applyMute() {
    if (this.muted) {
      this.sounds.bgm.volume = 0;
      this.sounds.eat.volume = 0;
      this.sounds.fail.volume = 0;
    } else {
      this.sounds.bgm.volume = 0.3;
      this.sounds.eat.volume = 1;
      this.sounds.fail.volume = 1;
    }
  }

  updateMuteButton() {
    if (!this.muteBtn) return;
    this.muteBtn.textContent = this.muted ? '\u{1F507}' : '\u{1F50A}';
  }

  loadMuted() {
    return localStorage.getItem(CONFIG.STORAGE_MUTE_KEY) === 'true';
  }

  saveMuted() {
    localStorage.setItem(CONFIG.STORAGE_MUTE_KEY, String(this.muted));
  }

  // --- Storage ---

  loadHighScore() {
    const val = localStorage.getItem(CONFIG.STORAGE_KEY);
    return val ? parseInt(val, 10) : 0;
  }

  saveHighScore() {
    localStorage.setItem(CONFIG.STORAGE_KEY, String(this.highScore));
  }
}

const game = new Game('game');
