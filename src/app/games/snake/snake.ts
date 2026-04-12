import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type GameState = 'idle' | 'playing' | 'paused' | 'game_over';

interface Point {
  x: number;
  y: number;
}

const CELL = 20;
const GRID = 30; // 600 / 20
const CANVAS_SIZE = 600;
const INITIAL_SPEED = 150;
const MIN_SPEED = 80;
const SPEED_STEP = 10;

@Component({
  selector: 'app-snake',
  imports: [RouterLink],
  templateUrl: './snake.html',
  styleUrl: './snake.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SnakeComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly score = signal(0);
  readonly highScore = signal(0);
  readonly gameState = signal<GameState>('idle');

  private ctx!: CanvasRenderingContext2D;
  private snake: Point[] = [];
  private food: Point = { x: 15, y: 15 };
  private direction: Direction = 'RIGHT';
  private nextDirection: Direction = 'RIGHT';
  private tickTimeout: ReturnType<typeof setTimeout> | null = null;
  private rafId: number | null = null;
  private speed = INITIAL_SPEED;
  private touchStartX = 0;
  private touchStartY = 0;

  private readonly onKeydown = (e: KeyboardEvent) => this.handleKeydown(e);
  private readonly onTouchStart = (e: TouchEvent) => {
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  };
  private readonly onTouchEnd = (e: TouchEvent) => {
    const dx = e.changedTouches[0].clientX - this.touchStartX;
    const dy = e.changedTouches[0].clientY - this.touchStartY;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.move(dx > 0 ? 'RIGHT' : 'LEFT');
    } else {
      this.move(dy > 0 ? 'DOWN' : 'UP');
    }
  };

  constructor() {
    this.highScore.set(parseInt(localStorage.getItem('snake-high-score') ?? '0', 10));
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    this.ctx = canvas.getContext('2d')!;

    document.addEventListener('keydown', this.onKeydown);
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: true });
    canvas.addEventListener('touchend', this.onTouchEnd, { passive: true });

    this.startRenderLoop();
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onKeydown);
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      canvas.removeEventListener('touchstart', this.onTouchStart);
      canvas.removeEventListener('touchend', this.onTouchEnd);
    }
    this.clearTick();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  startGame(): void {
    this.initGame();
    this.gameState.set('playing');
    this.scheduleTick();
  }

  togglePause(): void {
    const state = this.gameState();
    if (state === 'playing') {
      this.gameState.set('paused');
      this.clearTick();
    } else if (state === 'paused') {
      this.gameState.set('playing');
      this.scheduleTick();
    }
  }

  move(dir: Direction): void {
    const state = this.gameState();
    if (state === 'idle' || state === 'game_over') {
      this.startGame();
      return;
    }
    if (state !== 'playing') return;
    const opposites: Record<Direction, Direction> = {
      UP: 'DOWN',
      DOWN: 'UP',
      LEFT: 'RIGHT',
      RIGHT: 'LEFT',
    };
    if (this.direction !== opposites[dir]) {
      this.nextDirection = dir;
    }
  }

  private initGame(): void {
    const mid = Math.floor(GRID / 2);
    this.snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];
    this.direction = 'RIGHT';
    this.nextDirection = 'RIGHT';
    this.score.set(0);
    this.speed = INITIAL_SPEED;
    this.spawnFood();
  }

  private spawnFood(): void {
    let pos: Point;
    do {
      pos = {
        x: Math.floor(Math.random() * GRID),
        y: Math.floor(Math.random() * GRID),
      };
    } while (this.snake.some((s) => s.x === pos.x && s.y === pos.y));
    this.food = pos;
  }

  private scheduleTick(): void {
    this.tickTimeout = setTimeout(() => this.gameTick(), this.speed);
  }

  private clearTick(): void {
    if (this.tickTimeout !== null) {
      clearTimeout(this.tickTimeout);
      this.tickTimeout = null;
    }
  }

  private gameTick(): void {
    if (this.gameState() !== 'playing') return;
    this.direction = this.nextDirection;

    const head = this.snake[0];
    const newHead: Point = { x: head.x, y: head.y };

    switch (this.direction) {
      case 'UP':    newHead.y -= 1; break;
      case 'DOWN':  newHead.y += 1; break;
      case 'LEFT':  newHead.x -= 1; break;
      case 'RIGHT': newHead.x += 1; break;
    }

    if (newHead.x < 0 || newHead.x >= GRID || newHead.y < 0 || newHead.y >= GRID) {
      this.endGame(); return;
    }
    if (this.snake.some((s) => s.x === newHead.x && s.y === newHead.y)) {
      this.endGame(); return;
    }

    const eaten = newHead.x === this.food.x && newHead.y === this.food.y;
    this.snake.unshift(newHead);

    if (eaten) {
      const newScore = this.score() + 1;
      this.score.set(newScore);
      if (newScore % 5 === 0) {
        this.speed = Math.max(MIN_SPEED, this.speed - SPEED_STEP);
      }
      this.spawnFood();
    } else {
      this.snake.pop();
    }

    this.scheduleTick();
  }

  private endGame(): void {
    this.gameState.set('game_over');
    this.clearTick();
    const s = this.score();
    if (s > this.highScore()) {
      this.highScore.set(s);
      localStorage.setItem('snake-high-score', s.toString());
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    const state = this.gameState();

    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W':
        e.preventDefault();
        if (state === 'idle' || state === 'game_over') { this.startGame(); return; }
        this.move('UP'); break;
      case 'ArrowDown': case 's': case 'S':
        e.preventDefault();
        if (state === 'idle' || state === 'game_over') { this.startGame(); return; }
        this.move('DOWN'); break;
      case 'ArrowLeft': case 'a': case 'A':
        e.preventDefault();
        if (state === 'idle' || state === 'game_over') { this.startGame(); return; }
        this.move('LEFT'); break;
      case 'ArrowRight': case 'd': case 'D':
        e.preventDefault();
        if (state === 'idle' || state === 'game_over') { this.startGame(); return; }
        this.move('RIGHT'); break;
      case ' ':
        e.preventDefault();
        this.togglePause(); break;
      case 'Enter':
        if (state === 'idle' || state === 'game_over') this.startGame(); break;
    }
  }

  // ─── Rendering ────────────────────────────────────────────────────────────

  private startRenderLoop(): void {
    const loop = () => {
      this.draw();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private draw(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = this.ctx;
    const W = canvas.width;
    const H = canvas.height;
    const state = this.gameState();

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);

    if (state !== 'idle') {
      this.drawGrid(ctx, W, H);
      this.drawFood(ctx);
      if (this.snake.length > 0) this.drawSnake(ctx);
    }

    if (state === 'idle')      this.drawIdleOverlay(ctx, W, H);
    if (state === 'paused')    this.drawOverlay(ctx, W, H, '⏸ Paused', 'Press Space or tap Resume to continue');
    if (state === 'game_over') this.drawGameOverOverlay(ctx, W, H);
  }

  private drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= W; x += CELL) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += CELL) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  private drawFood(ctx: CanvasRenderingContext2D): void {
    const cx = this.food.x * CELL + CELL / 2;
    const cy = this.food.y * CELL + CELL / 2;
    const pulse = 1 + 0.15 * Math.sin(Date.now() * 0.006);
    const size = CELL * 0.7 * pulse;
    const scale = size / 32;

    ctx.save();
    ctx.shadowColor = '#ff69b4';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ff3366';
    ctx.translate(cx, cy + size * 0.12);
    ctx.scale(scale, -scale);
    // Parametric heart: x = 16sin³(t), y = 13cos(t) - 5cos(2t) - 2cos(3t) - cos(4t)
    ctx.beginPath();
    for (let t = 0; t <= Math.PI * 2; t += 0.05) {
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      if (t < 0.01) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawSnake(ctx: CanvasRenderingContext2D): void {
    const len = this.snake.length;
    // Draw tail → head so head renders on top
    for (let i = len - 1; i >= 0; i--) {
      const seg = this.snake[i];
      const t = i / Math.max(len - 1, 1);
      const hue = 160 + t * 140; // teal (160) at head → purple (300) at tail
      const lightness = i === 0 ? 65 : 55;

      ctx.save();
      ctx.shadowColor = `hsl(${hue}, 80%, 70%)`;
      ctx.shadowBlur = i === 0 ? 12 : 5;
      ctx.fillStyle = `hsl(${hue}, 80%, ${lightness}%)`;

      const gap = 2;
      this.fillRoundRect(ctx, seg.x * CELL + gap, seg.y * CELL + gap, CELL - gap * 2, CELL - gap * 2, i === 0 ? 6 : 4);
      ctx.restore();

      if (i === 0) this.drawEyes(ctx, seg);
    }
  }

  private fillRoundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  private drawEyes(ctx: CanvasRenderingContext2D, head: Point): void {
    const cx = head.x * CELL + CELL / 2;
    const cy = head.y * CELL + CELL / 2;
    const dir = this.direction;
    const offset = 3.5;

    let e1: Point, e2: Point, pupilDelta: Point;
    if (dir === 'RIGHT') {
      e1 = { x: cx + 3, y: cy - offset }; e2 = { x: cx + 3, y: cy + offset };
      pupilDelta = { x: 1, y: 0 };
    } else if (dir === 'LEFT') {
      e1 = { x: cx - 3, y: cy - offset }; e2 = { x: cx - 3, y: cy + offset };
      pupilDelta = { x: -1, y: 0 };
    } else if (dir === 'UP') {
      e1 = { x: cx - offset, y: cy - 3 }; e2 = { x: cx + offset, y: cy - 3 };
      pupilDelta = { x: 0, y: -1 };
    } else {
      e1 = { x: cx - offset, y: cy + 3 }; e2 = { x: cx + offset, y: cy + 3 };
      pupilDelta = { x: 0, y: 1 };
    }

    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(e1.x, e1.y, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e2.x, e2.y, 2.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(e1.x + pupilDelta.x, e1.y + pupilDelta.y, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e2.x + pupilDelta.x, e2.y + pupilDelta.y, 1.4, 0, Math.PI * 2); ctx.fill();
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, title: string, sub: string): void {
    ctx.fillStyle = 'rgba(10,10,26,0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.min(36, W * 0.07)}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, W / 2, H / 2 - 18);
    ctx.font = `${Math.min(15, W * 0.03)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(sub, W / 2, H / 2 + 18);
  }

  private drawIdleOverlay(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Draw a decorative rainbow gradient banner
    ctx.font = `bold ${Math.min(40, W * 0.08)}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🐍 Rainbow Snake', W / 2, H / 2 - 30);
    ctx.font = `${Math.min(16, W * 0.034)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('Arrow keys / WASD to start', W / 2, H / 2 + 14);
    if (this.highScore() > 0) {
      ctx.font = `${Math.min(14, W * 0.028)}px system-ui, sans-serif`;
      ctx.fillStyle = '#c9a96e';
      ctx.fillText(`🏆 Best: ${this.highScore()}`, W / 2, H / 2 + 44);
    }
  }

  private drawGameOverOverlay(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.fillStyle = 'rgba(10,10,26,0.88)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `bold ${Math.min(38, W * 0.075)}px system-ui, sans-serif`;
    ctx.fillStyle = '#ff3366';
    ctx.fillText('💔 Game Over', W / 2, H / 2 - 48);

    ctx.font = `bold ${Math.min(28, W * 0.055)}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Score: ${this.score()}`, W / 2, H / 2);

    const isNewHigh = this.score() > 0 && this.score() >= this.highScore();
    if (isNewHigh) {
      ctx.font = `${Math.min(16, W * 0.032)}px system-ui, sans-serif`;
      ctx.fillStyle = '#c9a96e';
      ctx.fillText('🏆 New High Score!', W / 2, H / 2 + 34);
    }

    ctx.font = `${Math.min(14, W * 0.028)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('Press any key or tap Play Again to restart', W / 2, H / 2 + (isNewHigh ? 66 : 44));
  }
}
