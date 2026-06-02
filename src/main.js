import Phaser from "https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.esm.js";

const ARENA = { w: 1040, h: 720 };
const CD = { basic: 0.34, dash: 2.8, area: 5.8 };
let state;
let nextId = 0;
let scene;
const keys = new Set();
const queued = { basic: false, dash: false, area: false, restart: false };

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  keys.add(event.code);
  if (event.code === "KeyJ") queued.basic = true;
  if (event.code === "Space") queued.dash = true;
  if (event.code === "KeyQ" || event.code === "KeyK") queued.area = true;
  if (event.code === "KeyR") queued.restart = true;
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("pointerdown", (event) => {
  if (event.button === 0) queued.basic = true;
});

function reset() {
  nextId = 0;
  state = {
    t: 0,
    phase: "play",
    wave: 0,
    gold: 0,
    message: "",
    nextWaveAt: 0,
    player: {
      id: id("player"),
      kind: "player",
      x: ARENA.w / 2,
      y: ARENA.h / 2,
      vx: 0,
      vy: 0,
      hp: 120,
      maxHp: 120,
      radius: 24,
      speed: 220,
      face: { x: 1, y: 0 },
      hurt: 0,
      basic: 0,
      dash: 0,
      area: 0,
      dashUntil: 0,
    },
    enemies: [],
    loot: [],
    text: [],
    fx: [],
  };
  startWave();
}

function startWave() {
  state.wave += 1;
  state.phase = "play";
  state.message = `Wave ${state.wave}`;
  const count = 4 + Math.floor(state.wave * 1.45);
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + state.wave * 0.42;
    const hp = 34 + state.wave * 7;
    state.enemies.push({
      id: id("enemy"),
      kind: "enemy",
      x: ARENA.w / 2 + Math.cos(angle) * ARENA.w * 0.46,
      y: ARENA.h / 2 + Math.sin(angle) * ARENA.h * 0.43,
      hp,
      maxHp: hp,
      radius: 19,
      speed: 88 + Math.min(52, state.wave * 5),
      damage: 7 + Math.floor(state.wave * 0.75),
      range: 48,
      attackAt: 0.5 + i * 0.05,
      attackCd: 0.78,
      face: { x: -Math.cos(angle), y: -Math.sin(angle) },
      hurt: 0,
    });
  }
}

function readInput() {
  const x = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const y = Number(keys.has("KeyS") || keys.has("ArrowDown")) - Number(keys.has("KeyW") || keys.has("ArrowUp"));
  const length = Math.hypot(x, y) || 1;
  const frame = { move: { x: x / length, y: y / length }, ...queued };
  queued.basic = queued.dash = queued.area = queued.restart = false;
  return frame;
}

function step(dt) {
  const input = readInput();
  if (input.restart && state.phase === "dead") {
    reset();
    scene.clearObjects();
  }
  state.t += dt;
  state.text = state.text.filter((item) => state.t - item.born < item.ttl);
  state.fx = state.fx.filter((item) => state.t - item.born < 0.42);
  if (state.phase === "dead") return;
  if (state.phase === "wait") {
    if (state.t >= state.nextWaveAt) startWave();
    return;
  }

  movePlayer(dt, input);
  moveEnemies(dt);
  collectLoot();
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.phase = "dead";
    state.message = "Defeated";
  }
  if (state.phase === "play" && state.enemies.length === 0) {
    state.phase = "wait";
    state.nextWaveAt = state.t + 2.1;
    state.message = `Wave ${state.wave} cleared`;
  }
}

function movePlayer(dt, input) {
  const p = state.player;
  if (input.move.x || input.move.y) p.face = norm(input.move);
  if (input.basic && state.t >= p.basic) {
    p.basic = state.t + CD.basic;
    strike(p.x + p.face.x * 38, p.y + p.face.y * 38, 72, 26, p.face);
    fx("slash", p.x + p.face.x * 38, p.y + p.face.y * 38, Math.atan2(p.face.y, p.face.x));
  }
  if (input.area && state.t >= p.area) {
    p.area = state.t + CD.area;
    fx("ring", p.x, p.y, 0);
    for (const enemy of state.enemies) {
      const away = norm({ x: enemy.x - p.x, y: enemy.y - p.y });
      if (dist(enemy, p) <= 132 + enemy.radius) damage(enemy, 42, away, 160);
    }
  }
  const dashing = state.t < p.dashUntil;
  if (input.dash && state.t >= p.dash) {
    const d = input.move.x || input.move.y ? norm(input.move) : p.face;
    p.vx = d.x * 620;
    p.vy = d.y * 620;
    p.dash = state.t + CD.dash;
    p.dashUntil = state.t + 0.18;
    fx("dash", p.x, p.y, 0);
  } else if (!dashing) {
    p.vx = input.move.x * p.speed;
    p.vy = input.move.y * p.speed;
  }
  p.x = clamp(p.x + p.vx * dt, 70, ARENA.w - 70);
  p.y = clamp(p.y + p.vy * dt, 80, ARENA.h - 80);
}

