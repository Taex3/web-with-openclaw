"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });
ctx.imageSmoothingEnabled = false;

const W = canvas.width;
const H = canvas.height;
const HALF_H = H / 2;
const FOV = Math.PI / 3;
const RAY_COUNT = W;
const MAX_DEPTH = 24;
const TAU = Math.PI * 2;

const ui = {
  health: document.getElementById("health"),
  armor: document.getElementById("armor"),
  ammo: document.getElementById("ammo"),
  face: document.getElementById("face"),
  start: document.getElementById("startScreen"),
  pause: document.getElementById("pauseScreen"),
  gameOver: document.getElementById("gameOverScreen"),
  finalStats: document.getElementById("finalStats"),
  damageFlash: document.getElementById("damageFlash"),
  muzzleFlash: document.getElementById("muzzleFlash"),
  startButton: document.getElementById("startButton"),
  resumeButton: document.getElementById("resumeButton"),
  restartButton: document.getElementById("restartButton"),
  retryButton: document.getElementById("retryButton")
};

const keys = new Set();
const zBuffer = new Float32Array(RAY_COUNT);
const wallHits = new Float32Array(RAY_COUNT);
const wallSides = new Uint8Array(RAY_COUNT);
const soundHooks = {
  shoot: () => {},
  hit: () => {},
  pickup: () => {},
  hurt: () => {},
  enemyDown: () => {}
};

let state = "start";
let lastTime = performance.now();
let elapsed = 0;
let fps = 0;
let fpsTimer = 0;
let fpsFrames = 0;
let screenShake = 0;
let damageFlash = 0;
let muzzleFlash = 0;
let showMap = false;
let map;
let rooms;
let enemies;
let projectiles;
let pickups;
let particles;
let player;

const textures = createTextures();
resetGame();
requestAnimationFrame(loop);

ui.startButton.addEventListener("click", () => startGame(true));
ui.resumeButton.addEventListener("click", resumeGame);
ui.restartButton.addEventListener("click", () => startGame(true));
ui.retryButton.addEventListener("click", () => startGame(true));

canvas.addEventListener("click", () => {
  if (state === "running") {
    canvas.requestPointerLock?.();
    shoot();
  }
});

document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== canvas && state === "running") {
    pauseGame();
  }
});

document.addEventListener("mousemove", event => {
  if (state !== "running" || document.pointerLockElement !== canvas) return;
  player.angle = normAngle(player.angle + event.movementX * 0.0028);
});

document.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  keys.add(key);

  if (key === "m") showMap = !showMap;
  if (key === "escape" && state === "running") pauseGame();
  if (key === "enter" && state === "start") startGame(true);
});

document.addEventListener("keyup", event => {
  keys.delete(event.key.toLowerCase());
});

function startGame(reset) {
  if (reset) resetGame();
  state = "running";
  ui.start.classList.add("hidden");
  ui.pause.classList.add("hidden");
  ui.gameOver.classList.add("hidden");
  canvas.requestPointerLock?.();
}

function pauseGame() {
  if (state !== "running") return;
  state = "paused";
  ui.pause.classList.remove("hidden");
}

function resumeGame() {
  state = "running";
  ui.pause.classList.add("hidden");
  canvas.requestPointerLock?.();
}

function gameOver() {
  state = "gameover";
  document.exitPointerLock?.();
  ui.finalStats.textContent = `Survived ${elapsed.toFixed(1)} seconds · Kills ${player.kills}`;
  ui.gameOver.classList.remove("hidden");
}

function resetGame() {
  ({ map, rooms } = generateMap(31, 31));
  const spawn = centerOf(rooms[0]);
  player = {
    x: spawn.x,
    y: spawn.y,
    angle: 0,
    radius: 0.18,
    health: 100,
    armor: 50,
    ammo: 80,
    fireCooldown: 0,
    bob: 0,
    kills: 0,
    hurtTime: 0
  };

  enemies = [];
  projectiles = [];
  pickups = [];
  particles = [];
  elapsed = 0;
  screenShake = 0;
  damageFlash = 0;
  muzzleFlash = 0;

  for (let i = 2; i < rooms.length; i += 2) {
    const p = centerOf(rooms[i]);
    if (distance(p.x, p.y, player.x, player.y) > 6) spawnEnemy(p.x, p.y);
  }

  for (let i = 1; i < rooms.length; i++) {
    const p = randomPointInRoom(rooms[i]);
    pickups.push({
      x: p.x,
      y: p.y,
      type: Math.random() > 0.55 ? "ammo" : "health",
      phase: Math.random() * TAU
    });
  }

  updateHud();
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (state === "running") update(dt);
  render();

  requestAnimationFrame(loop);
}

