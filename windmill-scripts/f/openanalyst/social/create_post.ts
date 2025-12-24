// Create Social Media Post Content
// Generates optimized social media content using the Brain service

interface PostResult {
  content: string;
  platform: string;
  hashtags: string[];
  suggested_time?: string;
  character_count: number;
}

export async function main(
  content_request: string,
  user_id: string,
  platform: string = "twitter",
  tone: string = "professional"
): Promise<PostResult> {
  const BRAIN_URL = Deno.env.get("BRAIN_URL") || "http://brain:3456";

  // Platform-specific constraints
  const platformConfig: Record<string, { maxLength: number; hashtagLimit: number }> = {
    twitter: { maxLength: 280, hashtagLimit: 3 },
    linkedin: { maxLength: 3000, hashtagLimit: 5 },
    instagram: { maxLength: 2200, hashtagLimit: 30 },
    facebook: { maxLength: 63206, hashtagLimit: 10 },
  };

  const config = platformConfig[platform.toLowerCase()] || platformConfig.twitter;

  // Generate content prompt
  const prompt = `Create a ${platform} post about: ${content_request}

Requirements:
- Tone: ${tone}
- Maximum length: ${config.maxLength} characters
- Include ${config.hashtagLimit} relevant hashtags
- Make it engaging and shareable

Return ONLY the post content with hashtags. No explanations.`;

  try {
    // Call Brain service to generate content
    const response = await fetch(`${BRAIN_URL}/api/agent/run-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        userId: user_id,
        sessionId: crypto.randomUUID(),
      }),
    });

    const result = await response.json();
    const generatedContent = result.data?.response || result.data?.content || "";

    // Extract hashtags from content
    const hashtagRegex = /#\w+/g;
    const hashtags = generatedContent.match(hashtagRegex) || [];

    // Calculate optimal posting time (simplified)
    const now = new Date();
    const optimalHours: Record<string, number> = {
      twitter: 9,
      linkedin: 10,
      instagram: 11,
      facebook: 13,
    };
    now.setHours(optimalHours[platform.toLowerCase()] || 9, 0, 0, 0);
    if (now < new Date()) {
      now.setDate(now.getDate() + 1);
    }

    return {
      content: generatedContent.slice(0, config.maxLength),
      platform: platform.toLowerCase(),
      hashtags,
      suggested_time: now.toISOString(),
      character_count: generatedContent.length,
    };
  } catch (error) {
    console.error("Failed to generate post:", error);
    throw new Error(`Content generation failed: ${error}`);
  }
}
