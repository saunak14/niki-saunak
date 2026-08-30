import os
from datetime import datetime
from typing import Literal

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from models.wordle import WordleState, WordleWord

LetterResult = Literal["correct", "present", "absent"]

_ENABLE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "dictionary.txt")
_english_words: frozenset[str] | None = None


def get_english_words() -> frozenset[str]:
    global _english_words
    if _english_words is None:
        with open(_ENABLE_PATH) as f:
            _english_words = frozenset(w.strip().lower() for w in f if w.strip())
    return _english_words


def score_guess(secret: str, guess: str) -> list[LetterResult]:
    result: list[LetterResult] = ["absent"] * len(secret)
    secret_counts: dict[str, int] = {}

    for i, (s, g) in enumerate(zip(secret, guess)):
        if s == g:
            result[i] = "correct"
        else:
            secret_counts[s] = secret_counts.get(s, 0) + 1

    for i, (s, g) in enumerate(zip(secret, guess)):
        if result[i] == "correct":
            continue
        if g in secret_counts and secret_counts[g] > 0:
            result[i] = "present"
            secret_counts[g] -= 1

    return result


def is_valid_guess(db: Session, guess: str, word_length: int) -> bool:
    if len(guess) != word_length:
        return False
    g = guess.lower()
    if g in get_english_words():
        return True
    return db.query(WordleWord).filter(func.lower(WordleWord.word) == g).first() is not None


def _get_state(db: Session) -> WordleState:
    state = db.query(WordleState).filter(WordleState.id == 1).first()
    if state is None:
        state = WordleState(id=1, current_word_id=None)
        db.add(state)
        db.commit()
        db.refresh(state)
    return state


def get_current_word(db: Session) -> WordleWord | None:
    state = _get_state(db)

    if state.current_word_id is not None:
        word = db.query(WordleWord).filter(WordleWord.id == state.current_word_id).first()
        if word is not None:
            return word

    # No locked word — pick a random unplayed one
    word = (
        db.query(WordleWord)
        .filter(WordleWord.played_at.is_(None))
        .order_by(text("RANDOM()"))
        .first()
    )

    if word is None:
        # All words played — reset and pick again
        db.query(WordleWord).update({"played_at": None})
        db.commit()
        word = (
            db.query(WordleWord)
            .order_by(text("RANDOM()"))
            .first()
        )

    if word is None:
        return None

    state.current_word_id = word.id
    db.commit()
    return word


def complete_word(db: Session, word_id: int) -> WordleWord | None:
    word = db.query(WordleWord).filter(WordleWord.id == word_id).first()
    if word is None:
        return None
    word.played_at = datetime.utcnow()
    state = _get_state(db)
    state.current_word_id = None
    db.commit()
    db.refresh(word)
    return word


def add_words(db: Session, words: list[str], mark_unused: bool) -> dict:
    added: list[str] = []
    skipped: list[str] = []
    reset: list[str] = []

    for raw in words:
        w = raw.strip().lower()
        if not w:
            continue
        existing = db.query(WordleWord).filter(func.lower(WordleWord.word) == w).first()
        if existing:
            if mark_unused:
                existing.played_at = None
                reset.append(w)
            else:
                skipped.append(w)
        else:
            db.add(WordleWord(word=w))
            added.append(w)

    db.commit()
    return {"added": added, "skipped": skipped, "reset": reset}
