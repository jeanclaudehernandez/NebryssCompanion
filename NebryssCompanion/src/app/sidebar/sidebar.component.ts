import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, ViewChild, ElementRef, HostListener, TemplateRef } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ModalService } from '../modal.service';
import { ThemeService } from '../theme.service';
import { AdminService } from '../admin.service';
import { AppView } from '../app-view.types';
import { FormsModule } from '@angular/forms';
import { DataService } from '../data.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  @ViewChild('sidebar') sidebarElement!: ElementRef;
  @ViewChild('burger') burgerElement!: ElementRef;
  @ViewChild('adminDialog') adminDialogTemplate!: TemplateRef<any>;
  @Output() viewChange = new EventEmitter<AppView>();
  @Output() openSettings = new EventEmitter<void>();
  isOpen = false;
  isAdmin = false;

  constructor(
    private matDialog: MatDialog,
    private modalService: ModalService,
    public themeService: ThemeService,
    private adminService: AdminService,
    private dataService: DataService
  ) {
    this.adminService.isAdmin$.subscribe(isAdmin => {
      this.isAdmin = isAdmin;
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen && !this.isClickInside(event)) {
      this.isOpen = false;
    }

    this.matDialog.openDialogs.forEach((dialog) => {
      if (!dialog.disableClose) {
        dialog.close();
      }
    });
  }

  private isClickInside(event: MouseEvent): boolean {
    const target = event.target as Node;
    const clickedInsideSidebar = this.sidebarElement?.nativeElement.contains(target);
    const clickedInsideBurger = this.burgerElement?.nativeElement.contains(target);
    const clickedHeaderBtn = (target as Element)?.closest?.('.header-action-btn');
    return !!(clickedInsideSidebar || clickedInsideBurger || clickedHeaderBtn);
  }

  toggleMenu() {
    this.isOpen = !this.isOpen;
  }

  changeView(view: AppView) {
    this.viewChange.emit(view);
    this.toggleMenu();
  }

  openSettingsModal(): void {
    this.openSettings.emit();
    this.isOpen = false;
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

  openAdminNpcEditor(): void {
    if (this.isAdmin) {
      this.changeView('adminNpcEditor');
      return;
    }

    this.openAdminDialog(this.adminDialogTemplate, () => {
      this.changeView('adminNpcEditor');
    });
  }

  openAdminShopEditor(): void {
    if (this.isAdmin) {
      this.changeView('adminShopEditor');
      return;
    }

    this.openAdminDialog(this.adminDialogTemplate, () => {
      this.changeView('adminShopEditor');
    });
  }

  openAdminCreatureEditor(): void {
    if (this.isAdmin) {
      this.changeView('adminCreatureEditor');
      return;
    }

    this.openAdminDialog(this.adminDialogTemplate, () => {
      this.changeView('adminCreatureEditor');
    });
  }

  openAdminCampaignEditor(): void {
    if (this.isAdmin) {
      this.changeView('adminCampaignEditor');
      return;
    }

    this.openAdminDialog(this.adminDialogTemplate, () => {
      this.changeView('adminCampaignEditor');
    });
  }

  openAdminRulesEditor(): void {
    if (this.isAdmin) {
      this.changeView('adminRulesEditor');
      return;
    }

    this.openAdminDialog(this.adminDialogTemplate, () => {
      this.changeView('adminRulesEditor');
    });
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
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.confirmation-dialog input[type="password"]');
      input?.focus();
    }, 50);
  }

  logoutAdmin() {
    this.adminService.setAdminAuthenticated(false);
  }
}
