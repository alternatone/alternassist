# Contributing to Alternassist

Thank you for your interest in contributing to Alternassist! This document provides guidelines for contributing to the project.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd alternassist
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run dev
   ```

## Project Structure

Please familiarize yourself with our organized structure:

- `src/main/` - Main process code (Electron backend)
- `src/renderer/` - Renderer process code (UI)
  - `pages/` - HTML page modules
  - `assets/` - Static assets
  - `utils/` - Shared utilities
- `src/integrations/` - Third-party integrations
- `docs/` - Documentation files
- `scripts/` - Build and utility scripts

## Coding Standards

### JavaScript
- Use ES6+ features where appropriate
- Follow the existing code style
- Use meaningful variable and function names
- Add comments for complex logic

### HTML/CSS
- Use semantic HTML5 elements
- Follow the existing design system (see `docs/PROJECT_CONTEXT.md`)
- Maintain responsive design principles
- Use CSS custom properties for theming

### File Organization
- Keep related code together
- Use clear, descriptive file names
- Place new utilities in appropriate directories
- Update documentation when adding new features

## Code Style

We use:
- **EditorConfig** - for consistent editor settings
- **Prettier** - for code formatting (see `.prettierrc`)

Format your code before committing:
```bash
npx prettier --write .
```

## Git Workflow

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clear, concise commit messages
   - Keep commits focused and atomic
   - Reference issue numbers when applicable

3. **Test your changes**
   - Ensure the app starts without errors
   - Test all affected functionality
   - Verify no existing features are broken

4. **Push and create a pull request**
   ```bash
   git push origin feature/your-feature-name
   ```

## Commit Message Guidelines

Use clear, descriptive commit messages:

```
feat: add new payment method support
fix: resolve invoice calculation rounding error
docs: update README with new features
refactor: reorganize project structure
style: format code with prettier
test: add tests for estimate calculator
```

Prefix types:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

## Testing

Before submitting:
- Test the main application flow
- Verify all modules load correctly
- Check for console errors
- Test cross-module integrations
- Verify localStorage data persistence

## Documentation

When adding new features:
- Update README.md if needed
- Add/update relevant documentation in `docs/`
- Include inline code comments for complex logic
- Update CHANGELOG.md

## Questions?

For questions or clarifications, please reach out to the project maintainer.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
