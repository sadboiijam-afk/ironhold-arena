import * as Phaser from "https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.esm.js";
import { PLAYER_SPRITE } from "./player-sprite.js";

const ARENA = { w: 1040, h: 720 };
const CD = { basic: 0.31, dash: 2.35, area: 5.4 };
const UPGRADE_POOL = [
  {
    id: "blade",
    title: "Sharpened Blade",
    text: "+6 strike damage",
    apply: (p) => { p.strikeDamage += 6; },
  },
  {
    id: "vitality",
    title: "Iron Vigor",
    text: "+24 max health and heal 24",
    apply: (p) => { p.maxHp += 24; p.hp = Math.min(p.maxHp, p.hp + 24); },
  },
  {
    id: "boots",
    title: "Swift Greaves",
    text: "+18 movement speed",
    apply: (p) => { p.speed += 18; },
  },
  {
    id: "dash",
    title: "Meteor Dash",
    text: "+8 dash impact damage",
    apply: (p) => { p.dashDamage += 8; },
  },
  {
    id: "cleave",
    title: "Wider Cleave",
    text: "+18 cleave radius and +8 damage",
    apply: (p) => { p.areaRadius += 18; p.areaDamage += 8; },
  },
  {
    id: "recovery",
    title: "Battle Recovery",
    text: "Heal 16 after every cleared wave",
    apply: (p) => { p.waveHeal += 16; },
  },
];
const keys = new Set();
const queued = { basic: false, dash: false, area: false, restart: false };
let state;
let nextId = 0;
let scene;
let pendingUpgrades = [];

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

document.querySelector("[data-restart]")?.addEventListener("click", () => {
  reset();
  scene?.clearObjects();
});

document.querySelector("[data-upgrades]")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-upgrade]");
  if (!button || state?.phase !== "upgrade") return;
  chooseUpgrade(button.dataset.upgrade);
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
    hitstop: 0,
    shake: 0,
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
      speed: 238,
      strikeDamage: 28,
      dashDamage: 18,
      areaDamage: 44,
      areaRadius: 148,
      waveHeal: 0,
      face: { x: 1, y: 0 },
      hurt: 0,
      attackUntil: 0,
      basic: 0,
      dash: 0,
      area: 0,
      dashUntil: 0,
      invulnUntil: 0,
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
  const count = 4 + Math.floor(state.wave * 1.35);
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + state.wave * 0.42;
    const hp = 34 + state.wave * 7;
    state.enemies.push({
      id: id("enemy"),
      kind: "enemy",
      x: ARENA.w / 2 + Math.cos(angle) * ARENA.w * 0.46,
      y: ARENA.h / 2 + Math.sin(angle) * ARENA.h * 0.43,
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      radius: 19,
      speed: 86 + Math.min(58, state.wave * 5),
      damage: 7 + Math.floor(state.wave * 0.75),
      range: 50,
      attackAt: 0.6 + i * 0.05,
      attackCd: 0.92,
      windupUntil: 0,
      dashHitUntil: 0,
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
  if (state.hitstop > 0) {
    state.hitstop = Math.max(0, state.hitstop - dt);
    state.t += dt * 0.18;
    return;
  }
  state.t += dt;
  state.shake = Math.max(0, state.shake - dt * 4.2);
  state.text = state.text.filter((item) => state.t - item.born < item.ttl);
  state.fx = state.fx.filter((item) => state.t - item.born < item.ttl);
  if (state.phase === "dead") return;
  if (state.phase === "wait") {
    if (state.t >= state.nextWaveAt) startWave();
    return;
  }
  if (state.phase === "upgrade") return;
  movePlayer(dt, input);
  moveEnemies(dt);
  separateEnemies(dt);
  collectLoot();
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.phase = "dead";
    state.message = "Defeated";
  }
  if (state.phase === "play" && state.enemies.length === 0) {
    offerUpgrades();
  }
}

