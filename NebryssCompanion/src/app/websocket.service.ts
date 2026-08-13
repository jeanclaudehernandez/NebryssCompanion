import { Injectable, OnDestroy, inject } from '@angular/core';
import { Subject, Observable, Subscription } from 'rxjs';
import { AuthService } from './auth.service';

export interface EntityUpdateEvent {
  type: string;
  entity: string;
  action: 'create' | 'update' | 'delete';
  data: any;
  timestamp?: number;
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketService implements OnDestroy {
  private socket: WebSocket | null = null;
  private messageSubject = new Subject<EntityUpdateEvent>();
  private reconnectTimer: any = null;
  private isDestroyed = false;
  private authSub: Subscription | null = null;
  private isAuthenticated = false;

  readonly messages$: Observable<EntityUpdateEvent> = this.messageSubject.asObservable();

  constructor(private authService: AuthService) {
    this.authSub = this.authService.isAuthenticated$.subscribe((auth) => {
      this.isAuthenticated = auth;
      if (auth) {
        this.connect();
      } else {
        this.disconnect();
      }
    });
  }

  connect(customUrl?: string): void {
    if (!this.isAuthenticated) {
      return;
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = customUrl || this.getWebSocketUrl();
    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('[WebSocketService] Connected to real-time sync server:', wsUrl);
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const data: EntityUpdateEvent = JSON.parse(event.data);
          if (data && data.type === 'ENTITY_UPDATE') {
            this.messageSubject.next(data);
          }
        } catch (e) {
          console.error('[WebSocketService] Failed to parse message:', e);
        }
      };

      this.socket.onerror = (error) => {
        console.warn('[WebSocketService] WebSocket error:', error);
      };

      this.socket.onclose = () => {
        console.warn('[WebSocketService] WebSocket closed. Scheduling reconnect...');
        this.scheduleReconnect();
      };
    } catch (e) {
      console.error('[WebSocketService] Failed to initialize WebSocket:', e);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
      this.socket = null;
    }
  }

  send(event: EntityUpdateEvent): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(event));
    }
  }

  private scheduleReconnect(): void {
    if (this.isDestroyed || !this.isAuthenticated) return;
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.isAuthenticated) {
        this.connect();
      }
    }, 4000);
  }

  private getWebSocketUrl(): string {
    const win = window as any;

    if (win.WS_URL) {
      return win.WS_URL;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    if (this.authSub) {
      this.authSub.unsubscribe();
    }
    this.disconnect();
  }
}
