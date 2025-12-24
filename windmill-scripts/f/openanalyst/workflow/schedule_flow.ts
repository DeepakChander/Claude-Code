// Schedule Workflow Flow
// Creates a scheduled execution for a Windmill flow

interface ScheduleResult {
  schedule_id: string;
  flow_path: string;
  cron_expression: string;
  next_run: string;
  enabled: boolean;
}

export async function main(
  user_id: string,
  flow_path: string,
  schedule: string, // Can be: "daily", "weekly", "hourly", or cron expression
  args?: Record<string, unknown>,
  timezone: string = "UTC"
): Promise<ScheduleResult> {
  const schedule_id = crypto.randomUUID();

  // Convert friendly schedule names to cron expressions
  const cronExpressions: Record<string, string> = {
    hourly: "0 * * * *",
    daily: "0 9 * * *",
    weekly: "0 9 * * 1",
    monthly: "0 9 1 * *",
  };

  const cron_expression = cronExpressions[schedule.toLowerCase()] || schedule;

  // Calculate next run time based on cron
  const now = new Date();
  let nextRun = new Date(now);

  if (schedule.toLowerCase() === "hourly") {
    nextRun.setHours(nextRun.getHours() + 1, 0, 0, 0);
  } else if (schedule.toLowerCase() === "daily") {
    nextRun.setDate(nextRun.getDate() + 1);
    nextRun.setHours(9, 0, 0, 0);
  } else if (schedule.toLowerCase() === "weekly") {
    const daysUntilMonday = (8 - nextRun.getDay()) % 7 || 7;
    nextRun.setDate(nextRun.getDate() + daysUntilMonday);
    nextRun.setHours(9, 0, 0, 0);
  }

  // In production, this would call Windmill API to create the schedule
  // const WINDMILL_URL = Deno.env.get("WINDMILL_URL") || "http://windmill_server:8000";
  // const WINDMILL_TOKEN = Deno.env.get("WINDMILL_TOKEN");
  //
  // await fetch(`${WINDMILL_URL}/api/w/openanalyst/schedules/create`, {
  //   method: "POST",
  //   headers: {
  //     "Authorization": `Bearer ${WINDMILL_TOKEN}`,
  //     "Content-Type": "application/json"
  //   },
  //   body: JSON.stringify({
  //     path: `u/${user_id}/schedules/${schedule_id}`,
  //     schedule: cron_expression,
  //     script_path: flow_path,
  //     args: args || {},
  //     timezone,
  //     enabled: true
  //   })
  // });

  console.log(`Scheduled flow: ${flow_path}`);
  console.log(`Cron: ${cron_expression}`);
  console.log(`Next run: ${nextRun.toISOString()}`);

  return {
    schedule_id,
    flow_path,
    cron_expression,
    next_run: nextRun.toISOString(),
    enabled: true,
  };
}