function movePlayer(dt, input) {
  const p = state.player;
  if (input.move.x || input.move.y) p.face = norm(input.move);
  if (input.basic && state.t >= p.basic) {
    p.basic = state.t + CD.basic;
    p.attackUntil = state.t + 0.16;
    strike(p.x + p.face.x * 44, p.y + p.face.y * 44, 86, p.strikeDamage, p.face);
    fx("slash", p.x + p.face.x * 42, p.y + p.face.y * 42, Math.atan2(p.face.y, p.face.x), 0.26);
  }
  if (input.area && state.t >= p.area) {
    p.area = state.t + CD.area;
    state.shake = Math.max(state.shake, 0.42);
    fx("ring", p.x, p.y, 0, 0.42);
    for (const enemy of state.enemies) {
      const away = norm({ x: enemy.x - p.x, y: enemy.y - p.y });
      if (dist(enemy, p) <= p.areaRadius + enemy.radius) damage(enemy, p.areaDamage, away, 190, true);
    }
  }
  const dashing = state.t < p.dashUntil;
  if (input.dash && state.t >= p.dash) {
    const d = input.move.x || input.move.y ? norm(input.move) : p.face;
    p.face = d;
    p.vx = d.x * 720;
    p.vy = d.y * 720;
    p.dash = state.t + CD.dash;
    p.dashUntil = state.t + 0.2;
    p.invulnUntil = state.t + 0.26;
    state.shake = Math.max(state.shake, 0.22);
    fx("dash", p.x, p.y, 0, 0.34);
  } else if (!dashing) {
    p.vx = input.move.x * p.speed;
    p.vy = input.move.y * p.speed;
  }
  p.x = clamp(p.x + p.vx * dt, 70, ARENA.w - 70);
  p.y = clamp(p.y + p.vy * dt, 80, ARENA.h - 80);
  if (dashing) dashStrike();
}

function dashStrike() {
  const p = state.player;
  for (const enemy of state.enemies) {
    if (state.t < enemy.dashHitUntil) continue;
    if (dist(enemy, p) <= 58 + enemy.radius) {
      enemy.dashHitUntil = state.t + 0.35;
      damage(enemy, p.dashDamage, p.face, 150, false);
      fx("spark", enemy.x, enemy.y - 6, 0, 0.22);
    }
  }
}

function offerUpgrades() {
  const p = state.player;
  if (p.waveHeal) {
    p.hp = Math.min(p.maxHp, p.hp + p.waveHeal);
    float(p.x, p.y - 58, `+${p.waveHeal}`, "#56d07f");
  }
  pendingUpgrades = pickUpgrades(3);
  state.phase = "upgrade";
  state.message = `Wave ${state.wave} cleared`;
}

function chooseUpgrade(id) {
  const upgrade = pendingUpgrades.find((item) => item.id === id);
  if (!upgrade) return;
  upgrade.apply(state.player);
  state.message = upgrade.title;
  pendingUpgrades = [];
  state.phase = "wait";
  state.nextWaveAt = state.t + 0.9;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + 8);
  fx("ring", state.player.x, state.player.y, 0, 0.36);
}

function pickUpgrades(count) {
  const pool = [...UPGRADE_POOL];
  const picks = [];
  while (picks.length < count && pool.length) {
    const index = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(index, 1)[0]);
  }
  return picks;
}

function moveEnemies(dt) {
  const p = state.player;
  for (const enemy of state.enemies) {
    const toPlayer = norm({ x: p.x - enemy.x, y: p.y - enemy.y });
    const gap = dist(enemy, p);
    enemy.face = toPlayer;
    if (enemy.hurt > state.t) {
      enemy.x = clamp(enemy.x + enemy.vx * dt, 42, ARENA.w - 42);
      enemy.y = clamp(enemy.y + enemy.vy * dt, 58, ARENA.h - 58);
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      continue;
    }
    if (gap > enemy.range) {
      enemy.windupUntil = 0;
      enemy.x = clamp(enemy.x + toPlayer.x * enemy.speed * dt, 42, ARENA.w - 42);
      enemy.y = clamp(enemy.y + toPlayer.y * enemy.speed * dt, 58, ARENA.h - 58);
    } else if (state.t >= enemy.attackAt && !enemy.windupUntil) {
      enemy.windupUntil = state.t + 0.36;
      enemy.attackAt = enemy.windupUntil;
      fx("warn", enemy.x, enemy.y, 0, 0.36);
    } else if (enemy.windupUntil && state.t >= enemy.windupUntil) {
      enemy.windupUntil = 0;
      enemy.attackAt = state.t + enemy.attackCd;
      if (dist(enemy, p) <= enemy.range + 10 && state.t >= p.invulnUntil) {
        p.hp -= enemy.damage;
        p.hurt = state.t + 0.14;
        state.shake = Math.max(state.shake, 0.24);
        float(p.x, p.y - 34, `-${enemy.damage}`, "#ff6b5c");
      }
    }
  }
  state.enemies = state.enemies.filter((enemy) => {
    if (enemy.hp > 0) return true;
    fx("pop", enemy.x, enemy.y, 0, 0.32);
    if (Math.random() <= 0.75) state.loot.push({ id: id("loot"), x: enemy.x, y: enemy.y, value: 2 + Math.ceil(Math.random() * 5), born: state.t });
    return false;
  });
}

