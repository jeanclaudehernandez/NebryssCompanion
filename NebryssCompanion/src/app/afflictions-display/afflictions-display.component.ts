import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Player, Affliction } from '../model';
import { ActivePlayerService } from '../active-player.service';

@Component({
  selector: 'app-afflictions-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './afflictions-display.component.html',
  styleUrls: ['./afflictions-display.component.css']
})
export class AfflictionsDisplayComponent {
  @Input() player!: Player;
  @Input() isEditable: boolean = false;

  constructor(private activePlayerService: ActivePlayerService) {}

  increaseProgress(affliction: Affliction) {
    if (!this.isEditable) return;
    
    // Ensure progress is initialized
    if (affliction.progress === undefined) affliction.progress = 0;
    
    if (affliction.progress < affliction.toHeal) {
      affliction.progress++;
      
      if (affliction.progress >= affliction.toHeal) {
        this.player.progression.afflictions = this.player.progression.afflictions.filter(a => a !== affliction);
      }
      
      this.save();
    }
  }

  decreaseProgress(affliction: Affliction) {
    if (!this.isEditable) return;
    
    // Ensure progress is initialized
    if (affliction.progress === undefined) affliction.progress = 0;
    
    if (affliction.progress > 0) {
      affliction.progress--;
      this.save();
    }
  }

  save() {
    this.activePlayerService.updateActivePlayer({ ...this.player });
  }
}
