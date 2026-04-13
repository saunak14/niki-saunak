import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home').then((m) => m.HomeComponent),
  },
  {
    path: 'snake',
    loadComponent: () => import('./games/snake/snake').then((m) => m.SnakeComponent),
  },
  { path: '**', redirectTo: '' },
];
