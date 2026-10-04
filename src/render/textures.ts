import * as THREE from 'three';

/** Procedural canvas textures: no external image files needed. */

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function noise(g: CanvasRenderingContext2D, w: number, h: number, amount: number, rnd: () => number): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function toTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Rows of irregular stone slabs; tiles seamlessly. */
function slabs(size: number, rows: number, mortar: string, base: [number, number, number], seed: number, moss = 0): THREE.CanvasTexture {
  const [c, g] = makeCanvas(size, size);
  const rnd = seeded(seed);
  g.fillStyle = mortar;
  g.fillRect(0, 0, size, size);
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * size * 0.2;
    const startX = x;
    while (x < startX + size) {
      const w = size * (0.18 + rnd() * 0.22);
      const k = 0.82 + rnd() * 0.3;
      const tint = (rnd() - 0.5) * 14;
      g.fillStyle = `rgb(${Math.round(base[0] * k + tint)},${Math.round(base[1] * k)},${Math.round(base[2] * k - tint)})`;
      for (const ox of [-size, 0, size]) {
        g.beginPath();
        g.roundRect(x + ox + 3, r * rowH + 3, w - 6, rowH - 6, size * 0.015);
        g.fill();
      }
      x += w;
    }
  }
  if (moss > 0) {
    for (let i = 0; i < 90 * moss; i++) {
      g.fillStyle = `rgba(${60 + rnd() * 30},${100 + rnd() * 40},${40 + rnd() * 20},${0.15 + rnd() * 0.25})`;
      g.beginPath();
      g.arc(rnd() * size, rnd() * size, 4 + rnd() * size * 0.05, 0, Math.PI * 2);
      g.fill();
    }
  }
  noise(g, size, size, 28, rnd);
  return toTexture(c);
}

export function stoneFloorTexture(): THREE.CanvasTexture {
  return slabs(512, 4, '#3e372e', [158, 146, 122], 11, 0.4);
}

export function stoneWallTexture(): THREE.CanvasTexture {
  return slabs(256, 4, '#2c2822', [118, 110, 96], 23, 1.2);
}

export function barkTexture(): THREE.CanvasTexture {
  const [c, g] = makeCanvas(128, 256);
  const rnd = seeded(5);
  g.fillStyle = '#4a3322';
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 128;
    g.strokeStyle = rnd() > 0.5 ? 'rgba(30,20,12,0.7)' : 'rgba(110,80,52,0.5)';
    g.lineWidth = 1 + rnd() * 4;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + (rnd() - 0.5) * 20, 90, x + (rnd() - 0.5) * 20, 170, x, 256);
    g.stroke();
    // wrap around horizontally
    g.beginPath();
    g.moveTo(x - 128, 0);
    g.lineTo(x - 128, 256);
    g.stroke();
  }
  noise(g, 128, 256, 20, rnd);
  return toTexture(c);
}

/** Carved emblem with left/right arrows for the junction square. */
export function emblemTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = makeCanvas(S, S);
  g.clearRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  g.strokeStyle = 'rgba(40,30,18,0.85)';
  g.lineWidth = 14;
  g.beginPath();
  g.arc(0, 0, S * 0.42, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 6;
  g.beginPath();
  g.arc(0, 0, S * 0.36, 0, Math.PI * 2);
  g.stroke();
  const arrow = (dir: number) => {
    g.save();
    g.scale(dir, 1);
    g.fillStyle = 'rgba(255,196,80,0.85)';
    g.strokeStyle = 'rgba(60,40,10,0.9)';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(S * 0.3, 0);
    g.lineTo(S * 0.12, -S * 0.13);
    g.lineTo(S * 0.12, -S * 0.05);
    g.lineTo(S * 0.03, -S * 0.05);
    g.lineTo(S * 0.03, S * 0.05);
    g.lineTo(S * 0.12, S * 0.05);
    g.lineTo(S * 0.12, S * 0.13);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  };
  arrow(1);
  arrow(-1);
  return toTexture(c, false);
}
