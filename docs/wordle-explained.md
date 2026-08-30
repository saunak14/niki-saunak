# How the Wordle Feature Works

This document explains every part of the Wordle implementation in plain language — what each file does, why it exists, and how the pieces fit together. It covers both concepts you may not have seen before and the specific choices made for this project.

---

## Big Picture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (Angular)                   │
│                                                          │
│  ┌──────────────┐  HTTP requests   ┌──────────────────┐  │
│  │   wordle.ts  │ ───────────────► │  wordle.service  │  │
│  │  (the game)  │ ◄─────────────── │  (talks to API)  │  │
│  └──────────────┘  JSON responses  └──────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │ │
                    GET/POST requests
                    over HTTP (port 8000)
                           │ │
                           ▼ ▼
┌─────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                      │
│                                                          │
│  ┌──────────────┐  calls  ┌───────────────────────────┐  │
│  │   router     │ ──────► │   wordle_service.py       │  │
│  │  (endpoints) │         │   (game logic, scoring)   │  │
│  └──────────────┘         └───────────────────────────┘  │
│                                       │                  │
│                                  reads/writes            │
│                                       │                  │
│                           ┌───────────▼──────────┐       │
│                           │   SQLite database    │       │
│                           │   (words.db file)    │       │
│                           └──────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

The **frontend** (Angular, runs in the browser) never stores the secret word. It only knows the word's length. All scoring happens on the **backend** (FastAPI, runs on the server). The word is only revealed after the game ends.

---

## Backend

The backend is written in **Python** using a framework called **FastAPI**.

### Concept: What is FastAPI?

FastAPI is a library that makes it easy to build a web server — a program that listens for HTTP requests (like when a browser visits a URL or sends form data) and sends back responses. You define "endpoints" with decorators like `@router.get(...)` and FastAPI handles all the networking for you.

---

### `backend/requirements.txt`

```
fastapi
uvicorn[standard]
sqlalchemy
aiosqlite
```

- **fastapi** — the web framework
- **uvicorn** — the server that actually runs FastAPI (like Apache or Nginx but for Python async apps)
- **sqlalchemy** — the database library (explained below)
- **aiosqlite** — lets SQLAlchemy work with SQLite in an async-friendly way

---

### `backend/database.py`

This file sets up the connection to the database.

```python
DB_PATH = os.path.join(os.path.dirname(__file__), "data", "words.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"
```

`os.path.dirname(__file__)` means "the folder where this file lives" — so the database file ends up at `backend/data/words.db`. The `sqlite:///` prefix is just how SQLAlchemy is told to use SQLite as the database type.

#### Concept: What is SQLAlchemy / ORM?

Normally, to store data in a database, you write SQL — the language databases understand:
```sql
SELECT * FROM wordle_words WHERE played_at IS NULL ORDER BY RANDOM() LIMIT 1;
```

SQLAlchemy is an **ORM** (Object-Relational Mapper). It lets you interact with the database using regular Python objects instead of writing SQL strings. The ORM translates your Python code into SQL automatically:

```python
# Python (what we write)
word = db.query(WordleWord).filter(WordleWord.played_at.is_(None)).order_by(text("RANDOM()")).first()

# What SQLAlchemy generates and sends to the database
SELECT * FROM wordle_words WHERE played_at IS NULL ORDER BY RANDOM() LIMIT 1;
```

The big advantage: if we ever wanted to switch from SQLite to PostgreSQL, we'd change one line (the connection URL) and the rest of the code stays the same.

```python
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
```

- **engine** — the actual connection to the database file
- **SessionLocal** — a factory for creating "sessions". A session is a temporary workspace where you make changes, and then either commit them (save) or roll them back (cancel). It's like a transaction at a bank.
- `check_same_thread=False` — SQLite has a quirk where by default only one thread can use it at a time. This disables that restriction, which is safe for our use case.

```python
class Base(DeclarativeBase):
    pass
```

`Base` is the foundation that all our database table classes will inherit from. It's what connects a Python class to a real database table.

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

