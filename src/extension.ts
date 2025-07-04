/**
 * TypeScript ts-rest Route Annotations Extension
 * 
 * This extension provides inline route annotations for TypeScript files using the ts-rest library pattern.
 * It shows HTTP method, path, and summary information next to @TsRestHandler decorators.
 */
import * as vscode from 'vscode';
import { RouteAnnotationProvider } from './route-annotation-provider';

let annotationProvider: RouteAnnotationProvider | undefined;

/**
 * This method is called when your extension is activated
 * Your extension is activated the very first time the command is executed
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('Activating ts-rest-handler-line-annotation extension...');

	try {
		// Initialize the annotation provider
		annotationProvider = new RouteAnnotationProvider(context);

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

	// Register all commands with the context
	context.subscriptions.push(toggleCommand, refreshCommand, statusCommand, debugFileCommand);
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

		console.log('ts-rest-handler-line-annotation extension deactivated successfully');

	} catch (error) {
		console.error('Error during extension deactivation:', error);
	}
}