function update(dt) {
  elapsed += dt;
  fpsTimer += dt;
  fpsFrames++;
  if (fpsTimer >= 0.5) {
    fps = Math.round(fpsFrames / fpsTimer);
    fpsTimer = 0;
    fpsFrames = 0;
  }

  updatePlayer(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updatePickups(dt);
  updateParticles(dt);

  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  player.hurtTime = Math.max(0, player.hurtTime - dt);
  screenShake = Math.max(0, screenShake - dt * 18);
  damageFlash = Math.max(0, damageFlash - dt * 2.8);
  muzzleFlash = Math.max(0, muzzleFlash - dt * 7);

  ui.damageFlash.style.opacity = damageFlash.toFixed(3);
  ui.muzzleFlash.style.opacity = muzzleFlash.toFixed(3);

  const targetCount = 8 + Math.floor(elapsed / 22);
  if (enemies.filter(e => e.alive).length < targetCount && Math.random() < dt * 0.45) {
    spawnEnemyAtFarRoom();
  }

  updateHud();
}

function updatePlayer(dt) {
  const sprint = keys.has("shift") ? 1.65 : 1;
  const speed = 3.2 * sprint;
  let forward = 0;
  let strafe = 0;

  if (keys.has("w")) forward += 1;
  if (keys.has("s")) forward -= 1;
  if (keys.has("a")) strafe -= 1;
  if (keys.has("d")) strafe += 1;
  if (keys.has("arrowleft")) player.angle = normAngle(player.angle - dt * 2.4);
  if (keys.has("arrowright")) player.angle = normAngle(player.angle + dt * 2.4);

  if (forward || strafe) {
    const len = Math.hypot(forward, strafe) || 1;
    forward /= len;
    strafe /= len;

    const sin = Math.sin(player.angle);
    const cos = Math.cos(player.angle);
    const dx = (cos * forward - sin * strafe) * speed * dt;
    const dy = (sin * forward + cos * strafe) * speed * dt;
    moveCircle(player, dx, dy);
    player.bob += dt * 11 * sprint;
  } else {
    player.bob += dt * 3;
  }
}

function updateEnemies(dt) {
  const difficulty = 1 + elapsed / 120;
  for (const enemy of enemies) {
    if (!enemy.alive) {
      enemy.death += dt;
      continue;
    }

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    const los = hasLineOfSight(enemy.x, enemy.y, player.x, player.y);

    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.anim += dt * 8;

    if (los) {
      enemy.angle = Math.atan2(dy, dx);
      if (dist > 1.45) {
        const speed = enemy.speed * difficulty;
        moveCircle(enemy, Math.cos(enemy.angle) * speed * dt, Math.sin(enemy.angle) * speed * dt);
      }

      if (dist < 10 && enemy.cooldown === 0) {
        enemyShoot(enemy);
        enemy.cooldown = Math.max(0.65, 1.65 - elapsed / 140) + Math.random() * 0.8;
      }
    } else {
      wanderToward(enemy, player.x, player.y, dt);
    }

    if (dist < 0.65) {
      damagePlayer(12 * dt);
    }
  }
}

function wanderToward(enemy, tx, ty, dt) {
  const direct = Math.atan2(ty - enemy.y, tx - enemy.x);
  const speed = enemy.speed * 0.65;
  const tries = [direct, direct + Math.PI / 2, direct - Math.PI / 2, direct + Math.PI];
  for (const angle of tries) {
    const ox = enemy.x;
    const oy = enemy.y;
    moveCircle(enemy, Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt);
    if (enemy.x !== ox || enemy.y !== oy) break;
  }
}

function updateProjectiles(dt) {
  for (const p of projectiles) {
    p.life -= dt;
    p.x += Math.cos(p.angle) * p.speed * dt;
    p.y += Math.sin(p.angle) * p.speed * dt;
    p.phase += dt * 18;

    if (isWall(p.x, p.y)) {
      p.life = 0;
      burst(p.x, p.y, "#ff7a20", 7);
    }

    if (p.owner === "enemy" && distance(p.x, p.y, player.x, player.y) < 0.34) {
      p.life = 0;
      damagePlayer(p.damage);
      burst(p.x, p.y, "#ff2e00", 10);
    }
  }

  projectiles = projectiles.filter(p => p.life > 0);
}

function updatePickups(dt) {
  for (const item of pickups) {
    item.phase += dt * 4;
    if (distance(item.x, item.y, player.x, player.y) < 0.55) {
      if (item.type === "health") player.health = Math.min(100, player.health + 28);
      if (item.type === "ammo") player.ammo = Math.min(160, player.ammo + 35);
      item.dead = true;
      soundHooks.pickup();
      burst(item.x, item.y, item.type === "health" ? "#36ff72" : "#55d8ff", 8);
    }
  }
  pickups = pickups.filter(item => !item.dead);
}

function updateParticles(dt) {
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vz -= dt * 2.8;
  }
  particles = particles.filter(p => p.life > 0);
}

