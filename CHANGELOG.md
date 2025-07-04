# Change Log

All notable changes to the "ts-rest-handler-line-annotation" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2025-07-04

### Added
- Initial release of ts-rest Route Annotations extension
- Inline route annotations for `@TsRestHandler` decorators
- TypeScript AST parsing for decorator extraction
- Contract file parsing with ts-rest pattern support
- Smart import resolution and file watching
- Real-time annotation updates with debouncing
- Configurable annotation display options
- Performance optimization with intelligent caching
- Comprehensive error handling and logging
- Support for router `pathPrefix` configuration
- Commands for toggling and refreshing annotations

### Features
- **AST Parser** (`ast-parser.ts`):
  - Extract `@TsRestHandler` decorators from TypeScript files
  - Parse import statements and resolve contract references
  - Handle property access chains (e.g., `c.posts.createPost`)
  - Support for namespace and named imports

- **Contract Parser** (`contract-parser.ts`):
  - Parse ts-rest contract files with router patterns
  - Extract route definitions (method, path, summary)
  - Support for `c.router()` calls with pathPrefix
  - Intelligent caching with file modification tracking

- **Route Annotation Provider** (`route-annotation-provider.ts`):
  - Main orchestration of parsing and annotation logic
  - Debounced document change handling
  - Performance metrics and cache management
  - VS Code decoration API integration

- **Configuration Options**:
  - `tsRestAnnotations.enabled`: Enable/disable annotations
  - `tsRestAnnotations.showHttpMethod`: Show HTTP method
  - `tsRestAnnotations.showPath`: Show route path
  - `tsRestAnnotations.showSummary`: Show route summary
  - `tsRestAnnotations.annotationPrefix`: Customize annotation prefix

- **Commands**:
  - `tsRestAnnotations.toggle`: Toggle annotations on/off
  - `tsRestAnnotations.refresh`: Refresh all annotations

### Technical Implementation
- **TypeScript Compiler API**: For robust AST parsing
- **VS Code Decorations API**: For inline annotation rendering
- **File System Watching**: For real-time updates
- **Intelligent Caching**: For performance optimization
- **Error Recovery**: Graceful handling of parsing errors

### Performance Features
- Route information caching with TTL (5 minutes)
- Contract file caching with modification time tracking
- Debounced document change events (300ms)
- Background processing to avoid UI blocking
- Cache invalidation on file changes

### Error Handling
- Comprehensive error types and messages
- Graceful fallbacks for missing files
- Console logging for debugging
- User-friendly error notifications

### Documentation
- Comprehensive README with examples
- TypeScript type definitions with JSDoc
- Code comments explaining complex logic
- Troubleshooting guide and FAQ