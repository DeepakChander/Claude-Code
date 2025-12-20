import Joi from 'joi';

// User validation schemas
export const userCreateSchema = Joi.object({
  username: Joi.string()
    .min(3)
    .max(50)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Username can only contain letters, numbers, underscores, and hyphens',
    }),
  email: Joi.string()
    .email()
    .required(),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase, one lowercase, and one number',
    }),
});

export const userLoginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required(),
  password: Joi.string()
    .required(),
});

// Conversation validation schemas
export const conversationCreateSchema = Joi.object({
  title: Joi.string()
    .max(500)
    .optional(),
  description: Joi.string()
    .max(2000)
    .optional(),
  workspace_path: Joi.string()
    .max(1000)
    .optional(),
  model: Joi.string()
    .max(100)
    .optional(),
  tags: Joi.array()
    .items(Joi.string().max(50))
    .max(10)
    .optional(),
  metadata: Joi.object()
    .optional(),
});

export const conversationUpdateSchema = Joi.object({
  title: Joi.string()
    .max(500)
    .optional(),
  description: Joi.string()
    .max(2000)
    .optional(),
  is_archived: Joi.boolean()
    .optional(),
  is_pinned: Joi.boolean()
    .optional(),
  tags: Joi.array()
    .items(Joi.string().max(50))
    .max(10)
    .optional(),
  metadata: Joi.object()
    .optional(),
});

// Message validation schemas
export const messageCreateSchema = Joi.object({
  role: Joi.string()
    .valid('user', 'assistant', 'system')
    .required(),
  content: Joi.string()
    .min(1)
    .max(100000)
    .required(),
  content_type: Joi.string()
    .max(50)
    .optional()
    .default('text'),
  parent_message_id: Joi.string()
    .uuid()
    .optional(),
  metadata: Joi.object()
    .optional(),
});

// Memory validation schemas
export const memoryCreateSchema = Joi.object({
  memory_type: Joi.string()
    .valid('short_term', 'long_term', 'workspace', 'preference', 'context')
    .required(),
  category: Joi.string()
    .max(100)
    .optional(),
  key: Joi.string()
    .max(255)
    .required(),
  value: Joi.string()
    .max(100000)
    .required(),
  value_type: Joi.string()
    .max(50)
    .optional()
    .default('text'),
  importance_score: Joi.number()
    .min(0)
    .max(1)
    .optional()
    .default(0.5),
  expires_at: Joi.date()
    .iso()
    .greater('now')
    .optional(),
  source: Joi.string()
    .max(100)
    .optional(),
  metadata: Joi.object()
    .optional(),
});

export const memoryUpdateSchema = Joi.object({
  value: Joi.string()
    .max(100000)
    .optional(),
  importance_score: Joi.number()
    .min(0)
    .max(1)
    .optional(),
  expires_at: Joi.date()
    .iso()
    .optional()
    .allow(null),
  metadata: Joi.object()
    .optional(),
});

// Agent query validation schemas
export const agentQuerySchema = Joi.object({
  prompt: Joi.string()
    .min(1)
    .max(100000)
    .required(),
  conversation_id: Joi.string()
    .uuid()
    .optional(),
  options: Joi.object({
    allowedTools: Joi.array()
      .items(Joi.string())
      .optional(),
    permissionMode: Joi.string()
      .valid('bypassPermissions', 'acceptEdits', 'askForPermission')
      .optional(),
    model: Joi.string()
      .max(100)
      .optional(),
    workingDirectory: Joi.string()
      .max(1000)
      .optional(),
    systemPrompt: Joi.string()
      .max(10000)
      .optional(),
    maxTurns: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .optional(),
    resume: Joi.string()
      .optional(),
    stream: Joi.boolean()
      .optional()
      .default(true),
  }).optional(),
});

// Pagination validation schemas
export const paginationSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .optional()
    .default(1),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional()
    .default(20),
  sortBy: Joi.string()
    .max(50)
    .optional(),
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .optional()
    .default('desc'),
});

// Search validation schemas
export const searchSchema = paginationSchema.keys({
  query: Joi.string()
    .max(500)
    .optional(),
  filters: Joi.object()
    .optional(),
});

// UUID validation
export const uuidSchema = Joi.string().uuid();

// Validate function
export const validate = <T>(schema: Joi.Schema, data: unknown): { value: T; error?: string } => {
  const { value, error } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errorMessage = error.details
      .map(detail => detail.message)
      .join(', ');
    return { value: data as T, error: errorMessage };
  }

  return { value: value as T };
};

// Validation middleware helper
export const validateRequest = (schema: Joi.Schema, property: 'body' | 'query' | 'params' = 'body') => {
  return (req: { body: unknown; query: unknown; params: unknown }, res: { status: (code: number) => { json: (data: unknown) => void } }, next: () => void) => {
    const data = req[property];
    const { error } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: errorMessage,
        },
      });
    }

    next();
  };
};