function shoot() {
  if (player.fireCooldown > 0 || player.ammo <= 0 || state !== "running") return;
  player.fireCooldown = 0.13;
  player.ammo--;
  screenShake = 1;
  muzzleFlash = 1;
  soundHooks.shoot();

  const spread = (Math.random() - 0.5) * 0.035;
  const shotAngle = player.angle + spread;
  const maxRange = 13;
  const hit = raycast(player.x, player.y, shotAngle, maxRange);
  let bestEnemy = null;
  let bestDist = hit.distance;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > bestDist || dist > maxRange) continue;
    const angleTo = angleDiff(Math.atan2(dy, dx), shotAngle);
    const width = 0.23 + 0.1 / Math.max(dist, 0.2);
    if (Math.abs(angleTo) < width && hasLineOfSight(player.x, player.y, enemy.x, enemy.y)) {
      bestEnemy = enemy;
      bestDist = dist;
    }
  }

  if (bestEnemy) {
    bestEnemy.health -= 42;
    bestEnemy.flash = 0.12;
    burst(bestEnemy.x, bestEnemy.y, "#62dcff", 10);
    soundHooks.hit();
    if (bestEnemy.health <= 0) {
      bestEnemy.alive = false;
      bestEnemy.death = 0;
      player.kills++;
      soundHooks.enemyDown();
      if (Math.random() < 0.45) pickups.push({ x: bestEnemy.x, y: bestEnemy.y, type: "ammo", phase: 0 });
    }
  }
}

function enemyShoot(enemy) {
  projectiles.push({
    x: enemy.x + Math.cos(enemy.angle) * 0.32,
    y: enemy.y + Math.sin(enemy.angle) * 0.32,
    angle: enemy.angle,
    speed: 4.2 + elapsed / 90,
    damage: 12,
    owner: "enemy",
    life: 4,
    phase: 0
  });
}

function damagePlayer(amount) {
  if (state !== "running") return;
  const armorAbsorb = Math.min(player.armor, amount * 0.55);
  player.armor -= armorAbsorb;
  player.health -= amount - armorAbsorb;
  player.hurtTime = 0.35;
  damageFlash = Math.min(0.75, damageFlash + 0.32);
  screenShake = Math.max(screenShake, 0.8);
  soundHooks.hurt();

  if (player.health <= 0) {
    player.health = 0;
    gameOver();
  }
}

function render() {
  const shakeX = (Math.random() - 0.5) * screenShake * 4;
  const shakeY = (Math.random() - 0.5) * screenShake * 3;
  ctx.save();
  ctx.translate(shakeX | 0, shakeY | 0);

  renderWorld();
  renderSprites();
  renderWeapon();
  renderCrosshair();
  if (showMap) renderMiniMap();
  renderFps();

  ctx.restore();
}

