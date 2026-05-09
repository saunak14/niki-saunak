import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  signal,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';

const ROWS = 16;
const COLS = 16;
const MINES = 40;

interface Cell {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  neighborCount: number;
  exploded: boolean;
}

type GameState = 'idle' | 'playing' | 'won' | 'lost';

const STICKERS = {
  start: [
    'STK-20210420-WA0005.webp',
    'STK-20220814-WA0005.webp',
    'STK-20260508-WA0002.webp',
  ],
  win: [
    'STK-20200318-WA0010.webp',
    'STK-20210531-WA0000.webp',
    'STK-20210818-WA0004.webp',
    'STK-20210921-WA0002.webp',
    'STK-20220208-WA0021.webp',
    'STK-20220518-WA0016.webp',
    'STK-20220518-WA0017.webp',
    'STK-20220728-WA0014.webp',
    'STK-20220906-WA0001.webp',
    'STK-20220916-WA0002.webp',
    'STK-20230110-WA0004.webp',
    'STK-20230424-WA0002.webp',
    'STK-20230504-WA0015.webp',
    'STK-20230625-WA0011.webp',
    'STK-20251203-WA0002.webp',
    'STK-20260118-WA0000.webp',
    'STK-20260322-WA0009.webp',
  ],
  lose: [
    'STK-20200512-WA0007.webp',
    'STK-20200920-WA0010.webp',
    'STK-20201030-WA0000.webp',
    'STK-20210416-WA0018.webp',
    'STK-20220122-WA0008.webp',
    'STK-20220206-WA0001.webp',
    'STK-20220215-WA0002.webp',
    'STK-20220223-WA0002.webp',
    'STK-20220518-WA0019.webp',
    'STK-20220531-WA0005.webp',
    'STK-20220628-WA0017.webp',
    'STK-20220815-WA0007.webp',
    'STK-20220916-WA0001.webp',
    'STK-20230131-WA0008.webp',
    'STK-20230131-WA0011.webp',
    'STK-20230314-WA0006.webp',
    'STK-20230328-WA0001.webp',
    'STK-20230401-WA0003.webp',
    'STK-20230521-WA0007.webp',
    'STK-20230616-WA0004.webp',
    'STK-20230626-WA0006.webp',
    'STK-20230628-WA0001.webp',
    'STK-20231122-WA0004.webp',
    'STK-20240102-WA0001.webp',
    'STK-20240918-WA0000.webp',
    'STK-20250409-WA0010.webp',
    'STK-20251129-WA0000.webp',
    'STK-20251203-WA0003.webp',
    'STK-20251206-WA0000.webp',
    'STK-20260508-WA0000.webp',
    'STK-20260508-WA0001.webp',
  ],
};

