import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Campaign } from './model';

const CAMPAIGN_STORAGE_KEY = 'nebryss_selected_campaign';

@Injectable({
  providedIn: 'root'
})
export class CampaignService {
  private selectedCampaignSubject = new BehaviorSubject<Campaign | null>(this.loadFromStorage());
  readonly selectedCampaign$: Observable<Campaign | null> = this.selectedCampaignSubject.asObservable();

  constructor() {}

  private loadFromStorage(): Campaign | null {
    try {
      const stored = localStorage.getItem(CAMPAIGN_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('[CampaignService] Failed to load campaign from storage', e);
    }
    return null;
  }

  getSelectedCampaign(): Campaign | null {
    return this.selectedCampaignSubject.getValue();
  }

  setSelectedCampaign(campaign: Campaign | null): void {
    try {
      if (campaign) {
        localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(campaign));
      } else {
        localStorage.removeItem(CAMPAIGN_STORAGE_KEY);
      }
    } catch (e) {
      console.error('[CampaignService] Failed to save campaign to storage', e);
    }
    this.selectedCampaignSubject.next(campaign);
  }

  hasCampaignSelected(): boolean {
    return this.getSelectedCampaign() !== null;
  }
}