function renderWorld() {
  const ceiling = ctx.createLinearGradient(0, 0, 0, HALF_H);
  ceiling.addColorStop(0, "#05070a");
  ceiling.addColorStop(0.65, "#161014");
  ceiling.addColorStop(1, "#29120f");
  ctx.fillStyle = ceiling;
  ctx.fillRect(0, 0, W, HALF_H);

  const floor = ctx.createLinearGradient(0, HALF_H, 0, H);
  floor.addColorStop(0, "#1a1514");
  floor.addColorStop(1, "#050505");
  ctx.fillStyle = floor;
  ctx.fillRect(0, HALF_H, W, HALF_H);

  drawFloorGrid();

  for (let x = 0; x < RAY_COUNT; x++) {
    const camera = x / RAY_COUNT - 0.5;
    const angle = player.angle + camera * FOV;
    const hit = raycast(player.x, player.y, angle, MAX_DEPTH);
    const corrected = Math.max(0.001, hit.distance * Math.cos(angle - player.angle));
    const wallHeight = Math.min(420, H / corrected);
    const top = Math.floor(HALF_H - wallHeight / 2);
    const texX = Math.floor(hit.textureX * textures.wall.width);
    const shade = Math.max(0.14, 1 - corrected / 13) * (hit.side ? 0.72 : 1);
    const fog = Math.min(1, corrected / MAX_DEPTH);

    zBuffer[x] = corrected;
    wallHits[x] = hit.tile;
    wallSides[x] = hit.side;

    drawTexturedColumn(x, top, wallHeight, texX, hit.tile, shade, fog);
  }
}

function drawFloorGrid() {
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "#75301f";
  for (let y = HALF_H + 4; y < H; y += 11) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y + (y - HALF_H) * 0.18);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawTexturedColumn(x, top, height, texX, tile, shade, fog) {
  const texture = tile === 2 ? textures.metal : textures.wall;
  const img = texture.data;
  const tw = texture.width;
  const th = texture.height;
  const y0 = Math.max(0, top);
  const y1 = Math.min(H, top + height);
  const step = th / height;
  let texY = (y0 - top) * step;

  for (let y = y0; y < y1; y++) {
    const color = img[(Math.floor(texY) * tw + texX) % img.length];
    const r = ((color >> 16) & 255) * shade;
    const g = ((color >> 8) & 255) * shade;
    const b = (color & 255) * shade;
    const fr = r * (1 - fog) + 12 * fog;
    const fg = g * (1 - fog) + 9 * fog;
    const fb = b * (1 - fog) + 12 * fog;
    ctx.fillStyle = `rgb(${fr | 0},${fg | 0},${fb | 0})`;
    ctx.fillRect(x, y, 1, 1);
    texY += step;
  }
}

function renderSprites() {
  const sprites = [];
  for (const p of pickups) sprites.push({ ...p, kind: "pickup", dist: distance(p.x, p.y, player.x, player.y) });
  for (const p of projectiles) sprites.push({ ...p, kind: "projectile", dist: distance(p.x, p.y, player.x, player.y) });
  for (const p of particles) sprites.push({ ...p, kind: "particle", dist: distance(p.x, p.y, player.x, player.y) });
  for (const e of enemies) sprites.push({ ...e, kind: "enemy", dist: distance(e.x, e.y, player.x, player.y) });
  sprites.sort((a, b) => b.dist - a.dist);

  for (const sprite of sprites) {
    const relX = sprite.x - player.x;
    const relY = sprite.y - player.y;
    const angleTo = angleDiff(Math.atan2(relY, relX), player.angle);
    if (Math.abs(angleTo) > FOV * 0.75 || sprite.dist < 0.08) continue;

    const screenX = W / 2 + Math.tan(angleTo) / Math.tan(FOV / 2) * W / 2;
    const size = Math.min(180, (H / sprite.dist) * (sprite.kind === "enemy" ? 0.78 : 0.36));
    const top = HALF_H - size * (sprite.kind === "enemy" ? 0.58 : 0.5);
    const left = screenX - size / 2;
    const right = screenX + size / 2;

    if (right < 0 || left > W) continue;
    if (!spriteVisible(sprite, left, right, sprite.dist)) continue;

    if (sprite.kind === "enemy") drawEnemy(sprite, left, top, size);
    if (sprite.kind === "pickup") drawPickup(sprite, left, top, size);
    if (sprite.kind === "projectile") drawProjectile(sprite, left, top, size);
    if (sprite.kind === "particle") drawParticle(sprite, left, top, size);
  }
}

function spriteVisible(sprite, left, right, dist) {
  const a = Math.max(0, Math.floor(left));
  const b = Math.min(W - 1, Math.ceil(right));
  for (let x = a; x <= b; x += 3) {
    if (dist < zBuffer[x] + 0.15) return true;
  }
  return false;
}