This is a **generator function** (note `yield` instead of `return`). It creates a database session, gives it to whoever asked for it, and then — no matter what happens, even if there's an error — closes the session when done. This ensures database connections are never left open. FastAPI uses this as a "dependency" (explained below).

---

### `backend/models/wordle.py`

This file defines the database tables as Python classes.

```python
class WordleWord(Base):
    __tablename__ = "wordle_words"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    word: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    played_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)
```

Each class = one table in the database. Each attribute = one column.

| Column | Type | What it stores |
|--------|------|----------------|
| `id` | Integer | Auto-incrementing unique number. Every row gets one automatically. |
| `word` | String | The word itself (e.g. "saunak"). `unique=True` means no duplicates. |
| `added_at` | DateTime | When the word was added. Defaults to right now. |
| `played_at` | DateTime or None | `None` = not yet played. Set to a timestamp when the game ends. This is how we track "used" vs "unused". |

```python
class WordleState(Base):
    __tablename__ = "wordle_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    current_word_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("wordle_words.id"), nullable=True, default=None
    )
```

This table always has exactly **one row** (id=1). Its only job is to remember which word is currently "locked in" for the active game.

- `current_word_id` — the ID of the word currently being played. `None` means no game is active; pick a new word next time someone asks.
- `ForeignKey("wordle_words.id")` — this column must contain a valid `id` from the `wordle_words` table, or be `None`. It's a link between two tables.

Think of `WordleState` as a sticky note on the fridge that says "current word: #7". When the game ends, you erase it. When a new game starts, you write a new word number.

---

### `backend/services/wordle_service.py`

This file contains all the actual logic — no HTTP routing, just the game mechanics.

#### Loading the English word list

```python
_ENABLE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "enable1.txt")
_english_words: frozenset[str] | None = None

def get_english_words() -> frozenset[str]:
    global _english_words
    if _english_words is None:
        with open(_ENABLE_PATH) as f:
            _english_words = frozenset(w.strip().lower() for w in f if w.strip())
    return _english_words
```

