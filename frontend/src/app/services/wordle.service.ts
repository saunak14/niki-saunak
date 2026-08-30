import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type LetterResult = 'correct' | 'present' | 'absent';

export interface WordMeta {
  id: number;
  length: number;
}

export interface GuessResponse {
  result: LetterResult[];
}

export interface CompleteResponse {
  word: string;
}

export interface AddWordsResponse {
  added: string[];
  skipped: string[];
  reset: string[];
}

const API = '/api/wordle';

@Injectable({ providedIn: 'root' })
export class WordleService {
  private http = inject(HttpClient);

  getCurrent(): Observable<WordMeta> {
    return this.http.get<WordMeta>(`${API}/current`);
  }

  guess(wordId: number, guess: string): Observable<GuessResponse> {
    return this.http.post<GuessResponse>(`${API}/guess`, { word_id: wordId, guess });
  }

  complete(wordId: number): Observable<CompleteResponse> {
    return this.http.post<CompleteResponse>(`${API}/complete`, { word_id: wordId });
  }

  addWords(words: string[], markUnused = false): Observable<AddWordsResponse> {
    return this.http.post<AddWordsResponse>(`${API}/words`, { words, mark_unused: markUnused });
  }

  validate(guess: string, wordId: number): Observable<{ valid: boolean }> {
    return this.http.get<{ valid: boolean }>(`${API}/validate/${guess}?word_id=${wordId}`);
  }
}
