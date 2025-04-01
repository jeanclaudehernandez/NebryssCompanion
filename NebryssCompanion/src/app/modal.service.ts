// modal.service.ts
import { Injectable, ComponentRef, createComponent, EnvironmentInjector, TemplateRef } from '@angular/core';
import { ModalComponent } from './modal/modal.component';

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  private modalComponentRef: ComponentRef<ModalComponent> | null = null;

  constructor(private injector: EnvironmentInjector) {}

  openFromTemplate(template: TemplateRef<any>) {
    this.close(); // Close any existing modal

    // Create the modal component
    this.modalComponentRef = createComponent(ModalComponent, {
      environmentInjector: this.injector
    });

    // Set the template and close handler
    setTimeout(() => {
      this.modalComponentRef!.instance.setTemplate(template);
      this.modalComponentRef!.instance.close = () => this.close();
      document.body.appendChild(this.modalComponentRef!.location.nativeElement);
      this.modalComponentRef!.changeDetectorRef.detectChanges();
    });

    // Attach the modal to the DOM
    document.body.appendChild(this.modalComponentRef.location.nativeElement);
  }

  close() {
    if (this.modalComponentRef) {
      this.modalComponentRef.destroy();
      this.modalComponentRef = null;
    }
  }
}