- The ENABLE word list has ~173,000 English words, one per line.
- `frozenset` is like a `set` (unordered collection with no duplicates) but immutable (can't be changed after creation). Sets are used here because checking "is this word in the set?" is near-instant (`O(1)` time), vs a list where you'd scan through all 173k words every time.
- `global _english_words` + the `if _english_words is None` check means the file is only read **once** when the server starts, then cached in memory for all future calls. This is called **lazy initialization** or a **singleton pattern**.

#### The scoring algorithm

This is the core of Wordle. Given the secret word and a guess, it returns a result like `["correct", "absent", "present", "correct", "absent"]`.

```python
def score_guess(secret: str, guess: str) -> list[LetterResult]:
    result: list[LetterResult] = ["absent"] * len(secret)
    secret_counts: dict[str, int] = {}

    # Pass 1: Find exact matches (correct position)
    for i, (s, g) in enumerate(zip(secret, guess)):
        if s == g:
            result[i] = "correct"
        else:
            secret_counts[s] = secret_counts.get(s, 0) + 1

    # Pass 2: Find letters in wrong position (present)
    for i, (s, g) in enumerate(zip(secret, guess)):
        if result[i] == "correct":
            continue
        if g in secret_counts and secret_counts[g] > 0:
            result[i] = "present"
            secret_counts[g] -= 1

    return result
```

The two-pass approach handles a tricky edge case: **duplicate letters**.

Example — secret is `"apple"`, guess is `"paper"`:

**Pass 1** (correct position):
- Position 0: `p` vs `a` — no match. Count `a` → `{a:1}`
- Position 1: `a` vs `p` — no match. Count `p` → `{a:1, p:1}`
- Position 2: `p` vs `p` — ✓ CORRECT. Don't count this `p`.
- Position 3: `e` vs `e` — ✓ CORRECT.
- Position 4: `r` vs `r` — ✓ CORRECT. Don't count `r` vs wait, secret is `apple` so `r` vs `e` — no match. Count `e` → `{a:1, p:1, e:1}`

Result so far: `[absent, absent, correct, correct, absent]`
`secret_counts = {a:1, p:1, e:1}`

**Pass 2** (wrong position — uses the counts):
- Position 0: `p` (guess) — is `p` in counts and count > 0? Yes (count=1). Mark PRESENT. Count now `p:0`.
- Position 1: `a` (guess) — is `a` in counts and count > 0? Yes (count=1). Mark PRESENT. Count now `a:0`.

Final: `[present, present, correct, correct, absent]`

The counts prevent the same letter in the secret being highlighted more times than it actually appears. This is exactly how the real Wordle scoring works.

#### Word cycling — how the current word is chosen

```python
def get_current_word(db: Session) -> WordleWord | None:
    state = _get_state(db)

    # 1. If a word is already locked in, return it
    if state.current_word_id is not None:
        word = db.query(WordleWord).filter(WordleWord.id == state.current_word_id).first()
        if word is not None:
            return word

    # 2. Pick a random unplayed word
    word = (
        db.query(WordleWord)
        .filter(WordleWord.played_at.is_(None))
        .order_by(text("RANDOM()"))
        .first()
    )

    # 3. If all words have been played, reset everyone and pick again
    if word is None:
        db.query(WordleWord).update({"played_at": None})
        db.commit()
        word = db.query(WordleWord).order_by(text("RANDOM()")).first()

    if word is None:
        return None

    # 4. Lock in the chosen word
    state.current_word_id = word.id
    db.commit()
    return word
```

Step-by-step:
1. Check the `WordleState` sticky note. If it already points to a word, that's the current game — return it. This is why refreshing the page gives you the same word.
2. No sticky note? Pick a random word from the "not yet played" pool (`played_at IS NULL`). `ORDER BY RANDOM()` is SQLite's built-in shuffle.
3. If every single word has been played (`played_at` is set on all of them), reset everything by setting all `played_at` back to `None`, then pick randomly again. This is the "cycle wraps around" behaviour.
4. Write the chosen word's ID onto the sticky note (`state.current_word_id = word.id`).

---

### `backend/routers/wordle.py`

This file defines the HTTP endpoints — the URLs the frontend calls.

#### Concept: FastAPI dependency injection

Look at this endpoint:
```python
@router.get("/current")
def current_word(db: Session = Depends(get_db)):
    ...
```

The `db: Session = Depends(get_db)` part is **dependency injection**. It's saying: "Before you call this function, run `get_db()` and pass the result in as `db`." FastAPI handles this automatically.

This means every endpoint gets a fresh database session, and FastAPI takes care of closing it when the request is done (because of the `try/finally` in `get_db`). You don't have to manually open or close the database in every function.

#### Concept: Pydantic models (request validation)

```python
class GuessRequest(BaseModel):
    word_id: int
    guess: str
```

When the frontend sends a `POST /api/wordle/guess` request with a JSON body, FastAPI automatically reads that JSON and maps it to a `GuessRequest` object. If the JSON is missing `word_id` or `guess`, or if `word_id` isn't an integer, FastAPI rejects the request with an error before your code even runs. This is free input validation.

#### The five endpoints

| Method | URL | What it does |
|--------|-----|--------------|
| `GET` | `/api/wordle/current` | Returns `{id, length}` of the current locked word. Never reveals the word itself. |
| `POST` | `/api/wordle/guess` | Takes `{word_id, guess}`, validates the guess, scores it, returns `{result: [...]}`. |
| `POST` | `/api/wordle/complete` | Takes `{word_id}`, marks the word as played, clears the lock, returns `{word}`. |
| `POST` | `/api/wordle/words` | Takes `{words: [...], mark_unused: bool}`, adds new words or resets existing ones. |
| `GET` | `/api/wordle/validate/{guess}?word_id=N` | Returns `{valid: true/false}` without scoring. Used optionally for live validation. |

---

### `backend/main.py`

```python
from database import Base, engine
from routers import wordle

Base.metadata.create_all(bind=engine)
```

`Base.metadata.create_all(bind=engine)` runs when the server starts. It looks at all the classes that inherit from `Base` (i.e., `WordleWord` and `WordleState`) and creates the corresponding tables in the SQLite file if they don't exist yet. The first time the server ever starts, this creates `words.db` with empty tables. After that, it's a no-op.

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    ...
)
```

**CORS** (Cross-Origin Resource Sharing) is a browser security feature. By default, a browser will refuse to let JavaScript on `nikisaunak.com` make HTTP requests to `api.nikisaunak.com` because they're different "origins". The CORS middleware tells the browser "it's fine, we allow this". `allow_methods` was updated from just `["GET"]` to `["GET", "POST"]` because the new wordle endpoints need `POST`.

---

### `backend/Dockerfile`

```dockerfile
RUN mkdir -p /app/data
```

This line was added to ensure the `data/` directory exists inside the container before the server starts. Without it, the server would crash trying to create `words.db` in a folder that doesn't exist.

---

### `docker-compose.yml` — Docker Volumes

```yaml
backend:
  build: ./backend
  ports:
    - "8000:8000"
  volumes:
    - wordle_data:/app/data