function separateEnemies(dt) {
  for (let i = 0; i < state.enemies.length; i += 1) {
    for (let j = i + 1; j < state.enemies.length; j += 1) {
      const a = state.enemies[i];
      const b = state.enemies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const gap = Math.hypot(dx, dy) || 1;
      const min = a.radius + b.radius + 8;
      if (gap >= min) continue;
      const push = (min - gap) * 0.5;
      const nx = dx / gap;
      const ny = dy / gap;
      a.x = clamp(a.x - nx * push * dt * 9, 42, ARENA.w - 42);
      a.y = clamp(a.y - ny * push * dt * 9, 58, ARENA.h - 58);
      b.x = clamp(b.x + nx * push * dt * 9, 42, ARENA.w - 42);
      b.y = clamp(b.y + ny * push * dt * 9, 58, ARENA.h - 58);
    }
  }
}

function strike(x, y, radius, amount, facing) {
  let hits = 0;
  for (const enemy of state.enemies) {
    if (dist(enemy, { x, y }) <= radius + enemy.radius) {
      hits += 1;
      damage(enemy, amount, facing, 120, false);
    }
  }
  if (hits) {
    state.hitstop = Math.min(0.07, 0.035 + hits * 0.012);
    state.shake = Math.max(state.shake, 0.18 + hits * 0.04);
  }
}

function damage(enemy, amount, direction, knockback, heavy) {
  enemy.hp -= amount;
  enemy.hurt = state.t + (heavy ? 0.18 : 0.13);
  enemy.windupUntil = 0;
  enemy.vx = direction.x * knockback;
  enemy.vy = direction.y * knockback;
  enemy.x = clamp(enemy.x + direction.x * knockback * 0.08, 42, ARENA.w - 42);
  enemy.y = clamp(enemy.y + direction.y * knockback * 0.08, 58, ARENA.h - 58);
  float(enemy.x, enemy.y - 28, String(amount), heavy ? "#ffffff" : "#f8d98a");
  fx("spark", enemy.x, enemy.y - 8, 0, 0.2);
}

