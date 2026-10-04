import * as THREE from 'three';
import type { AnswerOption } from './director';

export const DEVANAGARI_FONT = '"Noto Sans Devanagari", "Nirmala UI", "Mangal", "Kohinoor Devanagari", sans-serif';

/** Canvas texture for the dead-end wall: "◀ option A | option B ▶". */
export function signTexture(left: AnswerOption, right: AnswerOption): THREE.CanvasTexture {
  const W = 1024;
  const H = 300;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;

  g.fillStyle = 'rgba(28, 22, 14, 0.92)';
  g.beginPath();
  g.roundRect(6, 6, W - 12, H - 12, 26);
  g.fill();
  g.strokeStyle = '#d9a83a';
  g.lineWidth = 8;
  g.stroke();
  g.strokeStyle = 'rgba(217, 168, 58, 0.5)';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(W / 2, 40);
  g.lineTo(W / 2, H - 40);
  g.stroke();

  const half = (opt: AnswerOption, side: -1 | 1) => {
    const cx = W / 2 + side * (W / 4) + side * 18;
    const maxW = W / 2 - 150;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 96;
    g.font = `700 ${size}px ${DEVANAGARI_FONT}`;
    while (g.measureText(opt.hi).width > maxW && size > 40) {
      size -= 4;
      g.font = `700 ${size}px ${DEVANAGARI_FONT}`;
    }
    g.fillStyle = '#fff3d6';
    g.fillText(opt.hi, cx, 128);
    g.font = `italic 44px system-ui, sans-serif`;
    g.fillStyle = '#e5c372';
    g.fillText(opt.tr, cx, 228);
    // arrow
    g.font = '700 70px system-ui, sans-serif';
    g.fillStyle = '#ffc94a';
    g.fillText(side < 0 ? '◀' : '▶', side < 0 ? 62 : W - 62, H / 2);
  };
  half(left, -1);
  half(right, 1);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