volumes:
  wordle_data:
```

#### Concept: Why volumes matter

A Docker container is like a sealed box. When you rebuild the box (redeploy), everything inside is thrown away and replaced with a fresh copy. This means any file the server creates at runtime — like `words.db` — gets deleted on every redeploy.

A **volume** is a named storage area that lives *outside* the container. It's persistent storage that survives container rebuilds. By mounting `wordle_data` at `/app/data` inside the container, the `words.db` file lives in the volume, not inside the container. Redeploy the container — the database survives.

`wordle_data:` at the bottom declares the volume. Docker creates and manages it automatically.

---

## Frontend

The frontend is written in **TypeScript** using **Angular 21**.

---

### `frontend/src/app/services/wordle.service.ts`

```typescript
const API = 'http://localhost:8000/api/wordle';

@Injectable({ providedIn: 'root' })
export class WordleService {
  private http = inject(HttpClient);
  ...
}
```

#### Concept: Services in Angular

A **service** is a class that handles work that doesn't belong to a specific UI component — like talking to a server. The `@Injectable({ providedIn: 'root' })` decorator means Angular creates one instance of this service and shares it with the entire app. The game component doesn't need to know *how* to make HTTP calls; it just asks the service.

#### Concept: Observables and `subscribe`

```typescript
getCurrent(): Observable<WordMeta> {
  return this.http.get<WordMeta>(`${API}/current`);
}
```

Angular's `HttpClient` returns **Observables** — not the data itself, but a promise-like object representing a future value. HTTP calls are asynchronous: you don't know when the server will respond. An Observable is a stream that will emit a value (the response) at some point in the future.

You read that value by calling `.subscribe()`:

```typescript
this.wordleService.getCurrent().subscribe({
  next: (meta) => { /* runs when response arrives */ },
  error: ()    => { /* runs if the request fails */  },
});
```

Think of it like placing a coffee order. `.subscribe()` is handing your order to the barista. `next` is what you do when they call your name. `error` is what you do if they run out of coffee.

---

### `frontend/src/app/app.config.ts`

```typescript
providers: [
  ...
  provideHttpClient(),
]
```

This line was added to "register" Angular's HTTP client with the app. Without it, `inject(HttpClient)` in the service would throw an error because Angular wouldn't know what `HttpClient` is. This is Angular's dependency injection system — you declare what's available, and Angular wires it up.

---

### `frontend/src/app/games/wordle/wordle.ts`

This is the main game file. Let's go through the new concepts.

#### Concept: Angular Signals

```typescript
readonly wordMeta = signal<WordMeta | null>(null);
readonly guesses  = signal<string[]>([]);
readonly gameState = signal<GameState>('loading');
```

A **signal** is a reactive value. When its value changes, Angular automatically knows to update any part of the UI that depends on it — without you having to tell Angular "hey, please re-render".

The `<type>` in `signal<WordMeta | null>` is TypeScript's generic syntax — it tells the signal what type of value to expect. `WordMeta | null` means "either a WordMeta object or null".

You **read** a signal by calling it like a function: `this.guesses()`.
You **write** to a signal with `.set()`: `this.guesses.set(['snake', 'trail'])`.
You can also **update** based on the current value: `this.currentRow.update(r => r + 'A')`.

#### Concept: Computed signals

```typescript
readonly wordIndices = computed(() => {
  const meta = this.wordMeta();
  return meta ? Array.from({ length: meta.length }, (_, i) => i) : [];
});
```

A **computed** signal is a signal whose value is automatically derived from other signals. You never call `.set()` on it — it recalculates itself whenever any signal it reads from changes.

Here, `wordIndices` produces `[0, 1, 2, 3, 4, 5]` if the word is 6 letters long. The template uses this to render the correct number of cells per row. The `_` in `(_, i)` is a convention for "I don't care about this argument" (it's the array element value, which is `undefined`).

```typescript
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
```

This builds a map of `letter → best result`. For example, if you guessed "saunak" and `S` was "present" in one guess but "correct" in another, the keyboard should show `S` as "correct" (the best/most informative result). The `priority` object makes `correct` beat `present` beat `absent`.

#### Concept: `@HostListener`

```typescript
@HostListener('window:keydown', ['$event'])
onKeyDown(event: KeyboardEvent): void {
  ...
}
```

`@HostListener` is a decorator that tells Angular: "listen for this event on the window (the browser's global object), and call this method when it fires." This is how physical keyboard input works — every keypress fires a `keydown` event on the window, and this method catches it.

`['$event']` means "pass the actual keyboard event object as the argument to the method".

Without `@HostListener`, you'd have to manually add and remove event listeners in `ngOnInit` and `ngOnDestroy`. The decorator handles that lifecycle automatically.

#### localStorage — surviving a page refresh

```typescript
const LS_CURRENT_ID = 'wordle_current_id';
const lsGuesses  = (id: number) => `wordle_guesses_${id}`;
const lsResults  = (id: number) => `wordle_results_${id}`;
```

**localStorage** is the browser's built-in key-value store. Data stored here persists even if you close and reopen the tab — unlike regular variables which are reset on every page load.

We use it to save:
- `wordle_current_id` — what word ID was the browser working on
- `wordle_guesses_5` — the guesses made so far for word #5 (the number varies per word)
- `wordle_results_5` — the scoring results so far for word #5

When the page loads (`ngOnInit → loadCurrentWord → restoreOrStart`):
1. Ask the server what the current word ID is (e.g. `id: 5`)
2. Check localStorage: `wordle_current_id === "5"`?
   - **Yes** → restore the saved guesses and results. Resume where you left off.
   - **No** → the other player completed the previous word and the server advanced. Clear old localStorage and start fresh.

This is why refreshing the page restores your in-progress game, but if your partner finishes while you have the tab open, loading a new word clears your old state.

#### The game flow in `submitGuess`

```typescript
submitGuess(): void {
  // 1. Validate locally (length check)
  const guess = this.currentRow().toLowerCase();
  if (guess.length !== meta.length) { ... return; }

  // 2. Send to server
  this.isSubmitting.set(true);
  this.wordleService.guess(meta.id, guess).subscribe({
    next: ({ result }) => {
      // 3. Commit the guess and its result
      const newGuesses = [...this.guesses(), guess];
      const newResults = [...this.results(), result];
      this.guesses.set(newGuesses);
      this.results.set(newResults);

      // 4. Save to localStorage
      localStorage.setItem(lsGuesses(meta.id), JSON.stringify(newGuesses));
      localStorage.setItem(lsResults(meta.id), JSON.stringify(newResults));

      // 5. Check win/loss
      const won = result.every((r) => r === 'correct');
      const lost = !won && newGuesses.length >= MAX_GUESSES;
      if (won || lost) this.completeGame(won);
    },
    error: (err) => {
      // Server rejected the guess (not a valid word)
      this.errorMsg.set(err.error?.detail ?? 'Not a valid word');
    },
  });
}
```

Note `[...this.guesses(), guess]` — the spread operator `...` creates a new array containing all existing guesses plus the new one. In Angular, you must always replace a signal's value with a new object/array (not mutate the existing one) for change detection to work correctly.

`isSubmitting` prevents double-submits — while the server is thinking, the keyboard is locked.

---

### `frontend/src/app/games/wordle/wordle.html`

```html
<div class="guess-grid" [style.--word-len]="wordMeta()?.length ?? 5">
```

`[style.--word-len]` sets a **CSS custom property** (variable) on this element. The SCSS uses it:
```scss
--cell-size: clamp(36px, calc(min(90vw, 400px) / var(--word-len)), 64px);
```

This is how the grid automatically adjusts cell sizes for any word length. `clamp(min, preferred, max)` picks the `preferred` value but never goes below `min` or above `max`. The result: cells are always readable whether the word is 4 letters or 10.

```html
@for (rowIdx of rowIndices; track rowIdx) {
  <div class="word-row">
    @for (colIdx of wordIndices(); track colIdx) {
      <div class="letter-cell"
           [ngClass]="{ 'correct': getResult(rowIdx, colIdx) === 'correct', ... }">
        {{ getLetter(rowIdx, colIdx) }}
      </div>
    }
  </div>
}
```

`@for` is Angular's control flow syntax (new in Angular 17). `track` tells Angular how to identify each item when the list changes — it uses this to avoid re-rendering items unnecessarily.

`[ngClass]` applies CSS classes conditionally. The object keys are class names; the values are conditions. If `getResult(0, 2) === 'correct'`, the class `correct` is applied to that cell, making it show the teal background.

---

### `frontend/src/app/games/wordle/wordle.scss`

The key sizing trick:

```scss
.guess-grid {
  --cell-size: clamp(36px, calc(min(90vw, 400px) / var(--word-len)), 64px);
}