function moveEnemies(dt) {
  const p = state.player;
  for (const enemy of state.enemies) {
    const toPlayer = norm({ x: p.x - enemy.x, y: p.y - enemy.y });
    enemy.face = toPlayer;
    if (dist(enemy, p) > enemy.range) {
      enemy.x = clamp(enemy.x + toPlayer.x * enemy.speed * dt, 42, ARENA.w - 42);
      enemy.y = clamp(enemy.y + toPlayer.y * enemy.speed * dt, 58, ARENA.h - 58);
    } else if (state.t >= enemy.attackAt) {
      enemy.attackAt = state.t + enemy.attackCd;
      p.hp -= enemy.damage;
      p.hurt = state.t + 0.12;
      float(p.x, p.y - 34, `-${enemy.damage}`, "#ff6b5c");
    }
  }
  state.enemies = state.enemies.filter((enemy) => {
    if (enemy.hp > 0) return true;
    if (Math.random() <= 0.68) state.loot.push({ id: id("loot"), x: enemy.x, y: enemy.y, value: 2 + Math.ceil(Math.random() * 5), born: state.t });
    return false;
  });
}

function strike(x, y, radius, amount, facing) {
  for (const enemy of state.enemies) {
    if (dist(enemy, { x, y }) <= radius + enemy.radius) damage(enemy, amount, facing, 90);
  }
}

function damage(enemy, amount, direction, knockback) {
  enemy.hp -= amount;
  enemy.hurt = state.t + 0.13;
  enemy.x = clamp(enemy.x + direction.x * knockback * 0.12, 42, ARENA.w - 42);
  enemy.y = clamp(enemy.y + direction.y * knockback * 0.12, 58, ARENA.h - 58);
  float(enemy.x, enemy.y - 28, String(amount), "#f8d98a");
}

function collectLoot() {
  const p = state.player;
  state.loot = state.loot.filter((drop) => {
    if (dist(drop, p) > 38) return true;
    state.gold += drop.value;
    state.message = `+${drop.value} gold`;
    float(drop.x, drop.y - 24, `+${drop.value}g`, "#ffd166");
    return false;
  });
}

function id(prefix) { nextId += 1; return `${prefix}-${nextId}`; }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function norm(v) { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; }
function float(x, y, text, color) { state.text.push({ id: id("text"), x, y, text, color, born: state.t, ttl: 0.72 }); }
function fx(type, x, y, angle) { state.fx.push({ id: id("fx"), type, x, y, angle, born: state.t }); }

