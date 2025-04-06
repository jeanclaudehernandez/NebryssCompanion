import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { ScrollSection, Talent, TalentCategory, Player } from '../model';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { ActivePlayerService } from '../active-player.service';
import { Subscription } from 'rxjs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TalentRequirementsDialogComponent } from './talent-requirements-dialog.component';

@Component({
  selector: 'app-talents',
  standalone: true,
  imports: [CommonModule, ScrollNavComponent, MatDialogModule],
  templateUrl: './talents.component.html',
  styleUrls: ['./talents.component.css']
})
export class TalentsComponent implements OnInit, OnDestroy {
  talentCategories: TalentCategory[] = [];
  scrollSections: ScrollSection[] = [];
  activePlayer: Player | null = null;
  private subscription: Subscription = new Subscription();

  constructor(
    private dataService: DataService,
    private activePlayerService: ActivePlayerService,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.dataService.getTalents().subscribe(talents => {
      this.talentCategories = talents;
      this.scrollSections = this.talentCategories.map((category: TalentCategory) => {
        return {
          title: category.name,
          id: category.id
        }
      });
    });

    this.subscription.add(
      this.activePlayerService.activePlayer$.subscribe(player => {
        this.activePlayer = player;
      })
    );
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  getRequirementNames(requirementIds: string[]): string {
    const allTalents = this.talentCategories.flatMap(cat => cat.talents);
    return requirementIds.map(id => {
      const talent = allTalents.find(t => t.id === id);
      return talent ? talent.name : id;
    }).join(', ');
  }

  hasRequiredTalents(talent: Talent): boolean {
    if (!talent.requirements || talent.requirements.length === 0) {
      return true;
    }
    
    if (!this.activePlayer || !this.activePlayer.progression.talents) {
      return false;
    }
    
    return talent.requirements.every(reqId => 
      this.activePlayer!.progression.talents!.includes(reqId)
    );
  }
  
  getMissingRequirements(talent: Talent): string[] {
    if (!talent.requirements || talent.requirements.length === 0) {
      return [];
    }
    
    if (!this.activePlayer || !this.activePlayer.progression.talents) {
      return talent.requirements;
    }
    
    return talent.requirements.filter(reqId => 
      !this.activePlayer!.progression.talents!.includes(reqId)
    );
  }

  toggleTalent(talent: Talent): void {
    if (!this.activePlayer) return;
    
    // Initialize talents array if it doesn't exist
    if (!this.activePlayer.progression.talents) {
      this.activePlayer.progression.talents = [];
    }
    
    const playerTalents = this.activePlayer.progression.talents;
    const talentIndex = playerTalents.indexOf(talent.id);
    
    // If adding a talent (not already selected)
    if (talentIndex === -1) {
      // Check if player has required talents
      if (!this.hasRequiredTalents(talent)) {
        this.showRequirementsDialog(talent);
        return;
      }
      
      // Handle talents with max stacks
      if (talent.maxStacks) {
        const count = this.getTalentSelectedCount(talent);
        // If talent is selected fewer times than maxStacks, add it
        if (count < talent.maxStacks) {
          playerTalents.push(talent.id);
        }
      } else {
        // For non-stacking talents, add it
        playerTalents.push(talent.id);
      }
    } else {
      // Removing talent
      if (talent.maxStacks) {
        // Remove one instance of the talent (the last one)
        const lastIndex = playerTalents.lastIndexOf(talent.id);
        if (lastIndex !== -1) {
          playerTalents.splice(lastIndex, 1);
        }
      } else {
        // Remove talent
        playerTalents.splice(talentIndex, 1);
      }
    }
    
    // Update the player
    this.activePlayerService.setActivePlayer({...this.activePlayer});
  }
  
  showRequirementsDialog(talent: Talent): void {
    const missingRequirements = this.getMissingRequirements(talent);
    const missingNames = missingRequirements.map(reqId => {
      const reqTalent = this.talentCategories.flatMap(cat => cat.talents).find(t => t.id === reqId);
      return reqTalent ? reqTalent.name : reqId;
    }).join(', ');
    
    const dialogRef = this.dialog.open(TalentRequirementsDialogComponent, {
      data: {
        talentName: talent.name,
        missingTalents: missingNames
      },
      width: '350px',
      hasBackdrop: true,
      backdropClass: 'image-dialog-backdrop', // Optional: custom backdrop class
      disableClose: true // Allow closing by clicking outside
    });

    setTimeout(() => {
        dialogRef.disableClose = false;
    }, 0);
    ;
  }

  isTalentSelected(talent: Talent): boolean {
    if (!this.activePlayer || !this.activePlayer.progression.talents) {
      return false;
    }
    return this.activePlayer.progression.talents.includes(talent.id);
  }

  getTalentSelectedCount(talent: Talent): number {
    if (!this.activePlayer || !this.activePlayer.progression.talents) {
      return 0;
    }
    return this.activePlayer.progression.talents.filter(id => id === talent.id).length;
  }

  incrementTalent(talent: Talent, event: Event): void {
    event.stopPropagation(); // Prevent the parent toggle from firing
    if (!this.activePlayer) return;
    
    if (!this.activePlayer.progression.talents) {
      this.activePlayer.progression.talents = [];
    }
    
    // Check if player has required talents
    if (!this.hasRequiredTalents(talent)) {
      this.showRequirementsDialog(talent);
      return;
    }
    
    if (talent.maxStacks && this.getTalentSelectedCount(talent) < talent.maxStacks) {
      this.activePlayer.progression.talents.push(talent.id);
      this.activePlayerService.setActivePlayer({...this.activePlayer});
    }
  }

  decrementTalent(talent: Talent, event: Event): void {
    event.stopPropagation(); // Prevent the parent toggle from firing
    if (!this.activePlayer) return;
    
    if (!this.activePlayer.progression.talents) {
      return;
    }
    
    const playerTalents = this.activePlayer.progression.talents;
    const lastIndex = playerTalents.lastIndexOf(talent.id);
    
    if (lastIndex !== -1) {
      playerTalents.splice(lastIndex, 1);
      this.activePlayerService.setActivePlayer({...this.activePlayer});
    }
  }
}