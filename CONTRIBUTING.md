# Contributing to Frontier Meals

Thank you for your interest in contributing to Frontier Meals! This document provides guidelines and instructions for contributing.

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `pnpm install`
3. Set up environment variables (see README.md)
4. Run database migrations: `cd apps/api && pnpm db:migrate`
5. Start development servers: `pnpm dev`

## Code Standards

### TypeScript
- Use TypeScript for all new code
- Maintain strict type safety
- Avoid `any` types when possible
- Use Zod for runtime validation

### Svelte
- Follow Svelte 5 best practices
- Use runes for reactive state
- Prefer snippets over slots for reusable fragments
- Keep components focused and composable

### Styling
- Use Tailwind CSS utility classes
- Follow the design system (see app.css)
- Use semantic color tokens (e.g., `bg-primary` not `bg-blue-500`)
- Ensure responsive design

### Code Quality
- Write descriptive commit messages
- Add tests for new features
- Update documentation as needed
- Run linting before committing

## Commit Messages

Follow conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `test:` Test updates
- `chore:` Build/tooling changes

Example: `feat(auth): add password reset functionality`

## Pull Request Process

1. Create a feature branch from `develop`
2. Make your changes
3. Write/update tests
4. Run the full test suite: `pnpm test`
5. Run linting: `pnpm lint:fix`
6. Commit your changes
7. Push to your fork
8. Open a pull request to `develop`

### PR Checklist

- [ ] Tests pass locally
- [ ] Linting passes
- [ ] Type checking passes
- [ ] Documentation updated
- [ ] No console errors or warnings
- [ ] Responsive design verified
- [ ] Accessibility considered

## Testing

### Unit Tests
```bash
pnpm test:unit
```

### E2E Tests
```bash
pnpm test:e2e
```

### Test Coverage
```bash
pnpm test:unit -- --coverage
```

## Questions?

Feel free to open an issue for discussion before starting work on major features.
