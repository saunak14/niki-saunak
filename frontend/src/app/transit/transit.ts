import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';

interface Arrival {
  destination: string;
  minutes: number;
  color?: string | null;
}

interface Stop {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  activity: string | null;
  arrivals: Arrival[];
  error: boolean;
  error_detail?: string;
}

interface TransitData {
  stops: Stop[];
  fetched_at: string;
}

@Component({
  selector: 'app-transit',
  imports: [RouterLink],
  templateUrl: './transit.html',
  styleUrl: './transit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransitComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);

  readonly data = signal<TransitData | null>(null);
  readonly loading = signal(true);
  readonly fetchError = signal(false);

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private tickId: ReturnType<typeof setInterval> | null = null;
  private readonly REFRESH_MS = 60_000;

  // Increments every second so secondsAgo() re-evaluates in the template
  private readonly _tick = signal(0);

  private readonly visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      this.fetch();
      this.startInterval();
    } else {
      this.stopInterval();
    }
  };

  ngOnInit(): void {
    this.fetch();
    this.startInterval();
    this.tickId = setInterval(() => this._tick.update(n => n + 1), 1000);
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  ngOnDestroy(): void {
    this.stopInterval();
    if (this.tickId !== null) clearInterval(this.tickId);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
  }

  private fetch(): void {
    this.http.get<TransitData>('/api/transit/arrivals').subscribe({
      next: (data) => {
        this.data.set(data);
        this.loading.set(false);
        this.fetchError.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.fetchError.set(true);
      },
    });
  }

  private startInterval(): void {
    this.stopInterval();
    this.intervalId = setInterval(() => this.fetch(), this.REFRESH_MS);
  }

  private stopInterval(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isBart(stop: Stop): boolean {
    return stop.id.startsWith('glen_');
  }

  minuteLabel(mins: number): string {
    return mins === 0 ? 'Now' : String(mins);
  }

  activityEmoji(activity: string): string {
    if (activity.includes('Flying')) return '✈️';
    if (activity.includes('Running')) return '🏃';
    if (activity.includes('Groceries')) return '🛒';
    if (activity.includes('Downtown')) return '🌆';
    return '📍';
  }

  secondsAgo(): number {
    this._tick(); // subscribe to tick so this re-evaluates every second
    const d = this.data();
    if (!d) return 0;
    return Math.floor((Date.now() - new Date(d.fetched_at).getTime()) / 1000);
  }

  skeletons = Array(6);
}
