/**
 * Fakes for driving useRelaySession without a network: a scripted WebSocket
 * the test plays the relay's side of, and a fetch that mints a session.
 */
import { act } from '@testing-library/react';
import { vi } from 'vitest';

export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  readonly sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  // --- the relay's side -----------------------------------------------------

  async serverOpen(): Promise<void> {
    await act(async () => {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
      this.onmessage?.({
        data: JSON.stringify({ type: 'hello/accepted', session_id: 's-1' }),
      });
    });
  }

  async serverSend(frame: Record<string, unknown>): Promise<void> {
    await act(async () => {
      this.onmessage?.({ data: JSON.stringify(frame) });
    });
  }

  /** Frames of `type` the browser sent. */
  framesOf(type: string): Array<Record<string, unknown>> {
    return this.sent.filter((f) => f['type'] === type);
  }
}

export function installRelayFakes(): void {
  FakeWebSocket.instances = [];
  localStorage.clear();
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        connection_token: 'token-1',
        ws_url: 'ws://relay.test/ws/sessions/s-1',
      }),
    })),
  );
}

/** The socket the hook opened, once it has. */
export async function openedSocket(): Promise<FakeWebSocket> {
  await vi.waitFor(() => {
    if (FakeWebSocket.instances.length === 0) throw new Error('no socket yet');
  });
  return FakeWebSocket.instances.at(-1)!;
}