function collectLoot() {
  const p = state.player;
  state.loot = state.loot.filter((drop) => {
    const magnet = norm({ x: p.x - drop.x, y: p.y - drop.y });
    if (dist(drop, p) < 96) {
      drop.x += magnet.x * 180 * 0.016;
      drop.y += magnet.y * 180 * 0.016;
    }
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
function fx(type, x, y, angle, ttl = 0.42) { state.fx.push({ id: id("fx"), type, x, y, angle, born: state.t, ttl }); }

class ArenaScene extends Phaser.Scene {
  constructor() {
    super("arena");
    this.sprites = new Map();
    this.bars = new Map();
    this.drops = new Map();
    this.labels = new Map();
    this.seenFx = new Set();
  }

  preload() {
    this.load.image("player", PLAYER_SPRITE);
    this.texturesFromGraphics();
  }

  create() {
    this.cameras.main.setBackgroundColor("#0f0c10");
    this.drawArena();
    reset();
    scene = this;
  }

  update(_time, ms) {
    step(Math.min(ms / 1000, 0.05));
    this.renderGame();
    renderHud();
  }

  clearObjects() {
    for (const v of [...this.sprites.values(), ...this.drops.values(), ...this.labels.values()]) v.destroy(true);
    this.sprites.clear();
    this.bars.clear();
    this.drops.clear();
    this.labels.clear();
    this.seenFx.clear();
  }

  renderGame() {
    this.syncUnit(state.player);
    for (const enemy of state.enemies) this.syncUnit(enemy);
    const live = new Set([state.player.id, ...state.enemies.map((e) => e.id)]);
    for (const [id, sprite] of this.sprites) {
      if (!live.has(id)) {
        sprite.destroy(true);
        this.sprites.delete(id);
        this.bars.delete(id);
      }
    }
    this.syncLoot();
    this.syncText();
    this.syncFx();
    const zoom = Math.min(this.scale.width / 1160, this.scale.height / 760);
    this.cameras.main.setZoom(Phaser.Math.Clamp(zoom, 0.62, 1.05));
    const sx = (Math.random() - 0.5) * 18 * state.shake;
    const sy = (Math.random() - 0.5) * 12 * state.shake;
    this.cameras.main.centerOn(ARENA.w / 2 + sx, ARENA.h / 2 + sy);
  }

  syncUnit(unit) {
    let c = this.sprites.get(unit.id);
    if (!c) {
      c = this.add.container(unit.x, unit.y);
      const shadow = this.add.image(0, 20, "shadow").setAlpha(0.44);
      const sprite = this.add.image(0, 0, unit.kind === "player" ? "player" : "enemy");
      if (unit.kind === "player") sprite.setScale(0.48).setOrigin(0.5, 0.64);
      const bar = this.add.graphics();
      c.add([shadow, sprite, bar]);
      this.sprites.set(unit.id, c);
      this.bars.set(unit.id, bar);
    }
    c.setPosition(unit.x, unit.y).setDepth(unit.y * 10 + (unit.kind === "player" ? 6 : 0));
    const shadow = c.list[0];
    const sprite = c.list[1];
    const moving = Math.hypot(unit.vx || 0, unit.vy || 0) > 12 || (unit.kind === "enemy" && unit.hurt <= state.t && !unit.windupUntil);
    const seed = Number(unit.id.split("-").pop()) || 1;
    const bob = moving ? Math.sin(state.t * (unit.kind === "player" ? 14 : 9) + seed) * 4 : Math.sin(state.t * 4 + seed) * 1.4;
    const lean = unit.kind === "player" ? Phaser.Math.Clamp((unit.vx || 0) / 820, -0.1, 0.1) : Phaser.Math.Clamp(unit.face.x * 0.08, -0.08, 0.08);
    sprite.setPosition(0, bob);
    sprite.setRotation(unit.attackUntil > state.t ? -unit.face.x * 0.22 : lean);
    if (unit.kind === "player") sprite.setScale(0.48 + (state.t < unit.dashUntil ? 0.08 : 0), 0.48 - (state.t < unit.dashUntil ? 0.03 : 0));
    if (unit.kind === "enemy") sprite.setScale(unit.windupUntil > state.t ? 1.16 : unit.hurt > state.t ? 0.94 : 1);
    shadow.setScale(moving ? 1.08 : 1, moving ? 0.9 : 1).setAlpha(unit.kind === "player" && state.t < unit.invulnUntil ? 0.28 : 0.44);
    const tint = unit.hurt > state.t ? 0xffffff : unit.windupUntil > state.t ? 0xffd166 : unit.kind === "player" ? 0xffffff : 0xf05f45;
    sprite.setTint(tint).setAlpha(unit.kind === "player" && state.t < unit.invulnUntil ? 0.72 + Math.sin(state.t * 42) * 0.18 : 1);
    sprite.setFlipX(unit.face.x < -0.1);
    const bar = this.bars.get(unit.id);
    bar.clear();
    if (unit.kind === "enemy" || unit.hp < unit.maxHp) {
      const pct = Phaser.Math.Clamp(unit.hp / unit.maxHp, 0, 1);
      const y = unit.kind === "player" ? -54 : -48;
      bar.fillStyle(0x1d1516, 0.88).fillRoundedRect(-24, y, 48, 5, 2);
      bar.fillStyle(unit.kind === "player" ? 0x56d07f : 0xff7b54, 1).fillRoundedRect(-23, y + 1, 46 * pct, 3, 2);
    }
  }

  syncLoot() {
    const live = new Set(state.loot.map((d) => d.id));
    for (const drop of state.loot) {
      let s = this.drops.get(drop.id);
      if (!s) {
        s = this.add.image(drop.x, drop.y, "gold");
        this.drops.set(drop.id, s);
      }
      s.setPosition(drop.x, drop.y + Math.sin((state.t - drop.born) * 7) * 4).setRotation(state.t * 2.5).setDepth(drop.y * 10 + 2);
    }
    for (const [id, s] of this.drops) if (!live.has(id)) { s.destroy(); this.drops.delete(id); }
  }

  syncText() {
    const live = new Set(state.text.map((t) => t.id));
    for (const item of state.text) {
      let label = this.labels.get(item.id);
      if (!label) {
        label = this.add.text(item.x, item.y, item.text, { color: item.color, fontFamily: "Georgia, serif", fontSize: "18px", fontStyle: "bold", stroke: "#1a0d0f", strokeThickness: 3 }).setOrigin(0.5);
        this.labels.set(item.id, label);
      }
      const age = state.t - item.born;
      label.setPosition(item.x, item.y - age * 42).setAlpha(1 - age / item.ttl).setScale(1 + Math.max(0, 0.18 - age) * 1.3).setDepth(9000);
    }
    for (const [id, label] of this.labels) if (!live.has(id)) { label.destroy(); this.labels.delete(id); }
  }

  syncFx() {
    for (const item of state.fx) {
      if (this.seenFx.has(item.id)) continue;
      this.seenFx.add(item.id);
      if (item.type === "slash") this.tweenFx(this.add.image(item.x, item.y, "slash").setRotation(item.angle).setDepth(item.y * 10 + 30).setBlendMode(Phaser.BlendModes.ADD), 1.65, 190);
      if (item.type === "ring") this.tweenFx(this.add.image(item.x, item.y, "ring").setDepth(item.y * 10 + 25).setBlendMode(Phaser.BlendModes.ADD), 3.0, 330);
      if (item.type === "dash") this.tweenFx(this.add.image(item.x, item.y, "player").setScale(0.56).setTint(0x90d7ff).setAlpha(0.36).setDepth(item.y * 10 - 1), 1.6, 300);
      if (item.type === "spark") this.tweenFx(this.add.image(item.x, item.y, "spark").setDepth(item.y * 10 + 35).setBlendMode(Phaser.BlendModes.ADD), 1.8, 170);
      if (item.type === "warn") this.tweenFx(this.add.image(item.x, item.y, "warn").setDepth(item.y * 10 - 2).setAlpha(0.75), 1.2, 360);
      if (item.type === "pop") this.tweenFx(this.add.image(item.x, item.y, "pop").setDepth(item.y * 10 + 20).setBlendMode(Phaser.BlendModes.ADD), 1.5, 260);
    }
  }

  tweenFx(target, scale, duration) {
    this.tweens.add({ targets: target, scaleX: scale, scaleY: scale, alpha: 0, duration, ease: "Cubic.easeOut", onComplete: () => target.destroy() });
  }

  drawArena() {
    const layer = this.add.container(0, 0).setDepth(-1000);
    const cx = ARENA.w / 2;
    const cy = ARENA.h / 2;
    for (let row = -9; row <= 9; row += 1) {
      for (let col = -11; col <= 11; col += 1) {
        const x = cx + (col - row) * 48;
        const y = cy + (col + row) * 24;
        if (x > 50 && x < ARENA.w - 50 && y > 35 && y < ARENA.h - 35) layer.add(this.add.image(x, y, "tile").setAlpha(0.74 + ((row + col) % 3) * 0.04));
      }
    }
    const rim = this.add.graphics();
    rim.lineStyle(5, 0x5f3827, 0.88).strokeEllipse(cx, cy + 14, 1010, 640);
    rim.lineStyle(2, 0xc1783d, 0.4).strokeEllipse(cx, cy + 14, 900, 560);
    layer.add(rim);
  }

  texturesFromGraphics() {
    let g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x351619, 1).fillEllipse(31, 39, 42, 34).fillStyle(0x9f2f2a, 1).fillEllipse(31, 28, 34, 42).fillStyle(0xff6b3d, 0.75).fillTriangle(22, 24, 40, 24, 31, 3).fillStyle(0xffc36e, 1).fillCircle(24, 25, 3).fillCircle(38, 25, 3).generateTexture("enemy", 64, 68).destroy();
    g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffc44d, 1).fillEllipse(18, 18, 26, 18).lineStyle(2, 0x8f5d1d, 1).strokeEllipse(18, 18, 26, 18).generateTexture("gold", 36, 36).destroy();
    g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x2a2528, 1).fillPoints([{ x: 48, y: 0 }, { x: 96, y: 24 }, { x: 48, y: 48 }, { x: 0, y: 24 }], true).lineStyle(1, 0x514849, 0.82).strokePoints([{ x: 48, y: 0 }, { x: 96, y: 24 }, { x: 48, y: 48 }, { x: 0, y: 24 }, { x: 48, y: 0 }], false).generateTexture("tile", 96, 48).destroy();
    g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x000000, 0.55).fillEllipse(34, 18, 58, 20).generateTexture("shadow", 68, 36).destroy();
    g = this.make.graphics({ x: 0, y: 0 });
    g.lineStyle(8, 0xffe1a6, 1).beginPath().arc(46, 46, 34, -0.9, 0.9).strokePath().lineStyle(3, 0xffffff, 0.9).beginPath().arc(46, 46, 26, -0.8, 0.72).strokePath().generateTexture("slash", 92, 92).destroy();
    g = this.make.graphics({ x: 0, y: 0 });
    g.lineStyle(5, 0xffc76b, 0.95).strokeCircle(64, 64, 48).lineStyle(2, 0xffffff, 0.6).strokeCircle(64, 64, 36).generateTexture("ring", 128, 128).destroy();
    g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xfff1a8, 1).fillCircle(22, 22, 7).fillStyle(0xff8a3d, 0.75).fillCircle(22, 22, 15).generateTexture("spark", 44, 44).destroy();
    g = this.make.graphics({ x: 0, y: 0 });
    g.lineStyle(3, 0xffd166, 0.95).strokeCircle(32, 32, 22).lineStyle(1, 0xffffff, 0.45).strokeCircle(32, 32, 14).generateTexture("warn", 64, 64).destroy();
    g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xff7b54, 0.45).fillCircle(32, 32, 24).lineStyle(2, 0xffe1a6, 0.8).strokeCircle(32, 32, 20).generateTexture("pop", 64, 64).destroy();
  }
}

