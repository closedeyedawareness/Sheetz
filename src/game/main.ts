import './game.css';
import { loadSongFromUrl, parseMidi, type Song } from './song';
import { connectMidi, attachKeyboard, type MidiConnection } from './midiInput';
import { Synth } from './synth';
import { THEMES, type Theme } from './themes';

// ---------- note helpers ----------
const LOW = 21, HIGH = 108;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
const noteName = (m: number) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const hand = (m: number): 'L' | 'R' => (m < 60 ? 'L' : 'R');
const ROWS = [0.10, 0.17, 0.24];
const LEAD = 1.7;       // seconds an enemy forms before its note is due
const WINDOW = 0.18;    // hit timing tolerance
const HOLD_MIN = 0.9;   // seconds — a note this long is a sustained hold

const LIBRARY = [
  { url: '/songs/twinkle.mid', name: 'Twinkle Twinkle' },
  { url: '/songs/ode-to-joy.mid', name: 'Ode to Joy' },
  { url: '/songs/fur-elise.mid', name: 'Für Elise' },
  { url: '/songs/canon.mid', name: "Pachelbel's Canon" },
  { url: '/songs/turkish-march.mid', name: 'Rondo alla Turca' },
];

// ---------- layout ----------
const rootEl = document.getElementById('game-root')!;
rootEl.innerHTML = `
<div class="stage"><div class="cabinet">
  <div class="marquee">
    <div class="brand"><a href="/" class="back-link" title="Back to Sheetz transcription">←</a><h1>Sheetz Shooter</h1><span class="sub">Play · Shoot · Learn</span></div>
    <span class="midi-pill" id="midiPill"><span class="dot"></span> <span id="midiText">MIDI: not connected</span></span>
  </div>
  <div class="hud">
    <div class="card">
      <div class="eyebrow"><span id="tier">Beginner</span> · <span id="handHint">right hand</span></div>
      <div class="song-title" id="songTitle">—</div>
      <div class="song-sub" id="songSub">Loading song library…</div>
    </div>
    <div class="card">
      <div class="stat-row">
        <div class="stat"><span class="eyebrow">Score</span><span class="num score" id="score">0</span></div>
        <div class="stat"><span class="eyebrow">Combo</span><span class="num combo" id="combo">×1</span></div>
        <div class="stat"><span class="eyebrow">Accuracy</span><span class="num acc" id="acc">100%</span></div>
        <div class="stat"><span class="eyebrow">Lives</span><span class="num" id="lives" style="color:var(--red)">♥♥♥</span></div>
        <div class="stars" id="stars"><span class="s">★</span><span class="s">★</span><span class="s">★</span></div>
      </div>
      <div class="eyebrow" style="margin-top:8px">Shields</div>
      <div class="health-track"><div class="health-fill" id="health"></div></div>
    </div>
  </div>
  <div class="screen">
    <canvas id="game"></canvas>
    <div class="piano-case"><div class="piano" id="piano"></div></div>
    <div class="scanlines"></div>
    <div class="overlay" id="overlay">
      <h2 id="ovTitle">Play the song. Blast the invasion.</h2>
      <p id="ovText">Enemies form above the exact key the song needs next — right-hand notes and left-hand notes in their own colours, chords side-by-side, long notes as holds. Play them in time on your MIDI keyboard (or computer keys / clicking) to fire and clear the wave.</p>
      <button class="btn" id="startBtn">▶ Start</button>
    </div>
  </div>
  <div class="console">
    <button class="btn ghost" id="connectBtn">🎹 Connect MIDI</button>
    <select class="select" id="songSelect"></select>
    <label class="file-label">📂 Load .mid<input type="file" id="fileInput" accept=".mid,.midi,audio/midi"></label>
    <span class="theme-pills" id="themePills"></span>
    <button class="btn ghost" id="demoBtn" aria-pressed="false">👁 Demo: off</button>
    <div class="spacer"></div>
    <button class="btn" id="playBtn">▶ Start</button>
    <button class="btn ghost" id="restartBtn">↻ Restart</button>
  </div>
  <p class="foot">Difficulty is auto-rated from each song. Themes are swappable. <b>Load .mid</b> to play any file. <b>Demo</b> watches a perfect run. Keys: home row <b>a s d f g h j…</b> = C4 up.</p>
</div></div>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const midiPill = $('midiPill'), midiText = $('midiText');
const songTitleEl = $('songTitle'), songSubEl = $('songSub'), tierEl = $('tier'), handHint = $('handHint');
const scoreEl = $('score'), comboEl = $('combo'), accEl = $('acc'), livesEl = $('lives'), healthEl = $('health'), starsEl = $('stars');
const overlay = $('overlay'), ovTitle = $('ovTitle'), ovText = $('ovText');
const piano = $('piano');
const canvas = $<HTMLCanvasElement>('game');
const ctx = canvas.getContext('2d')!;

let theme: Theme = THEMES[0];

// ---------- piano ----------
const whiteMidis: number[] = [];
for (let m = LOW; m <= HIGH; m++) if (!isBlack(m)) whiteMidis.push(m);
const keyEls: Record<number, HTMLElement> = {};
whiteMidis.forEach((m) => {
  const el = document.createElement('div');
  el.className = 'wkey'; el.dataset.midi = String(m);
  el.innerHTML = m % 12 === 0 ? `<span class="lbl">${noteName(m)}</span>` : '';
  piano.appendChild(el); keyEls[m] = el;
});
function positionBlacks() {
  piano.querySelectorAll('.bkey').forEach((b) => b.remove());
  const w = piano.clientWidth / whiteMidis.length;
  for (let m = LOW; m <= HIGH; m++) {
    if (!isBlack(m)) continue;
    const idx = whiteMidis.indexOf(m - 1);
    if (idx < 0) continue;
    const b = document.createElement('div');
    b.className = 'bkey'; b.dataset.midi = String(m);
    b.style.left = (idx + 1) * w + 'px';
    b.style.width = w * 0.64 + 'px';
    piano.appendChild(b); keyEls[m] = b;
  }
}
positionBlacks();
window.addEventListener('resize', positionBlacks);
function lightKey(m: number) { const el = keyEls[m]; if (!el) return; el.classList.add('lit'); setTimeout(() => el.classList.remove('lit'), 190); }

// ---------- canvas ----------
let W = 0, H = 0, DPR = 1, baseH = 0;
let field: { x: number; y: number; z: number }[] = [];
const caseEl = document.querySelector('.piano-case') as HTMLElement;
function makeField() { field = Array.from({ length: 100 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: 0.3 + Math.random() * 0.7 })); }
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  W = r.width; H = r.height;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  baseH = caseEl?.offsetHeight || H * 0.22;
  makeField();
}
new ResizeObserver(resize).observe(canvas);
resize();
const strikeY = () => H - baseH;
const whiteW = () => W / whiteMidis.length;
function keyX(m: number) { const w = whiteW(); return isBlack(m) ? (whiteMidis.indexOf(m - 1) + 1) * w : whiteMidis.indexOf(m) * w + w / 2; }

// ---------- state ----------
interface Alien { midi: number; x: number; y: number; time: number; dur: number; idx: number; hand: 'L' | 'R'; hold: boolean; holding: boolean; resolved: '' | 'hit' | 'miss'; flash: number; alive: boolean; }
interface Bolt { x: number; y: number; ty: number; target: Alien | null; done: boolean; }
interface Sustain { x: number; ty: number; endT: number; alien: Alien; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; sz: number; }
interface Popup { x: number; y: number; text: string; color: string; life: number; }
interface Boss { hp: number; max: number; x: number; flash: number; }

let song: Song | null = null;
let synth: Synth | null = null;
let demo = false, running = false, startAt = 0, rafId = 0, sinceStart = 0;
let bossStartIdx = Infinity;

interface State {
  aliens: Alien[]; bolts: Bolt[]; sustains: Sustain[]; parts: Particle[]; popups: Popup[]; boss: Boss | null;
  score: number; combo: number; maxCombo: number; hits: number; total: number; health: number; lives: number;
  shake: number; redFlash: number; ship: { x: number; target: number; fire: number }; cursor: number; guideCursor: number;
}
let state: State;
function freshState(): State {
  return { aliens: [], bolts: [], sustains: [], parts: [], popups: [], boss: null,
    score: 0, combo: 0, maxCombo: 0, hits: 0, total: 0, health: 100, lives: 3,
    shake: 0, redFlash: 0, ship: { x: W / 2, target: W / 2, fire: 0 }, cursor: 0, guideCursor: 0 };
}
state = freshState();

function setSong(s: Song, subExtra = '') {
  song = s;
  state = freshState();
  running = false;
  const meta = s.meta!;
  const n = s.notes.length;
  bossStartIdx = n >= 8 ? n - Math.min(6, Math.max(3, Math.floor(n * 0.15))) : Infinity;
  const hands = new Set(s.notes.map((x) => hand(x.midi)));
  songTitleEl.textContent = s.name;
  songSubEl.textContent = `${n} notes · ${s.bpm} BPM · ${Math.round(s.duration)}s · ${meta.notesPerSec.toFixed(1)} notes/s${meta.maxPolyphony > 1 ? ` · chords ×${meta.maxPolyphony}` : ''}${subExtra ? ' · ' + subExtra : ''}`;
  tierEl.textContent = meta.tier;
  handHint.textContent = hands.size > 1 ? 'both hands' : hands.has('L') ? 'left hand' : 'right hand';
  updateHUD();
  drawStatic();
}

// ---------- HUD ----------
function updateHUD() {
  scoreEl.textContent = state.score.toLocaleString();
  comboEl.textContent = '×' + Math.max(1, Math.min(4, Math.floor(state.combo / 8) + 1));
  accEl.textContent = (state.total ? Math.round((state.hits / state.total) * 100) : 100) + '%';
  livesEl.textContent = '♥'.repeat(Math.max(0, state.lives)) || '—';
  healthEl.style.width = state.health + '%';
  const t = [500, 1500, 3000];
  starsEl.querySelectorAll('.s').forEach((s, i) => s.classList.toggle('on', state.score >= t[i]));
}

// ---------- gameplay ----------
function spawnAlien(idx: number) {
  const nt = song!.notes[idx];
  state.aliens.push({ midi: nt.midi, x: keyX(nt.midi), y: H * ROWS[idx % ROWS.length], time: nt.time, dur: nt.duration,
    idx, hand: hand(nt.midi), hold: nt.duration >= HOLD_MIN, holding: false, resolved: '', flash: 0, alive: true });
  if (idx >= bossStartIdx && !state.boss) state.boss = { hp: song!.notes.length - bossStartIdx, max: song!.notes.length - bossStartIdx, x: W / 2, flash: 0 };
}
function fireLaser(a: Alien) { state.ship.target = a.x; state.ship.fire = 1; state.bolts.push({ x: a.x, y: strikeY() - 12, ty: a.y, target: a, done: false }); }
function detonate(b: Bolt) { burst(b.x, b.ty, theme.impact); if (b.target && b.target.alive && !b.target.holding) b.target.alive = false; }
function spawnPopup(x: number, y: number, text: string, color: string) { state.popups.push({ x, y, text, color, life: 1 }); }

function resolveHit(a: Alien, st: number) {
  a.resolved = 'hit';
  const err = Math.abs(a.time - st);
  const q = err < 0.06 ? 2 : err < 0.13 ? 1 : 0;
  spawnPopup(a.x, a.y - a.dur * 0 - 16, q === 2 ? 'PERFECT' : q === 1 ? 'GOOD' : 'OK', q === 2 ? '#8fffc1' : q === 1 ? '#8fd0ff' : '#ffd76a');
  const mult = Math.min(4, Math.floor(state.combo / 8) + 1);
  state.score += (10 + q * 4) * mult;
  state.combo++; state.hits++; state.total++;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  if (state.boss && a.idx >= bossStartIdx) { state.boss.hp--; state.boss.flash = 1; if (state.boss.hp <= 0) defeatBoss(); }
  if (a.hold) { a.holding = true; state.ship.target = a.x; state.ship.fire = 1; state.sustains.push({ x: a.x, ty: a.y, endT: st + a.dur, alien: a }); spawnPopup(a.x, a.y - 30, 'HOLD', '#ffd76a'); }
  else fireLaser(a);
  updateHUD();
}
function resolveMiss(a: Alien) {
  a.resolved = 'miss'; a.flash = 1;
  state.total++; state.combo = 0;
  state.shake = 1; state.redFlash = 1;
  spawnPopup(a.x, a.y, 'MISS', '#ff6b7a');
  state.health -= 22;
  if (state.health <= 0) { state.lives--; state.health = 100; if (state.lives <= 0) { updateHUD(); gameOver(); return; } }
  updateHUD();
}
function defeatBoss() {
  if (!state.boss) return;
  for (let i = 0; i < 3; i++) burst(state.boss.x + (Math.random() - 0.5) * 60, H * 0.13 + (Math.random() - 0.5) * 40, theme.impact);
  spawnPopup(state.boss.x, H * 0.13, 'BOSS DOWN!', theme.laserCore);
  state.score += 250; state.boss = null; updateHUD();
}
function wildShot(midi: number) { state.ship.target = keyX(midi); state.ship.fire = 1; state.bolts.push({ x: keyX(midi), y: strikeY() - 12, ty: strikeY() - H * 0.5, target: null, done: false }); }
function burst(x: number, y: number, color: string) { for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, sp = 0.6 + Math.random() * 3; state.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color, sz: 1.4 + Math.random() * 2.6 }); } }

function playNote(midi: number) {
  lightKey(midi); synth?.blip(midi, 0.3);
  if (!running || !song) { drawStatic(); return; }
  const st = songTime();
  let best: Alien | null = null, bestErr = 1e9;
  for (const a of state.aliens) { if (a.resolved || a.midi !== midi) continue; const e = Math.abs(a.time - st); if (e < bestErr) { bestErr = e; best = a; } }
  if (best && bestErr <= WINDOW) resolveHit(best, st); else wildShot(midi);
}

const songTime = () => (synth ? synth.now() - startAt : 0);

// ---------- loop ----------
function loop() {
  if (!running || !song) return;
  const st = songTime();
  sinceStart += 16;

  while (state.guideCursor < song.notes.length && song.notes[state.guideCursor].time <= st + 0.12) {
    const n = song.notes[state.guideCursor];
    synth?.play(n.midi, startAt + n.time, Math.min(0.5, n.duration), 0.11);
    state.guideCursor++;
  }
  while (state.cursor < song.notes.length && song.notes[state.cursor].time <= st + LEAD) { spawnAlien(state.cursor); state.cursor++; }
  for (const a of state.aliens) {
    if (a.resolved) continue;
    if (demo && st >= a.time) { lightKey(a.midi); synth?.blip(a.midi, 0.26); resolveHit(a, st); }
    else if (!demo && st > a.time + WINDOW) resolveMiss(a);
  }

  const boltSpeed = 0.6 * (H / 600);
  for (const b of state.bolts) { b.y -= boltSpeed * 16; if (!b.done && b.y <= b.ty) { b.done = true; detonate(b); } }
  state.bolts = state.bolts.filter((b) => !b.done && b.y > b.ty - 4);
  for (const s of state.sustains) { if (st >= s.endT) { burst(s.x, s.ty, theme.impact); if (s.alien.alive) s.alien.alive = false; state.score += 8; } }
  state.sustains = state.sustains.filter((s) => st < s.endT);
  for (const a of state.aliens) { a.flash = Math.max(0, a.flash - 16 / 300); if (a.resolved === 'miss' && a.flash <= 0) a.alive = false; }
  state.aliens = state.aliens.filter((a) => a.alive);
  if (state.boss) state.boss.flash = Math.max(0, state.boss.flash - 16 / 300);

  const next = state.aliens.filter((a) => !a.resolved).sort((x, y) => x.time - y.time)[0];
  if (next) state.ship.target = next.x;
  state.ship.x += (state.ship.target - state.ship.x) * Math.min(1, 16 / 110);
  state.ship.fire = Math.max(0, state.ship.fire - 16 / 150);
  state.parts.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 16 / 700; });
  state.parts = state.parts.filter((p) => p.life > 0);
  state.popups.forEach((p) => { p.y -= 0.5; p.life -= 16 / 900; });
  state.popups = state.popups.filter((p) => p.life > 0);
  state.shake = Math.max(0, state.shake - 16 / 260);
  state.redFlash = Math.max(0, state.redFlash - 16 / 300);
  for (const s of field) { s.y += theme.fieldDir * s.z * 0.5; if (s.y > H) s.y = 0; else if (s.y < 0) s.y = H; }

  piano.querySelectorAll('.due').forEach((e) => e.classList.remove('due'));
  if (next && keyEls[next.midi]) keyEls[next.midi].classList.add('due');

  draw();
  if (st > song.duration + 2 && !state.aliens.length && !state.sustains.length) { finishSong(); return; }
  rafId = requestAnimationFrame(loop);
}

function finishSong() {
  running = false;
  const acc = state.total ? Math.round((state.hits / state.total) * 100) : 0;
  ovTitle.textContent = `Wave cleared — ${acc}% accuracy`;
  ovText.textContent = `Score ${state.score.toLocaleString()} · best combo ×${state.maxCombo} · ${state.lives} lives left. Start again, try a harder song, switch theme, or load your own .mid.`;
  overlay.classList.remove('hidden'); playBtn.textContent = '▶ Start';
  piano.querySelectorAll('.due').forEach((e) => e.classList.remove('due'));
}
function gameOver() {
  running = false; cancelAnimationFrame(rafId);
  ovTitle.textContent = 'Shields down — game over';
  ovText.textContent = `You cleared to ${state.total ? Math.round((state.hits / state.total) * 100) : 0}% accuracy for ${state.score.toLocaleString()} points. Press Start to try again — turn on Demo to see it played, or pick an easier song.`;
  overlay.classList.remove('hidden'); playBtn.textContent = '▶ Start';
}

// ---------- render ----------
function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (state.shake > 0) { const s = state.shake * 5; ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s); }
  theme.bg(ctx, W, H, sinceStart, field);
  drawLanes();
  drawSustains();
  drawAliens();
  drawBoss();
  drawBolts();
  theme.shooter(ctx, state.ship.x, strikeY() - 6, state.ship.fire, sinceStart);
  drawParticles();
  drawPopups();
  ctx.restore();
  if (state.redFlash > 0) { ctx.fillStyle = `rgba(255,92,108,${state.redFlash * 0.22})`; ctx.fillRect(0, 0, W, H); }
  drawVignette();
}
function drawStatic() {
  ctx.clearRect(0, 0, W, H);
  theme.bg(ctx, W, H, sinceStart, field); drawLanes();
  if (song) song.notes.slice(0, 6).forEach((n, i) => theme.enemy(ctx, keyX(n.midi), H * ROWS[i % ROWS.length], { midi: n.midi, hand: hand(n.midi), flash: 0, hold: n.duration >= HOLD_MIN, boss: false, r: 14 }, sinceStart));
  drawBolt({ x: keyX(67), y: H * 0.5, ty: H * 0.17 } as Bolt);
  theme.shooter(ctx, W / 2, strikeY() - 6, 0, sinceStart); drawVignette();
}
function drawLanes() {
  const w = whiteW(), sy = strikeY();
  for (let i = 0; i <= whiteMidis.length; i++) { ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(i * w, 0); ctx.lineTo(i * w, sy); ctx.stroke(); }
  const b = state.bolts[state.bolts.length - 1];
  if (b) { const lg = ctx.createLinearGradient(0, 0, 0, sy); lg.addColorStop(0, 'transparent'); lg.addColorStop(1, theme.laneGlow); ctx.fillStyle = lg; ctx.fillRect(b.x - w * 0.5, 0, w, sy); }
  const grd = ctx.createLinearGradient(0, sy - 14, 0, sy + 2); grd.addColorStop(0, 'transparent'); grd.addColorStop(1, theme.laneGlow); ctx.fillStyle = grd; ctx.fillRect(0, sy - 14, W, 16);
}
function drawAliens() {
  for (const a of state.aliens) {
    theme.enemy(ctx, a.x, a.y, { midi: a.midi, hand: a.hand, flash: a.flash, hold: a.hold, boss: false, r: 14 }, sinceStart);
    ctx.fillStyle = '#eef1fb'; ctx.font = '700 10px ui-monospace, monospace'; ctx.textAlign = 'center';
    ctx.fillText(noteName(a.midi), a.x, a.y - 20);
  }
}
function drawBoss() {
  if (!state.boss) return;
  const bx = state.boss.x, by = H * 0.12;
  theme.enemy(ctx, bx, by, { midi: 60, hand: 'R', flash: state.boss.flash, hold: false, boss: true, r: 16 }, sinceStart);
  const bw = 120, hp = state.boss.hp / state.boss.max;
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx - bw / 2, by - 44, bw, 7);
  ctx.fillStyle = theme.laser; ctx.fillRect(bx - bw / 2, by - 44, bw * Math.max(0, hp), 7);
  ctx.fillStyle = '#eef1fb'; ctx.font = '700 10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText('BOSS', bx, by - 50);
}
function drawSustains() {
  for (const s of state.sustains) {
    ctx.save(); ctx.shadowColor = theme.laser; ctx.shadowBlur = 16;
    const g = ctx.createLinearGradient(0, strikeY(), 0, s.ty); g.addColorStop(0, theme.laser); g.addColorStop(1, theme.laserCore);
    ctx.fillStyle = g; ctx.fillRect(s.x - 4, s.ty, 8, strikeY() - s.ty);
    ctx.fillStyle = theme.laserCore; ctx.fillRect(s.x - 1.5, s.ty, 3, strikeY() - s.ty);
    ctx.restore();
  }
}
function drawBolt(b: Bolt) {
  const len = 72; ctx.save(); ctx.shadowColor = theme.laser; ctx.shadowBlur = 22;
  const grd = ctx.createLinearGradient(0, b.y + len, 0, b.y); grd.addColorStop(0, 'transparent'); grd.addColorStop(0.7, theme.laser); grd.addColorStop(1, theme.laser);
  ctx.fillStyle = grd; ctx.fillRect(b.x - 3, b.y, 6, len);
  ctx.shadowBlur = 12; const core = ctx.createLinearGradient(0, b.y + len, 0, b.y); core.addColorStop(0, 'transparent'); core.addColorStop(1, theme.laserCore);
  ctx.fillStyle = core; ctx.fillRect(b.x - 1.2, b.y, 2.4, len);
  ctx.shadowColor = theme.laser; ctx.shadowBlur = 24; ctx.fillStyle = theme.laserCore; ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, 6.2832); ctx.fill();
  ctx.restore();
}
function drawBolts() { for (const b of state.bolts) drawBolt(b); }
function drawParticles() { for (const p of state.parts) { ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, 6.2832); ctx.fill(); ctx.restore(); } }
function drawPopups() { for (const p of state.popups) { ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.font = '700 13px system-ui'; ctx.textAlign = 'center'; ctx.shadowColor = p.color; ctx.shadowBlur = 8; ctx.fillText(p.text, p.x, p.y); ctx.restore(); } }
function drawVignette() { const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8); v.addColorStop(0, 'transparent'); v.addColorStop(1, 'rgba(0,0,0,0.5)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H); }

// ---------- controls ----------
const playBtn = $<HTMLButtonElement>('playBtn');
async function start() {
  if (!song) return;
  if (synth) synth.ctx.close();
  synth = new Synth(); await synth.resume();
  const keepTheme = theme; state = freshState(); void keepTheme;
  updateHUD();
  startAt = synth.now() + 0.5; sinceStart = 0; running = true;
  overlay.classList.add('hidden'); playBtn.textContent = '⏸ Stop';
  cancelAnimationFrame(rafId); rafId = requestAnimationFrame(loop);
}
function stop() { running = false; cancelAnimationFrame(rafId); if (synth) { synth.ctx.close(); synth = null; } playBtn.textContent = '▶ Start'; }
playBtn.addEventListener('click', () => (running ? stop() : start()));
$('startBtn').addEventListener('click', start);
$('restartBtn').addEventListener('click', start);

// song library (auto-difficulty)
const cache = new Map<string, Song>();
const songSelect = $<HTMLSelectElement>('songSelect');
songSelect.addEventListener('change', () => { stop(); const s = cache.get(songSelect.value); if (s) setSong(s); });

// theme pills
const themePills = $('themePills');
THEMES.forEach((t) => {
  const b = document.createElement('button');
  b.className = 'theme-pill' + (t.id === theme.id ? ' active' : '');
  b.textContent = `${t.emoji} ${t.name}`;
  b.addEventListener('click', () => { theme = t; themePills.querySelectorAll('.theme-pill').forEach((p) => p.classList.remove('active')); b.classList.add('active'); if (!running) drawStatic(); });
  themePills.appendChild(b);
});

$('demoBtn').addEventListener('click', () => { demo = !demo; const b = $('demoBtn'); b.textContent = demo ? '👁 Demo: on' : '👁 Demo: off'; b.setAttribute('aria-pressed', String(demo)); });

$<HTMLInputElement>('fileInput').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return; stop();
  try {
    const buf = await file.arrayBuffer();
    const s = parseMidi(buf, file.name.replace(/\.midi?$/i, ''));
    if (!s.notes.length) { songSubEl.textContent = 'That file has no playable notes.'; return; }
    setSong(s, 'your file');
  } catch (err) { songSubEl.textContent = `Couldn't read that MIDI (${err instanceof Error ? err.message : String(err)}).`; }
});

