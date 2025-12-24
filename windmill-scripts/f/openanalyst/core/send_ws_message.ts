// Send WebSocket Message to User
// This script sends a message to a connected user via the WebSocket Hub

export async function main(
  user_id: string,
  session_id: string,
  message_type: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; message_id: string }> {
  const WS_HUB_URL = Deno.env.get("WS_HUB_URL") || "http://websocket-hub:8002";

  const messageId = crypto.randomUUID();

  const wsMessage = {
    type: message_type,
    userId: user_id,
    sessionId: session_id,
    payload: {
      content,
      metadata,
    },
    timestamp: Date.now(),
    messageId,
  };

  try {
    // In a real implementation, this would publish to Redis
    // For now, we'll make an HTTP call to a broadcast endpoint
    const response = await fetch(`${WS_HUB_URL}/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(wsMessage),
    });

    return {
      success: response.ok,
      message_id: messageId,
    };
  } catch (error) {
    console.error("Failed to send WebSocket message:", error);
    return {
      success: false,
      message_id: messageId,
    };
  }
}
