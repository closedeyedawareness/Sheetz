import './game.css';
import { loadSongFromUrl, parseMidi, type Song, type SongNote } from './song';
import { connectMidi, attachKeyboard, type MidiConnection } from './midiInput';
import { Synth } from './synth';

// ---------- note helpers ----------
const LOW = 21, HIGH = 108; // full 88-key piano A0..C8
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
const noteName = (m: number) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const LASER = '#3ea0ff', LASER_CORE = '#dff0ff';
const ROWS = [0.10, 0.17, 0.24];
const LEAD = 1.7;      // seconds an alien forms before its note is due
const WINDOW = 0.18;   // seconds: hit timing tolerance

const BUILTIN = {
  easy: { url: '/songs/easy-ode-to-joy.mid', name: 'Ode to Joy', label: 'Easy' },
  medium: { url: '/songs/medium-fur-elise.mid', name: 'Für Elise', label: 'Medium' },
  hard: { url: '/songs/hard-turkish-march.mid', name: 'Rondo alla Turca', label: 'Hard' },
};

// ---------- layout ----------
const root = document.getElementById('game-root')!;
root.innerHTML = `
<div class="stage"><div class="cabinet">
  <div class="marquee">
    <div class="brand"><h1>Sheetz Shooter</h1><span class="sub">Play · Shoot · Learn</span></div>
    <span class="midi-pill" id="midiPill"><span class="dot"></span> <span id="midiText">MIDI: not connected</span></span>
  </div>
  <div class="hud">
    <div class="card">
      <div class="eyebrow" id="diffLabel">Song · Easy</div>
      <div class="song-title" id="songTitle">—</div>
      <div class="song-sub" id="songSub">Pick a song and press Start</div>
    </div>
    <div class="card">
      <div class="stat-row">
        <div class="stat"><span class="eyebrow">Score</span><span class="num score" id="score">0</span></div>
        <div class="stat"><span class="eyebrow">Combo</span><span class="num combo" id="combo">×1</span></div>
        <div class="stat"><span class="eyebrow">Accuracy</span><span class="num acc" id="acc">100%</span></div>
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
      <p id="ovText">Each alien forms above the exact key the song needs next. Play that note in time on your MIDI keyboard (or the computer keys / by clicking) to fire a laser up and destroy it. Play the song right and you clear them all.</p>
      <button class="btn" id="startBtn">▶ Start</button>
    </div>
  </div>
  <div class="console">
    <button class="btn ghost" id="connectBtn">🎹 Connect MIDI</button>
    <select class="select" id="songSelect">
      <option value="easy">Easy · Ode to Joy</option>
      <option value="medium">Medium · Für Elise</option>
      <option value="hard">Hard · Rondo alla Turca</option>
    </select>
    <label class="file-label">📂 Load .mid<input type="file" id="fileInput" accept=".mid,.midi,audio/midi"></label>
    <button class="btn ghost" id="demoBtn" aria-pressed="false">👁 Demo: off</button>
    <div class="spacer"></div>
    <button class="btn" id="playBtn">▶ Start</button>
    <button class="btn ghost" id="restartBtn">↻ Restart</button>
  </div>
  <p class="foot">Bundled tunes are public-domain. <b>Load .mid</b> to play any MIDI file. Turn on <b>Demo</b> to watch a perfect play. Computer-key fallback: home row <b>a s d f g h j…</b> = C4 up.</p>
</div></div>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const midiPill = $('midiPill'), midiText = $('midiText');
const songTitleEl = $('songTitle'), songSubEl = $('songSub'), diffLabel = $('diffLabel');
const scoreEl = $('score'), comboEl = $('combo'), accEl = $('acc'), healthEl = $('health'), starsEl = $('stars');
const overlay = $('overlay'), ovTitle = $('ovTitle'), ovText = $('ovText');
const piano = $('piano');
const canvas = $<HTMLCanvasElement>('game');
const ctx = canvas.getContext('2d')!;

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
function lightKey(m: number) {
  const el = keyEls[m]; if (!el) return;
  el.classList.add('lit'); setTimeout(() => el.classList.remove('lit'), 190);
}

// ---------- canvas ----------
let W = 0, H = 0, DPR = 1, baseH = 0;
let stars: { x: number; y: number; z: number }[] = [];
const caseEl = document.querySelector('.piano-case') as HTMLElement;
function makeStars() { stars = Array.from({ length: 110 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: 0.3 + Math.random() * 0.7 })); }
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  W = r.width; H = r.height;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  baseH = caseEl?.offsetHeight || H * 0.22;
  makeStars();
}
new ResizeObserver(resize).observe(canvas);
resize();
const strikeY = () => H - baseH;
const whiteW = () => W / whiteMidis.length;
function keyX(m: number) {
  const w = whiteW();
  if (!isBlack(m)) return whiteMidis.indexOf(m) * w + w / 2;
  return (whiteMidis.indexOf(m - 1) + 1) * w;
}

// ---------- engine state ----------
interface Alien { midi: number; x: number; y: number; time: number; idx: number; resolved: '' | 'hit' | 'miss'; fired: boolean; flash: number; warp: number; wob: number; r: number; alive: boolean; }
interface Bolt { x: number; y: number; ty: number; target: Alien | null; done: boolean; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; sz: number; }

let song: Song | null = null;
let synth: Synth | null = null;
let demo = false;
let running = false;
let startAt = 0;      // AudioContext time the song began
let rafId = 0;
let sinceStart = 0;   // ms for cosmetic animation

interface State {
  aliens: Alien[]; bolts: Bolt[]; parts: Particle[];
  score: number; combo: number; maxCombo: number; hits: number; total: number; health: number;
  shake: number; redFlash: number; ship: { x: number; target: number; fire: number };
  cursor: number; guideCursor: number; done: boolean;
}
let state: State;
function freshState(): State {
  return { aliens: [], bolts: [], parts: [], score: 0, combo: 0, maxCombo: 0, hits: 0, total: 0, health: 100,
    shake: 0, redFlash: 0, ship: { x: W / 2, target: W / 2, fire: 0 }, cursor: 0, guideCursor: 0, done: false };
}
state = freshState();

function setSong(s: Song, label: string) {
  song = s;
  state = freshState();
  running = false;
  songTitleEl.textContent = s.name;
  songSubEl.textContent = `${s.notes.length} notes · ${s.bpm} BPM · ${Math.round(s.duration)}s — play the notes in time to clear them`;
  diffLabel.textContent = `Song · ${label}`;
  updateHUD();
  drawStatic();
}

// ---------- HUD ----------
function updateHUD() {
  scoreEl.textContent = state.score.toLocaleString();
  comboEl.textContent = '×' + Math.max(1, Math.min(4, Math.floor(state.combo / 8) + 1));
  accEl.textContent = (state.total ? Math.round((state.hits / state.total) * 100) : 100) + '%';
  healthEl.style.width = state.health + '%';
  const t = [500, 1500, 3000];
  starsEl.querySelectorAll('.s').forEach((s, i) => s.classList.toggle('on', state.score >= t[i]));
}

// ---------- gameplay ----------
function spawnAlien(n: SongNote, idx: number) {
  state.aliens.push({ midi: n.midi, x: keyX(n.midi), y: H * ROWS[idx % ROWS.length], time: n.time, idx,
    resolved: '', fired: false, flash: 0, warp: 1, wob: Math.random() * 6.28, r: 14, alive: true });
}
function fireLaser(a: Alien) {
  a.fired = true;
  state.ship.target = a.x; state.ship.fire = 1;
  state.bolts.push({ x: a.x, y: strikeY() - 12, ty: a.y, target: a, done: false });
}
function detonate(b: Bolt) {
  burst(b.x, b.ty, '#8fd0ff');
  if (b.target && b.target.alive) b.target.alive = false;
}
function resolveHit(a: Alien, st: number) {
  a.resolved = 'hit';
  fireLaser(a);
  const err = Math.abs(a.time - st);
  const quality = err < 0.06 ? 2 : err < 0.13 ? 1 : 0;
  const mult = Math.min(4, Math.floor(state.combo / 8) + 1);
  state.score += (10 + quality * 4) * mult;
  state.combo++; state.hits++; state.total++;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  updateHUD();
}
function resolveMiss(a: Alien) {
  a.resolved = 'miss'; a.fired = true; a.flash = 1;
  state.total++; state.combo = 0;
  state.health = Math.max(0, state.health - 8);
  state.shake = 1; state.redFlash = 1;
  updateHUD();
}
function wildShot(midi: number) {
  state.ship.target = keyX(midi); state.ship.fire = 1;
  state.bolts.push({ x: keyX(midi), y: strikeY() - 12, ty: strikeY() - H * 0.5, target: null, done: false });
}
function burst(x: number, y: number, color: string) {
  for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, sp = 0.6 + Math.random() * 3;
    state.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color, sz: 1.4 + Math.random() * 2.6 }); }
}

/** Player (or key/click/MIDI) plays a note. */
function playNote(midi: number) {
  lightKey(midi);
  synth?.blip(midi, 0.3);
  if (!running || !song) { drawStatic(); return; }
  const st = songTime();
  let best: Alien | null = null, bestErr = 1e9;
  for (const a of state.aliens) {
    if (a.resolved || a.midi !== midi) continue;
    const e = Math.abs(a.time - st);
    if (e < bestErr) { bestErr = e; best = a; }
  }
  if (best && bestErr <= WINDOW) resolveHit(best, st);
  else wildShot(midi);
}

// ---------- clock ----------
const songTime = () => (synth ? synth.now() - startAt : 0);

// ---------- loop ----------
function loop() {
  if (!running || !song) return;
  const st = songTime();
  sinceStart += 16;

  // guide track: schedule notes just ahead using the audio clock (stays in sync)
  while (state.guideCursor < song.notes.length && song.notes[state.guideCursor].time <= st + 0.12) {
    const n = song.notes[state.guideCursor];
    synth?.play(n.midi, startAt + n.time, Math.min(0.4, n.duration), 0.12);
    state.guideCursor++;
  }
  // form aliens ahead of their note
  while (state.cursor < song.notes.length && song.notes[state.cursor].time <= st + LEAD) {
    spawnAlien(song.notes[state.cursor], state.cursor); state.cursor++;
  }
  // resolve: demo auto-plays perfectly; otherwise a passed note is a miss
  for (const a of state.aliens) {
    if (a.resolved) continue;
    if (demo && st >= a.time) { lightKey(a.midi); synth?.blip(a.midi, 0.28); resolveHit(a, st); }
    else if (!demo && st > a.time + WINDOW) resolveMiss(a);
  }

  // bolts, aliens, ship, particles, stars
  const boltSpeed = 0.6 * (H / 600);
  for (const b of state.bolts) { b.y -= boltSpeed * 16; if (!b.done && b.y <= b.ty) { b.done = true; detonate(b); } }
  state.bolts = state.bolts.filter((b) => !b.done && b.y > b.ty - 4);
  for (const a of state.aliens) { a.flash = Math.max(0, a.flash - 16 / 300); if (a.warp) a.warp = Math.max(0, a.warp - 16 / 300); if (a.resolved === 'miss' && a.flash <= 0) a.alive = false; }
  state.aliens = state.aliens.filter((a) => a.alive);

  const next = state.aliens.filter((a) => !a.resolved).sort((x, y) => x.time - y.time)[0];
  if (next) state.ship.target = next.x;
  state.ship.x += (state.ship.target - state.ship.x) * Math.min(1, 16 / 110);
  state.ship.fire = Math.max(0, state.ship.fire - 16 / 150);
  state.parts.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 16 / 700; });
  state.parts = state.parts.filter((p) => p.life > 0);
  state.shake = Math.max(0, state.shake - 16 / 260);
  state.redFlash = Math.max(0, state.redFlash - 16 / 300);
  for (const s of stars) { s.y += s.z * 0.5; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } }

  piano.querySelectorAll('.due').forEach((e) => e.classList.remove('due'));
  if (next && keyEls[next.midi]) keyEls[next.midi].classList.add('due');

  draw();

  if (st > song.duration + 2 && !state.aliens.length) { finishSong(); return; }
  rafId = requestAnimationFrame(loop);
}

function finishSong() {
  running = false;
  const acc = state.total ? Math.round((state.hits / state.total) * 100) : 0;
  ovTitle.textContent = `Wave cleared — ${acc}% accuracy`;
  ovText.textContent = `Score ${state.score.toLocaleString()} · best combo ×${state.maxCombo}. Press Start to run it again, pick another difficulty, or load your own .mid.`;
  overlay.classList.remove('hidden');
  playBtn.textContent = '▶ Start';
  piano.querySelectorAll('.due').forEach((e) => e.classList.remove('due'));
}

// ---------- render ----------
function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (state.shake > 0) { const s = state.shake * 5; ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s); }
  drawSpace(); drawLanes(); drawAliens(); drawBolts(); drawShip(); drawParticles();
  ctx.restore();
  if (state.redFlash > 0) { ctx.fillStyle = `rgba(255,92,108,${state.redFlash * 0.22})`; ctx.fillRect(0, 0, W, H); }
  drawVignette();
}
function drawStatic() {
  ctx.clearRect(0, 0, W, H);
  drawSpace(); drawLanes();
  if (song) song.notes.slice(0, 6).forEach((n, i) => drawAlien({ midi: n.midi, x: keyX(n.midi), y: H * ROWS[i % ROWS.length], wob: i } as Alien));
  drawBolt({ x: keyX(67), y: H * 0.5, ty: H * 0.17 } as Bolt);
  drawShip(); drawVignette();
}
function drawSpace() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a0b26'); g.addColorStop(0.55, '#080718'); g.addColorStop(1, '#04040c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const neb = ctx.createRadialGradient(W * 0.75, H * 0.28, 20, W * 0.75, H * 0.28, W * 0.6);
  neb.addColorStop(0, 'rgba(120,60,200,0.2)'); neb.addColorStop(1, 'transparent');
  ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);
  for (const s of stars) { ctx.globalAlpha = 0.35 + s.z * 0.6; ctx.fillStyle = '#dfefff'; ctx.fillRect(s.x, s.y, s.z * 1.6, s.z * 1.6); }
  ctx.globalAlpha = 1;
}
function drawLanes() {
  const w = whiteW(), sy = strikeY();
  for (let i = 0; i <= whiteMidis.length; i++) { ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(i * w, 0); ctx.lineTo(i * w, sy); ctx.stroke(); }
  const b = state.bolts[state.bolts.length - 1];
  if (b) { const lg = ctx.createLinearGradient(0, 0, 0, sy); lg.addColorStop(0, 'transparent'); lg.addColorStop(1, 'rgba(62,160,255,0.16)'); ctx.fillStyle = lg; ctx.fillRect(b.x - w * 0.5, 0, w, sy); }
  const y = sy; const grd = ctx.createLinearGradient(0, y - 14, 0, y + 2); grd.addColorStop(0, 'transparent'); grd.addColorStop(1, 'rgba(84,230,255,0.12)'); ctx.fillStyle = grd; ctx.fillRect(0, y - 14, W, 16);
}
function drawAlien(a: Alien) {
  const wob = Math.sin(sinceStart / 220 + a.wob) * 3;
  const x = a.x + wob, y = a.y, r = a.r || 14;
  const red = (a.flash || 0) > 0;
  const glass = red ? '#ff6b7a' : (isBlack(a.midi) ? '#c98bff' : '#8affc1');
  const metal = red ? '#5a1720' : '#2a2f4a';
  ctx.save();
  ctx.shadowColor = glass; ctx.shadowBlur = 14; ctx.fillStyle = metal;
  ctx.beginPath(); ctx.ellipse(x, y + 4, r * 1.35, r * 0.5, 0, 0, 6.2832); ctx.fill();
  ctx.shadowBlur = 0;
  const dg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 2, x, y, r * 0.95);
  dg.addColorStop(0, '#fff'); dg.addColorStop(0.4, glass); dg.addColorStop(1, 'rgba(20,20,40,0.6)');
  ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(x, y, r * 0.72, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#0a0a18';
  ctx.beginPath(); ctx.ellipse(x - r * 0.22, y - r * 0.18, r * 0.11, r * 0.16, 0, 0, 6.2832); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + r * 0.22, y - r * 0.18, r * 0.11, r * 0.16, 0, 0, 6.2832); ctx.fill();
  ctx.fillStyle = '#eef1fb'; ctx.font = '700 10px ui-monospace, monospace'; ctx.textAlign = 'center';
  ctx.fillText(noteName(a.midi), x, y - r * 0.95);
  ctx.restore();
}
function drawAliens() { for (const a of state.aliens) drawAlien(a); }
function drawBolt(b: Bolt) {
  const len = 72;
  ctx.save();
  ctx.shadowColor = LASER; ctx.shadowBlur = 22;
  const grd = ctx.createLinearGradient(0, b.y + len, 0, b.y);
  grd.addColorStop(0, 'transparent'); grd.addColorStop(0.7, 'rgba(62,160,255,0.85)'); grd.addColorStop(1, LASER);
  ctx.fillStyle = grd; ctx.fillRect(b.x - 3, b.y, 6, len);
  ctx.shadowBlur = 12;
  const core = ctx.createLinearGradient(0, b.y + len, 0, b.y);
  core.addColorStop(0, 'transparent'); core.addColorStop(1, LASER_CORE);
  ctx.fillStyle = core; ctx.fillRect(b.x - 1.2, b.y, 2.4, len);
  ctx.shadowColor = LASER; ctx.shadowBlur = 24; ctx.fillStyle = LASER_CORE;
  ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, 6.2832); ctx.fill();
  ctx.restore();
}
function drawBolts() { for (const b of state.bolts) drawBolt(b); }
function drawShip() {
  const x = state.ship.x, y = strikeY() - 6, fire = state.ship.fire;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(84,230,255,0.5)'; ctx.shadowColor = '#54e6ff'; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.moveTo(-6, 10); ctx.lineTo(0, 20 + Math.sin(sinceStart / 60) * 4); ctx.lineTo(6, 10); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  const hg = ctx.createLinearGradient(0, -16, 0, 12); hg.addColorStop(0, '#eaf6ff'); hg.addColorStop(0.5, '#7fb6d8'); hg.addColorStop(1, '#2b3f5e');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(16, 10); ctx.lineTo(7, 12); ctx.lineTo(0, 8); ctx.lineTo(-7, 12); ctx.lineTo(-16, 10); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(84,230,255,0.8)'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.fillStyle = '#ff5d8f'; ctx.shadowColor = '#ff5d8f'; ctx.shadowBlur = 6 + fire * 10;
  ctx.beginPath(); ctx.arc(0, -4, 4.5, 0, 6.2832); ctx.fill();
  if (fire > 0.05) { ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 16 * fire; ctx.beginPath(); ctx.arc(0, -18, 3 + fire * 5, 0, 6.2832); ctx.fill(); }
  ctx.restore();
}
function drawParticles() {
  for (const p of state.parts) { ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, 6.2832); ctx.fill(); ctx.restore(); }
}
function drawVignette() {
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8);
  v.addColorStop(0, 'transparent'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

// ---------- controls ----------
const playBtn = $<HTMLButtonElement>('playBtn');
async function start() {
  if (!song) return;
  if (synth) synth.ctx.close();
  synth = new Synth();
  await synth.resume();
  state = freshState();
  updateHUD();
  startAt = synth.now() + 0.5;
  sinceStart = 0;
  running = true;
  overlay.classList.add('hidden');
  playBtn.textContent = '⏸ Stop';
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}
function stop() {
  running = false;
  cancelAnimationFrame(rafId);
  if (synth) { synth.ctx.close(); synth = null; }
  playBtn.textContent = '▶ Start';
}
playBtn.addEventListener('click', () => (running ? stop() : start()));
$('startBtn').addEventListener('click', start);
$('restartBtn').addEventListener('click', start);

$<HTMLSelectElement>('songSelect').addEventListener('change', async (e) => {
  const key = (e.target as HTMLSelectElement).value as keyof typeof BUILTIN;
  stop();
  await loadBuiltin(key);
});

$('demoBtn').addEventListener('click', () => {
  demo = !demo;
  const b = $('demoBtn');
  b.textContent = demo ? '👁 Demo: on' : '👁 Demo: off';
  b.setAttribute('aria-pressed', String(demo));
});

$<HTMLInputElement>('fileInput').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  stop();
  try {
    const buf = await file.arrayBuffer();
    const s = parseMidi(buf, file.name.replace(/\.midi?$/i, ''));
    if (!s.notes.length) { songSubEl.textContent = 'That file has no playable notes.'; return; }
    setSong(s, 'Custom');
  } catch (err) {
    songSubEl.textContent = `Couldn't read that MIDI file (${err instanceof Error ? err.message : String(err)}).`;
  }
});

// input: MIDI + keyboard + click
let midiConn: MidiConnection | null = null;
$('connectBtn').addEventListener('click', async () => {
  midiConn?.disconnect();
  midiConn = await connectMidi((m) => playNote(m));
  const map: Record<string, string> = { connected: `MIDI: ${midiConn.deviceName || 'keyboard'} ✓`, unsupported: 'MIDI: not supported in this browser', denied: 'MIDI: access denied', 'no-devices': 'MIDI: no devices found' };
  midiText.textContent = map[midiConn.status];
  midiPill.classList.toggle('on', midiConn.status === 'connected');
});
attachKeyboard((m) => playNote(m));
piano.addEventListener('pointerdown', (e) => {
  const k = (e.target as HTMLElement).closest('[data-midi]') as HTMLElement | null;
  if (k) playNote(+k.dataset.midi!);
});

// ---------- boot ----------
async function loadBuiltin(key: keyof typeof BUILTIN) {
  const b = BUILTIN[key];
  songSubEl.textContent = 'Loading…';
  try {
    const s = await loadSongFromUrl(b.url, b.name);
    setSong(s, b.label);
  } catch (err) {
    songSubEl.textContent = err instanceof Error ? err.message : String(err);
  }
}
loadBuiltin('easy');