function drawEnemy(enemy, left, top, size) {
  const death = enemy.alive ? 0 : Math.min(1, enemy.death / 0.6);
  const squash = 1 - death * 0.7;
  const y = top + size * death * 0.55;
  const h = size * squash;
  const flash = enemy.flash > 0 ? "#eaffff" : "#a52018";

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(left + size * 0.18, y + h * 0.82, size * 0.64, size * 0.12);

  ctx.fillStyle = flash;
  pixelRect(left + size * 0.23, y + h * 0.18, size * 0.54, h * 0.5);
  ctx.fillStyle = "#5a1410";
  pixelRect(left + size * 0.15, y + h * 0.36, size * 0.18, h * 0.22);
  pixelRect(left + size * 0.67, y + h * 0.36, size * 0.18, h * 0.22);
  ctx.fillStyle = "#24100c";
  pixelRect(left + size * 0.33, y + h * 0.05, size * 0.34, h * 0.2);
  ctx.fillStyle = "#ffcf55";
  pixelRect(left + size * 0.37, y + h * 0.23, size * 0.1, h * 0.08);
  pixelRect(left + size * 0.53, y + h * 0.23, size * 0.1, h * 0.08);
  ctx.fillStyle = "#282828";
  pixelRect(left + size * 0.42, y + h * 0.68, size * 0.16, h * 0.22);
}

function drawPickup(item, left, top, size) {
  const bob = Math.sin(item.phase) * size * 0.08;
  ctx.fillStyle = item.type === "health" ? "#2dff73" : "#58d8ff";
  pixelRect(left + size * 0.18, top + bob + size * 0.28, size * 0.64, size * 0.44);
  ctx.fillStyle = item.type === "health" ? "#092915" : "#092032";
  if (item.type === "health") {
    pixelRect(left + size * 0.42, top + bob + size * 0.34, size * 0.16, size * 0.32);
    pixelRect(left + size * 0.31, top + bob + size * 0.45, size * 0.38, size * 0.12);
  } else {
    pixelRect(left + size * 0.28, top + bob + size * 0.38, size * 0.44, size * 0.1);
    pixelRect(left + size * 0.28, top + bob + size * 0.54, size * 0.44, size * 0.1);
  }
}

function drawProjectile(p, left, top, size) {
  const pulse = 1 + Math.sin(p.phase) * 0.2;
  const s = size * pulse;
  const x = left + (size - s) / 2;
  ctx.fillStyle = "#ffea63";
  pixelRect(x + s * 0.25, top + s * 0.25, s * 0.5, s * 0.5);
  ctx.fillStyle = "#ff3b10";
  pixelRect(x + s * 0.08, top + s * 0.38, s * 0.84, s * 0.24);
  ctx.fillStyle = "rgba(255,70,10,0.45)";
  ctx.fillRect(x - s * 0.2, top - s * 0.2, s * 1.4, s * 1.4);
}

function drawParticle(p, left, top, size) {
  ctx.globalAlpha = Math.max(0, p.life * 2);
  ctx.fillStyle = p.color;
  pixelRect(left + size * 0.35, top + size * (0.5 - p.z * 0.25), size * 0.3, size * 0.3);
  ctx.globalAlpha = 1;
}

function renderWeapon() {
  const bob = Math.sin(player.bob) * 4;
  const recoil = player.fireCooldown > 0 ? player.fireCooldown * 90 : 0;
  const cx = W / 2;
  const y = H - 4 + bob + recoil;

  ctx.fillStyle = "#05080c";
  pixelRect(cx - 52, y - 34, 104, 38);
  ctx.fillStyle = "#152635";
  pixelRect(cx - 42, y - 48, 84, 34);
  ctx.fillStyle = "#254e66";
  pixelRect(cx - 28, y - 62, 56, 34);
  ctx.fillStyle = "#8bedff";
  pixelRect(cx - 18, y - 70, 36, 26);
  ctx.fillStyle = "#1b96d1";
  pixelRect(cx - 12, y - 66, 24, 18);
  ctx.fillStyle = "#091219";
  pixelRect(cx - 9, y - 74, 18, 14);

  if (muzzleFlash > 0) {
    ctx.globalAlpha = muzzleFlash;
    ctx.fillStyle = "#d9fbff";
    pixelRect(cx - 18, y - 94, 36, 22);
    ctx.fillStyle = "#54ddff";
    pixelRect(cx - 30, y - 88, 60, 12);
    ctx.globalAlpha = 1;
  }
}

