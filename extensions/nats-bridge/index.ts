/**
 * NATS Bridge Extension for OpenClaw
 *
 * Publishes channel events to the PMOVES NATS bus for
 * cross-service observability and event-driven coordination.
 *
 * Subjects:
 * - openclaw.message.received.v1  — inbound message from any channel
 * - openclaw.message.sent.v1      — outbound message to any channel
 * - openclaw.channel.connected.v1 — channel adapter connected/disconnected
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/nats-bridge";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/nats-bridge";
import {
  emitMessageReceived,
  emitMessageSent,
  emitChannelConnected,
} from "./src/nats-publisher.js";

const plugin = {
  id: "nats-bridge",
  name: "NATS Bridge",
  description: "Publish OpenClaw events to PMOVES NATS bus",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    // Hook into message lifecycle via subagent hooks pattern
    api.runtime.on("message:received", (msg: any) => {
      emitMessageReceived({
        channel: msg.channel ?? "unknown",
        message_id: msg.id,
        author: msg.author?.id,
        content_length: msg.content?.length ?? 0,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    });

    api.runtime.on("message:sent", (msg: any) => {
      emitMessageSent({
        channel: msg.channel ?? "unknown",
        message_id: msg.id,
        content_length: msg.content?.length ?? 0,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    });

    api.runtime.on("channel:connected", (ch: any) => {
      emitChannelConnected({
        channel: ch.name ?? ch.id ?? "unknown",
        status: "connected",
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    });

    api.runtime.on("channel:disconnected", (ch: any) => {
      emitChannelConnected({
        channel: ch.name ?? ch.id ?? "unknown",
        status: "disconnected",
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    });

    console.log("[nats-bridge] Registered PMOVES NATS bridge");
  },
};

export default plugin;
