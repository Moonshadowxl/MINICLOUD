import type { WebSocket } from 'ws';

/**
 * Tiny per-user event bus behind the /api/events WebSocket.
 * Drives the "live" feel of the dashboard: upload progress, usage changes, serve changes.
 */
export class EventBus {
  private sockets = new Map<string, Set<WebSocket>>();

  subscribe(userId: string, socket: WebSocket): void {
    let set = this.sockets.get(userId);
    if (!set) this.sockets.set(userId, (set = new Set()));
    set.add(socket);
    socket.on('close', () => set!.delete(socket));
  }

  emit(userId: string, type: string, data: unknown = {}): void {
    const set = this.sockets.get(userId);
    if (!set) return;
    const msg = JSON.stringify({ type, data, at: Date.now() });
    for (const s of set) {
      if (s.readyState === 1) s.send(msg);
    }
  }
}