function renderHud() {
  const hp = document.querySelector("[data-hp-text]");
  const hpFill = document.querySelector("[data-hp-fill]");
  if (!hp || !hpFill) return;
  hp.textContent = `${Math.ceil(state.player.hp)} / ${state.player.maxHp}`;
  hpFill.style.width = `${Math.max(0, (state.player.hp / state.player.maxHp) * 100)}%`;
  document.querySelector("[data-wave]").textContent = state.wave;
  document.querySelector("[data-gold]").textContent = state.gold;
  for (const key of Object.keys(CD)) {
    const skill = document.querySelector(`[data-skill="${key}"]`);
    const left = Math.max(0, state.player[key] - state.t);
    skill.querySelector(".skill-cooldown").textContent = left ? left.toFixed(1) : "";
    skill.querySelector(".skill-mask").style.height = `${(left / CD[key]) * 100}%`;
  }
  const toast = document.querySelector("[data-toast]");
  toast.textContent = state.phase === "wait" ? `${state.message}. Next wave incoming...` : state.phase === "upgrade" ? "" : state.message;
  toast.classList.toggle("visible", Boolean(toast.textContent));
  document.querySelector("[data-defeat]").classList.toggle("hidden", state.phase !== "dead");
  renderUpgrades();
}

function renderUpgrades() {
  const panel = document.querySelector("[data-upgrade-panel]");
  const list = document.querySelector("[data-upgrades]");
  if (!panel || !list) return;
  const open = state.phase === "upgrade";
  panel.classList.toggle("hidden", !open);
  if (!open) {
    list.replaceChildren();
    return;
  }
  if (list.children.length === pendingUpgrades.length) return;
  list.replaceChildren(...pendingUpgrades.map((upgrade) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "upgrade-card";
    button.dataset.upgrade = upgrade.id;
    button.innerHTML = `<strong>${upgrade.title}</strong><span>${upgrade.text}</span>`;
    return button;
  }));
}

new Phaser.Game({
  type: Phaser.CANVAS,
  parent: "game-root",
  width: 1280,
  height: 760,
  backgroundColor: "#100d12",
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true },
  scene: ArenaScene,
});
