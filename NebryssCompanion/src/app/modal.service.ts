// modal.service.ts
import { ApplicationRef, Injectable, ComponentRef, createComponent, EnvironmentInjector, TemplateRef } from '@angular/core';
import { ModalComponent } from './modal/modal.component';

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  private modalComponentRef: ComponentRef<ModalComponent> | null = null;

  constructor(private injector: EnvironmentInjector, private appRef: ApplicationRef) {}

  openFromTemplate(template: TemplateRef<any>, context?: any, options: { width?: string, height?: string } = {}) {
    this.close();
  
    this.modalComponentRef = createComponent(ModalComponent, {
      environmentInjector: this.injector
    });
  
    // Append to DOM and detect changes first
    this.appRef.attachView(this.modalComponentRef.hostView);
    document.body.appendChild(this.modalComponentRef.location.nativeElement);
    this.modalComponentRef.changeDetectorRef.detectChanges();
  
    // Now set the template and context
    this.modalComponentRef.instance.setTemplate(template, context);
    if (options.width) this.modalComponentRef.instance.width = options.width;
    if (options.height) this.modalComponentRef.instance.height = options.height;
    
    this.modalComponentRef.instance.close = () => this.close();
    this.modalComponentRef.changeDetectorRef.detectChanges();
  }

  close() {
    if (this.modalComponentRef) {
      // Make sure the DOM element is removed properly
      const element = this.modalComponentRef.location.nativeElement;
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
      
      this.appRef.detachView(this.modalComponentRef.hostView);
      this.modalComponentRef.destroy();
      this.modalComponentRef = null;
    }
  }
}
