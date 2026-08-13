import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, ViewChild, ElementRef, HostListener, TemplateRef } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ModalService } from '../modal.service';
import { ThemeService } from '../theme.service';
import { AdminService } from '../admin.service';
import { AppView } from '../app-view.types';
import { FormsModule } from '@angular/forms';
import { DataService } from '../data.service';
import { AuthService } from '../auth.service';

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
  @Output() viewChange = new EventEmitter<AppView>();
  @Output() openSettings = new EventEmitter<void>();
  isOpen = false;
  isAdmin = false;

  constructor(
    private matDialog: MatDialog,
    private modalService: ModalService,
    public themeService: ThemeService,
    private adminService: AdminService,
    private dataService: DataService,
    public authService: AuthService
  ) {
    this.adminService.isAdmin$.subscribe(isAdmin => {
      this.isAdmin = isAdmin;
    });
  }

  onLogout(): void {
    this.isOpen = false;
    this.authService.logout().subscribe();
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
    this.changeView('adminItemCreator');
  }

  openAdminLocationCreator(): void {
    this.changeView('adminLocationCreator');
  }

  openAdminPlayerEditor(): void {
    this.changeView('adminPlayerEditor');
  }

  openAdminNpcEditor(): void {
    this.changeView('adminNpcEditor');
  }

  openAdminShopEditor(): void {
    this.changeView('adminShopEditor');
  }

  openAdminCreatureEditor(): void {
    this.changeView('adminCreatureEditor');
  }

  openAdminCampaignEditor(): void {
    this.changeView('adminCampaignEditor');
  }

  openAdminRulesEditor(): void {
    this.changeView('adminRulesEditor');
  }
}