function renderCrosshair() {
  ctx.fillStyle = "rgba(180,240,255,0.75)";
  ctx.fillRect(W / 2 - 6, H / 2, 4, 1);
  ctx.fillRect(W / 2 + 3, H / 2, 4, 1);
  ctx.fillRect(W / 2, H / 2 - 6, 1, 4);
  ctx.fillRect(W / 2, H / 2 + 3, 1, 4);
}

function renderMiniMap() {
  const scale = 3;
  const ox = 8;
  const oy = 8;
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = "#050505";
  ctx.fillRect(ox - 3, oy - 3, map[0].length * scale + 6, map.length * scale + 6);
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (map[y][x]) {
        ctx.fillStyle = map[y][x] === 2 ? "#4b6068" : "#56211a";
        ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
    }
  }
  ctx.fillStyle = "#53d8ff";
  ctx.fillRect(ox + player.x * scale - 1, oy + player.y * scale - 1, 3, 3);
  ctx.strokeStyle = "#53d8ff";
  ctx.beginPath();
  ctx.moveTo(ox + player.x * scale, oy + player.y * scale);
  ctx.lineTo(ox + (player.x + Math.cos(player.angle) * 2) * scale, oy + (player.y + Math.sin(player.angle) * 2) * scale);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function renderFps() {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(W - 58, 6, 50, 16);
  ctx.fillStyle = "#b8f7ff";
  ctx.font = "8px Courier New";
  ctx.fillText(`${fps || 0} FPS`, W - 52, 17);
}

function raycast(originX, originY, angle, maxDistance) {
  // DDA raycasting walks the map grid one cell boundary at a time. This is
  // much faster than tiny fixed steps and gives us the exact wall side hit.
  const rayDirX = Math.cos(angle);
  const rayDirY = Math.sin(angle);
  let mapX = Math.floor(originX);
  let mapY = Math.floor(originY);

  const deltaDistX = Math.abs(1 / (rayDirX || 0.0001));
  const deltaDistY = Math.abs(1 / (rayDirY || 0.0001));
  const stepX = rayDirX < 0 ? -1 : 1;
  const stepY = rayDirY < 0 ? -1 : 1;
  let sideDistX = rayDirX < 0 ? (originX - mapX) * deltaDistX : (mapX + 1 - originX) * deltaDistX;
  let sideDistY = rayDirY < 0 ? (originY - mapY) * deltaDistY : (mapY + 1 - originY) * deltaDistY;
  let side = 0;
  let distanceTravelled = 0;

  while (distanceTravelled < maxDistance) {
    if (sideDistX < sideDistY) {
      distanceTravelled = sideDistX;
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      distanceTravelled = sideDistY;
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }

    if (mapY < 0 || mapY >= map.length || mapX < 0 || mapX >= map[0].length) break;
    if (map[mapY][mapX]) {
      const hitX = originX + rayDirX * distanceTravelled;
      const hitY = originY + rayDirY * distanceTravelled;
      const textureX = side === 0 ? hitY - Math.floor(hitY) : hitX - Math.floor(hitX);
      return {
        distance: distanceTravelled,
        textureX,
        side,
        tile: map[mapY][mapX],
        x: hitX,
        y: hitY
      };
    }
  }

  return { distance: maxDistance, textureX: 0, side: 0, tile: 1, x: originX, y: originY };
}

function createTextures() {
  return {
    wall: makeTexture((x, y) => {
      const brick = ((x >> 4) + (y >> 3)) % 2;
      const seam = x % 16 < 2 || y % 16 < 2;
      const heat = Math.sin((x + y) * 0.3) * 20;
      const r = seam ? 35 : 80 + brick * 25 + heat;
      const g = seam ? 20 : 28 + brick * 8;
      const b = seam ? 18 : 24 + brick * 6;
      return rgb(r, g, b);
    }),
    metal: makeTexture((x, y) => {
      const rib = x % 12 < 2 || y % 18 < 3;
      const bolt = (x % 24 > 18 && y % 24 > 18) ? 35 : 0;
      const v = rib ? 72 : 38 + bolt;
      return rgb(v * 0.75, v, v + 8);
    })
  };
}

function makeTexture(fn) {
  const width = 64;
  const height = 64;
  const data = new Uint32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = fn(x, y);
  }
  return { width, height, data };
}

