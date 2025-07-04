/**
 * AST Parser for TypeScript files to extract @TsRestHandler decorators and imports
 */
import * as vscode from 'vscode';
import * as ts from 'typescript';
import { 
  HandlerDecoratorInfo, 
  ImportResolution, 
  ParseResult, 
  ExtensionError, 
  ErrorType 
} from './types';

export class AstParser {
  private sourceFile: ts.SourceFile | null = null;

  /**
   * Parse a TypeScript file and extract decorator and import information
   */
  public async parseFile(document: vscode.TextDocument): Promise<ParseResult> {
    const result: ParseResult = {
      decorators: [],
      imports: new Map(),
      errors: []
    };

    try {
      const sourceText = document.getText();
      
      this.sourceFile = ts.createSourceFile(
        document.fileName,
        sourceText,
        ts.ScriptTarget.Latest,
        true
      );

      // Extract imports first
      this.extractImports(this.sourceFile, result);
      
      // Extract decorators
      this.extractDecorators(this.sourceFile, result, document);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
      console.error(`[AstParser] Parse error: ${errorMessage}`);
      result.errors.push(`Failed to parse file: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Extract import statements from the source file
   */
  private extractImports(sourceFile: ts.SourceFile, result: ParseResult): void {
    const visitor = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) {
        this.processImportDeclaration(node, result);
      }
      ts.forEachChild(node, visitor);
    };

    visitor(sourceFile);
  }

  /**
   * Process an import declaration node
   */
  private processImportDeclaration(node: ts.ImportDeclaration, result: ParseResult): void {
    try {
      const moduleSpecifier = node.moduleSpecifier;
      if (!ts.isStringLiteral(moduleSpecifier)) {
        return;
      }

      const importPath = moduleSpecifier.text;
      const importClause = node.importClause;

      if (!importClause) {
        return;
      }

      // Handle default imports
      if (importClause.name) {
        const importName = importClause.name.text;
        result.imports.set(importName, {
          filePath: importPath,
          isDefaultImport: true
        });
      }

      // Handle named imports
      if (importClause.namedBindings) {
        if (ts.isNamedImports(importClause.namedBindings)) {
          for (const element of importClause.namedBindings.elements) {
            const importName = element.name.text;
            const exportName = element.propertyName?.text || importName;
            
            result.imports.set(importName, {
              filePath: importPath,
              exportName,
              isDefaultImport: false
            });
          }
        } else if (ts.isNamespaceImport(importClause.namedBindings)) {
          // Handle namespace imports (import * as name from 'module')
          const namespaceName = importClause.namedBindings.name.text;
          result.imports.set(namespaceName, {
            filePath: importPath,
            isDefaultImport: false
          });
        }
      }
    } catch (error) {
      result.errors.push(`Failed to process import: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract @TsRestHandler decorators from the source file
   */
  private extractDecorators(sourceFile: ts.SourceFile, result: ParseResult, document: vscode.TextDocument): void {
    const visitor = (node: ts.Node): void => {
      if (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) {
        this.processMethodDecorators(node, result, document);
      }
      ts.forEachChild(node, visitor);
    };

    visitor(sourceFile);
  }

  /**
   * Process decorators on a method or function
   */
  private processMethodDecorators(
    node: ts.MethodDeclaration | ts.FunctionDeclaration, 
    result: ParseResult, 
    document: vscode.TextDocument
  ): void {
    if (!node.modifiers) {
      return;
    }

    for (const modifier of node.modifiers) {
      if (ts.isDecorator(modifier)) {
        const decoratorInfo = this.analyzeDecorator(modifier, document);
        if (decoratorInfo) {
          result.decorators.push(decoratorInfo);
        }
      }
    }
  }

  /**
   * Analyze a decorator to see if it's a @TsRestHandler
   */
  private analyzeDecorator(decorator: ts.Decorator, document: vscode.TextDocument): HandlerDecoratorInfo | null {
    try {
      const expression = decorator.expression;
      
      // Must be a call expression: @TsRestHandler(...)
      if (!ts.isCallExpression(expression)) {
        return null;
      }

      const callExpression = expression;
      
      // Check if the decorator name is TsRestHandler
      const isTsRestHandler = this.isTsRestHandlerDecorator(callExpression);
      
      if (!isTsRestHandler) {
        return null;
      }

      // Must have exactly one argument
      if (callExpression.arguments.length !== 1) {
        return null;
      }

      const argument = callExpression.arguments[0];
      
      const contractReference = this.extractContractReference(argument);
      
      if (!contractReference) {
        return null;
      }

      // Get position information
      const start = decorator.getStart(this.sourceFile!);
      const position = document.positionAt(start);
      const line = position.line;
      const range = new vscode.Range(
        position,
        document.positionAt(decorator.getEnd())
      );

      const result = {
        position,
        line,
        contractReference: contractReference.base,
        contractPropertyPath: contractReference.propertyPath,
        range
      };

      return result;

    } catch (error) {
      console.error('[AstParser] Error analyzing decorator:', error);
      return null;
    }
  }

  /**
   * Check if a call expression is a TsRestHandler decorator
   */
  private isTsRestHandlerDecorator(callExpression: ts.CallExpression): boolean {
    const expression = callExpression.expression;
    
    if (ts.isIdentifier(expression)) {
      return expression.text === 'TsRestHandler';
    }
    
    // Handle qualified names like SomeModule.TsRestHandler
    if (ts.isPropertyAccessExpression(expression)) {
      return expression.name.text === 'TsRestHandler';
    }
    
    return false;
  }

  /**
   * Extract contract reference from the decorator argument
   */
  private extractContractReference(argument: ts.Expression): { base: string; propertyPath: string[] } | null {
    const propertyPath: string[] = [];
    let current = argument;

    // Walk through property access chains (e.g., c.posts.createPost)
    while (ts.isPropertyAccessExpression(current)) {
      propertyPath.unshift(current.name.text);
      current = current.expression;
    }

    // The base should be an identifier
    if (!ts.isIdentifier(current)) {
      return null;
    }

    return {
      base: current.text,
      propertyPath
    };
  }

  /**
   * Get line number from TypeScript node
   */
  public getLineNumber(node: ts.Node, document: vscode.TextDocument): number {
    if (!this.sourceFile) {
      return 0;
    }
    
    const start = node.getStart(this.sourceFile);
    const position = document.positionAt(start);
    return position.line;
  }

  /**
   * Check if a file is a TypeScript file
   */
  public static isTypeScriptFile(document: vscode.TextDocument): boolean {
    return document.languageId === 'typescript' || document.languageId === 'typescriptreact';
  }

  /**
   * Get all class methods with decorators
   */
  public getDecoratedMethods(sourceFile: ts.SourceFile): ts.MethodDeclaration[] {
    const methods: ts.MethodDeclaration[] = [];

    const visitor = (node: ts.Node): void => {
      if (ts.isMethodDeclaration(node) && node.modifiers) {
        const hasDecorators = node.modifiers.some(modifier => ts.isDecorator(modifier));
        if (hasDecorators) {
          methods.push(node);
        }
      }
      ts.forEachChild(node, visitor);
    };

    visitor(sourceFile);
    return methods;
  }

  /**
   * Create diagnostic information for parsing errors
   */
  public createDiagnostic(
    message: string, 
    range: vscode.Range, 
    severity: vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Error
  ): vscode.Diagnostic {
    return {
      range,
      message,
      severity,
      source: 'ts-rest-annotations'
    };
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.sourceFile = null;
  }
}
