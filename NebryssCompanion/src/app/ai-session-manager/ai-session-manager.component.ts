import {
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  OnInit,
  Output,
  ViewChild,
  inject,
  AfterViewChecked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  AiSessionManagerService,
  ChatMessage,
  ConnectionStatus
} from './ai-session-manager.service';
import { CampaignService } from '../campaign.service';
import { DataService } from '../data.service';
import { AppView } from '../app-view.types';

interface Campaign {
  id: number;
  name: string;
  [key: string]: any;
}

interface Player {
  id: number;
  name: string;
  [key: string]: any;
}

@Component({
  selector: 'app-ai-session-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-session-manager.component.html',
  styleUrls: ['./ai-session-manager.component.css']
})
export class AiSessionManagerComponent implements OnInit, AfterViewChecked {
  @Output() viewChange = new EventEmitter<AppView>();

  @ViewChild('messagesContainer') messagesContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('inputArea') inputArea!: ElementRef<HTMLTextAreaElement>;

  private readonly destroyRef = inject(DestroyRef);

  messages: ChatMessage[] = [];
  connectionStatus: ConnectionStatus = 'disconnected';
  isAgentTyping = false;
  inputText = '';
  sidebarCollapsed = false;
  isAtBottom = true;

  activeCampaign: Campaign | null = null;
  activePlayers: Player[] = [];
  conversationId: string | null = null;
  agentStatus: string | null = null;

  private shouldScrollToBottom = false;
  private previousMessageCount = 0;

  constructor(
    private readonly aiService: AiSessionManagerService,
    private readonly campaignService: CampaignService,
    private readonly dataService: DataService,
    private readonly sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    // Subscribe to real-time agent status (tools, reasoning)
    this.aiService.currentStatus$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(status => {
        this.agentStatus = status;
        if (status) {
          this.shouldScrollToBottom = true;
        }
      });

    // Subscribe to messages
    this.aiService.messages$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(messages => {
        const isNew = messages.length > this.previousMessageCount;
        this.messages = messages;
        this.previousMessageCount = messages.length;

        // Auto-scroll on new messages or streaming
        if (isNew || this.isAgentTyping) {
          this.shouldScrollToBottom = true;
        }
      });

    // Subscribe to connection status
    this.aiService.connectionStatus$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(status => {
        this.connectionStatus = status;
      });

    // Subscribe to typing state
    this.aiService.isAgentTyping$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(typing => {
        this.isAgentTyping = typing;
        if (typing) {
          this.shouldScrollToBottom = true;
        }
      });

    // Track conversation ID
    this.aiService.rawEvents$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event.type === 'response_end' && event['conversationId']) {
          this.conversationId = event['conversationId'];
        }
      });

    // Get active campaign
    this.campaignService.selectedCampaign$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(campaign => {
        this.activeCampaign = campaign as Campaign | null;
      });

    // Get players
    this.dataService.getPlayers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(players => {
        this.activePlayers = (players || []) as Player[];
      });

    // Connect to the AGY bridge
    this.aiService.connect();

    // Collapse sidebar on mobile by default
    if (window.innerWidth <= 768) {
      this.sidebarCollapsed = true;
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom && this.isAtBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  // ─── Message Handling ─────────────────────────────────────────

  sendCurrentMessage(): void {
    const text = this.inputText.trim();
    if (!text) return;

    this.aiService.sendMessage(text, this.activeCampaign?.id);
    this.inputText = '';
    this.resetInputHeight();
    this.isAtBottom = true;
    this.shouldScrollToBottom = true;
  }

  sendQuickAction(action: string): void {
    const campaignId = this.activeCampaign?.id;
    const campaignRef = campaignId ? ` for campaign ${campaignId}` : '';

    const prompts: Record<string, string> = {
      'get-context': `Get the full campaign context${campaignRef}. Show me the current sessions, active players, NPCs, and locations.`,
      'plan-session': `Let's plan a new campaign session${campaignRef}. Follow the Session Manager skill workflow — read the previous sessions, identify unresolved plot hooks, and present 2-3 structured session ideas for my review.`,
      'conclude-session': `Let's conclude the latest session${campaignRef}. Follow the Session Manager skill conclusion workflow — fetch the latest session, then ask me debrief questions about what happened.`,
      'list-sessions': `List all sessions${campaignRef} with their titles and status (planned vs concluded).`,
    };

    const prompt = prompts[action];
    if (prompt) {
      this.aiService.sendMessage(prompt, campaignId);
      this.isAtBottom = true;
      this.shouldScrollToBottom = true;

      // Collapse sidebar on mobile after action
      if (window.innerWidth <= 768) {
        this.sidebarCollapsed = true;
      }
    }
  }

  cancelResponse(): void {
    this.aiService.cancelResponse();
  }

  startNewConversation(): void {
    this.aiService.clearHistory();
    this.conversationId = null;
    this.aiService.disconnect();
    setTimeout(() => this.aiService.connect(), 300);
  }

  reconnect(): void {
    this.aiService.connect();
  }

  // ─── Input Handling ───────────────────────────────────────────

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendCurrentMessage();
    }
  }

  autoResizeInput(): void {
    if (!this.inputArea?.nativeElement) return;
    const el = this.inputArea.nativeElement;
    el.style.height = 'auto';
    el.style.height = Math.max(24, Math.min(el.scrollHeight, 120)) + 'px';
  }

  private resetInputHeight(): void {
    if (!this.inputArea?.nativeElement) return;
    this.inputArea.nativeElement.style.height = '24px';
  }

  // ─── Scroll Management ────────────────────────────────────────

  scrollToBottom(): void {
    if (!this.messagesContainer?.nativeElement) return;
    const el = this.messagesContainer.nativeElement;
    el.scrollTop = el.scrollHeight;
    this.isAtBottom = true;
  }

  onScroll(): void {
    if (!this.messagesContainer?.nativeElement) return;
    const el = this.messagesContainer.nativeElement;
    const threshold = 60;
    this.isAtBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < threshold;
  }

  // ─── Markdown Rendering ───────────────────────────────────────

  renderMarkdown(text: string): SafeHtml {
    if (!text) return this.sanitizer.bypassSecurityTrustHtml('');

    let html = this.escapeHtml(text);

    // Code blocks (``` ... ```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');

    // Blockquotes
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // Unordered lists
    html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Tables (simple)
    html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
      const cells = content.split('|').map((c: string) => c.trim());
      const isHeader = cells.every((c: string) => /^[-:]+$/.test(c));
      if (isHeader) return '';
      const tag = 'td';
      return '<tr>' + cells.map((c: string) => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
    });
    html = html.replace(/((?:<tr>.*<\/tr>\n?)+)/g, '<table>$1</table>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    // Clean up double <br> around block elements
    html = html.replace(/<br><(h[1-3]|pre|blockquote|ul|ol|table|hr)/g, '<$1');
    html = html.replace(/<\/(h[1-3]|pre|blockquote|ul|ol|table)><br>/g, '</$1>');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ─── Utilities ────────────────────────────────────────────────

  trackByMessageId(_index: number, msg: ChatMessage): string {
    return msg.id;
  }
}
