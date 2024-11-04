import * as vscode from 'vscode';
import { spawn } from 'child_process';

export function activate(context: vscode.ExtensionContext) {

	let disposable = vscode.commands.registerCommand('extension.completeText', () => {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const document = editor.document;
			const selection = editor.selection;

			const selectedText = document.getText(selection);
			if (selectedText) {
				const pythonProcess = spawn('python', ['../text_completion_model.py', selectedText]);

				pythonProcess.stdout.on('data', (data) => {
					const result = data.toString();
					editor.edit(editBuilder => {
						editBuilder.replace(selection, result);
					});
				});

				pythonProcess.stderr.on('data', (data) => {
					vscode.window.showErrorMessage(`Error: ${data.toString()}`);
				});
			}
		}
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
