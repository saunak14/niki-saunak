import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WordleService, type LetterResult, type WordMeta } from '../../services/wordle.service';
import confetti from 'canvas-confetti';

type GameState = 'loading' | 'playing' | 'won' | 'lost' | 'error';

const MAX_GUESSES = 6;

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
];

const LS_CURRENT_ID = 'wordle_current_id';

@Component({
  selector: 'app-wordle',
  imports: [RouterLink, NgClass],
  templateUrl: './wordle.html',
  styleUrl: './wordle.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WordleComponent implements OnInit {
  private readonly wordleService = inject(WordleService);

  @ViewChild('hiddenInput') private hiddenInput!: ElementRef<HTMLInputElement>;

  readonly keyboardRows = KEYBOARD_ROWS;
  readonly rowIndices = Array.from({ length: MAX_GUESSES }, (_, i) => i);

  readonly wordMeta = signal<WordMeta | null>(null);
  readonly guesses = signal<string[]>([]);
  readonly results = signal<LetterResult[][]>([]);
  readonly currentRow = signal('');
  readonly gameState = signal<GameState>('loading');
  readonly revealedWord = signal<string | null>(null);
  readonly errorMsg = signal<string | null>(null);
  readonly isSubmitting = signal(false);
  readonly animatingRow = signal<number | null>(null);

  readonly wordIndices = computed(() => {
    const meta = this.wordMeta();
    return meta ? Array.from({ length: meta.length }, (_, i) => i) : [];
  });

  readonly letterStates = computed(() => {
    const map = new Map<string, LetterResult>();
    const priority: Record<LetterResult, number> = { correct: 2, present: 1, absent: 0 };

    this.guesses().forEach((guess, i) => {
      const result = this.results()[i];
      if (!result) return;
      guess.toUpperCase().split('').forEach((letter, j) => {
        const existing = map.get(letter);
        const incoming = result[j];
        if (!existing || priority[incoming] > priority[existing]) {
          map.set(letter, incoming);
        }
      });
    });

    return map;
  });

  readonly knownLetters = computed(() => {
    const meta = this.wordMeta();
    if (!meta) return [];
    const known: string[] = Array(meta.length).fill('_');
    this.guesses().forEach((guess, i) => {
      const result = this.results()[i];
      if (!result) return;
      guess.toUpperCase().split('').forEach((letter, j) => {
        if (result[j] === 'correct') known[j] = letter;
      });
    });
    return known;
  });

  ngOnInit(): void {
    this.loadCurrentWord();
  }

  loadCurrentWord(): void {
    this.gameState.set('loading');
    this.wordleService.getCurrent().subscribe({
      next: (meta) => {
        this.wordMeta.set(meta);
        this.restoreOrStart(meta);
      },
      error: () => {
        this.gameState.set('error');
      },
    });
  }

  private restoreOrStart(meta: WordMeta): void {
    const storedId = localStorage.getItem(LS_CURRENT_ID);

    this.guesses.set([]);
    this.results.set([]);
    this.currentRow.set('');

    if (storedId !== String(meta.id)) {
      localStorage.setItem(LS_CURRENT_ID, String(meta.id));
    }

    this.gameState.set('playing');
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (this.gameState() !== 'playing' || this.isSubmitting()) return;

    if (event.key === 'Enter') {
      this.submitGuess();
    } else if (event.key === 'Backspace') {
      this.deleteLetter();
    } else if (/^[a-zA-Z]$/.test(event.key)) {
      this.addLetter(event.key.toUpperCase());
    }
  }

  onKeyPress(key: string): void {
    if (this.gameState() !== 'playing' || this.isSubmitting()) return;

    if (key === '⌫') {
      this.deleteLetter();
    } else {
      this.addLetter(key);
    }
  }

  focusHiddenInput(): void {
    this.hiddenInput?.nativeElement.focus();
  }

  onHiddenInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    if (value) {
      const letter = value[value.length - 1];
      if (/^[a-zA-Z]$/.test(letter)) this.addLetter(letter.toUpperCase());
    }
    input.value = '';
  }

  onHiddenKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter') { event.preventDefault(); this.submitGuess(); }
    else if (event.key === 'Backspace') { event.preventDefault(); this.deleteLetter(); }
  }

  addLetter(letter: string): void {
    const meta = this.wordMeta();
    if (!meta) return;
    if (this.currentRow().length >= meta.length) return;
    this.currentRow.update((r) => r + letter);
    this.errorMsg.set(null);
  }

  deleteLetter(): void {
    this.currentRow.update((r) => r.slice(0, -1));
    this.errorMsg.set(null);
  }

  submitGuess(): void {
    const meta = this.wordMeta();
    if (!meta) return;

    const guess = this.currentRow().toLowerCase();
    if (guess.length !== meta.length) {
      this.errorMsg.set(`Word must be ${meta.length} letters`);
      return;
    }

    this.isSubmitting.set(true);
    this.wordleService.guess(meta.id, guess).subscribe({
      next: ({ result }) => {
        const newGuesses = [...this.guesses(), guess];
        const newResults = [...this.results(), result];
        this.guesses.set(newGuesses);
        this.results.set(newResults);
        this.currentRow.set('');
        this.errorMsg.set(null);
        this.isSubmitting.set(false);

        const justSubmitted = newGuesses.length - 1;
        this.animatingRow.set(justSubmitted);
        setTimeout(() => this.animatingRow.set(null), meta.length * 80 + 400);

        const won = result.every((r) => r === 'correct');
        const lost = !won && newGuesses.length >= MAX_GUESSES;

        if (won || lost) {
          this.completeGame(won);
        }
      },
      error: (err) => {
        this.errorMsg.set(err.error?.detail ?? 'Not a valid word');
        this.isSubmitting.set(false);
      },
    });
  }

  private completeGame(won: boolean): void {
    const meta = this.wordMeta();
    if (!meta) return;

    this.wordleService.complete(meta.id).subscribe({
      next: ({ word }) => {
        this.revealedWord.set(word);
        this.gameState.set(won ? 'won' : 'lost');
        this.hiddenInput?.nativeElement.blur();
        if (won) setTimeout(() => this.launchCelebration(), 300);
      },
      error: () => {
        this.revealedWord.set('?');
        this.gameState.set(won ? 'won' : 'lost');
        this.hiddenInput?.nativeElement.blur();
        if (won) setTimeout(() => this.launchCelebration(), 300);
      },
    });
  }

  private launchCelebration(): void {
    const colors = ['#5fa35a', '#e0853f', '#216568', '#c4c96e', '#ffffc6', '#ffffff'];

    const burst = (x: number, y: number, count: number, spread: number) => {
      confetti({ particleCount: count, spread, origin: { x, y }, colors, scalar: 1.1, shapes: ['star', 'circle'] });
    };

    burst(0.5,  0.5,  100, 80);
    setTimeout(() => burst(0.25, 0.4, 60, 60),  200);
    setTimeout(() => burst(0.75, 0.4, 60, 60),  350);
    setTimeout(() => burst(0.5,  0.3, 80, 100), 600);
    setTimeout(() => burst(0.15, 0.6, 50, 50),  800);
    setTimeout(() => burst(0.85, 0.6, 50, 50),  950);
    setTimeout(() => burst(0.5,  0.45, 120, 120), 1200);
  }

  nextWord(): void {
    this.revealedWord.set(null);
    this.currentRow.set('');
    this.errorMsg.set(null);
    this.loadCurrentWord();
  }

  getLetter(row: number, col: number): string {
    const g = this.guesses();
    if (row < g.length) return g[row][col]?.toUpperCase() ?? '';
    if (row === g.length) return this.currentRow()[col] ?? '';
    return '';
  }

  getResult(row: number, col: number): LetterResult | null {
    const r = this.results();
    return row < r.length ? (r[row][col] ?? null) : null;
  }
}
