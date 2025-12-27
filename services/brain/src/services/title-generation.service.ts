// Title Generation Service
// Uses Claude Haiku for fast, cost-effective conversation title generation

import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/logger';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Use Claude Haiku for fastest, cheapest title generation
const TITLE_MODEL = 'claude-haiku-4-5-20250514';

// Title generation prompt
const TITLE_PROMPT = `Generate a concise title (5-10 words) summarizing this conversation based on the user's first message.

Rules:
- Return ONLY the title text, no quotes or extra formatting
- Make it descriptive but brief
- Use sentence case (capitalize first word and proper nouns only)
- Do not include punctuation at the end
- Focus on the main topic or question

First message: "{message}"

Title:`;

interface TitleGenerationResult {
  title: string;
  model: string;
  generatedAt: Date;
}

/**
 * Generate a conversation title from the first user message
 */
export async function generateTitleFromMessage(
  message: string
): Promise<TitleGenerationResult> {
  if (!ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY not set, using fallback title');
    return {
      title: generateFallbackTitle(message),
      model: 'fallback',
      generatedAt: new Date(),
    };
  }

  try {
    const client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });

    // Truncate message if too long (keep first 500 chars)
    const truncatedMessage = message.length > 500
      ? message.substring(0, 500) + '...'
      : message;

    const prompt = TITLE_PROMPT.replace('{message}', truncatedMessage);

    logger.info('Generating conversation title with Claude Haiku', {
      messageLength: message.length,
      model: TITLE_MODEL,
    });

    const response = await client.messages.create({
      model: TITLE_MODEL,
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in response');
    }

    let title = textContent.text.trim();

    // Clean up the title
    title = cleanTitle(title);

    logger.info('Title generated successfully', {
      title,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    });

    return {
      title,
      model: TITLE_MODEL,
      generatedAt: new Date(),
    };
  } catch (error) {
    logger.error('Failed to generate title with AI', {
      error: (error as Error).message,
    });

    // Fallback to simple title extraction
    return {
      title: generateFallbackTitle(message),
      model: 'fallback',
      generatedAt: new Date(),
    };
  }
}

/**
 * Clean up the generated title
 */
function cleanTitle(title: string): string {
  // Remove quotes if present
  title = title.replace(/^["']|["']$/g, '');

  // Remove "Title:" prefix if AI included it
  title = title.replace(/^Title:\s*/i, '');

  // Remove trailing punctuation
  title = title.replace(/[.!?]+$/, '');

  // Ensure reasonable length (max 100 chars)
  if (title.length > 100) {
    title = title.substring(0, 97) + '...';
  }

  // Fallback if empty
  if (!title.trim()) {
    return 'New Conversation';
  }

  return title.trim();
}

/**
 * Generate a fallback title from the message (when AI is unavailable)
 */
function generateFallbackTitle(message: string): string {
  // Take first sentence or first 50 chars
  const firstSentence = message.split(/[.!?]/)[0];

  if (firstSentence.length <= 50) {
    return cleanTitle(firstSentence);
  }

  // Truncate at word boundary
  const truncated = message.substring(0, 50);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > 20) {
    return cleanTitle(truncated.substring(0, lastSpace) + '...');
  }

  return cleanTitle(truncated + '...');
}

/**
 * Check if a title needs generation (is default)
 */
export function needsTitleGeneration(title: string | undefined | null): boolean {
  if (!title) return true;

  const defaultTitles = [
    'new conversation',
    'untitled',
    'new chat',
    '',
  ];

  return defaultTitles.includes(title.toLowerCase().trim());
}

export default {
  generateTitleFromMessage,
  needsTitleGeneration,
};