function generateMap(width, height) {
  const generated = Array.from({ length: height }, () => Array(width).fill(1));
  const madeRooms = [];

  for (let i = 0; i < 13; i++) {
    const rw = randInt(4, 8);
    const rh = randInt(4, 8);
    const rx = randInt(1, width - rw - 2);
    const ry = randInt(1, height - rh - 2);
    const room = { x: rx, y: ry, w: rw, h: rh };
    if (madeRooms.some(r => rectsOverlap(room, r, 1))) continue;
    carveRoom(generated, room);
    if (madeRooms.length) connectRooms(generated, centerOf(madeRooms[madeRooms.length - 1]), centerOf(room));
    madeRooms.push(room);
  }

  if (madeRooms.length < 4) return generateMap(width, height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (generated[y][x] === 1 && Math.random() < 0.1) generated[y][x] = 2;
    }
  }

  return { map: generated, rooms: madeRooms };
}

function carveRoom(target, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) target[y][x] = 0;
  }
}

function connectRooms(target, a, b) {
  let x = Math.floor(a.x);
  let y = Math.floor(a.y);
  const tx = Math.floor(b.x);
  const ty = Math.floor(b.y);
  while (x !== tx) {
    target[y][x] = 0;
    x += x < tx ? 1 : -1;
  }
  while (y !== ty) {
    target[y][x] = 0;
    y += y < ty ? 1 : -1;
  }
  target[y][x] = 0;
}

function spawnEnemyAtFarRoom() {
  const candidates = rooms
    .map(room => centerOf(room))
    .filter(p => distance(p.x, p.y, player.x, player.y) > 8);
  if (!candidates.length) return;
  const p = candidates[randInt(0, candidates.length - 1)];
  spawnEnemy(p.x + rand(-0.8, 0.8), p.y + rand(-0.8, 0.8));
}

function spawnEnemy(x, y) {
  enemies.push({
    x,
    y,
    radius: 0.22,
    health: 100,
    speed: rand(1.0, 1.45),
    cooldown: rand(0.6, 2.2),
    angle: 0,
    alive: true,
    death: 0,
    anim: 0,
    flash: 0
  });
}

function moveCircle(entity, dx, dy) {
  const nx = entity.x + dx;
  const ny = entity.y + dy;
  const r = entity.radius || 0.18;
  if (!collides(nx, entity.y, r)) entity.x = nx;
  if (!collides(entity.x, ny, r)) entity.y = ny;
}

function collides(x, y, r) {
  return isWall(x - r, y - r) || isWall(x + r, y - r) || isWall(x - r, y + r) || isWall(x + r, y + r);
}

function isWall(x, y) {
  const mx = Math.floor(x);
  const my = Math.floor(y);
  return my < 0 || my >= map.length || mx < 0 || mx >= map[0].length || map[my][mx] !== 0;
}

function hasLineOfSight(x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const dist = distance(x1, y1, x2, y2);
  return raycast(x1, y1, angle, dist).distance >= dist - 0.05;
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU;
    const s = rand(0.6, 2.6);
    particles.push({
      x,
      y,
      z: rand(0.2, 1.1),
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      vz: rand(0.2, 1.5),
      life: rand(0.25, 0.7),
      color
    });
  }
}

function updateHud() {
  ui.health.textContent = Math.ceil(player.health);
  ui.armor.textContent = Math.ceil(player.armor);
  ui.ammo.textContent = player.ammo;
  ui.face.classList.toggle("hurt", player.hurtTime > 0);
}

function pixelRect(x, y, w, h) {
  ctx.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0));
}

function centerOf(room) {
  return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
}

function randomPointInRoom(room) {
  return { x: rand(room.x + 1, room.x + room.w - 1), y: rand(room.y + 1, room.y + room.h - 1) };
}

function rectsOverlap(a, b, margin) {
  return a.x - margin < b.x + b.w && a.x + a.w + margin > b.x && a.y - margin < b.y + b.h && a.y + a.h + margin > b.y;
}

function angleDiff(a, b) {
  let diff = (a - b + Math.PI) % TAU - Math.PI;
  return diff < -Math.PI ? diff + TAU : diff;
}

function normAngle(a) {
  return (a % TAU + TAU) % TAU;
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function rgb(r, g, b) {
  return ((clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b)) >>> 0;
}

function clamp255(v) {
  return Math.max(0, Math.min(255, v | 0));
}
