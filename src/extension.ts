import * as path from 'path';
import * as vscode from 'vscode';
import Log from './common/logger';
import { FirejailResolver, REMOTE_FIREJAIL_AUTHORITY } from './authResolver';
import { openJailConfigFile, promptOpenJailWindow } from './commands';
import { JailTreeDataProvider } from './jailTreeView';
import { setJailsConfigPath } from './jail/jailConfig';
import { registerFirejailCompletionProvider } from './jail/firejailCompletion';

export async function activate(context: vscode.ExtensionContext) {
    const logger = new Log('Firejail');
    context.subscriptions.push(logger);

    // Default the jails.json path to the extension's global storage when the
    // user hasn't set firejail.configFile explicitly.
    setJailsConfigPath(path.join(context.globalStorageUri.fsPath, 'jails.json'));

    const resolver = new FirejailResolver(context, logger);
    context.subscriptions.push(vscode.workspace.registerRemoteAuthorityResolver(REMOTE_FIREJAIL_AUTHORITY, resolver));
    context.subscriptions.push(resolver);

    // This extension is `extensionKind: ["ui"]`, so it always runs in the local
    // UI extension host (never inside the firejail remote). The `firejailJails`
    // view is contributed under `views.remote` and rendered in the Remote
    // Explorer of that same UI window, so its data provider must be created here
    // unconditionally. Gating on `vscode.env.remoteName` (always undefined for a
    // UI extension) left the view with no provider — "There is no data provider
    // registered that can provide view data".
    const treeProvider = new JailTreeDataProvider();
    context.subscriptions.push(treeProvider);
    context.subscriptions.push(vscode.window.createTreeView('firejailJails', { treeDataProvider: treeProvider }));

    context.subscriptions.push(vscode.commands.registerCommand('firejail.openEmptyWindow', () => promptOpenJailWindow(false)));
    context.subscriptions.push(vscode.commands.registerCommand('firejail.openEmptyWindowInCurrentWindow', () => promptOpenJailWindow(true)));
    context.subscriptions.push(vscode.commands.registerCommand('firejail.openConfigFile', () => openJailConfigFile()));
    context.subscriptions.push(vscode.commands.registerCommand('firejail.showLog', () => logger.show()));

    context.subscriptions.push(registerFirejailCompletionProvider());
}

export function deactivate() {
}