class ArenaScene extends Phaser.Scene {
  constructor() {
    super("arena");
    this.sprites = new Map();
    this.bars = new Map();
    this.drops = new Map();
    this.labels = new Map();
    this.seenFx = new Set();
  }
  preload() { this.texturesFromGraphics(); }
  create() { this.cameras.main.setBackgroundColor("#0f0c10"); this.drawArena(); reset(); scene = this; }
  update(_time, ms) { step(Math.min(ms / 1000, 0.05)); this.renderGame(); renderHud(); }
  clearObjects() { for (const v of [...this.sprites.values(), ...this.drops.values(), ...this.labels.values()]) v.destroy(true); this.sprites.clear(); this.bars.clear(); this.drops.clear(); this.labels.clear(); this.seenFx.clear(); }
  renderGame() {
    this.syncUnit(state.player);
    for (const enemy of state.enemies) this.syncUnit(enemy);
    const live = new Set([state.player.id, ...state.enemies.map((e) => e.id)]);
    for (const [id, sprite] of this.sprites) if (!live.has(id)) { sprite.destroy(true); this.sprites.delete(id); this.bars.delete(id); }
    this.syncLoot(); this.syncText(); this.syncFx();
    const zoom = Math.min(this.scale.width / 1160, this.scale.height / 760);
    this.cameras.main.setZoom(Phaser.Math.Clamp(zoom, 0.62, 1.05));
    this.cameras.main.centerOn(ARENA.w / 2, ARENA.h / 2);
  }
  syncUnit(unit) {
    let c = this.sprites.get(unit.id);
    if (!c) {
      c = this.add.container(unit.x, unit.y);
      const shadow = this.add.image(0, 18, "shadow").setAlpha(0.44);
      const sprite = this.add.image(0, 0, unit.kind === "player" ? "player" : "enemy");
      const bar = this.add.graphics();
      c.add([shadow, sprite, bar]);
      this.sprites.set(unit.id, c); this.bars.set(unit.id, bar);
    }
    c.setPosition(unit.x, unit.y).setDepth(unit.y * 10 + (unit.kind === "player" ? 6 : 0));
    c.list[1].setTint(unit.hurt > state.t ? 0xffffff : unit.kind === "player" ? 0xd6dadf : 0xf05f45).setFlipX(unit.face.x < -0.1);
    const bar = this.bars.get(unit.id); bar.clear();
    if (unit.kind === "enemy" || unit.hp < unit.maxHp) {
      const pct = Phaser.Math.Clamp(unit.hp / unit.maxHp, 0, 1);
      bar.fillStyle(0x1d1516, 0.88).fillRoundedRect(-24, -42, 48, 5, 2);
      bar.fillStyle(unit.kind === "player" ? 0x56d07f : 0xff7b54, 1).fillRoundedRect(-23, -41, 46 * pct, 3, 2);
    }
  }
  syncLoot() {
    const live = new Set(state.loot.map((d) => d.id));
    for (const drop of state.loot) {
      let s = this.drops.get(drop.id);
      if (!s) { s = this.add.image(drop.x, drop.y, "gold"); this.drops.set(drop.id, s); }
      s.setPosition(drop.x, drop.y + Math.sin((state.t - drop.born) * 7) * 4).setDepth(drop.y * 10 + 2);
    }
    for (const [id, s] of this.drops) if (!live.has(id)) { s.destroy(); this.drops.delete(id); }
  }
  syncText() {
    const live = new Set(state.text.map((t) => t.id));
    for (const item of state.text) {
      let label = this.labels.get(item.id);
      if (!label) { label = this.add.text(item.x, item.y, item.text, { color: item.color, fontFamily: "Georgia, serif", fontSize: "18px", fontStyle: "bold", stroke: "#1a0d0f", strokeThickness: 3 }).setOrigin(0.5); this.labels.set(item.id, label); }
      const age = state.t - item.born;
      label.setPosition(item.x, item.y - age * 42).setAlpha(1 - age / item.ttl).setDepth(9000);
    }
    for (const [id, label] of this.labels) if (!live.has(id)) { label.destroy(); this.labels.delete(id); }
  }
  syncFx() {
    for (const item of state.fx) {
      if (this.seenFx.has(item.id)) continue;
      this.seenFx.add(item.id);
      if (item.type === "slash") this.tweenFx(this.add.image(item.x, item.y, "slash").setRotation(item.angle).setDepth(item.y * 10 + 30).setBlendMode(Phaser.BlendModes.ADD), 1.35, 180);
      if (item.type === "ring") this.tweenFx(this.add.image(item.x, item.y, "ring").setDepth(item.y * 10 + 25).setBlendMode(Phaser.BlendModes.ADD), 2.6, 310);
      if (item.type === "dash") this.tweenFx(this.add.image(item.x, item.y, "player").setTint(0x90d7ff).setAlpha(0.32).setDepth(item.y * 10 - 1), 1.4, 260);
    }
  }
  tweenFx(target, scale, duration) { this.tweens.add({ targets: target, scaleX: scale, scaleY: scale, alpha: 0, duration, ease: "Cubic.easeOut", onComplete: () => target.destroy() }); }
  drawArena() {
    const layer = this.add.container(0, 0).setDepth(-1000); const cx = ARENA.w / 2; const cy = ARENA.h / 2;
    for (let row = -9; row <= 9; row++) for (let col = -11; col <= 11; col++) { const x = cx + (col - row) * 48; const y = cy + (col + row) * 24; if (x > 50 && x < ARENA.w - 50 && y > 35 && y < ARENA.h - 35) layer.add(this.add.image(x, y, "tile").setAlpha(0.74 + ((row + col) % 3) * 0.04)); }
    const rim = this.add.graphics(); rim.lineStyle(5, 0x5f3827, 0.88).strokeEllipse(cx, cy + 14, 1010, 640); rim.lineStyle(2, 0xc1783d, 0.4).strokeEllipse(cx, cy + 14, 900, 560); layer.add(rim);
  }
  texturesFromGraphics() {
    let g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x272b31, 1).fillEllipse(32, 50, 42, 30).fillStyle(0xc8d4d9, 1).fillEllipse(32, 28, 34, 42).fillStyle(0x7b2634, 1).fillTriangle(13, 38, 50, 38, 32, 68).fillStyle(0xf1c27d, 1).fillCircle(32, 16, 11).lineStyle(6, 0xd9d2bd, 1).lineBetween(44, 28, 62, 8).generateTexture("player", 72, 76).destroy();
    g = this.make.graphics({ x: 0, y: 0 }); g.fillStyle(0x351619, 1).fillEllipse(31, 39, 42, 34).fillStyle(0x9f2f2a, 1).fillEllipse(31, 28, 34, 42).fillStyle(0xff6b3d, 0.75).fillTriangle(22, 24, 40, 24, 31, 3).fillStyle(0xffc36e, 1).fillCircle(24, 25, 3).fillCircle(38, 25, 3).generateTexture("enemy", 64, 68).destroy();
    g = this.make.graphics({ x: 0, y: 0 }); g.fillStyle(0xffc44d, 1).fillEllipse(18, 18, 26, 18).lineStyle(2, 0x8f5d1d, 1).strokeEllipse(18, 18, 26, 18).generateTexture("gold", 36, 36).destroy();
    g = this.make.graphics({ x: 0, y: 0 }); g.fillStyle(0x2a2528, 1).fillPoints([{ x: 48, y: 0 }, { x: 96, y: 24 }, { x: 48, y: 48 }, { x: 0, y: 24 }], true).lineStyle(1, 0x514849, 0.82).strokePoints([{ x: 48, y: 0 }, { x: 96, y: 24 }, { x: 48, y: 48 }, { x: 0, y: 24 }, { x: 48, y: 0 }], false).generateTexture("tile", 96, 48).destroy();
    g = this.make.graphics({ x: 0, y: 0 }); g.fillStyle(0x000000, 0.55).fillEllipse(34, 18, 58, 20).generateTexture("shadow", 68, 36).destroy();
    g = this.make.graphics({ x: 0, y: 0 }); g.lineStyle(8, 0xffe1a6, 1).beginPath().arc(46, 46, 34, -0.9, 0.9).strokePath().lineStyle(3, 0xffffff, 0.9).beginPath().arc(46, 46, 26, -0.8, 0.72).strokePath().generateTexture("slash", 92, 92).destroy();
    g = this.make.graphics({ x: 0, y: 0 }); g.lineStyle(5, 0xffc76b, 0.95).strokeCircle(64, 64, 48).lineStyle(2, 0xffffff, 0.6).strokeCircle(64, 64, 36).generateTexture("ring", 128, 128).destroy();
  }
}

