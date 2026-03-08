import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Ship } from '../model';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-ship-navigation',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './ship-navigation.component.html',
  styleUrls: ['./ship-navigation.component.css']
})
export class ShipNavigationComponent implements OnInit {
  ships: Ship[] = [];
  selectedShipId: string = '';
  newShipName: string = '';
  newShipType: string = 'Sloop'; // Default

  // Navigation moves (4 turns)
  moves: string[] = ['', '', '', ''];
  leftCannons: boolean[] = [false, false, false, false];
  rightCannons: boolean[] = [false, false, false, false];
  
  // Available moves
  availableMoves: string[] = ['Forward', 'Left', 'Right', 'Hard Left', 'Hard Right'];

  ngOnInit() {
    this.loadShips();
  }

  loadShips() {
    const savedShips = localStorage.getItem('myShips');
    if (savedShips) {
      try {
        this.ships = JSON.parse(savedShips);
      } catch (e) {
        console.error('Error parsing ships from localStorage', e);
        this.ships = [];
      }
    }
  }

  saveShips() {
    localStorage.setItem('myShips', JSON.stringify(this.ships));
  }

  addShip() {
    if (this.newShipName.trim()) {
      const newShip: Ship = {
        id: Date.now().toString(),
        name: this.newShipName.trim(),
        type: this.newShipType
      };
      this.ships.push(newShip);
      this.saveShips();
      this.newShipName = '';
      this.selectedShipId = newShip.id; // Select the new ship
    }
  }

  deleteShip(id: string) {
    if (confirm('Are you sure you want to delete this ship?')) {
      this.ships = this.ships.filter(s => s.id !== id);
      this.saveShips();
      if (this.selectedShipId === id) {
        this.selectedShipId = '';
        this.moves = ['', '', '', '']; // Reset moves
      }
    }
  }

  get selectedShip(): Ship | undefined {
    return this.ships.find(s => s.id === this.selectedShipId);
  }

  // Predicate to prevent items from returning to the palette
  noReturnPredicate() {
    return false;
  }

  // Handle Drag and Drop
  drop(event: CdkDragDrop<string[]>) {
    if (event.previousContainer === event.container) {
      // Reordering within the same list (not applicable here as slots are individual)
    } else {
      // Moving from source to target
      // Get the data from the item
      const move = event.item.data;
      
      // Get the target index from the container's id or data
      const targetIndex = parseInt(event.container.id.replace('turn-', ''), 10);
      
      if (!isNaN(targetIndex) && targetIndex >= 0 && targetIndex < 4) {
          this.moves[targetIndex] = move;
      }
    }
  }

  // Allow clearing a slot
  clearSlot(index: number) {
      this.moves[index] = '';
  }

  selectMove(turnIndex: number, move: string) {
    if (this.moves[turnIndex] === move) {
        this.moves[turnIndex] = ''; // Deselect if already selected
    } else {
        this.moves[turnIndex] = move;
    }
  }
  
  toggleCannon(turnIndex: number, side: 'left' | 'right') {
    if (side === 'left') {
      this.leftCannons[turnIndex] = !this.leftCannons[turnIndex];
    } else {
      this.rightCannons[turnIndex] = !this.rightCannons[turnIndex];
    }
  }

  resetMoves() {
      this.moves = ['', '', '', ''];
      this.leftCannons = [false, false, false, false];
      this.rightCannons = [false, false, false, false];
  }
}
