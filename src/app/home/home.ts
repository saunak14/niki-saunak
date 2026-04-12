import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

interface Widget {
  icon: string;
  name: string;
  desc: string;
  route: string | null;
  active: boolean;
}

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private router = inject(Router);

  readonly widgets: Widget[] = [
    { icon: '🐍', name: 'Snake', desc: 'A colorful twist on the classic', route: '/snake', active: true },
    { icon: '🌤️', name: 'Weather', desc: 'See the weather at hottie\'s locations', route: null, active: false },
    { icon: '🏀', name: 'Sports Scores', desc: 'For Saunak to follow his favorite teams (and for Niki to understand Saunak\'s mood', route: null, active: false },
    { icon: '🚌', name: 'Transit', desc: 'BART & bus stop times near Saunak\'s house', route: null, active: false },
    { icon: '💣', name: 'Minesweeper', desc: 'Niki\'s favorite pastime', route: null, active: false },
  ];

  navigate(widget: Widget): void {
    if (widget.active && widget.route) {
      this.router.navigate([widget.route]);
    }
  }
}
