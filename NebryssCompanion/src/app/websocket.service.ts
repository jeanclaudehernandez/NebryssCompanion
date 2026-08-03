import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Observable } from 'rxjs';

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

  readonly messages$: Observable<EntityUpdateEvent> = this.messageSubject.asObservable();

  constructor() {
    this.connect();
  }

  connect(customUrl?: string): void {
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

  send(event: EntityUpdateEvent): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(event));
    }
  }

  private scheduleReconnect(): void {
    if (this.isDestroyed) return;
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 4000);
  }

  private getWebSocketUrl(): string {
    const win = window as any;
    if (win.WS_URL) {
      return win.WS_URL;
    }

    const defaultWsUrl = 'wss://nebryss-companion-ws-771693340084.us-east4.run.app/ws';
    const defaultApiUrl = 'https://nebryss-companion-api-771693340084.us-east4.run.app/api';
    const apiUrl = win.API_URL || defaultApiUrl;

    if (apiUrl.includes('nebryss-companion-api')) {
      return defaultWsUrl;
    }

    if (apiUrl.startsWith('http://')) {
      return apiUrl.replace(/^http:\/\//, 'ws://').replace(/\/api\/?$/, '') + '/ws';
    } else if (apiUrl.startsWith('https://')) {
      return apiUrl.replace(/^https:\/\//, 'wss://').replace(/\/api\/?$/, '') + '/ws';
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.socket) {
      this.socket.close();
    }
  }
}
