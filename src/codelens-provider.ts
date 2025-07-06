/**
 * CodeLens Provider for Test Endpoint functionality
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AstParser } from './ast-parser';
import { ContractParser } from './contract-parser';
import { RouteInfo, HandlerDecoratorInfo, ImportResolution } from './types';

export class TsRestCodeLensProvider implements vscode.CodeLensProvider {
  private astParser: AstParser;
  private contractParser: ContractParser;
  private envCache: Map<string, string> = new Map();
  private envCacheTime: number = 0;
  private readonly ENV_CACHE_TTL = 5000; // 5 seconds cache
  private envFileWatcher: vscode.FileSystemWatcher | undefined;

  constructor() {
    this.astParser = new AstParser();
    this.contractParser = new ContractParser();
    this.setupEnvFileWatcher();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    if (!AstParser.isTypeScriptFile(document)) {
      return [];
    }

    try {
      // Parse the document for @TsRestHandler decorators
      const parseResult = await this.astParser.parseFile(document);
      
      if (parseResult.decorators.length === 0) {
        return [];
      }

      const codeLenses: vscode.CodeLens[] = [];

      for (const decorator of parseResult.decorators) {
        try {
          const routeInfo = await this.resolveRouteInfo(
            decorator, 
            parseResult.imports, 
            document.fileName
          );

          if (routeInfo) {
            const openApiTag = await this.extractOpenApiTag(
              decorator,
              parseResult.imports,
              document.fileName
            );

            const testUrl = await this.buildTestUrl(routeInfo, openApiTag);
            const apiUrl = await this.buildApiUrl(routeInfo);
            
            if (testUrl) {
              // CodeLens for opening API docs in browser
              const openTestUrlCodeLens = new vscode.CodeLens(
                new vscode.Range(decorator.position, decorator.position),
                {
                  title: "Test Endpoint",
                  command: "tsRestAnnotations.openTestEndpoint",
                  arguments: [testUrl]
                }
              );

              codeLenses.push(openTestUrlCodeLens);

              // CodeLens for copying API docs link
              const copyTestUrlCodeLens = new vscode.CodeLens(
                new vscode.Range(decorator.position, decorator.position),
                {
                  title: "Copy Test Endpoint Link",
                  command: "tsRestAnnotations.copyTestEndpointLink",
                  arguments: [testUrl]
                }
              );

              codeLenses.push(copyTestUrlCodeLens);
            }

            if (apiUrl) {
              // CodeLens for copying actual API link
              const copyApiUrlCodeLens = new vscode.CodeLens(
                new vscode.Range(decorator.position, decorator.position),
                {
                  title: "Copy Endpoint Link",
                  command: "tsRestAnnotations.copyEndpointLink",
                  arguments: [apiUrl]
                }
              );

              codeLenses.push(copyApiUrlCodeLens);
            }
          }
        } catch (error) {
          console.error('[TsRestCodeLens] Error processing decorator:', error);
          // Continue with other decorators even if one fails
        }
      }

      return codeLenses;

    } catch (error) {
      // Silent fail for production - could add optional debug logging via configuration
      return [];
    }
  }

  /**
   * Resolve route information for a decorator
   */
  private async resolveRouteInfo(
    decorator: HandlerDecoratorInfo,
    imports: Map<string, ImportResolution>,
    currentFilePath: string
  ): Promise<RouteInfo | null> {
    try {
      // Find the import for the contract reference
      const importInfo = imports.get(decorator.contractReference);
      if (!importInfo) {
        return null;
      }

      // Resolve the contract file path
      const contractFilePath = await this.contractParser.resolveImportPath(
        importInfo.filePath,
        currentFilePath
      );

      if (!contractFilePath) {
        return null;
      }

      // Parse the contract file
      const contractFile = await this.contractParser.parseContractFile(contractFilePath);

      // Extract route information
      const routeInfo = await this.contractParser.extractRouteInfo(
        contractFile,
        decorator.contractPropertyPath,
        importInfo
      );

      return routeInfo;

    } catch (error) {
      // Silent fail for production
      return null;
    }
  }

  /**
   * Extract OpenAPI tag from contract file
   */
  private async extractOpenApiTag(
    decorator: HandlerDecoratorInfo,
    imports: Map<string, ImportResolution>,
    currentFilePath: string
  ): Promise<string | null> {
    try {
      // Find the import for the contract reference
      const importInfo = imports.get(decorator.contractReference);
      if (!importInfo) {
        return null;
      }

      // Resolve the contract file path
      const contractFilePath = await this.contractParser.resolveImportPath(
        importInfo.filePath,
        currentFilePath
      );

      if (!contractFilePath) {
        return null;
      }

      // Read and parse the contract file to extract openApiTags
      const uri = vscode.Uri.file(contractFilePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const sourceText = document.getText();

      // Look for openApiTags pattern - handle various formats
      const patterns = [
        /openApiTags:\s*\[\s*['"`]([^'"`]+)['"`]\s*\]/,  // Single tag
        /openApiTags:\s*\[\s*['"`]([^'"`]+)['"`]\s*,/,   // First tag in array
        /openApiTags:\s*\[\s*(['"`][^'"`]+['"`](?:\s*,\s*['"`][^'"`]+['"`])*)\s*\]/ // Multiple tags
      ];

      for (const pattern of patterns) {
        const match = sourceText.match(pattern);
        if (match && match[1]) {
          // Extract first tag if multiple, clean quotes
          const firstTag = match[1].replace(/['"`]/g, '').split(',')[0].trim();
          if (firstTag) {
            return firstTag.toLowerCase();
          }
        }
      }

      return null;

    } catch (error) {
      // Silent fail for production
      return null;
    }
  }

  /**
   * Build the test URL according to the schema
   */
  private async buildTestUrl(routeInfo: RouteInfo, openApiTag: string | null): Promise<string | null> {
    try {
      const appHost = await this.getAppHost();
      
      if (!appHost || !openApiTag || !routeInfo.method || !routeInfo.fullPath) {
        return null;
      }

      // Convert HTTP method to lowercase
      const httpAdverb = routeInfo.method.toLowerCase();

      // Convert endpoint path: replace :param with {param}
      let endpoint = routeInfo.fullPath.replace(/:([^/]+)/g, '{$1}');

      // Ensure appHost doesn't end with slash
      const cleanAppHost = appHost.replace(/\/$/, '');

      // Build the URL: <APP_HOST>/api-docs#tag/<TAG>/<HTTP_ADVERB>/<ENDPOINT>
      // Add trailing slash if the original contract path ends with one
      const baseUrl = `${cleanAppHost}/api-docs`;
      const trailingSlash = routeInfo.path.endsWith('/') ? '/' : '';
      const fragment = `tag/${openApiTag}/${httpAdverb}${endpoint}${trailingSlash}`;
      const testUrl = `${baseUrl}#${fragment}`;

      return testUrl;

    } catch (error) {
      return null;
    }
  }

  /**
   * Build the actual API URL for the endpoint
   */
  private async buildApiUrl(routeInfo: RouteInfo): Promise<string | null> {
    try {
      const appHost = await this.getAppHost();
      
      if (!appHost || !routeInfo.fullPath) {
        return null;
      }

      // Ensure appHost doesn't end with slash
      const cleanAppHost = appHost.replace(/\/$/, '');

      // Build the API URL: <APP_HOST><ENDPOINT>
      // Add trailing slash if the original contract path ends with one
      const trailingSlash = routeInfo.path.endsWith('/') ? '/' : '';
      const apiUrl = `${cleanAppHost}${routeInfo.fullPath}${trailingSlash}`;

      return apiUrl;

    } catch (error) {
      return null;
    }
  }

  /**
   * Get APP_HOST from .env file, fallback to http://localhost:<APP_PORT>
   */
  private async getAppHost(): Promise<string | null> {
    try {
      // Check cache first
      const now = Date.now();
      if (this.envCacheTime && (now - this.envCacheTime) < this.ENV_CACHE_TTL) {
        const cachedAppHost = this.envCache.get('APP_HOST');
        if (cachedAppHost) {
          return cachedAppHost;
        }
        
        // Fallback to localhost with APP_PORT
        const cachedAppPort = this.envCache.get('APP_PORT');
        if (cachedAppPort) {
          return `http://localhost:${cachedAppPort}`;
        }
        
        return null;
      }

      // Find .env file in workspace
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return null;
      }

      const envPath = path.join(workspaceFolders[0].uri.fsPath, '.env');
      
      if (!fs.existsSync(envPath)) {
        return null;
      }

      // Read .env file
      const envContent = fs.readFileSync(envPath, 'utf8');
      
      // Parse .env content
      this.envCache.clear();
      const lines = envContent.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const equalIndex = trimmedLine.indexOf('=');
          if (equalIndex > 0) {
            const key = trimmedLine.substring(0, equalIndex).trim();
            const value = trimmedLine.substring(equalIndex + 1).trim()
              .replace(/^["']/, '') // Remove leading quotes
              .replace(/["']$/, ''); // Remove trailing quotes
            
            this.envCache.set(key, value);
          }
        }
      }

      this.envCacheTime = now;
      
      // Try to get APP_HOST first
      const appHost = this.envCache.get('APP_HOST');
      if (appHost) {
        return appHost;
      }
      
      // Fallback to localhost with APP_PORT
      const appPort = this.envCache.get('APP_PORT');
      if (appPort) {
        const fallbackHost = `http://localhost:${appPort}`;
        return fallbackHost;
      }
      
      return null;

    } catch (error) {
      return null;
    }
  }

  /**
   * Setup file watcher for .env file to invalidate cache
   */
  private setupEnvFileWatcher(): void {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
      }

      const envPattern = new vscode.RelativePattern(workspaceFolders[0], '.env');
      this.envFileWatcher = vscode.workspace.createFileSystemWatcher(envPattern);

      this.envFileWatcher.onDidChange(() => {
        this.clearCache();
      });

      this.envFileWatcher.onDidCreate(() => {
        this.clearCache();
      });

      this.envFileWatcher.onDidDelete(() => {
        this.clearCache();
      });

    } catch (error) {
      // Silent fail for production
    }
  }

  /**
   * Clear cache (useful for testing or when .env file changes)
   */
  public clearCache(): void {
    this.envCache.clear();
    this.envCacheTime = 0;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    if (this.envFileWatcher) {
      this.envFileWatcher.dispose();
      this.envFileWatcher = undefined;
    }
    this.clearCache();
  }
}
