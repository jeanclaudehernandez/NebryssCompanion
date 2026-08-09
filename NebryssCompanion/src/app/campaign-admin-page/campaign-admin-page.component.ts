import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DataService } from '../data.service';
import { CampaignService } from '../campaign.service';
import { AdminService } from '../admin.service';
import { ToastService } from '../toast.service';
import { NavigationHistoryService } from '../navigation-history.service';
import { Campaign } from '../model';

@Component({
  selector: 'app-campaign-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './campaign-admin-page.component.html',
  styleUrls: ['./campaign-admin-page.component.css']
})
export class CampaignAdminPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dataService = inject(DataService);
  public readonly campaignService = inject(CampaignService);
  private readonly adminService = inject(AdminService);
  private readonly toastService = inject(ToastService);
  private readonly navigationHistory = inject(NavigationHistoryService);

  isAdmin = false;
  isLoading = true;
  isSaving = false;
  isDeleting = false;
  showDeleteConfirm = false;

  campaigns: Campaign[] = [];
  searchTerm = '';
  selectedCampaignId: number | null = null;
  activeCampaignId: number | null = null;

  // Form fields
  id: number | null = null;
  name = '';
  prefix = '';

  get filteredCampaigns(): Campaign[] {
    if (!this.searchTerm.trim()) {
      return this.campaigns;
    }
    const term = this.searchTerm.toLowerCase();
    return this.campaigns.filter(c =>
      c.name.toLowerCase().includes(term) ||
      (c.prefix && c.prefix.toLowerCase().includes(term))
    );
  }

  ngOnInit(): void {
    this.navigationHistory.registerModalHandler(() => {
      if (this.showDeleteConfirm) {
        this.showDeleteConfirm = false;
        return true;
      }
      return false;
    }, this.destroyRef);

    this.adminService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
      });

    this.campaignService.selectedCampaign$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(active => {
        this.activeCampaignId = active ? active.id : null;
      });

    this.loadCampaigns();
  }

  loadCampaigns(): void {
    this.isLoading = true;
    this.dataService.getCampaigns()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (campaigns) => {
          this.campaigns = campaigns || [];
          this.isLoading = false;
          if (this.selectedCampaignId) {
            const found = this.campaigns.find(c => c.id === this.selectedCampaignId);
            if (found) {
              this.selectCampaign(found);
            }
          }
        },
        error: (err) => {
          console.error('[CampaignAdminPageComponent] Failed to load campaigns', err);
          this.isLoading = false;
          this.toastService.show('Failed to load campaigns', 'error');
        }
      });
  }

  selectCampaign(campaign: Campaign): void {
    this.selectedCampaignId = campaign.id;
    this.id = campaign.id;
    this.name = campaign.name || '';
    this.prefix = campaign.prefix || '';
    this.showDeleteConfirm = false;
  }

  resetForm(): void {
    this.selectedCampaignId = null;
    this.id = null;
    this.name = '';
    this.prefix = '';
    this.showDeleteConfirm = false;
  }

  makeActive(campaign: Campaign, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.campaignService.setSelectedCampaign(campaign);
    this.dataService.refreshPlayers().subscribe();
    this.toastService.show(`Active campaign set to "${campaign.name}"`, 'success');
  }

  saveCampaign(): void {
    if (!this.name.trim()) {
      this.toastService.show('Campaign name is required', 'error');
      return;
    }

    const payloadPrefix = this.prefix.trim() || this.name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');

    const campaignObj: Campaign = {
      id: this.id || 0,
      name: this.name.trim(),
      prefix: payloadPrefix
    };

    this.isSaving = true;

    if (this.id) {
      this.dataService.updateCampaign(campaignObj).subscribe({
        next: (updated) => {
          this.isSaving = false;
          this.toastService.show('Campaign updated successfully!', 'success');
          // If active campaign was updated, keep CampaignService in sync
          const active = this.campaignService.getSelectedCampaign();
          if (active && active.id === updated.id) {
            this.campaignService.setSelectedCampaign(updated);
          }
          this.loadCampaigns();
        },
        error: (err) => {
          this.isSaving = false;
          console.error('[CampaignAdminPageComponent] Error updating campaign', err);
          this.toastService.show('Error updating campaign', 'error');
        }
      });
    } else {
      this.dataService.createCampaign(campaignObj).subscribe({
        next: (created) => {
          this.isSaving = false;
          this.toastService.show('Campaign created successfully!', 'success');
          this.selectCampaign(created);
          this.loadCampaigns();
        },
        error: (err) => {
          this.isSaving = false;
          console.error('[CampaignAdminPageComponent] Error creating campaign', err);
          this.toastService.show('Error creating campaign', 'error');
        }
      });
    }
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  deleteCampaign(): void {
    if (!this.id) return;
    const deletingId = this.id;
    this.isDeleting = true;

    this.dataService.deleteCampaign(deletingId).subscribe({
      next: () => {
        this.isDeleting = false;
        this.toastService.show('Campaign deleted successfully', 'info');
        const active = this.campaignService.getSelectedCampaign();
        if (active && active.id === deletingId) {
          this.campaignService.setSelectedCampaign(null);
        }
        this.resetForm();
        this.loadCampaigns();
      },
      error: (err) => {
        this.isDeleting = false;
        console.error('[CampaignAdminPageComponent] Error deleting campaign', err);
        this.toastService.show('Error deleting campaign', 'error');
      }
    });
  }
}