.word-row {
  display: flex;
  gap: 6px;
}

.letter-cell {
  width: var(--cell-size);
  height: var(--cell-size);
  ...
}
```

Every cell is a square `--cell-size × --cell-size`. The size is computed so that all cells fit within 90% of the screen width (`90vw`) but never exceed 400px total width, and each cell is between 36px and 64px. `var(--word-len)` is the CSS variable set from the template.

---

## How a Complete Game Plays Out

Here's the entire flow from opening the page to finishing a game:

```
1. Browser opens /wordle
   └─► Angular creates WordleComponent
       └─► ngOnInit() fires → loadCurrentWord()

2. loadCurrentWord()
   └─► GET http://localhost:8000/api/wordle/current
       └─► Server checks WordleState table
           ├─ Already locked? Return {id:5, length:6}
           └─ Not locked? Pick random unplayed word, lock it, return {id:5, length:6}
   └─► Frontend receives {id:5, length:6}
       └─► restoreOrStart({id:5, length:6})
           ├─ localStorage has "wordle_current_id = 5"?
           │   ├─ YES → restore saved guesses and results
           │   └─ NO  → start fresh, store "wordle_current_id = 5"
           └─► gameState = 'playing'

3. Player types "s", "n", "a", "k", "e"
   └─► @HostListener catches each keydown
       └─► addLetter() appends to currentRow signal
           └─► Angular sees signal changed → re-renders the active row

