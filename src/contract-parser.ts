/**
 * Contract Parser for extracting route information from ts-rest contract files
 */
import * as vscode from 'vscode';
import * as ts from 'typescript';
import * as path from 'path';
import { 
  RouteInfo, 
  ContractDefinition, 
  RouterDefinition, 
  ImportResolution, 
  ExtensionError, 
  ErrorType,
  ContractFile 
} from './types';

export class ContractParser {
  private contractCache = new Map<string, ContractFile>();

  /**
   * Parse a contract file and extract route definitions
   */
  public async parseContractFile(filePath: string): Promise<ContractFile> {
    // Check cache first
    const cachedContract = this.contractCache.get(filePath);
    if (cachedContract) {
      try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        if (stat.mtime <= cachedContract.lastModified) {
          return cachedContract;
        }
      } catch {
        // File might not exist, continue with fresh parse
      }
    }

    try {
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const sourceText = document.getText();

      const sourceFile = ts.createSourceFile(
        filePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true
      );

      const exports = this.extractExports(sourceFile);
      
      const contractFile: ContractFile = {
        filePath,
        exports,
        lastModified: Date.now()
      };

      this.contractCache.set(filePath, contractFile);
      return contractFile;

    } catch (error) {
      throw new ExtensionError(
        `Failed to parse contract file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.PARSE_ERROR,
        filePath
      );
    }
  }

  /**
   * Extract route information from a contract reference
   */
  public async extractRouteInfo(
    contractFile: ContractFile,
    propertyPath: string[],
    importInfo?: { exportName?: string; isDefaultImport: boolean }
  ): Promise<RouteInfo | null> {
    
    try {
      // Find the base contract object based on the import type
      let baseContract: any = null;
      
      if (importInfo && importInfo.exportName) {
        // Named import - look in the specific export and navigate the property path within it
        const exportObj = contractFile.exports.get(importInfo.exportName);
        if (exportObj) {
          baseContract = this.findRouteInContract(exportObj, propertyPath);
        }
      } else {
        // Default import or unknown import type - try the old logic
        baseContract = this.findContractByPath(contractFile.exports, propertyPath);
        
        if (!baseContract) {
          // Try default export first
          const defaultExport = contractFile.exports.get('default');
          if (defaultExport) {
            baseContract = this.findRouteInContract(defaultExport, propertyPath);
          }
          
          // Try 'contract' export if default didn't work
          if (!baseContract) {
            const contractExport = contractFile.exports.get('contract');
            if (contractExport) {
              baseContract = this.findRouteInContract(contractExport, propertyPath);
            }
          }
          
          // Try all exports as fallback
          if (!baseContract) {
            for (const [exportName, exportValue] of contractFile.exports) {
              baseContract = this.findRouteInContract(exportValue, propertyPath);
              if (baseContract) {
                break;
              }
            }
          }
        }
      }
      
      if (!baseContract) {
        return null;
      }

      // Extract route definition
      const routeDefinition = this.extractRouteDefinition(baseContract);
      if (!routeDefinition) {
        return null;
      }

      // Find the router configuration for pathPrefix
      const pathPrefix = this.findPathPrefix(contractFile.exports, propertyPath);
      
      // Combine path prefix with route path
      const fullPath = this.combinePaths(pathPrefix, routeDefinition.path || '');

      const result = {
        method: routeDefinition.method || 'GET',
        path: routeDefinition.path || '',
        summary: routeDefinition.summary,
        fullPath
      };

      return result;

    } catch (error) {
      console.error('[ContractParser] Error extracting route info:', error);
      return null;
    }
  }

  /**
   * Find a route within a contract object (handles router patterns)
   */
  private findRouteInContract(contractObj: any, propertyPath: string[]): any {
    if (!contractObj || typeof contractObj !== 'object' || propertyPath.length === 0) {
      return null;
    }

    const [routeName] = propertyPath;

    // Direct property access
    if (contractObj[routeName]) {
      return contractObj[routeName];
    }

    // If this is a router object (has __router flag), look in the router properties
    if (contractObj.__router) {
      if (contractObj[routeName]) {
        return contractObj[routeName];
      }
    }

    // Look for nested objects that might contain the route
    for (const [key, value] of Object.entries(contractObj)) {
      if (typeof value === 'object' && value !== null && !key.startsWith('__')) {
        const valueObj = value as Record<string, any>;
        if (valueObj[routeName]) {
          return valueObj[routeName];
        }
      }
    }

    return null;
  }

  /**
   * Extract all exports from a source file
   */
  private extractExports(sourceFile: ts.SourceFile): Map<string, any> {
    const exports = new Map<string, any>();

    const visitor = (node: ts.Node): void => {
      // Variable declarations (const, let, var)
      if (ts.isVariableStatement(node)) {
        this.processVariableStatement(node, exports);
      }
      
      // Export assignments (export = ...)
      if (ts.isExportAssignment(node)) {
        this.processExportAssignment(node, exports);
      }

      ts.forEachChild(node, visitor);
    };

    visitor(sourceFile);
    return exports;
  }

  /**
   * Process variable statements for exports
   */
  private processVariableStatement(node: ts.VariableStatement, exports: Map<string, any>): void {
    try {
      const isExported = node.modifiers?.some(modifier => 
        modifier.kind === ts.SyntaxKind.ExportKeyword
      );

      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          const name = declaration.name.text;
          const value = this.extractObjectLiteral(declaration.initializer);
          
          if (value) {
            exports.set(name, value);
            
            // If it's a default export, also set it as 'default'
            if (isExported && node.declarationList.declarations.length === 1) {
              exports.set('default', value);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error processing variable statement:', error);
    }
  }

  /**
   * Process export assignments
   */
  private processExportAssignment(node: ts.ExportAssignment, exports: Map<string, any>): void {
    try {
      const value = this.extractObjectLiteral(node.expression);
      if (value) {
        exports.set('default', value);
      }
    } catch (error) {
      console.error('Error processing export assignment:', error);
    }
  }

  /**
   * Extract object literal as a plain object structure
   */
  private extractObjectLiteral(node: ts.Expression): any {
    if (ts.isObjectLiteralExpression(node)) {
      const obj: any = {};
      
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) {
          const key = this.getPropertyName(property.name);
          if (key) {
            obj[key] = this.extractObjectLiteral(property.initializer);
          }
        } else if (ts.isMethodDeclaration(property)) {
          const key = this.getPropertyName(property.name);
          if (key) {
            obj[key] = { __method: true };
          }
        }
      }
      
      return obj;
    }
    
    if (ts.isStringLiteral(node)) {
      return node.text;
    }
    
    if (ts.isNumericLiteral(node)) {
      return parseFloat(node.text);
    }
    
    if (node.kind === ts.SyntaxKind.TrueKeyword) {
      return true;
    }
    
    if (node.kind === ts.SyntaxKind.FalseKeyword) {
      return false;
    }
    
    if (ts.isCallExpression(node)) {
      // Handle c.router() calls
      if (this.isRouterCall(node)) {
        return this.extractRouterCall(node);
      }
      
      // Handle ts-rest contract method calls (c.get, c.post, etc.)
      if (this.isTsRestMethodCall(node)) {
        return this.extractTsRestMethodCall(node);
      }
    }
    
    return null;
  }

  /**
   * Get property name from property name node
   */
  private getPropertyName(name: ts.PropertyName): string | null {
    if (ts.isIdentifier(name)) {
      return name.text;
    }
    if (ts.isStringLiteral(name)) {
      return name.text;
    }
    if (ts.isComputedPropertyName(name)) {
      // For computed property names, we'd need more complex handling
      return null;
    }
    return null;
  }

  /**
   * Check if a call expression is a router call (c.router)
   */
  private isRouterCall(node: ts.CallExpression): boolean {
    if (ts.isPropertyAccessExpression(node.expression)) {
      return node.expression.name.text === 'router';
    }
    return false;
  }

  /**
   * Extract router call information
   */
  private extractRouterCall(node: ts.CallExpression): any {
    const router: any = { __router: true };
    
    if (node.arguments.length >= 1) {
      // First argument is the routes object
      const routesObj = this.extractObjectLiteral(node.arguments[0]);
      if (routesObj) {
        Object.assign(router, routesObj);
      }
    }
    
    if (node.arguments.length >= 2) {
      // Second argument is the options (pathPrefix, etc.)
      const options = this.extractObjectLiteral(node.arguments[1]);
      if (options) {
        router.__options = options;
      }
    }
    
    return router;
  }

  /**
   * Check if a call expression is a ts-rest method call (c.get, c.post, etc.)
   */
  private isTsRestMethodCall(node: ts.CallExpression): boolean {
    if (ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text;
      const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
      return httpMethods.includes(methodName.toLowerCase());
    }
    return false;
  }

  /**
   * Extract ts-rest method call information (c.get, c.post, etc.)
   */
  private extractTsRestMethodCall(node: ts.CallExpression): any {
    if (!ts.isPropertyAccessExpression(node.expression)) {
      return null;
    }

    const methodName = node.expression.name.text.toUpperCase();
    const route: any = { 
      method: methodName,
      __method: methodName,
      __call: true 
    };

    if (node.arguments.length >= 1) {
      // First argument is typically the path
      const pathArg = node.arguments[0];
      if (ts.isStringLiteral(pathArg)) {
        route.path = pathArg.text;
        route.__path = pathArg.text;
      }
    }

    if (node.arguments.length >= 2) {
      // Second argument is typically the options object
      const optionsArg = this.extractObjectLiteral(node.arguments[1]);
      if (optionsArg) {
        Object.assign(route, optionsArg);
      }
    }

    return route;
  }

  /**
   * Find a contract object by property path
   */
  private findContractByPath(exports: Map<string, any>, propertyPath: string[]): any {
    if (propertyPath.length === 0) {
      return null;
    }

    // Start with the first part of the path
    const [firstPart, ...restPath] = propertyPath;
    let current = exports.get(firstPart) || exports.get('default');

    if (!current) {
      return null;
    }

    // Navigate through the property path
    for (const part of restPath) {
      if (typeof current === 'object' && current !== null && part in current) {
        current = current[part];
      } else {
        return null;
      }
    }

    return current;
  }

  /**
   * Extract route definition from a contract object
   */
  private extractRouteDefinition(contractObj: any): ContractDefinition | null {
    if (!contractObj || typeof contractObj !== 'object') {
      return null;
    }

    // Direct route definition (simple object with method/path)
    if (contractObj.method || contractObj.path) {
      return {
        method: contractObj.method,
        path: contractObj.path,
        summary: contractObj.summary,
        description: contractObj.description,
        responses: contractObj.responses,
        body: contractObj.body,
        query: contractObj.query,
        params: contractObj.params
      };
    }

    // ts-rest contract route definition (from c.get(), c.post(), etc.)
    // These typically have an internal structure that we need to parse
    if (contractObj.__call || contractObj.__type === 'route') {
      return this.extractFromTsRestRoute(contractObj);
    }

    // Check for nested route information
    if (contractObj.route) {
      return this.extractRouteDefinition(contractObj.route);
    }

    // Look for common ts-rest properties
    if (contractObj.__method || contractObj.__path) {
      return {
        method: contractObj.__method,
        path: contractObj.__path,
        summary: contractObj.__summary || contractObj.summary,
        description: contractObj.__description || contractObj.description,
        responses: contractObj.__responses || contractObj.responses,
        body: contractObj.__body || contractObj.body,
        query: contractObj.__query || contractObj.query,
        params: contractObj.__params || contractObj.params
      };
    }

    return null;
  }

  /**
   * Extract route information from ts-rest route call structure
   */
  private extractFromTsRestRoute(contractObj: any): ContractDefinition | null {
    // This handles the internal structure created by c.get(), c.post(), etc.
    const method = contractObj.method || contractObj.__method || 'GET';
    const path = contractObj.path || contractObj.__path || '/';
    
    return {
      method: method.toUpperCase(),
      path,
      summary: contractObj.summary || contractObj.__summary,
      description: contractObj.description || contractObj.__description,
      responses: contractObj.responses || contractObj.__responses,
      body: contractObj.body || contractObj.__body,
      query: contractObj.query || contractObj.__query,
      params: contractObj.params || contractObj.__params
    };
  }

  /**
   * Find path prefix from router configuration
   */
  private findPathPrefix(exports: Map<string, any>, propertyPath: string[]): string {
    if (propertyPath.length === 0) {
      return '';
    }

    // Check all exports for router configurations
    for (const [exportName, exportValue] of exports) {
      if (exportValue && typeof exportValue === 'object') {
        // Check if this export is a router with options
        if (exportValue.__router && exportValue.__options && exportValue.__options.pathPrefix) {
          return exportValue.__options.pathPrefix;
        }
        
        // Check nested objects for router configurations
        for (const [key, value] of Object.entries(exportValue)) {
          if (typeof value === 'object' && value !== null) {
            const valueObj = value as any;
            if (valueObj.__router && valueObj.__options && valueObj.__options.pathPrefix) {
              return valueObj.__options.pathPrefix;
            }
          }
        }
      }
    }

    return '';
  }

  /**
   * Combine path prefix with route path
   */
  private combinePaths(pathPrefix: string, routePath: string): string {
    if (!pathPrefix) {
      return routePath || '/';
    }

    if (!routePath || routePath === '/') {
      return pathPrefix;
    }

    // Ensure both paths start with /
    const normalizedPrefix = pathPrefix.startsWith('/') ? pathPrefix : `/${pathPrefix}`;
    const normalizedRoute = routePath.startsWith('/') ? routePath : `/${routePath}`;

    // Remove trailing slash from prefix if route doesn't start with /
    const cleanPrefix = normalizedPrefix.endsWith('/') && normalizedRoute !== '/' 
      ? normalizedPrefix.slice(0, -1) 
      : normalizedPrefix;

    return cleanPrefix + normalizedRoute;
  }

  /**
   * Resolve import path to absolute file path
   */
  public async resolveImportPath(importPath: string, fromFile: string): Promise<string | null> {
    try {
      // Handle relative imports
      if (importPath.startsWith('.')) {
        const basePath = path.dirname(fromFile);
        const resolvedPath = path.resolve(basePath, importPath);
        
        // Try different extensions
        const extensions = ['.ts', '.tsx', '.js', '.jsx'];
        for (const ext of extensions) {
          const fullPath = resolvedPath + ext;
          try {
            await vscode.workspace.fs.stat(vscode.Uri.file(fullPath));
            return fullPath;
          } catch {
            // File doesn't exist, continue
          }
        }
        
        // Try index files
        for (const ext of extensions) {
          const indexPath = path.join(resolvedPath, `index${ext}`);
          try {
            await vscode.workspace.fs.stat(vscode.Uri.file(indexPath));
            return indexPath;
          } catch {
            // Index file doesn't exist, continue
          }
        }
      }

      // Handle absolute imports (would need more complex resolution)
      return null;

    } catch (error) {
      console.error('[ContractParser] Error resolving import path:', error);
      return null;
    }
  }

  /**
   * Clear the contract cache
   */
  public clearCache(): void {
    this.contractCache.clear();
  }

  /**
   * Remove a specific file from cache
   */
  public invalidateCache(filePath: string): void {
    this.contractCache.delete(filePath);
  }

  /**
   * Get cache statistics for debugging
   */
  public getCacheStats(): { size: number; files: string[] } {
    return {
      size: this.contractCache.size,
      files: Array.from(this.contractCache.keys())
    };
  }
}
