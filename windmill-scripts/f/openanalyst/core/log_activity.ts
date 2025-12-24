// Log User Activity
// Records user activity for analytics and audit purposes

interface ActivityLog {
  user_id: string;
  action: string;
  details?: Record<string, unknown>;
  timestamp: string;
  session_id?: string;
}

export async function main(
  user_id: string,
  action: string,
  details?: Record<string, unknown>,
  session_id?: string
): Promise<{ logged: boolean; activity_id: string }> {
  const activity_id = crypto.randomUUID();

  const activity: ActivityLog = {
    user_id,
    action,
    details,
    timestamp: new Date().toISOString(),
    session_id,
  };

  console.log("Activity logged:", JSON.stringify(activity, null, 2));

  // In production, this would:
  // 1. Store in database
  // 2. Send to analytics service
  // 3. Trigger any relevant webhooks

  return {
    logged: true,
    activity_id,
  };
}