4. Player presses Enter
   └─► submitGuess()
       └─► POST http://localhost:8000/api/wordle/guess
           Body: {word_id: 5, guess: "snake"}
           └─► Server checks:
               ├─ Is "snake" in ENABLE word list? YES ✓
               ├─ Is "snake" 6 letters? (word is 6 letters) NO ✗
               └─► Returns 400: "not a valid 6-letter word"
   └─► Frontend shows error banner "Word must be 6 letters"

5. Player types "saunik" and presses Enter
   └─► POST {word_id:5, guess:"saunik"}
       └─► Server:
           ├─ "saunik" in ENABLE? NO
           ├─ "saunik" in custom words? NO
           └─► Returns 400 error
   └─► Frontend: "Not a valid word"

6. Player types "season" (a real word, 6 letters) and presses Enter
   └─► POST {word_id:5, guess:"season"}
       └─► Server scores "season" against secret word "saunak":
           s=s CORRECT, e≠a, a≠u, s≠n, o≠a, n≠k
           ... (scoring algorithm runs) ...
           └─► Returns {result:["correct","absent","present","absent","absent","present"]}
   └─► Frontend:
       ├─ Appends "season" to guesses[]
       ├─ Appends result to results[]
       ├─ Saves both to localStorage
       ├─ letterStates recomputes → S=correct, E=absent, A=present, N=present
       └─► Grid and keyboard re-render with colors