const STICKER_DIRS: Record<keyof typeof STICKERS, string> = {
  start: '/assets/stickers/game-start-stickers',
  win: '/assets/stickers/game-win-stickers',
  lose: '/assets/stickers/game-lose-stickers',
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function stickerUrl(pack: keyof typeof STICKERS): string {
  return `${STICKER_DIRS[pack]}/${pickRandom(STICKERS[pack])}`;
}

function emptyCell(): Cell {
  return { isMine: false, isRevealed: false, isFlagged: false, neighborCount: 0, exploded: false };
}

@Component({
  selector: 'app-minesweeper',
  imports: [RouterLink, NgClass],
  templateUrl: './minesweeper.html',
  styleUrl: './minesweeper.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MinesweeperComponent implements OnDestroy {
  readonly gameState = signal<GameState>('idle');
  readonly board = signal<Cell[][]>([]);
  readonly flagsPlaced = signal(0);
  readonly time = signal(0);
  readonly bestTime = signal<number | null>(null);
  readonly stickerSrc = signal(stickerUrl('start'));

  readonly minesLeft = computed(() => MINES - this.flagsPlaced());
  readonly displayTime = computed(() => Math.min(this.time(), 999));
  readonly displayMines = computed(() => Math.max(this.minesLeft(), -99));

  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private longPressTimeout: ReturnType<typeof setTimeout> | null = null;
  private longPressTriggered = false;

  constructor() {
    const stored = localStorage.getItem('minesweeper-best-time');
    if (stored) this.bestTime.set(parseInt(stored, 10));
    this.initBoard();
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.clearLongPress();
  }

  // ─── Board setup ────────────────────────────────────────────────────────────

  private initBoard(): void {
    const board: Cell[][] = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => emptyCell()),
    );
    this.board.set(board);
    this.flagsPlaced.set(0);
    this.time.set(0);
  }

  private placeMines(safeR: number, safeC: number): void {
    const board = this.board().map((r) => r.map((c) => ({ ...c })));
    let placed = 0;
    while (placed < MINES) {
      const r = Math.floor(Math.random() * ROWS);
      const c = Math.floor(Math.random() * COLS);
      if (!board[r][c].isMine && !(r === safeR && c === safeC)) {
        board[r][c].isMine = true;
        placed++;
      }
    }
    this.calcNeighbors(board);
    this.board.set(board);
  }

  private calcNeighbors(board: Cell[][]): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c].isMine) continue;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc].isMine) count++;
          }
        }
        board[r][c].neighborCount = count;
      }
    }
  }

  // ─── Game actions ────────────────────────────────────────────────────────────

  onCellClick(r: number, c: number): void {
    if (this.longPressTriggered) {
      this.longPressTriggered = false;
      return;
    }
    const state = this.gameState();
    if (state === 'won' || state === 'lost') return;

    const cell = this.board()[r][c];
    if (cell.isFlagged || cell.isRevealed) return;

    if (state === 'idle') {
      this.placeMines(r, c);
      this.gameState.set('playing');
      this.startTimer();
    }

    const board = this.board().map((row) => row.map((cell) => ({ ...cell })));
    const target = board[r][c];

    if (target.isMine) {
      target.isRevealed = true;
      target.exploded = true;
      this.revealAllMines(board);
      this.board.set(board);
      this.gameState.set('lost');
      this.stopTimer();
      this.stickerSrc.set(stickerUrl('lose'));
      return;
    }

    this.floodReveal(board, r, c);
    this.board.set(board);

    if (this.checkWin(board)) {
      this.gameState.set('won');
      this.stopTimer();
      const t = this.time();
      const best = this.bestTime();
      if (best === null || t < best) {
        this.bestTime.set(t);
        localStorage.setItem('minesweeper-best-time', t.toString());
      }
      this.stickerSrc.set(stickerUrl('win'));
    }
  }

  onCellRightClick(r: number, c: number, event: MouseEvent): void {
    event.preventDefault();
    const state = this.gameState();
    if (state === 'won' || state === 'lost' || state === 'idle') return;
    this.toggleFlag(r, c);
  }

  private toggleFlag(r: number, c: number): void {
    const board = this.board().map((row) => row.map((cell) => ({ ...cell })));
    const cell = board[r][c];
    if (cell.isRevealed) return;
    cell.isFlagged = !cell.isFlagged;
    this.flagsPlaced.update((n) => (cell.isFlagged ? n + 1 : n - 1));
    this.board.set(board);
  }

  resetGame(): void {
    this.stopTimer();
    this.clearLongPress();
    this.gameState.set('idle');
    this.initBoard();
    this.stickerSrc.set(stickerUrl('start'));
  }

  // ─── Long-press to flag (mobile) ─────────────────────────────────────────────

  onCellTouchStart(r: number, c: number): void {
    this.longPressTriggered = false;
    this.longPressTimeout = setTimeout(() => {
      const state = this.gameState();
      if (state === 'won' || state === 'lost' || state === 'idle') return;
      this.longPressTriggered = true;
      this.toggleFlag(r, c);
      navigator.vibrate?.(50);
    }, 500);
  }

  onCellTouchEnd(): void {
    this.clearLongPress();
  }

  onCellTouchMove(): void {
    this.clearLongPress();
  }

  private clearLongPress(): void {
    if (this.longPressTimeout !== null) {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }
  }

  // ─── Board traversal ─────────────────────────────────────────────────────────

  private floodReveal(board: Cell[][], startR: number, startC: number): void {
    const queue: [number, number][] = [[startR, startC]];
    const visited = new Set<number>();
    while (queue.length > 0) {
      const [r, c] = queue.shift()!;
      const key = r * COLS + c;
      if (visited.has(key)) continue;
      visited.add(key);
      const cell = board[r][c];
      if (cell.isFlagged || cell.isRevealed || cell.isMine) continue;
      cell.isRevealed = true;
      if (cell.neighborCount === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              queue.push([nr, nc]);
            }
          }
        }
      }
    }
  }

  private revealAllMines(board: Cell[][]): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (cell.isMine && !cell.exploded) cell.isRevealed = true;
        // Mark wrongly placed flags
        if (!cell.isMine && cell.isFlagged) cell.isRevealed = true;
      }
    }
  }

  private checkWin(board: Cell[][]): boolean {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (!cell.isMine && !cell.isRevealed) return false;
      }
    }
    return true;
  }

  // ─── Timer ───────────────────────────────────────────────────────────────────

  private startTimer(): void {
    this.timerInterval = setInterval(() => {
      this.time.update((t) => (t < 999 ? t + 1 : t));
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  // ─── Template helpers ────────────────────────────────────────────────────────

  getCellDisplay(cell: Cell): string {
    if (!cell.isRevealed) {
      return cell.isFlagged ? '🚩' : '';
    }
    if (cell.isMine) return '💣';
    // Wrong flag shown after loss
    if (!cell.isMine && cell.isFlagged) return '❌';
    return cell.neighborCount > 0 ? cell.neighborCount.toString() : '';
  }

  getCellClasses(cell: Cell): Record<string, boolean> {
    return {
      revealed: cell.isRevealed && !cell.isMine,
      flagged: cell.isFlagged && !cell.isRevealed,
      exploded: cell.exploded,
      'mine-shown': cell.isMine && cell.isRevealed && !cell.exploded,
      'num-1': cell.isRevealed && cell.neighborCount === 1 && !cell.isMine,
      'num-2': cell.isRevealed && cell.neighborCount === 2 && !cell.isMine,
      'num-3': cell.isRevealed && cell.neighborCount === 3 && !cell.isMine,
      'num-4': cell.isRevealed && cell.neighborCount === 4 && !cell.isMine,
      'num-5': cell.isRevealed && cell.neighborCount === 5 && !cell.isMine,
      'num-6': cell.isRevealed && cell.neighborCount === 6 && !cell.isMine,
      'num-7': cell.isRevealed && cell.neighborCount === 7 && !cell.isMine,
      'num-8': cell.isRevealed && cell.neighborCount === 8 && !cell.isMine,
    };
  }

  formatCounter(value: number): string {
    return String(Math.abs(value)).padStart(3, '0');
  }
}
