import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  templateUrl: './auth-layout.component.html',
  styleUrl: './auth-layout.component.css',
})
export class AuthLayoutComponent {
  constructor() {
    const document = inject(DOCUMENT);
    const themeColor = inject(Meta).getTag('name="theme-color"');
    const destroyRef = inject(DestroyRef);
    const root = document.documentElement;
    const authColor = document.defaultView?.getComputedStyle(root).getPropertyValue('--auth-edge-color').trim();
    if (!themeColor || !authColor) return;

    const previousColor = themeColor.content;
    themeColor.content = authColor;
    destroyRef.onDestroy(() => { themeColor.content = previousColor; });
  }
}
