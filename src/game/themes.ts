// Skinnable themes. Each theme owns its background, enemy sprite, shooter, and
// projectile palette, so the engine in main.ts stays theme-agnostic and just
// calls theme.bg / theme.enemy / theme.shooter and reads theme.laser.

export interface FieldParticle { x: number; y: number; z: number; }

export interface EnemyOpts {
  midi: number;
  hand: 'L' | 'R';
  flash: number;   // 0..1 red hit-flash
  hold: boolean;   // sustained note
  boss: boolean;
  r: number;
}

export interface Theme {
  id: string;
  name: string;
  emoji: string;
  laser: string;       // projectile body
  laserCore: string;   // projectile hot core
  laneGlow: string;    // rgba lane highlight
  impact: string;      // explosion particle color
  fieldDir: 1 | -1;    // +1 field drifts down (stars), -1 drifts up (embers/bubbles)
  bg(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, field: FieldParticle[]): void;
  enemy(ctx: CanvasRenderingContext2D, x: number, y: number, o: EnemyOpts, t: number): void;
  shooter(ctx: CanvasRenderingContext2D, x: number, y: number, fire: number, t: number): void;
}

const roundEllipseDome = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath(); ctx.arc(x, y, r, Math.PI, 0); ctx.fill();
};

// ---------------------------------------------------------------- SPACE
const space: Theme = {
  id: 'space', name: 'Space Invasion', emoji: '🛸',
  laser: '#3ea0ff', laserCore: '#dff0ff', laneGlow: 'rgba(62,160,255,0.16)', impact: '#8fd0ff', fieldDir: 1,
  bg(ctx, W, H, _t, field) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0b26'); g.addColorStop(0.55, '#080718'); g.addColorStop(1, '#04040c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const neb = ctx.createRadialGradient(W * 0.75, H * 0.28, 20, W * 0.75, H * 0.28, W * 0.6);
    neb.addColorStop(0, 'rgba(120,60,200,0.2)'); neb.addColorStop(1, 'transparent');
    ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);
    for (const s of field) { ctx.globalAlpha = 0.35 + s.z * 0.6; ctx.fillStyle = '#dfefff'; ctx.fillRect(s.x, s.y, s.z * 1.6, s.z * 1.6); }
    ctx.globalAlpha = 1;
  },
  enemy(ctx, x, y, o, t) {
    const wob = Math.sin(t / 220 + x) * 3; const cx = x + wob, r = o.r * (o.boss ? 2.2 : 1);
    const glass = o.flash > 0 ? '#ff6b7a' : (o.hand === 'L' ? '#ffcf6a' : '#8affc1');
    ctx.save();
    if (o.hold) { ctx.strokeStyle = 'rgba(138,255,193,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, y + r * 1.6); ctx.stroke(); }
    ctx.shadowColor = glass; ctx.shadowBlur = 14; ctx.fillStyle = o.flash > 0 ? '#5a1720' : '#2a2f4a';
    ctx.beginPath(); ctx.ellipse(cx, y + 4, r * 1.35, r * 0.5, 0, 0, 6.2832); ctx.fill(); ctx.shadowBlur = 0;
    const dg = ctx.createRadialGradient(cx - r * 0.3, y - r * 0.4, 2, cx, y, r * 0.95);
    dg.addColorStop(0, '#fff'); dg.addColorStop(0.4, glass); dg.addColorStop(1, 'rgba(20,20,40,0.6)');
    ctx.fillStyle = dg; roundEllipseDome(ctx, cx, y, r * 0.72);
    ctx.fillStyle = '#0a0a18';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.22, y - r * 0.18, r * 0.11, r * 0.16, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + r * 0.22, y - r * 0.18, r * 0.11, r * 0.16, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
  },
  shooter(ctx, x, y, fire, t) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(84,230,255,0.5)'; ctx.shadowColor = '#54e6ff'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(-6, 10); ctx.lineTo(0, 20 + Math.sin(t / 60) * 4); ctx.lineTo(6, 10); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    const hg = ctx.createLinearGradient(0, -16, 0, 12); hg.addColorStop(0, '#eaf6ff'); hg.addColorStop(0.5, '#7fb6d8'); hg.addColorStop(1, '#2b3f5e');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(16, 10); ctx.lineTo(7, 12); ctx.lineTo(0, 8); ctx.lineTo(-7, 12); ctx.lineTo(-16, 10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(84,230,255,0.8)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = '#ff5d8f'; ctx.shadowColor = '#ff5d8f'; ctx.shadowBlur = 6 + fire * 10;
    ctx.beginPath(); ctx.arc(0, -4, 4.5, 0, 6.2832); ctx.fill();
    if (fire > 0.05) { ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 16 * fire; ctx.beginPath(); ctx.arc(0, -18, 3 + fire * 5, 0, 6.2832); ctx.fill(); }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- CASTLE SIEGE
const castle: Theme = {
  id: 'castle', name: 'Castle Siege', emoji: '🏰',
  laser: '#ff9a3c', laserCore: '#ffe6b0', laneGlow: 'rgba(255,154,60,0.16)', impact: '#ffb861', fieldDir: -1,
  bg(ctx, W, H, _t, field) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#241640'); g.addColorStop(0.5, '#1a1030'); g.addColorStop(1, '#0c0715');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // moon
    ctx.fillStyle = 'rgba(255,236,190,0.9)'; ctx.shadowColor = 'rgba(255,220,150,0.6)'; ctx.shadowBlur = 40;
    ctx.beginPath(); ctx.arc(W * 0.8, H * 0.22, 26, 0, 6.2832); ctx.fill(); ctx.shadowBlur = 0;
    // embers (field)
    for (const s of field) { ctx.globalAlpha = 0.3 + s.z * 0.5; ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.arc(s.x, s.y, s.z * 1.4, 0, 6.2832); ctx.fill(); }
    ctx.globalAlpha = 1;
    // battlements along the base
    const bh = H * 0.10, by = H - bh; ctx.fillStyle = '#0a0712';
    ctx.fillRect(0, by, W, bh);
    for (let x = 0; x < W; x += 46) ctx.fillRect(x, by - 10, 24, 12);
  },
  enemy(ctx, x, y, o, t) {
    const flap = Math.sin(t / 120 + x) * 0.5; const r = o.r * (o.boss ? 2.2 : 1);
    const col = o.flash > 0 ? '#ff6b7a' : (o.hand === 'L' ? '#ff7a6a' : '#b98cff');
    ctx.save(); ctx.translate(x, y + Math.sin(t / 200 + x) * 2);
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12;
    // wings (bat/dragon)
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-r * 1.6, -r * (0.8 + flap), -r * 1.9, r * 0.3); ctx.quadraticCurveTo(-r * 1.1, r * 0.1, 0, r * 0.4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 1.6, -r * (0.8 + flap), r * 1.9, r * 0.3); ctx.quadraticCurveTo(r * 1.1, r * 0.1, 0, r * 0.4); ctx.fill();
    // body
    ctx.shadowBlur = 0; ctx.fillStyle = '#2a1224';
    ctx.beginPath(); ctx.ellipse(0, r * 0.1, r * 0.5, r * 0.65, 0, 0, 6.2832); ctx.fill();
    // eyes
    ctx.fillStyle = '#ffe36a'; ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.05, r * 0.1, 0, 6.2832); ctx.arc(r * 0.2, -r * 0.05, r * 0.1, 0, 6.2832); ctx.fill();
    ctx.restore();
  },
  shooter(ctx, x, y, fire, _t) {
    ctx.save(); ctx.translate(x, y);
    // cannon barrel pointing up
    ctx.fillStyle = '#3a2c1e'; ctx.beginPath(); ctx.arc(0, 8, 11, 0, 6.2832); ctx.fill(); // wheel
    ctx.fillStyle = '#6b7078'; ctx.strokeStyle = '#2a2d33'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-7, 8); ctx.lineTo(-5, -16); ctx.lineTo(5, -16); ctx.lineTo(7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (fire > 0.05) { ctx.fillStyle = '#ffd76a'; ctx.shadowColor = '#ff9a3c'; ctx.shadowBlur = 18 * fire; ctx.beginPath(); ctx.arc(0, -18, 4 + fire * 6, 0, 6.2832); ctx.fill(); }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- DEEP REEF
const reef: Theme = {
  id: 'reef', name: 'Deep Reef', emoji: '🌊',
  laser: '#3ee0ff', laserCore: '#dffcff', laneGlow: 'rgba(62,224,255,0.16)', impact: '#9ff0d8', fieldDir: -1,
  bg(ctx, W, H, _t, field) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a3550'); g.addColorStop(0.5, '#08283e'); g.addColorStop(1, '#04121f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // light rays
    ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = '#bfefff';
    for (let i = 0; i < 4; i++) { const bx = W * (0.2 + i * 0.2); ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + 40, 0); ctx.lineTo(bx + 120, H); ctx.lineTo(bx + 60, H); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    // bubbles (field)
    for (const s of field) { ctx.globalAlpha = 0.25 + s.z * 0.4; ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(s.x, s.y, s.z * 2, 0, 6.2832); ctx.stroke(); }
    ctx.globalAlpha = 1;
  },
  enemy(ctx, x, y, o, t) {
    const r = o.r * (o.boss ? 2.2 : 1);
    const col = o.flash > 0 ? '#ff6b7a' : (o.hand === 'L' ? '#5ad0c0' : '#ff8fb0');
    ctx.save(); ctx.translate(x, y + Math.sin(t / 200 + x) * 3);
    // jellyfish bell
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 14;
    const dg = ctx.createRadialGradient(0, -r * 0.2, 2, 0, 0, r);
    dg.addColorStop(0, '#ffffff'); dg.addColorStop(0.4, col); dg.addColorStop(1, 'rgba(10,30,40,0.5)');
    ctx.fillStyle = dg; roundEllipseDome(ctx, 0, r * 0.2, r * 0.85); ctx.shadowBlur = 0;
    // tentacles
    ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    for (let i = -2; i <= 2; i++) { const tx = i * r * 0.28; ctx.beginPath(); ctx.moveTo(tx, r * 0.2); ctx.quadraticCurveTo(tx + Math.sin(t / 150 + i) * 4, r * 0.9, tx, r * 1.5); ctx.stroke(); }
    ctx.restore();
  },
  shooter(ctx, x, y, fire, t) {
    ctx.save(); ctx.translate(x, y);
    // submarine
    ctx.fillStyle = '#f2c14e'; ctx.strokeStyle = '#8a6b1e'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(0, 2, 16, 9, 0, 0, 6.2832); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#123'; ctx.fillRect(-2, -14, 4, 10); // periscope
    ctx.fillStyle = '#bfefff'; ctx.beginPath(); ctx.arc(0, 2, 4, 0, 6.2832); ctx.fill(); // porthole
    if (fire > 0.05) { ctx.fillStyle = '#dffcff'; ctx.shadowColor = '#3ee0ff'; ctx.shadowBlur = 16 * fire; ctx.beginPath(); ctx.arc(0, -14, 3 + fire * 5, 0, 6.2832); ctx.fill(); }
    // idle bubbles
    ctx.globalAlpha = 0.5; ctx.strokeStyle = '#bfefff'; ctx.beginPath(); ctx.arc(10, -8 - (t / 40 % 14), 2, 0, 6.2832); ctx.stroke();
    ctx.restore();
  },
};

export const THEMES: Theme[] = [space, castle, reef];
export const themeById = (id: string) => THEMES.find((t) => t.id === id) || space;
