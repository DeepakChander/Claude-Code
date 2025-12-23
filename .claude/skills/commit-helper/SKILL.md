---
name: commit-helper
description: Generates clear commit messages from git diffs. Use when writing commit messages or reviewing staged changes.
---
# Commit Message Generator

## Instructions

When asked to create a commit message:

1. Run `git diff --staged` to see the current changes
2. Analyze the changes to understand what was modified
3. Generate a commit message following this structure:
   - **Subject line**: Under 50 characters, present tense, no period
   - **Body** (optional): Explain WHAT and WHY, not HOW
   - **Footer** (optional): Reference issues (e.g., "Fixes #123")

## Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting, no code change
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

## Examples

**Good:**
```
feat(auth): add password reset functionality

Users can now reset their password via email link.
Reset tokens expire after 24 hours for security.

Closes #42
```

**Bad:**
```
Updated some stuff in the auth module to fix the thing
```

## Best Practices

- Use present tense ("add" not "added")
- Be specific about what changed
- Explain the WHY if not obvious from the code
- Keep subject line under 50 characters
- Wrap body at 72 characters
