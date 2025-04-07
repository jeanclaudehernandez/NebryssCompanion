import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private renderer: Renderer2;
  private toastElement: HTMLElement | null = null;
  private toastTimeout: any = null;

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  show(message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = 3000): void {
    // Clear any existing toast
    this.clear();

    // Create toast element
    this.toastElement = this.renderer.createElement('div');
    this.renderer.addClass(this.toastElement, 'toast');
    this.renderer.addClass(this.toastElement, `toast-${type}`);
    
    // Add message
    this.renderer.setProperty(this.toastElement, 'innerText', message);
    
    // Add to document
    this.renderer.appendChild(document.body, this.toastElement);
    
    // Animate in
    setTimeout(() => {
      if (this.toastElement) {
        this.renderer.addClass(this.toastElement, 'show');
      }
    }, 10);
    
    // Auto remove after duration
    this.toastTimeout = setTimeout(() => {
      this.clear();
    }, duration);
  }

  clear(): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }
    
    if (this.toastElement) {
      this.renderer.removeClass(this.toastElement, 'show');
      
      // Remove from DOM after animation completes
      setTimeout(() => {
        if (this.toastElement) {
          this.renderer.removeChild(document.body, this.toastElement);
          this.toastElement = null;
        }
      }, 300);
    }
  }
} 