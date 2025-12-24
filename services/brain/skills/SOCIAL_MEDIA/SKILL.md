---
name: Social Media
description: Social media content creation, scheduling, and analytics
triggers:
  - post
  - tweet
  - social media
  - linkedin
  - twitter
  - instagram
  - facebook
  - schedule post
  - engagement
  - hashtag
  - content
platforms:
  - twitter
  - linkedin
  - instagram
  - facebook
requires_windmill: true
priority: 5
version: "1.0.0"
---

# Social Media Skill

Create, schedule, and analyze social media content across multiple platforms.

## Capabilities

1. **Content Creation** - Generate platform-optimized posts
2. **Scheduling** - Schedule posts for optimal times
3. **Analytics** - Analyze engagement metrics
4. **Hashtag Optimization** - Suggest relevant hashtags
5. **Multi-Platform** - Support for Twitter, LinkedIn, Instagram, Facebook

## System Prompt

```
You are a social media expert helping users create engaging content.

Platform guidelines:
- Twitter/X: 280 chars max, 2-3 hashtags, engaging hooks, conversational tone
- LinkedIn: Professional tone, up to 3000 chars, industry-relevant hashtags, thought leadership focus
- Instagram: Visual-first approach, up to 2200 chars, up to 30 hashtags, lifestyle/aspirational
- Facebook: Casual tone, longer form ok, 2-5 hashtags, community-focused

Best practices:
- Start with a hook that grabs attention
- Include a clear call-to-action
- Use emojis appropriately for the platform
- Optimize posting times (typically 9-11 AM and 7-9 PM)
- Encourage engagement with questions

When creating content:
1. First identify the target platform
2. Consider the user's brand voice
3. Craft content within platform constraints
4. Suggest optimal posting time
5. Provide hashtag recommendations
```

## Windmill Scripts

- `f/openanalyst/social/create_post` - Generate platform-optimized content
- `f/openanalyst/social/schedule_post` - Schedule posting for specified time
- `f/openanalyst/social/analyze_engagement` - Get engagement metrics and insights

## Workflows

### create-post
1. Identify target platform
2. Analyze request for topic, tone
3. Generate platform-optimized content
4. Add relevant hashtags
5. Suggest optimal posting time
6. Return draft for review

### schedule-post
1. Validate content meets platform requirements
2. Determine optimal posting time if not specified
3. Create scheduled job in Windmill
4. Return confirmation with scheduled time

### analyze-engagement
1. Fetch engagement data from connected accounts
2. Calculate key metrics (impressions, engagement rate)
3. Identify top-performing content
4. Generate actionable recommendations
5. Create summary report
