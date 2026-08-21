import { Injectable, signal, effect } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  // Defaults to dark mode (isLight = false)
  private readonly isLightSignal = signal<boolean>(false);

  readonly isLight = this.isLightSignal.asReadonly();

  constructor() {
    // Load from localStorage if present
    const savedTheme = localStorage.getItem('medisync-theme');
    if (savedTheme === 'light') {
      this.isLightSignal.set(true);
      document.documentElement.classList.add('light-theme');
      document.body.classList.add('light-theme');
    } else {
      this.isLightSignal.set(false);
      document.documentElement.classList.remove('light-theme');
      document.body.classList.remove('light-theme');
    }

    // Effect to synchronise document class list state on updates
    effect(() => {
      const light = this.isLightSignal();
      if (light) {
        document.documentElement.classList.add('light-theme');
        document.body.classList.add('light-theme');
        localStorage.setItem('medisync-theme', 'light');
      } else {
        document.documentElement.classList.remove('light-theme');
        document.body.classList.remove('light-theme');
        localStorage.setItem('medisync-theme', 'dark');
      }
    });
  }

  toggleTheme(): void {
    this.isLightSignal.update(val => !val);
  }
}
