from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class WordleWord(Base):
    __tablename__ = "wordle_words"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    word: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    played_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)


class WordleState(Base):
    __tablename__ = "wordle_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    current_word_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("wordle_words.id"), nullable=True, default=None
    )
