// Create Workflow Flow
// Creates a new Windmill flow for automated task execution

interface FlowStep {
  id: string;
  name: string;
  script_path: string;
  input_transforms: Record<string, string>;
}

interface FlowResult {
  flow_id: string;
  user_id: string;
  name: string;
  description: string;
  steps: FlowStep[];
  created_at: string;
  path: string;
}

export async function main(
  user_id: string,
  flow_name: string,
  description: string,
  steps: Array<{
    name: string;
    script_path: string;
    inputs?: Record<string, string>;
  }>
): Promise<FlowResult> {
  const flow_id = crypto.randomUUID();
  const path = `u/${user_id}/flows/${flow_name.toLowerCase().replace(/\s+/g, "_")}`;

  // Transform steps into Windmill flow format
  const flowSteps: FlowStep[] = steps.map((step, index) => ({
    id: `step_${index + 1}`,
    name: step.name,
    script_path: step.script_path,
    input_transforms: step.inputs || {},
  }));

  // In production, this would call Windmill API to create the flow
  // const WINDMILL_URL = Deno.env.get("WINDMILL_URL") || "http://windmill_server:8000";
  // const WINDMILL_TOKEN = Deno.env.get("WINDMILL_TOKEN");
  //
  // await fetch(`${WINDMILL_URL}/api/w/openanalyst/flows/create`, {
  //   method: "POST",
  //   headers: {
  //     "Authorization": `Bearer ${WINDMILL_TOKEN}`,
  //     "Content-Type": "application/json"
  //   },
  //   body: JSON.stringify({
  //     path,
  //     summary: description,
  //     value: { modules: flowSteps }
  //   })
  // });

  console.log(`Created flow: ${path}`);
  console.log(`Steps: ${flowSteps.length}`);

  return {
    flow_id,
    user_id,
    name: flow_name,
    description,
    steps: flowSteps,
    created_at: new Date().toISOString(),
    path,
  };
}
