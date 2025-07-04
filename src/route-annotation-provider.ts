/**
 * Route Annotation Provider - Main logic for displaying ts-rest route annotations
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { 
  RouteInfo, 
  HandlerDecoratorInfo, 
  AnnotationConfig, 
  ExtensionState, 
  DecorationOptions, 
  CacheEntry, 
  ExtensionError, 
  ErrorType,
  PerformanceMetrics 
} from './types';
import { AstParser } from './ast-parser';
import { ContractParser } from './contract-parser';

export class RouteAnnotationProvider {
  private astParser: AstParser;
  private contractParser: ContractParser;
  private state: ExtensionState;
  private config: AnnotationConfig;
  private updateDebounceTimeout: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_DELAY = 300; // ms
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private context: vscode.ExtensionContext) {
    this.astParser = new AstParser();
    this.contractParser = new ContractParser();
    this.state = this.initializeState();
    this.config = this.loadConfiguration();
    
    this.setupEventListeners();
    this.initializeActiveEditors();
  }

  /**
   * Initialize extension state
   */
  private initializeState(): ExtensionState {
    return {
      isEnabled: true,
      contractCache: new Map(),
      routeCache: new Map(),
      decorationTypes: new Map(),
      fileWatchers: new Map(),
      disposables: []
    };
  }

  /**
   * Load configuration from VS Code settings
   */
  private loadConfiguration(): AnnotationConfig {
    const config = vscode.workspace.getConfiguration('tsRestAnnotations');
    return {
      enabled: config.get('enabled', true),
      showHttpMethod: config.get('showHttpMethod', true),
      showPath: config.get('showPath', true),
      showSummary: config.get('showSummary', true),
      annotationPrefix: config.get('annotationPrefix', ' // ')
    };
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Document change events
    this.state.disposables.push(
      vscode.workspace.onDidChangeTextDocument(this.onDocumentChange.bind(this))
    );

    // Active editor change
    this.state.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(this.onActiveEditorChange.bind(this))
    );

    // Configuration changes
    this.state.disposables.push(
      vscode.workspace.onDidChangeConfiguration(this.onConfigurationChange.bind(this))
    );

    // File system events
    this.state.disposables.push(
      vscode.workspace.onDidSaveTextDocument(this.onDocumentSave.bind(this))
    );

    this.state.disposables.push(
      vscode.workspace.onDidDeleteFiles(this.onFilesDeleted.bind(this))
    );
  }

  /**
   * Initialize annotations for currently active editors
   */
  private async initializeActiveEditors(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    for (const editor of vscode.window.visibleTextEditors) {
      if (AstParser.isTypeScriptFile(editor.document)) {
        await this.updateAnnotations(editor.document);
      }
    }
  }

  /**
   * Handle document changes with debouncing
   */
  private onDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (!this.config.enabled || !AstParser.isTypeScriptFile(event.document)) {
      return;
    }

    // Clear existing timeout
    if (this.updateDebounceTimeout) {
      clearTimeout(this.updateDebounceTimeout);
    }

    // Set new timeout
    this.updateDebounceTimeout = setTimeout(() => {
      this.updateAnnotations(event.document);
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * Handle active editor changes
   */
  private async onActiveEditorChange(editor: vscode.TextEditor | undefined): Promise<void> {
    if (!this.config.enabled || !editor || !AstParser.isTypeScriptFile(editor.document)) {
      return;
    }

    await this.updateAnnotations(editor.document);
  }

  /**
   * Handle configuration changes
   */
  private async onConfigurationChange(event: vscode.ConfigurationChangeEvent): Promise<void> {
    if (!event.affectsConfiguration('tsRestAnnotations')) {
      return;
    }

    const oldConfig = this.config;
    this.config = this.loadConfiguration();

    // If enabled state changed
    if (oldConfig.enabled !== this.config.enabled) {
      if (this.config.enabled) {
        await this.initializeActiveEditors();
      } else {
        this.clearAllAnnotations();
      }
      return;
    }

    // If other settings changed, refresh all annotations
    if (this.config.enabled) {
      await this.refreshAllAnnotations();
    }
  }

  /**
   * Handle document save events
   */
  private async onDocumentSave(document: vscode.TextDocument): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Invalidate cache for saved file
    this.invalidateCache(document.fileName);

    // Update annotations if it's a TypeScript file
    if (AstParser.isTypeScriptFile(document)) {
      await this.updateAnnotations(document);
    }
  }

  /**
   * Handle file deletion events
   */
  private onFilesDeleted(event: vscode.FileDeleteEvent): void {
    for (const uri of event.files) {
      this.invalidateCache(uri.fsPath);
    }
  }

  /**
   * Main method to update annotations for a document
   */
  public async updateAnnotations(document: vscode.TextDocument): Promise<void> {
    if (!this.config.enabled || !AstParser.isTypeScriptFile(document)) {
      return;
    }

    const startTime = Date.now();
    const metrics: Partial<PerformanceMetrics> = { cacheHits: 0, cacheMisses: 0 };

    try {
      // Parse the document
      const parseStartTime = Date.now();
      const parseResult = await this.astParser.parseFile(document);
      metrics.parseTime = Date.now() - parseStartTime;

      if (parseResult.errors.length > 0) {
        console.warn('[RouteAnnotationProvider] Parse errors:', parseResult.errors);
      }

      if (parseResult.decorators.length === 0) {
        this.clearAnnotations(document);
        return;
      }

      // Resolve route information for each decorator
      const contractStartTime = Date.now();
      const annotationPromises = parseResult.decorators.map(decorator =>
        this.resolveRouteInfo(decorator, parseResult.imports, document.fileName, metrics)
      );

      const annotationResults = await Promise.allSettled(annotationPromises);
      metrics.contractResolutionTime = Date.now() - contractStartTime;

      // Create decorations
      const renderStartTime = Date.now();
      const decorations = this.createDecorations(
        parseResult.decorators,
        annotationResults,
        document
      );

      // Apply decorations
      await this.applyDecorations(document, decorations);
      metrics.decorationRenderTime = Date.now() - renderStartTime;

      metrics.totalTime = Date.now() - startTime;
      this.logPerformanceMetrics(metrics as PerformanceMetrics);

    } catch (error) {
      console.error('[RouteAnnotationProvider] Error updating annotations:', error);
      this.showError(`Failed to update route annotations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Resolve route information for a decorator
   */
  private async resolveRouteInfo(
    decorator: HandlerDecoratorInfo,
    imports: Map<string, any>,
    currentFilePath: string,
    metrics: Partial<PerformanceMetrics>
  ): Promise<RouteInfo | null> {
    try {
      // Check cache first
      const cacheKey = `${currentFilePath}:${decorator.line}:${decorator.contractReference}:${decorator.contractPropertyPath.join('.')}`;
      const cached = this.state.routeCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        metrics.cacheHits = (metrics.cacheHits || 0) + 1;
        return cached.routeInfo;
      }

      metrics.cacheMisses = (metrics.cacheMisses || 0) + 1;

      // Find the import for the contract reference
      const importInfo = imports.get(decorator.contractReference);
      if (!importInfo) {
        console.error(`[RouteAnnotationProvider] ❌ Import not found for contract reference: ${decorator.contractReference}`);
        throw new ExtensionError(
          `Import not found for contract reference: ${decorator.contractReference}`,
          ErrorType.IMPORT_RESOLUTION_FAILED,
          currentFilePath
        );
      }

      // Resolve the contract file path
      const contractFilePath = await this.contractParser.resolveImportPath(
        importInfo.filePath,
        currentFilePath
      );

      if (!contractFilePath) {
        console.error(`[RouteAnnotationProvider] ❌ Contract file not found: ${importInfo.filePath}`);
        throw new ExtensionError(
          `Contract file not found: ${importInfo.filePath}`,
          ErrorType.FILE_NOT_FOUND,
          currentFilePath
        );
      }

      // Parse the contract file
      const contractFile = await this.contractParser.parseContractFile(contractFilePath);

      // Extract route information
      const routeInfo = await this.contractParser.extractRouteInfo(
        contractFile,
        decorator.contractPropertyPath,
        importInfo
      );

      if (routeInfo) {
        // Cache the result
        this.state.routeCache.set(cacheKey, {
          routeInfo,
          timestamp: Date.now(),
          fileVersion: 1 // TODO: implement proper file versioning
        });
      } else {
        console.warn(`[RouteAnnotationProvider] ⚠️ No route info extracted for property path: ${decorator.contractPropertyPath.join('.')}`);
      }

      return routeInfo;

    } catch (error) {
      console.error('[RouteAnnotationProvider] ❌ Error resolving route info:', error);
      return null;
    }
  }

  /**
   * Create decoration options for annotations
   */
  private createDecorations(
    decorators: HandlerDecoratorInfo[],
    annotationResults: PromiseSettledResult<RouteInfo | null>[],
    document: vscode.TextDocument
  ): DecorationOptions[] {
    const decorations: DecorationOptions[] = [];

    for (let i = 0; i < decorators.length; i++) {
      const decorator = decorators[i];
      const result = annotationResults[i];

      if (result.status === 'fulfilled' && result.value) {
        const routeInfo = result.value;
        const annotationText = this.formatAnnotationText(routeInfo);

        if (annotationText) {
          const line = document.lineAt(decorator.line);
          const range = new vscode.Range(
            new vscode.Position(decorator.line, line.text.length),
            new vscode.Position(decorator.line, line.text.length)
          );

          decorations.push({
            range,
            renderOptions: {
              after: {
                contentText: annotationText,
                color: new vscode.ThemeColor('editorCodeLens.foreground'),
                fontStyle: 'italic',
                opacity: '0.7'
              }
            }
          });
        }
      }
    }

    return decorations;
  }

  /**
   * Format route information as annotation text
   */
  private formatAnnotationText(routeInfo: RouteInfo): string {
    const parts: string[] = [];

    if (this.config.showHttpMethod && routeInfo.method) {
      parts.push(routeInfo.method.toUpperCase());
    }

    if (this.config.showPath && routeInfo.fullPath) {
      parts.push(routeInfo.fullPath);
    }

    if (this.config.showSummary && routeInfo.summary) {
      parts.push(`- ${routeInfo.summary}`);
    }

    if (parts.length === 0) {
      return '';
    }

    return this.config.annotationPrefix + parts.join(' ');
  }

  /**
   * Apply decorations to a document
   */
  private async applyDecorations(
    document: vscode.TextDocument,
    decorations: DecorationOptions[]
  ): Promise<void> {
    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === document.uri.toString()
    );

    if (!editor) {
      return;
    }

    // Get or create decoration type
    const decorationType = this.getDecorationType(document.uri.toString());
    
    // Apply decorations
    editor.setDecorations(decorationType, decorations);
  }

  /**
   * Get or create decoration type for a document
   */
  private getDecorationType(documentKey: string): vscode.TextEditorDecorationType {
    let decorationType = this.state.decorationTypes.get(documentKey);

    if (!decorationType) {
      decorationType = vscode.window.createTextEditorDecorationType({
        after: {
          margin: '0 0 0 1em',
          fontWeight: 'normal',
          fontStyle: 'italic'
        }
      });
      
      this.state.decorationTypes.set(documentKey, decorationType);
    }

    return decorationType;
  }

  /**
   * Clear annotations for a specific document
   */
  private clearAnnotations(document: vscode.TextDocument): void {
    const documentKey = document.uri.toString();
    const decorationType = this.state.decorationTypes.get(documentKey);

    if (decorationType) {
      const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === documentKey
      );

      if (editor) {
        editor.setDecorations(decorationType, []);
      }
    }
  }

  /**
   * Clear all annotations
   */
  private clearAllAnnotations(): void {
    for (const [documentKey, decorationType] of this.state.decorationTypes) {
      const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === documentKey
      );

      if (editor) {
        editor.setDecorations(decorationType, []);
      }
    }
  }

  /**
   * Refresh all annotations
   */
  public async refreshAllAnnotations(): Promise<void> {
    this.clearCaches();
    
    for (const editor of vscode.window.visibleTextEditors) {
      if (AstParser.isTypeScriptFile(editor.document)) {
        await this.updateAnnotations(editor.document);
      }
    }
  }

  /**
   * Toggle annotations on/off
   */
  public async toggleAnnotations(): Promise<void> {
    const config = vscode.workspace.getConfiguration('tsRestAnnotations');
    const currentState = config.get('enabled', true);
    await config.update('enabled', !currentState, vscode.ConfigurationTarget.Workspace);
    
    const newState = !currentState;
    vscode.window.showInformationMessage(
      `ts-rest route annotations ${newState ? 'enabled' : 'disabled'}`
    );
  }

  /**
   * Invalidate cache for a specific file
   */
  private invalidateCache(filePath: string): void {
    // Clear contract cache
    this.contractParser.invalidateCache(filePath);

    // Clear route cache entries for this file
    const keysToDelete: string[] = [];
    for (const [key] of this.state.routeCache) {
      if (key.startsWith(filePath + ':')) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.state.routeCache.delete(key);
    }
  }

  /**
   * Clear all caches
   */
  private clearCaches(): void {
    this.contractParser.clearCache();
    this.state.routeCache.clear();
  }

  /**
   * Log performance metrics for debugging
   */
  private logPerformanceMetrics(metrics: PerformanceMetrics): void {
    // Performance logging disabled for production
    // Uncomment for debugging: console.log('[RouteAnnotationProvider] Performance metrics:', metrics);
  }

  /**
   * Show error message to user
   */
  private showError(message: string): void {
    vscode.window.showErrorMessage(`ts-rest annotations: ${message}`);
  }

  /**
   * Get extension status for debugging
   */
  public getStatus(): any {
    return {
      enabled: this.config.enabled,
      contractCacheSize: this.contractParser.getCacheStats().size,
      routeCacheSize: this.state.routeCache.size,
      decorationTypesCount: this.state.decorationTypes.size,
      fileWatchersCount: this.state.fileWatchers.size
    };
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    // Clear timeouts
    if (this.updateDebounceTimeout) {
      clearTimeout(this.updateDebounceTimeout);
    }

    // Dispose of decoration types
    for (const decorationType of this.state.decorationTypes.values()) {
      decorationType.dispose();
    }

    // Dispose of file watchers
    for (const watcher of this.state.fileWatchers.values()) {
      watcher.dispose();
    }

    // Dispose of event listeners
    for (const disposable of this.state.disposables) {
      disposable.dispose();
    }

    // Clear caches
    this.clearCaches();

    // Dispose parsers
    this.astParser.dispose();
  }
}
