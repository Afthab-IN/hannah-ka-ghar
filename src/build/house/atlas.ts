import { mulberry32 } from '../../noise';
import type { Rect } from './util';

// One 1024 canvas for every printed / woven surface in the farmhouse.
export const ATLAS_SIZE = 1024;
export const R = {
  quilt1: [0, 0, 256, 256] as Rect,
  quilt2: [256, 0, 256, 256] as Rect,
  sign: [512, 0, 512, 144] as Rect,
  paint1: [512, 144, 256, 176] as Rect,
  paint2: [768, 144, 256, 176] as Rect,
  rug1: [0, 256, 512, 320] as Rect,
  rug2: [512, 320, 256, 256] as Rect,
  rug3: [768, 320, 256, 256] as Rect,
  gingham: [0, 576, 128, 128] as Rect,
  wood: [128, 576, 64, 64] as Rect,
  towel: [192, 576, 64, 128] as Rect,
  bathmat: [256, 576, 128, 96] as Rect,
  paint3: [384, 576, 192, 128] as Rect,
  paint4: [576, 576, 128, 160] as Rect,
  runner: [704, 576, 320, 96] as Rect,
  linen: [192, 704, 64, 64] as Rect,
  signBack: [0, 768, 512, 144] as Rect,
};

export function drawAtlas(g: CanvasRenderingContext2D, S: number) {
  const rnd = mulberry32(77);
  g.fillStyle = '#d8ccb5';
  g.fillRect(0, 0, S, S);

  // ---- patchwork quilts: half-square triangles in a warm palette
  const quilt = (r: Rect, pal: string[], border: string) => {
    const [x0, y0, w] = r;
    const n = 8, s = w / n;
    g.fillStyle = border;
    g.fillRect(x0, y0, w, w);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = x0 + i * s, y = y0 + j * s;
      const a = pal[Math.floor(rnd() * pal.length)], b2 = pal[Math.floor(rnd() * pal.length)];
      g.fillStyle = a;
      g.fillRect(x + 1, y + 1, s - 2, s - 2);
      g.fillStyle = b2;
      g.beginPath();
      const k = (i + j) % 2;
      if (k) { g.moveTo(x + 1, y + 1); g.lineTo(x + s - 1, y + 1); g.lineTo(x + 1, y + s - 1); }
      else { g.moveTo(x + s - 1, y + 1); g.lineTo(x + s - 1, y + s - 1); g.lineTo(x + 1, y + 1); }
      g.fill();
      // little stitches
      g.strokeStyle = 'rgba(255,248,230,0.35)';
      g.setLineDash([2, 3]);
      g.strokeRect(x + 3, y + 3, s - 6, s - 6);
      g.setLineDash([]);
    }
  };
  quilt(R.quilt1, ['#a8432f', '#e8dcc0', '#2f4a64', '#d6a54a', '#efe6d0', '#7c2f2a', '#6f8aa0'], '#e9dfc6');
  quilt(R.quilt2, ['#7f9a7a', '#e9dfc4', '#c99a3e', '#4f6b5a', '#f1e9d6', '#b5694a', '#a7b99a'], '#efe6cf');

  // ---- the name board: dark walnut with cream lettering
  const sign = (r: Rect) => {
    const [x0, y0, w, h] = r;
    const grd = g.createLinearGradient(x0, y0, x0, y0 + h);
    grd.addColorStop(0, '#4a3222');
    grd.addColorStop(0.5, '#3b281b');
    grd.addColorStop(1, '#2f2016');
    g.fillStyle = grd;
    g.fillRect(x0, y0, w, h);
    // grain
    for (let i = 0; i < 46; i++) {
      const y = y0 + rnd() * h;
      g.strokeStyle = `rgba(${rnd() < 0.5 ? '20,12,6' : '110,78,50'},${0.18 + rnd() * 0.2})`;
      g.lineWidth = 0.6 + rnd() * 1.6;
      g.beginPath();
      g.moveTo(x0, y);
      for (let x = 0; x <= w; x += 32) g.lineTo(x0 + x, y + Math.sin(x * 0.02 + i) * 2.2);
      g.stroke();
    }
    // painted border
    g.strokeStyle = 'rgba(238,224,192,0.85)';
    g.lineWidth = 3;
    g.strokeRect(x0 + 12, y0 + 12, w - 24, h - 24);
    g.lineWidth = 1;
    g.strokeRect(x0 + 18, y0 + 18, w - 36, h - 36);
    // lettering
    g.fillStyle = '#f1e4c4';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let px = 58;
    const fit = () => { g.font = `italic 700 ${px}px Georgia, "Times New Roman", serif`; return g.measureText('Hannah ka Ghar').width; };
    while (fit() > w - 150 && px > 30) px -= 2;
    g.shadowColor = 'rgba(0,0,0,0.35)';
    g.shadowBlur = 2;
    g.fillText('Hannah ka Ghar', x0 + w / 2, y0 + h / 2 + 3);
    g.shadowBlur = 0;
    // little painted sprigs either side
    for (const side of [-1, 1]) {
      const cx = x0 + w / 2 + side * (w / 2 - 50), cy = y0 + h / 2 + 2;
      g.strokeStyle = '#a9b88a';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx - 10, cy + 12); g.quadraticCurveTo(cx, cy, cx + 6, cy - 16); g.stroke();
      g.fillStyle = '#a9b88a';
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.ellipse(cx - 6 + k * 5, cy + 6 - k * 9, 5, 2.4, -0.9 + side * 0.2, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#e8a0a8';
      g.beginPath(); g.arc(cx + 6, cy - 18, 3.5, 0, Math.PI * 2); g.fill();
    }
  };
  sign(R.sign);
  sign(R.signBack);

  // ---- framed pictures
  const frame = (r: Rect, inner: (x: number, y: number, w: number, h: number) => void, frameCol = '#5a3a24', mat = '#efe8d8') => {
    const [x0, y0, w, h] = r;
    g.fillStyle = frameCol;
    g.fillRect(x0, y0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x0, y0, w, 4);
    g.fillStyle = mat;
    g.fillRect(x0 + 10, y0 + 10, w - 20, h - 20);
    g.save();
    g.beginPath();
    g.rect(x0 + 20, y0 + 20, w - 40, h - 40);
    g.clip();
    inner(x0 + 20, y0 + 20, w - 40, h - 40);
    g.restore();
  };
  // golden hour over the hills
  frame(R.paint1, (x, y, w, h) => {
    const sky = g.createLinearGradient(x, y, x, y + h);
    sky.addColorStop(0, '#8fa6c4'); sky.addColorStop(0.55, '#f2c38a'); sky.addColorStop(1, '#e98a5a');
    g.fillStyle = sky; g.fillRect(x, y, w, h);
    g.fillStyle = '#fff1c9'; g.beginPath(); g.arc(x + w * 0.62, y + h * 0.55, 10, 0, Math.PI * 2); g.fill();
    const hill = (yy: number, col: string, amp: number, ph: number) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(x, y + h);
      for (let i = 0; i <= w; i += 6) g.lineTo(x + i, y + yy + Math.sin(i * 0.035 + ph) * amp);
      g.lineTo(x + w, y + h); g.fill();
    };
    hill(h * 0.62, '#7d8f5c', 6, 1); hill(h * 0.74, '#5d7444', 8, 3); hill(h * 0.86, '#43592f', 5, 0.3);
    g.fillStyle = '#f4f1ea'; g.fillRect(x + w * 0.2, y + h * 0.66, 18, 11);
    g.fillStyle = '#33373b'; g.beginPath(); g.moveTo(x + w * 0.2 - 2, y + h * 0.66); g.lineTo(x + w * 0.2 + 9, y + h * 0.6); g.lineTo(x + w * 0.2 + 20, y + h * 0.66); g.fill();
  });
  // hydrangeas in a jug
  frame(R.paint2, (x, y, w, h) => {
    g.fillStyle = '#e6dcc6'; g.fillRect(x, y, w, h);
    g.fillStyle = '#c9b48a'; g.fillRect(x, y + h * 0.78, w, h * 0.22);
    g.fillStyle = '#f3efe6'; g.beginPath(); g.ellipse(x + w / 2, y + h * 0.7, 22, 26, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 40;
      g.fillStyle = ['#8f7bc0', '#b48bcf', '#d48fb0', '#9fb6dc', '#7f9a6a'][Math.floor(rnd() * 5)];
      g.beginPath(); g.arc(x + w / 2 + Math.cos(a) * d * 1.3, y + h * 0.38 + Math.sin(a) * d * 0.8, 4 + rnd() * 3, 0, Math.PI * 2); g.fill();
    }
  }, '#2c2c2c');
  // a botanical print for the attic
  frame(R.paint3, (x, y, w, h) => {
    g.fillStyle = '#f1ead8'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#5f7a4e'; g.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const cx = x + w * (0.25 + k * 0.25);
      g.beginPath(); g.moveTo(cx, y + h - 6); g.quadraticCurveTo(cx - 6, y + h * 0.5, cx + 4, y + 10); g.stroke();
      g.fillStyle = '#7d9a63';
      for (let j = 0; j < 5; j++) { g.beginPath(); g.ellipse(cx + (j % 2 ? 8 : -8), y + 18 + j * 12, 7, 3, j % 2 ? 0.6 : -0.6, 0, Math.PI * 2); g.fill(); }
    }
  }, '#a5733f', '#f6f1e4');
  // an old sepia photograph
  frame(R.paint4, (x, y, w, h) => {
    const s = g.createLinearGradient(x, y, x, y + h);
    s.addColorStop(0, '#cdb897'); s.addColorStop(1, '#9c8463');
    g.fillStyle = s; g.fillRect(x, y, w, h);
    g.fillStyle = '#6b563d';
    g.beginPath(); g.arc(x + w / 2, y + h * 0.42, 14, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(x + w / 2, y + h * 0.95, 30, 34, 0, 0, Math.PI * 2); g.fill();
  }, '#3a2a1e', '#e9e0cc');

  // ---- rugs
  {
    // living room: a kilim in rust, cream and indigo
    const [x0, y0, w, h] = R.rug1;
    g.fillStyle = '#9a4a32'; g.fillRect(x0, y0, w, h);
    g.fillStyle = '#e9dcc0'; g.fillRect(x0 + 14, y0 + 14, w - 28, h - 28);
    g.fillStyle = '#2f3f5a'; g.fillRect(x0 + 24, y0 + 24, w - 48, h - 48);
    g.fillStyle = '#a5553a'; g.fillRect(x0 + 36, y0 + 36, w - 72, h - 72);
    const dia = (cx: number, cy: number, rx: number, ry: number, col: string) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy - ry); g.lineTo(cx + rx, cy); g.lineTo(cx, cy + ry); g.lineTo(cx - rx, cy); g.fill();
    };
    for (let i = 0; i < 3; i++) {
      const cx = x0 + w * (0.25 + i * 0.25), cy = y0 + h / 2;
      dia(cx, cy, 52, 100, '#e9dcc0'); dia(cx, cy, 40, 78, '#2f3f5a'); dia(cx, cy, 26, 52, '#d29a4a'); dia(cx, cy, 12, 24, '#7a2e25');
    }
    for (let i = 0; i < 40; i++) dia(x0 + 44 + i * ((w - 88) / 39), y0 + 44, 5, 6, '#e9dcc0');
    for (let i = 0; i < 40; i++) dia(x0 + 44 + i * ((w - 88) / 39), y0 + h - 44, 5, 6, '#e9dcc0');
    // weave noise
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`; g.fillRect(x0 + rnd() * w, y0 + rnd() * h, 2, 1); }
    // fringe (cut out by alpha at the very ends)
    g.clearRect(x0, y0, 6, h); g.clearRect(x0 + w - 6, y0, 6, h);
    g.fillStyle = '#efe6d0';
    for (let j = 0; j < h; j += 6) { g.fillRect(x0, y0 + j, 6, 2); g.fillRect(x0 + w - 6, y0 + j, 6, 2); }
  }
  {
    // braided round rug (attic): concentric rings
    const [x0, y0, w] = R.rug2;
    const cols = ['#7a8f6e', '#c9a46a', '#8a4b3a', '#e2d5b8', '#56708a', '#b77a52'];
    for (let r = w / 2; r > 2; r -= 7) {
      g.fillStyle = cols[Math.floor(rnd() * cols.length)];
      g.beginPath(); g.arc(x0 + w / 2, y0 + w / 2, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; g.stroke();
    }
  }
  {
    // oval rag rug (bedroom)
    const [x0, y0, w] = R.rug3;
    const cols = ['#d9cbb0', '#9fb3c8', '#c88a7a', '#e8e0cc', '#8aa08a'];
    for (let r = w / 2; r > 2; r -= 5) {
      g.fillStyle = cols[Math.floor(rnd() * cols.length)];
      g.beginPath(); g.arc(x0 + w / 2, y0 + w / 2, r, 0, Math.PI * 2); g.fill();
    }
  }
  {
    // kitchen runner: stripes
    const [x0, y0, w, h] = R.runner;
    const cols = ['#e7dcc4', '#8a3b2a', '#e7dcc4', '#3e5a6e', '#e7dcc4', '#c9a04a'];
    for (let i = 0; i < w; i += 16) { g.fillStyle = cols[(i / 16) % cols.length]; g.fillRect(x0 + i, y0, 16, h); }
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let j = 0; j < h; j += 4) g.fillRect(x0, y0 + j, w, 1);
  }
  // ---- gingham
  {
    const [x0, y0, w] = R.gingham;
    g.fillStyle = '#f7f2e8'; g.fillRect(x0, y0, w, w);
    g.fillStyle = 'rgba(176,48,44,0.55)';
    for (let i = 0; i < w; i += 16) { g.fillRect(x0 + i, y0, 8, w); g.fillRect(x0, y0 + i, w, 8); }
  }
  // ---- plain wood, towel, bath mat, linen
  g.fillStyle = '#4a3222'; g.fillRect(...R.wood);
  {
    const [x0, y0, w, h] = R.towel;
    g.fillStyle = '#f4f1ea'; g.fillRect(x0, y0, w, h);
    g.fillStyle = '#5b7f9e'; g.fillRect(x0, y0 + 14, w, 6); g.fillRect(x0, y0 + h - 20, w, 6);
  }
  {
    const [x0, y0, w, h] = R.bathmat;
    g.fillStyle = '#e9eef0'; g.fillRect(x0, y0, w, h);
    g.fillStyle = '#7d9db3'; for (let i = 6; i < w; i += 14) g.fillRect(x0 + i, y0 + 6, 5, h - 12);
  }
  g.fillStyle = '#e8dfcd'; g.fillRect(...R.linen);
}
