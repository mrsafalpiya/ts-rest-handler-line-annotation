# TypeScript ts-rest Route Annotations

A Visual Studio Code extension that provides inline route annotations for TypeScript files using the [ts-rest](https://ts-rest.com/) library pattern. Shows HTTP method, path, and summary information next to `@TsRestHandler` decorators in NestJS controllers.

## Features

- **Inline Route Annotations**: Displays route information directly next to `@TsRestHandler` decorators
- **Real-time Updates**: Annotations update automatically as you edit your code
- **Smart Contract Resolution**: Follows import statements to locate contract definitions
- **Path Prefix Support**: Combines router `pathPrefix` with individual route paths
- **Configurable Display**: Choose what information to show (method, path, summary)
- **Performance Optimized**: Uses caching and debouncing for smooth editing experience
- **Error Handling**: Graceful handling of parsing errors and missing files

## Example

**Before:**
```typescript
// posts.controller.ts
import c from './posts.contract';

@TsRestHandler(c.createPost)
async createPost() { ... }

@TsRestHandler(c.getAllPosts)
async getAllPosts() { ... }
```

**After (with annotations):**
```typescript
// posts.controller.ts
import c from './posts.contract';

@TsRestHandler(c.createPost)  // POST /posts - Create a new post
async createPost() { ... }

@TsRestHandler(c.getAllPosts)  // GET /posts - Get all posts
async getAllPosts() { ... }
```

## Supported Patterns

### Basic Route Contract
```typescript
// posts.contract.ts
const postsContract = c.router({
  createPost: {
    method: 'POST',
    path: '/',
    summary: 'Create a new post',
    body: z.object({ title: z.string() }),
    responses: {
      201: z.object({ id: z.string() })
    }
  },
  getAllPosts: {
    method: 'GET',
    path: '/',
    summary: 'Get all posts',
    responses: {
      200: z.array(z.object({ id: z.string(), title: z.string() }))
    }
  }
}, {
  pathPrefix: '/posts'  // Combined with individual paths
});

export default postsContract;
```

### Controller Usage
```typescript
// posts.controller.ts
import { Controller } from '@nestjs/common';
import { TsRestHandler, TsRest } from '@ts-rest/nest';
import postsContract from './posts.contract';

@Controller()
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @TsRestHandler(postsContract.createPost)  // POST /posts - Create a new post
  async createPost() {
    return this.postsService.create(body);
  }

  @TsRestHandler(postsContract.getAllPosts)  // GET /posts - Get all posts
  async getAllPosts() {
    return this.postsService.findAll();
  }
}
```

## Commands

The extension provides the following commands:

- **`ts-rest: Toggle Route Annotations`** - Enable/disable route annotations
- **`ts-rest: Refresh Route Annotations`** - Manually refresh all annotations

Access these commands via:
- Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
- Right-click context menu in TypeScript files

## Configuration

Configure the extension via VS Code settings:

```json
{
  "tsRestAnnotations.enabled": true,
  "tsRestAnnotations.showHttpMethod": true,
  "tsRestAnnotations.showPath": true,
  "tsRestAnnotations.showSummary": true,
  "tsRestAnnotations.annotationPrefix": " // "
}
```

### Settings Reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `tsRestAnnotations.enabled` | boolean | `true` | Enable/disable ts-rest route annotations |
| `tsRestAnnotations.showHttpMethod` | boolean | `true` | Show HTTP method in annotations |
| `tsRestAnnotations.showPath` | boolean | `true` | Show route path in annotations |
| `tsRestAnnotations.showSummary` | boolean | `true` | Show route summary in annotations |
| `tsRestAnnotations.annotationPrefix` | string | `" // "` | Prefix for route annotations |

## Requirements

- Visual Studio Code 1.101.0 or higher
- TypeScript files using the ts-rest library pattern
- `@TsRestHandler` decorators in your controllers

## Extension Structure

The extension is built with a modular architecture:

```
src/
├── extension.ts              # Main extension entry point
├── types.ts                  # TypeScript type definitions
├── ast-parser.ts            # TypeScript AST parsing logic
├── contract-parser.ts       # Contract file parsing logic
└── route-annotation-provider.ts  # Main annotation logic
```

## Performance Features

- **Intelligent Caching**: Contract files and route information are cached
- **Debounced Updates**: Annotations update smoothly during editing
- **Smart Invalidation**: Cache is cleared only when files change
- **Background Processing**: File parsing doesn't block the UI

## Error Handling

The extension gracefully handles various error scenarios:

- Missing contract files
- Invalid TypeScript syntax
- Unresolved imports
- Malformed contract definitions
- Network/file system errors

Errors are logged to the console and shown as user-friendly messages when appropriate.

## Development

### Building from Source

```bash
# Clone the repository
git clone <repository-url>
cd ts-rest-handler-line-annotation

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes during development
npm run watch
```

### Testing

```bash
# Run linting
npm run lint

# Run tests
npm run test
```

### Debugging

1. Open the project in VS Code
2. Press `F5` to launch a new Extension Development Host
3. Open a TypeScript file with `@TsRestHandler` decorators
4. Annotations should appear automatically

## Troubleshooting

### Annotations Not Appearing

1. **Check if the extension is enabled**:
   - Open Command Palette
   - Run "ts-rest: Toggle Route Annotations"

2. **Verify file structure**:
   - Ensure contract files are properly imported
   - Check that `@TsRestHandler` decorators reference valid contract properties

3. **Check the Developer Console**:
   - Open Developer Tools (`Help > Toggle Developer Tools`)
   - Look for error messages in the Console tab

### Performance Issues

1. **Large codebases**: The extension caches aggressively, but very large projects might experience slower initial loading
2. **Frequent file changes**: Use the debouncing feature (automatically enabled)
3. **Memory usage**: Clear cache with "ts-rest: Refresh Route Annotations" if needed

### Common Issues

| Issue | Solution |
|-------|----------|
| "Import not found" error | Check import paths and file names |
| Annotations showing wrong information | Refresh annotations or restart VS Code |
| Extension not activating | Ensure you're working with TypeScript files |

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

### Development Guidelines

1. Follow TypeScript best practices
2. Add tests for new features
3. Update documentation for user-facing changes
4. Ensure compatibility with the latest VS Code API

## Code Generation

The majority of the code in this repository was generated using **GitHub Copilot Agent** in Visual Studio Code. The agent helped design, implement, and refine the extension's architecture, TypeScript AST parsing logic, contract resolution system, and user interface components. This demonstrates the power of AI-assisted development for creating production-quality VS Code extensions.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed list of changes and updates.

## Related Projects

- [ts-rest](https://ts-rest.com/) - Type-safe REST APIs
- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [@ts-rest/nest](https://www.npmjs.com/package/@ts-rest/nest) - NestJS integration for ts-rest