7. After 6 guesses (or a winning guess)
   └─► completeGame(won: true/false)
       └─► POST http://localhost:8000/api/wordle/complete
           Body: {word_id: 5}
           └─► Server:
               ├─ Sets wordle_words.played_at = NOW() for word 5
               ├─ Sets wordle_state.current_word_id = NULL (clears lock)
               └─► Returns {word: "saunak"}
   └─► Frontend:
       ├─ revealedWord = "saunak"
       ├─ gameState = "won" (or "lost")
       └─► Result panel appears: "🎉 You got it! saunak"

8. Player clicks "Next word →"
   └─► nextWord() → loadCurrentWord() again
       └─► Server: lock is cleared, picks a new random unplayed word
           └─► A new game begins
```

---

## How to Add Words

The backend exposes a `POST /api/wordle/words` endpoint. You can call it from any terminal:

```bash
# Add new words
curl -X POST http://localhost:8000/api/wordle/words \
  -H "Content-Type: application/json" \
  -d '{"words": ["saunak", "niki", "trekking", "himalaya"]}'

# Response
{"added": ["saunak","niki","trekking","himalaya"], "skipped": [], "reset": []}
```

```bash
# Put a word back into circulation (set played_at back to NULL)
curl -X POST http://localhost:8000/api/wordle/words \
  -H "Content-Type: application/json" \
  -d '{"words": ["saunak"], "mark_unused": true}'

# Response
{"added": [], "skipped": [], "reset": ["saunak"]}
```

- `added` — words that were new and got inserted
- `skipped` — words that already existed (and `mark_unused` was not set)
- `reset` — words that already existed and were put back into circulation

---

## File Map

```
backend/
├── database.py            ← DB connection + session management
├── models/
│   └── wordle.py          ← WordleWord and WordleState table definitions
├── services/
│   └── wordle_service.py  ← Game logic: scoring, word cycling, validation
├── routers/
│   └── wordle.py          ← HTTP endpoints (5 routes)
├── data/
│   ├── enable1.txt        ← 172,823 English words (bundled, read-only)
│   └── words.db           ← SQLite database (auto-created, NOT committed)
├── main.py                ← App entry point, CORS, table creation
├── requirements.txt       ← Python dependencies
└── Dockerfile             ← How to build the container

frontend/src/app/
├── services/
│   └── wordle.service.ts  ← HttpClient wrapper for all API calls
├── games/wordle/
│   ├── wordle.ts          ← Game component (all game logic)
│   ├── wordle.html        ← Template (grid, keyboard, result panel)
│   └── wordle.scss        ← Styles (tile colors, sizing, keyboard)
├── app.config.ts          ← Added provideHttpClient()
├── app.routes.ts          ← Added /wordle lazy route
└── home/home.ts           ← Added Wordle widget card

docker-compose.yml         ← Added wordle_data volume for DB persistence
```
