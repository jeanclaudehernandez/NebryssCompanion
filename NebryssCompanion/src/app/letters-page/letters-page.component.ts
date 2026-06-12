import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { ActivePlayerService } from '../active-player.service';
import { DataService } from '../data.service';
import { ModalService } from '../modal.service';
import { Letter, NPC, Player } from '../model';

@Component({
  selector: 'app-letters-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './letters-page.component.html'
})
export class LettersPageComponent implements OnInit {
  @ViewChild('letterModal') letterModal!: TemplateRef<any>;

  private readonly destroyRef = inject(DestroyRef);

  activePlayer: Player | null = null;
  players: Player[] = [];
  npcs: NPC[] = [];
  allLetters: Letter[] = [];
  visibleLetters: Letter[] = [];
  selectedLetter: Letter | null = null;

  constructor(
    private readonly activePlayerService: ActivePlayerService,
    private readonly dataService: DataService,
    public readonly modalService: ModalService
  ) {}

  ngOnInit(): void {
    this.activePlayerService.activePlayer$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(player => {
        this.activePlayer = player;
        this.updateVisibleLetters();
        this.syncSelectedLetter();
      });

    this.dataService.letters$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(letters => {
        this.allLetters = letters;
        this.updateVisibleLetters();
        this.syncSelectedLetter();
      });

    forkJoin({
      players: this.dataService.getPlayers(),
      npcs: this.dataService.getNpcs(),
      letters: this.dataService.getLetters()
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ players, npcs, letters }) => {
        this.players = players;
        this.npcs = npcs;
        this.allLetters = letters;
        this.updateVisibleLetters();
      });
  }

  openLetter(letter: Letter): void {
    this.selectedLetter = letter;
    this.modalService.openFromTemplate(this.letterModal, undefined, { width: '720px' });

    if (this.activePlayer && this.isUnread(letter)) {
      this.dataService.markLetterAsRead(letter.id, this.activePlayer.id).subscribe(updatedLetter => {
        this.selectedLetter = updatedLetter;
      });
    }
  }

  getSenderName(letter: Letter): string {
    if (letter.senderName && letter.senderName.trim()) {
      return letter.senderName.trim();
    }

    if (letter.senderId !== null) {
      return this.npcs.find(npc => npc.id === letter.senderId)?.name ?? `NPC ${letter.senderId}`;
    }

    return 'Unknown Sender';
  }

  getTargetNames(letter: Letter): string[] {
    if (letter.targetNames?.length) {
      return letter.targetNames;
    }

    return letter.recipientIds
      .map(recipientId => this.players.find(player => player.id === recipientId)?.name ?? `Player ${recipientId}`);
  }

  getLetterPreview(letter: Letter): string {
    const normalized = this.getPlainTextFromHtml(letter.message ?? '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= 120) {
      return normalized;
    }

    return `${normalized.slice(0, 117)}...`;
  }

  isUnread(letter: Letter): boolean {
    return !!this.activePlayer && !letter.readBy.includes(this.activePlayer.id);
  }

  formatImperialDate(value: string): string {
    if (/^\d\.\d{3}\.\d{3}\.M\d{2,}$/.test(value)) {
      return value;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const year = date.getUTCFullYear();
    const dayOfYear = this.getUtcDayOfYear(date);
    const daysInYear = this.isLeapYear(year) ? 366 : 365;
    const yearFraction = Math.min(999, Math.floor(((dayOfYear - 1) / daysInYear) * 1000));
    const yearOfMillennium = ((year - 1) % 1000) + 1;
    const millennium = Math.floor((year - 1) / 1000) + 1;

    return `0.${String(yearFraction).padStart(3, '0')}.${String(yearOfMillennium).padStart(3, '0')}.M${String(millennium).padStart(2, '0')}`;
  }

  trackByLetterId(_index: number, letter: Letter): number {
    return letter.id;
  }

  private updateVisibleLetters(): void {
    if (!this.activePlayer) {
      this.visibleLetters = [];
      return;
    }

    this.visibleLetters = [...this.allLetters]
      .filter(letter => letter.recipientIds.includes(this.activePlayer!.id))
      .sort((left, right) => this.getSortTimestamp(right.date) - this.getSortTimestamp(left.date));
  }

  private syncSelectedLetter(): void {
    if (!this.selectedLetter) {
      return;
    }

    const updatedLetter = this.allLetters.find(letter => letter.id === this.selectedLetter?.id);
    if (updatedLetter) {
      this.selectedLetter = updatedLetter;
    }
  }

  private getSortTimestamp(value: string): number {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  private getUtcDayOfYear(date: Date): number {
    const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
    const currentDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return Math.floor((currentDay - startOfYear) / 86400000) + 1;
  }

  private isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  private getPlainTextFromHtml(value: string): string {
    if (!value) {
      return '';
    }

    const tempElement = document.createElement('div');
    tempElement.innerHTML = value;
    return tempElement.textContent ?? tempElement.innerText ?? '';
  }
}
