/**
 * TypeScript ts-rest Route Annotations Extension
 * 
 * This extension provides inline route annotations for TypeScript files using the ts-rest library pattern.
 * It shows HTTP method, path, and summary information next to @TsRestHandler decorators.
 */
import * as vscode from 'vscode';
import { RouteAnnotationProvider } from './route-annotation-provider';
import { TsRestCodeLensProvider } from './codelens-provider';
import { ReplCodeLensProvider } from './repl-codelens-provider';

let annotationProvider: RouteAnnotationProvider | undefined;
let codeLensProvider: TsRestCodeLensProvider | undefined;

/**
 * This method is called when your extension is activated
 * Your extension is activated the very first time the command is executed
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('Activating ts-rest-handler-line-annotation extension...');

	try {
		// Initialize the annotation provider
		annotationProvider = new RouteAnnotationProvider(context);

		// Initialize and register the CodeLens provider
		console.log('Registering CodeLens provider...');
		codeLensProvider = new TsRestCodeLensProvider();
		const codeLensDisposable = vscode.languages.registerCodeLensProvider(
			[
				{ scheme: 'file', language: 'typescript' },
				{ scheme: 'file', language: 'typescriptreact' }
			],
			codeLensProvider
		);
		context.subscriptions.push(codeLensDisposable);
		console.log('CodeLens provider registered successfully');

		// Register REPL CodeLens provider for TypeScript files
		const replCodeLensProvider = new ReplCodeLensProvider();
		const replCodeLensDisposable = vscode.languages.registerCodeLensProvider(
			[
				{ scheme: 'file', language: 'typescript' }
			],
			replCodeLensProvider
		);
		context.subscriptions.push(replCodeLensDisposable);

		// Register commands
		registerCommands(context);

		console.log('ts-rest-handler-line-annotation extension activated successfully');

	} catch (error) {
		console.error('Failed to activate ts-rest-handler-line-annotation extension:', error);
		vscode.window.showErrorMessage(
			`Failed to activate ts-rest Route Annotations: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

/**
 * Register extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
	// Toggle annotations command
	const toggleCommand = vscode.commands.registerCommand(
		'tsRestAnnotations.toggle',
		async () => {
			try {
				if (annotationProvider) {
					await annotationProvider.toggleAnnotations();
				} else {
					vscode.window.showWarningMessage('ts-rest annotations provider not initialized');
				}
			} catch (error) {
				console.error('Error toggling annotations:', error);
				vscode.window.showErrorMessage(
					`Failed to toggle annotations: ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}
		}
	);

	// Refresh annotations command
	const refreshCommand = vscode.commands.registerCommand(
		'tsRestAnnotations.refresh',
		async () => {
			try {
				if (annotationProvider) {
					await annotationProvider.refreshAllAnnotations();
					vscode.window.showInformationMessage('ts-rest route annotations refreshed');
				} else {
					vscode.window.showWarningMessage('ts-rest annotations provider not initialized');
				}
			} catch (error) {
				console.error('Error refreshing annotations:', error);
				vscode.window.showErrorMessage(
					`Failed to refresh annotations: ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}
		}
	);

	// Show status command (for debugging)
	const statusCommand = vscode.commands.registerCommand(
		'tsRestAnnotations.showStatus',
		() => {
			try {
				if (annotationProvider) {
					const status = annotationProvider.getStatus();
					const statusMessage = `ts-rest Annotations Status:
• Enabled: ${status.enabled}
• Contract Cache: ${status.contractCacheSize} files
• Route Cache: ${status.routeCacheSize} entries
• Active Decorations: ${status.decorationTypesCount}
• File Watchers: ${status.fileWatchersCount}`;

					vscode.window.showInformationMessage(statusMessage);
				} else {
					vscode.window.showWarningMessage('ts-rest annotations provider not initialized');
				}
			} catch (error) {
				console.error('Error getting status:', error);
				vscode.window.showErrorMessage(
					`Failed to get status: ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}
		}
	);

	// Debug current file command
	const debugFileCommand = vscode.commands.registerCommand(
		'tsRestAnnotations.debugCurrentFile',
		async () => {
			try {
				const activeEditor = vscode.window.activeTextEditor;
				if (!activeEditor) {
					vscode.window.showWarningMessage('No active editor');
					return;
				}

				if (annotationProvider) {
					// Force update annotations
					await annotationProvider.updateAnnotations(activeEditor.document);
					vscode.window.showInformationMessage('Debug annotations updated');
				}
			} catch (error) {
				console.error('Error debugging file:', error);
				vscode.window.showErrorMessage(
					`Failed to debug file: ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}
		}
	);

	// Open test endpoint command
	const openTestEndpointCommand = vscode.commands.registerCommand(
		'tsRestAnnotations.openTestEndpoint',
		async (url: string) => {
			try {
				if (url) {
					// Try to decode the URL if it's already encoded
					let decodedUrl = url;
					if (url.includes('%7B') || url.includes('%7D')) {
						decodedUrl = decodeURIComponent(url);
					}
					
					// Import child_process to open URL directly without VS Code's URI encoding
					const { exec } = require('child_process');
					const os = require('os');
					
					let command: string;
					const platform = os.platform();
					
					if (platform === 'darwin') {
						// macOS
						command = `open "${decodedUrl}"`;
					} else if (platform === 'win32') {
						// Windows  
						command = `start "" "${decodedUrl}"`;
					} else {
						// Linux and others
						command = `xdg-open "${decodedUrl}"`;
					}
					
					exec(command, (error: any) => {
						if (error) {
							// Fallback to VS Code's method if system command fails
							vscode.env.openExternal(vscode.Uri.parse(decodedUrl));
						}
					});
				} else {
					vscode.window.showWarningMessage('No test endpoint URL available');
				}
			} catch (error) {
				// Fallback to VS Code's method
				try {
					if (url) {
						await vscode.env.openExternal(vscode.Uri.parse(url));
					}
				} catch (fallbackError) {
					vscode.window.showErrorMessage(
						`Failed to open test endpoint: ${error instanceof Error ? error.message : 'Unknown error'}`
					);
				}
			}
		}
	);

	// Copy test endpoint link command
	const copyTestEndpointLinkCommand = vscode.commands.registerCommand(
		'tsRestAnnotations.copyTestEndpointLink',
		async (url: string) => {
			try {
				if (url) {
					await vscode.env.clipboard.writeText(url);
					vscode.window.showInformationMessage('Test endpoint link copied to clipboard');
				} else {
					vscode.window.showWarningMessage('No test endpoint URL available');
				}
			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to copy test endpoint link: ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}
		}
	);

	// Copy endpoint link command
	const copyEndpointLinkCommand = vscode.commands.registerCommand(
		'tsRestAnnotations.copyEndpointLink',
		async (url: string) => {
			try {
				if (url) {
					await vscode.env.clipboard.writeText(url);
					vscode.window.showInformationMessage('Endpoint link copied to clipboard');
				} else {
					vscode.window.showWarningMessage('No endpoint URL available');
				}
			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to copy endpoint link: ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}
		}
	);

	// Run in REPL command
	const runInReplCommand = vscode.commands.registerCommand(
		'tsRestAnnotations.runInRepl',
		async (className: string, methodName: string) => {
			const command = `STARTUP_COMMAND='\$(${className}).${methodName}()' npm run repl:debug`;
			const terminal = vscode.window.createTerminal({ name: 'REPL Debug' });
			terminal.show();
			terminal.sendText(command);
		}
	);

	// Register all commands with the context
	context.subscriptions.push(
		toggleCommand, 
		refreshCommand, 
		statusCommand, 
		debugFileCommand, 
		openTestEndpointCommand, 
		copyTestEndpointLinkCommand,
		copyEndpointLinkCommand,
		runInReplCommand
	);
}

/**
 * This method is called when your extension is deactivated
 */
export function deactivate() {
	console.log('Deactivating ts-rest-handler-line-annotation extension...');

	try {
		// Clean up the annotation provider
		if (annotationProvider) {
			annotationProvider.dispose();
			annotationProvider = undefined;
		}

		// Clean up the CodeLens provider
		if (codeLensProvider) {
			codeLensProvider.dispose();
			codeLensProvider = undefined;
		}

		console.log('ts-rest-handler-line-annotation extension deactivated successfully');

	} catch (error) {
		console.error('Error during extension deactivation:', error);
	}
}