function renderHud() {
  document.querySelector("[data-hp-text]").textContent = `${Math.ceil(state.player.hp)} / ${state.player.maxHp}`;
  document.querySelector("[data-hp-fill]").style.width = `${Math.max(0, (state.player.hp / state.player.maxHp) * 100)}%`;
  document.querySelector("[data-wave]").textContent = state.wave;
  document.querySelector("[data-gold]").textContent = state.gold;
  for (const key of Object.keys(CD)) {
    const skill = document.querySelector(`[data-skill="${key}"]`);
    const left = Math.max(0, state.player[key] - state.t);
    skill.querySelector(".skill-cooldown").textContent = left ? left.toFixed(1) : "";
    skill.querySelector(".skill-mask").style.height = `${(left / CD[key]) * 100}%`;
  }
  const toast = document.querySelector("[data-toast]");
  toast.textContent = state.phase === "wait" ? `${state.message}. Next wave incoming...` : state.message;
  toast.classList.toggle("visible", Boolean(toast.textContent));
  document.querySelector("[data-defeat]").classList.toggle("hidden", state.phase !== "dead");
}

document.querySelector("[data-restart]")?.addEventListener("click", () => { reset(); scene.clearObjects(); });
new Phaser.Game({ type: Phaser.AUTO, parent: document.querySelector("#game-root"), width: 1280, height: 760, backgroundColor: "#100d12", scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true }, scene: [new ArenaScene()] });
