import * as vscode from 'vscode';
import * as ts from 'typescript';

export class ReplCodeLensProvider implements vscode.CodeLensProvider {
  public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
    // Only activate for .service.ts files
    if (!document.fileName.endsWith('.service.ts')) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();
    
    try {
      // Parse the TypeScript file using the TypeScript compiler API
      const sourceFile = ts.createSourceFile(
        document.fileName,
        text,
        ts.ScriptTarget.Latest,
        true
      );

      // Visit all nodes in the AST
      function visit(node: ts.Node) {
        // Look for class declarations
        if (ts.isClassDeclaration(node) && node.name) {
          const className = node.name.text;
          
          // Iterate through class members
          node.members.forEach(member => {
            // Only show CodeLens for instance methods (not constructors, not static methods, not properties)
            if (
              ts.isMethodDeclaration(member) &&
              member.name &&
              ts.isIdentifier(member.name) &&
              member.name.text !== 'constructor' &&
              !member.modifiers?.some(mod => mod.kind === ts.SyntaxKind.StaticKeyword)
            ) {
              const methodName = member.name.text;
              const start = member.name.getStart(sourceFile);
              const pos = document.positionAt(start);
              
              codeLenses.push(new vscode.CodeLens(
                new vscode.Range(pos, pos),
                {
                  title: 'Run in REPL',
                  command: 'tsRestAnnotations.runInRepl',
                  arguments: [className, methodName]
                }
              ));
            }
          });
        }
        
        // Continue visiting child nodes
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    } catch (error) {
      console.error('Error parsing TypeScript file for REPL CodeLens:', error);
    }

    return codeLenses;
  }
}
