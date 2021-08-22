/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { disposeAll } from '../../utils/dispose';

type VsCodeConfiguration = { [key: string]: any };

async function updateConfig(newConfig: VsCodeConfiguration): Promise<VsCodeConfiguration> {
	const oldConfig: VsCodeConfiguration = {};
	const config = vscode.workspace.getConfiguration(undefined);
	for (const configKey of Object.keys(newConfig)) {
		oldConfig[configKey] = config.get(configKey);
		await new Promise<void>((resolve, reject) =>
			config.update(configKey, newConfig[configKey], vscode.ConfigurationTarget.Global)
				.then(() => resolve(), reject));
	}
	return oldConfig;
}

namespace Config {
	export const referencesCodeLens = 'typescript.referencesCodeLens.enabled';
}

suite('TypeScript TsconfigLinkProvider', () => {
	const configDefaults: VsCodeConfiguration = Object.freeze({
		[Config.referencesCodeLens]: true,
	});

	const _disposables: vscode.Disposable[] = [];
	let oldConfig: { [key: string]: any } = {};

	setup(async () => {
		// the tests assume that typescript features are registered
		await vscode.extensions.getExtension('vscode.typescript-language-features')!.activate();

		// Save off config and apply defaults
		oldConfig = await updateConfig(configDefaults);
	});

	teardown(async () => {
		disposeAll(_disposables);

		// Restore config
		await updateConfig(oldConfig);

		return vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('"extends" with relative path', async () => {
		const file = workspaceFile('tsconfig.test.json');
		await withFileContents(file, '{ "extends": "./tsconfig.test.json" }');

		const [link] = await getLinksForFile(file);
		assert.strictEqual(link.target?.path, workspaceFile('tsconfig.test.json').path);
	});

	test('"extends" with node module (tsconfig at root)', async () => {
		const file = workspaceFile('tsconfig.test.json');
		await withFileContents(file, '{ "extends": "some-lib/tsconfig.json" }');

		const [link] = await getLinksForFile(file);
		assert.strictEqual(link.target?.path, workspaceFile('node_modules', 'some-lib', 'tsconfig.json').path);
	});

	test('"extends" with node module (tsconfig at subdirectory)', async () => {
		const file = workspaceFile('some-dir', 'tsconfig.json');
		await withFileContents(file, '{ "extends": "some-lib/tsconfig.json" }');

		const [link] = await getLinksForFile(file);
		assert.strictEqual(link.target?.path, workspaceFile('some-dir', 'node_modules', 'some-lib', 'tsconfig.json').path);
	});

	test('"extends" with non-existing node module', async () => {
		const file = workspaceFile('some-dir', 'tsconfig.json');
		await withFileContents(file, '{ "extends": "non-existing-lib/tsconfig.json" }');

		const links = await getLinksForFile(file);
		assert.strictEqual(links.length, 0);
	});
});

//
// Helpers copied from markdown-language-features/src/test/documentLink.test.ts
//
function workspaceFile(...pathSegments: string[]) {
	return vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, ...pathSegments);
}

async function getLinksForFile(file: vscode.Uri): Promise<vscode.DocumentLink[]> {
	return (await vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', file))!;
}

async function withFileContents(file: vscode.Uri, contents: string): Promise<void> {
	const document = await vscode.workspace.openTextDocument(file);
	const editor = await vscode.window.showTextDocument(document);
	await editor.edit(edit => {
		edit.replace(new vscode.Range(0, 0, 1000, 0), contents);
	});
}
