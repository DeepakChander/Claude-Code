// Generate Analytics Report
// Creates a formatted report from metrics data

interface ReportResult {
  report_id: string;
  user_id: string;
  title: string;
  generated_at: string;
  sections: Array<{
    title: string;
    content: string;
    data?: unknown;
  }>;
  summary: string;
  export_formats: string[];
}

export async function main(
  user_id: string,
  report_type: string = "weekly",
  step_1_result?: { data: { overview: Record<string, number>; trends: Array<{ date: string; value: number }> } }
): Promise<ReportResult> {
  const BRAIN_URL = Deno.env.get("BRAIN_URL") || "http://brain:3456";
  const report_id = crypto.randomUUID();

  // Use metrics from previous step or generate sample data
  const metricsData = step_1_result?.data || {
    overview: {
      total_interactions: 750,
      active_sessions: 25,
      tasks_completed: 120,
      success_rate: 92.5,
    },
    trends: [],
  };

  // Generate summary using Brain service
  let summary = "";
  try {
    const prompt = `Analyze these metrics and provide a brief 2-3 sentence summary:
    - Total Interactions: ${metricsData.overview.total_interactions}
    - Active Sessions: ${metricsData.overview.active_sessions}
    - Tasks Completed: ${metricsData.overview.tasks_completed}
    - Success Rate: ${metricsData.overview.success_rate}%

    Focus on key insights and actionable recommendations.`;

    const response = await fetch(`${BRAIN_URL}/api/agent/run-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        userId: user_id,
        sessionId: crypto.randomUUID(),
      }),
    });

    const result = await response.json();
    summary = result.data?.response || "Report generated successfully.";
  } catch (error) {
    summary = `Your ${report_type} report shows ${metricsData.overview.total_interactions} total interactions with a ${metricsData.overview.success_rate}% success rate.`;
  }

  return {
    report_id,
    user_id,
    title: `${report_type.charAt(0).toUpperCase() + report_type.slice(1)} Analytics Report`,
    generated_at: new Date().toISOString(),
    sections: [
      {
        title: "Overview",
        content: "Key performance metrics for the reporting period.",
        data: metricsData.overview,
      },
      {
        title: "Trends",
        content: "Activity trends over time.",
        data: metricsData.trends,
      },
      {
        title: "Recommendations",
        content: summary,
      },
    ],
    summary,
    export_formats: ["pdf", "csv", "json"],
  };
}
