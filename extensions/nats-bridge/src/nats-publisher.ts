/**
 * NATS Publisher for OpenClaw events.
 *
 * Fire-and-forget: connects, publishes, flushes, closes.
 * Failures are logged but never throw — the bridge must not
 * interrupt message routing.
 */

import { connect, type NatsConnection, StringCodec } from "nats";

const NATS_URL = process.env.NATS_URL ?? "nats://nats:pmoves@nats:4222";
const sc = StringCodec();

export const SUBJECTS = {
  MESSAGE_RECEIVED: "openclaw.message.received.v1",
  MESSAGE_SENT: "openclaw.message.sent.v1",
  CHANNEL_CONNECTED: "openclaw.channel.connected.v1",
} as const;

export interface MessageEvent {
  channel: string;
  message_id?: string;
  author?: string;
  content_length: number;
  timestamp: string;
}

export interface ChannelEvent {
  channel: string;
  status: "connected" | "disconnected";
  timestamp: string;
}

async function publishEvent(subject: string, payload: object): Promise<boolean> {
  let nc: NatsConnection | undefined;
  try {
    nc = await connect({ servers: NATS_URL, timeout: 5_000 });
    nc.publish(subject, sc.encode(JSON.stringify(payload)));
    await nc.flush();
    await nc.close();
    return true;
  } catch (err) {
    console.error(`[nats-bridge] publish failed (${subject}):`, err);
    try { await nc?.close(); } catch { /* ignore */ }
    return false;
  }
}

export async function emitMessageReceived(event: MessageEvent): Promise<boolean> {
  return publishEvent(SUBJECTS.MESSAGE_RECEIVED, event);
}

export async function emitMessageSent(event: MessageEvent): Promise<boolean> {
  return publishEvent(SUBJECTS.MESSAGE_SENT, event);
}

export async function emitChannelConnected(event: ChannelEvent): Promise<boolean> {
  return publishEvent(SUBJECTS.CHANNEL_CONNECTED, event);
}
