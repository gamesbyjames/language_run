import { CONFIG } from '../game/config';
import { DIR_NAMES, type TurnDir, dirVec } from '../game/dirs';
import type { DeathCause, Player } from '../game/player';
import type { Segment, Track } from '../game/track';

const DEATH_TEXT: Record<DeathCause, string> = {
  wall: 'You ran into the dead end. At a T junction you have to turn left or right.',
  log: 'You tripped over a root. Jump over those (↑ / W / swipe up).',
  beam: 'You hit a spiked beam. Slide under those (↓ / S / swipe down).',
  block: 'You crashed into a fallen block. Change lanes (← / → before a junction).',
  gap: 'You fell into the abyss. Jump over gaps.',
  hearts: 'Out of hearts. Read the corrections, then try again; you continue with the same sentence.',
};

/** DOM overlay: stats, junction prompt, title/game-over panels, minimap, debug text. */
export class Hud {
  readonly root: HTMLDivElement;
  private stats: HTMLDivElement;
  private prompt: HTMLDivElement;
  private promptL: HTMLSpanElement;
  private promptR: HTMLSpanElement;
  private toast: HTMLDivElement;
  private panel: HTMLDivElement;
  private debug: HTMLPreElement;
  private map: HTMLCanvasElement;
  private toastTimer = 0;
  debugVisible = false;
  /** classic "◀ TURN ▶" prompt (learn mode shows answer cards instead) */
  classicPrompt = true;
  /** buttons inside panels: <span class="btn" data-action="..."> */
  onAction: (action: string) => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    this.root.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (a) this.onAction(a.dataset.action!);
    });
    this.stats = el('div', 'stats', this.root);
    this.prompt = el('div', 'prompt', this.root);
    this.promptL = el('span', 'arrow left', this.prompt);
    this.promptL.textContent = '◀';
    el('span', 'label', this.prompt).textContent = 'TURN';
    this.promptR = el('span', 'arrow right', this.prompt);
    this.promptR.textContent = '▶';
    this.toast = el('div', 'toast', this.root);
    this.panel = el('div', 'panel', this.root);
    this.map = el('canvas', 'minimap', this.root);
    this.map.width = this.map.height = 180;
    this.debug = el('pre', 'debug', this.root);
    this.debug.style.display = 'none';
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    this.debug.style.display = this.debugVisible ? 'block' : 'none';
  }

  loading(text: string): void {
    this.showPanel(`<h1>Temple Run<br><small>prototype</small></h1><p>${text}</p>`);
  }

  title(character: string): void {
    this.showPanel(`
      <h1>Temple Run<br><small>prototype</small></h1>
      <p class="cta">Press <b>Space</b> or tap to run</p>
      <table>
        <tr><td>← → / A D / swipe</td><td>turn at a junction · change lane elsewhere</td></tr>
        <tr><td>↑ / W / Space / swipe up</td><td>jump</td></tr>
        <tr><td>↓ / S / swipe down</td><td>slide</td></tr>
        <tr><td>P / Esc</td><td>pause · <b>H</b> debug overlay</td></tr>
      </table>
      <p class="hint">Character: ${character} · <a href="?mode=learn" style="color:#ffc94a;pointer-events:auto">learn Hindi mode</a></p>`);
  }

  gameOver(cause: DeathCause, player: Player, extra = ''): void {
    const turns = player.turns.length ? player.turns.map((t) => (t === 'left' ? '←' : '→')).join(' ') : 'none';
    this.showPanel(`
      <h1>Game over</h1>
      <p>${DEATH_TEXT[cause]}</p>
      <p class="score">${Math.floor(player.distance)} m · ${player.coins} coins</p>
      ${extra || `<p class="hint">Turns taken: ${turns}</p>`}
      <p class="cta">Press <b>Space</b> or tap to run again</p>`);
  }

  paused(on: boolean): void {
    if (on) this.showPanel('<h1>Paused</h1><p class="cta">Press <b>P</b> to continue</p>');
    else this.hidePanel();
  }

  hidePanel(): void {
    this.panel.classList.remove('show');
  }

  flash(text: string, cls = ''): void {
    this.toast.textContent = text;
    this.toast.className = `toast show ${cls}`;
    this.toastTimer = 0.9;
  }

  update(dt: number, player: Player, track: Track, running: boolean): void {
    this.stats.innerHTML = `<b>${Math.floor(player.distance)}</b> m &nbsp; <span class="coin">●</span> <b>${player.coins}</b>`;

    const d = player.decider;
    const inZone = this.classicPrompt && running && player.alive && d.inZone(player.s);
    this.prompt.classList.toggle('show', inZone);
    this.promptL.classList.toggle('active', inZone && d.pending === 'left');
    this.promptR.classList.toggle('active', inZone && d.pending === 'right');

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }

    this.drawMap(player, track);

    if (this.debugVisible) {
      const seg = player.segment;
      this.debug.textContent = [
        `segment #${seg.id} heading ${DIR_NAMES[seg.dir]} depth ${seg.depth} len ${seg.length}`,
        `s ${player.s.toFixed(2)}  lat ${player.lat.toFixed(2)}  y ${player.y.toFixed(2)}`,
        `speed ${player.speed.toFixed(1)} m/s  lane ${player.lane}  ${player.sliding ? 'SLIDING' : player.grounded ? 'grounded' : 'airborne'}`,
        `junction: zone@${d.zoneStart.toFixed(1)} centre@${d.turnPoint.toFixed(1)} wall@${d.wall.toFixed(1)}`,
        `  to zone ${(d.zoneStart - player.s).toFixed(1)} m  in zone ${d.inZone(player.s)}  pending ${d.pending ?? '-'}`,
        `turns ${player.turns.join(', ') || '-'}  segments alive ${track.segments.length}`,
      ].join('\n');
    }
  }

  private drawMap(player: Player, track: Track): void {
    const c = this.map;
    const g = c.getContext('2d')!;
    const S = c.width;
    const scale = 0.55; // px per metre
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(10,16,8,0.55)';
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    g.fill();

    const pos = player.worldPosition();
    const fwd = dirVec(player.segment.dir);
    // rotate the map so the runner always faces up
    const ang = Math.atan2(fwd.x, -fwd.z);
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
    g.clip();
    g.translate(S / 2, S / 2 + 30);
    g.rotate(-ang);
    g.scale(scale, scale);
    g.translate(-pos.x, -pos.z);

    const cur = player.segment;
    const pending = player.decider.pending;
    const colorFor = (seg: Segment): string => {
      if (seg === cur) return '#f4e6c4';
      if (seg.parent === cur) return seg.via === pending ? '#ffc94a' : '#8f8a78';
      return '#5a5648';
    };
    g.lineCap = 'square';
    for (const seg of track.segments) {
      const a = track.localToWorld(seg, Math.max(seg.floorStart, -6), 0);
      const b = track.junctionCenter(seg);
      g.strokeStyle = colorFor(seg);
      g.lineWidth = CONFIG.pathWidth;
      g.beginPath();
      g.moveTo(a.x, a.z);
      g.lineTo(b.x, b.z);
      g.stroke();
      // dead-end wall of the T
      const wall = track.localToWorld(seg, seg.length + CONFIG.pathWidth / 2 + 0.6, 0);
      const r = track.localToWorld(seg, seg.length + CONFIG.pathWidth / 2 + 0.6, CONFIG.pathWidth / 2 + 1);
      g.strokeStyle = '#b0563a';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(2 * wall.x - r.x, 2 * wall.z - r.z);
      g.lineTo(r.x, r.z);
      g.stroke();
    }
    g.restore();

    // runner
    g.fillStyle = player.alive ? '#ff5a3c' : '#888';
    g.beginPath();
    g.moveTo(S / 2, S / 2 + 30 - 7);
    g.lineTo(S / 2 - 5, S / 2 + 30 + 6);
    g.lineTo(S / 2 + 5, S / 2 + 30 + 6);
    g.closePath();
    g.fill();
  }

  private showPanel(html: string): void {
    this.panel.innerHTML = html;
    this.panel.classList.add('show');
  }
}

export function turnLabel(dir: TurnDir): string {
  return dir === 'left' ? '◀ LEFT' : 'RIGHT ▶';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}