let midiConn: MidiConnection | null = null;
$('connectBtn').addEventListener('click', async () => {
  midiConn?.disconnect();
  midiConn = await connectMidi((m) => playNote(m));
  const map: Record<string, string> = { connected: `MIDI: ${midiConn.deviceName || 'keyboard'} ✓`, unsupported: 'MIDI: not supported here', denied: 'MIDI: access denied', 'no-devices': 'MIDI: no devices found' };
  midiText.textContent = map[midiConn.status];
  midiPill.classList.toggle('on', midiConn.status === 'connected');
});
attachKeyboard((m) => playNote(m));
piano.addEventListener('pointerdown', (e) => { const k = (e.target as HTMLElement).closest('[data-midi]') as HTMLElement | null; if (k) playNote(+k.dataset.midi!); });

// ---------- boot: preload library, sort by auto-difficulty ----------
(async () => {
  const loaded = await Promise.all(LIBRARY.map(async (l) => {
    try { const s = await loadSongFromUrl(l.url, l.name); cache.set(l.url, s); return { url: l.url, s }; } catch { return null; }
  }));
  const valid = loaded.filter((x): x is { url: string; s: Song } => !!x).sort((a, b) => a.s.meta!.score - b.s.meta!.score);
  if (!valid.length) { songSubEl.textContent = 'Could not load the song library.'; return; }
  songSelect.innerHTML = '';
  for (const v of valid) {
    const o = document.createElement('option');
    o.value = v.url; o.textContent = `${v.s.name} · ${v.s.meta!.tier}`;
    songSelect.appendChild(o);
  }
  songSelect.value = valid[0].url;
  setSong(valid[0].s);
})();
