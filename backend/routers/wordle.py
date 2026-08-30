from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from services.wordle_service import (
    add_words,
    complete_word,
    get_current_word,
    is_valid_guess,
    score_guess,
)

router = APIRouter(prefix="/api/wordle", tags=["wordle"])


class GuessRequest(BaseModel):
    word_id: int
    guess: str


class CompleteRequest(BaseModel):
    word_id: int


class AddWordsRequest(BaseModel):
    words: list[str]
    mark_unused: bool = False


@router.get("/current")
def current_word(db: Session = Depends(get_db)):
    word = get_current_word(db)
    if word is None:
        raise HTTPException(status_code=404, detail="No words in the database yet")
    return {"id": word.id, "length": len(word.word)}


@router.post("/guess")
def guess(req: GuessRequest, db: Session = Depends(get_db)):
    from models.wordle import WordleWord

    word_obj = db.query(WordleWord).filter(WordleWord.id == req.word_id).first()
    if word_obj is None:
        raise HTTPException(status_code=404, detail="Word not found")

    g = req.guess.strip().lower()
    if not is_valid_guess(db, g, len(word_obj.word)):
        raise HTTPException(
            status_code=400,
            detail=f"'{req.guess}' is not a valid {len(word_obj.word)}-letter word",
        )

    return {"result": score_guess(word_obj.word.lower(), g)}


@router.post("/complete")
def complete(req: CompleteRequest, db: Session = Depends(get_db)):
    word = complete_word(db, req.word_id)
    if word is None:
        raise HTTPException(status_code=404, detail="Word not found")
    return {"word": word.word}


@router.post("/words")
def add(req: AddWordsRequest, db: Session = Depends(get_db)):
    if not req.words:
        raise HTTPException(status_code=400, detail="No words provided")
    return add_words(db, req.words, req.mark_unused)


@router.get("/validate/{guess}")
def validate(guess: str, word_id: int, db: Session = Depends(get_db)):
    from models.wordle import WordleWord

    word_obj = db.query(WordleWord).filter(WordleWord.id == word_id).first()
    if word_obj is None:
        raise HTTPException(status_code=404, detail="Word not found")

    return {"valid": is_valid_guess(db, guess.strip().lower(), len(word_obj.word))}
