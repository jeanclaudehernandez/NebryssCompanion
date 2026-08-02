import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, ViewChild, ElementRef, HostListener, TemplateRef } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { UpdateService } from '../update.service';
import { ModalService } from '../modal.service';
import { ThemeService } from '../theme.service';
import { AdminService } from '../admin.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  @ViewChild('sidebar') sidebarElement!: ElementRef;
  @ViewChild('burger') burgerElement!: ElementRef;
  @ViewChild('confirmDialog') confirmDialogTemplate!: TemplateRef<any>;
  @ViewChild('adminDialog') adminDialogTemplate!: TemplateRef<any>;
  @Output() viewChange = new EventEmitter<'players' | 'bestiary' | 'letters' | 'items' | 'shops' | 'lore' | 'locations' | 'worldMap' | 'talents' | 'mistEffects' | 'terrains' | 'mistEngineBattles' | 'weaponRules' | 'alteredStates' | 'afflictions' | 'shipNavigation' | 'adminItemCreator' | 'adminLocationCreator' | 'adminPlayerEditor'>();
  isOpen = false;
  isAdmin = false;

  constructor(
    private matDialog: MatDialog,
    public updateService: UpdateService,
    private modalService: ModalService,
    public themeService: ThemeService,
    private adminService: AdminService
  ) {
    this.adminService.isAdmin$.subscribe(isAdmin => {
      this.isAdmin = isAdmin;
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // Handle sidebar closing
    if (this.isOpen && !this.isClickInside(event)) {
      this.isOpen = false;
    }
    
    // Close MatDialog dialogs
    this.matDialog.openDialogs.forEach((dialog) => {
      if(!dialog.disableClose) {
        dialog.close();
      }
    });
    
    // Close the modal if user clicked on the overlay or outside of any modal content
    /*if (!this.isModalClick(event)) {
      this.modalService.close();
    }*/
  }

  private isClickInside(event: MouseEvent): boolean {
    const target = event.target as Node;
    const clickedInsideSidebar = this.sidebarElement?.nativeElement.contains(target);
    const clickedInsideBurger = this.burgerElement?.nativeElement.contains(target);
    const clickedHeaderBtn = (target as Element)?.closest?.('.header-action-btn');
    return !!(clickedInsideSidebar || clickedInsideBurger || clickedHeaderBtn);
  }

  private isModalClick(event: MouseEvent): boolean {
    // Check if click was inside modal content (not on the overlay)
    const modalContent = document.querySelector('.modal-content');
    return modalContent?.contains(event.target as Node) || false;
  }

  toggleMenu() {
    this.isOpen = !this.isOpen;
  }

  changeView(view: 'players' | 'bestiary' | 'letters' | 'items' | 'shops' | 'lore' | 'locations' | 'worldMap' | 'talents' | 'mistEffects' | 'terrains' | 'mistEngineBattles' | 'weaponRules' | 'alteredStates' | 'afflictions' | 'shipNavigation' | 'adminItemCreator' | 'adminLocationCreator' | 'adminPlayerEditor') {
    this.viewChange.emit(view);
    this.toggleMenu();
  }

  openAdminItemCreator(): void {
    if (this.isAdmin) {
      this.changeView('adminItemCreator');
      return;
    }

    this.openAdminDialog(this.adminDialogTemplate, () => {
      this.changeView('adminItemCreator');
    });
  }

  openAdminLocationCreator(): void {
    if (this.isAdmin) {
      this.changeView('adminLocationCreator');
      return;
    }

    this.openAdminDialog(this.adminDialogTemplate, () => {
      this.changeView('adminLocationCreator');
    });
  }

  openAdminPlayerEditor(): void {
    if (this.isAdmin) {
      this.changeView('adminPlayerEditor');
      return;
    }

    this.openAdminDialog(this.adminDialogTemplate, () => {
      this.changeView('adminPlayerEditor');
    });
  }

  forceUpdate() {
    this.updateService.unregisterAndReload();
  }

  clearStorageAndUpdate() {
    const dialogContext = {
      confirm: () => {
        this.modalService.close();
        this.updateService.clearStorageAndReload();
      },
      cancel: () => {
        this.modalService.close();
      }
    };
    
    this.modalService.openFromTemplate(this.confirmDialogTemplate, dialogContext);
  }

  openAdminDialog(template: TemplateRef<any>, onSuccess?: () => void) {
    const dialogContext = {
      check: (password: string) => {
        if (password === '2602') {
          this.adminService.setAdminAuthenticated(true);
          this.modalService.close();
          onSuccess?.();
        } else {
          alert('Incorrect password');
        }
      },
      cancel: () => {
        this.modalService.close();
      }
    };
    this.modalService.openFromTemplate(template, dialogContext);
  }

  logoutAdmin() {
    this.adminService.setAdminAuthenticated(false);
  }
}
