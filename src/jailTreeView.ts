import * as vscode from 'vscode';
import JailStore, { JailConfiguration } from './jail/jailConfig';
import { Disposable } from './common/disposable';
import { addNewJail, editJail, openJailConfigFile, openJailWindow, removeJail } from './commands';

class JailItem {
    constructor(public jail: JailConfiguration) {
    }
}

export class JailTreeDataProvider extends Disposable implements vscode.TreeDataProvider<JailItem> {

    private readonly _onDidChangeTreeData = this._register(new vscode.EventEmitter<JailItem | JailItem[] | void>());
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor() {
        super();

        this._register(vscode.commands.registerCommand('firejail.explorer.add', () => this.addJail()));
        this._register(vscode.commands.registerCommand('firejail.explorer.configure', () => openJailConfigFile()));
        this._register(vscode.commands.registerCommand('firejail.explorer.refresh', () => this.refresh()));
        this._register(vscode.commands.registerCommand('firejail.explorer.edit', (e: JailItem) => this.edit(e)));
        this._register(vscode.commands.registerCommand('firejail.explorer.remove', (e: JailItem) => this.remove(e)));
        this._register(vscode.commands.registerCommand('firejail.explorer.openInNewWindow', (e: JailItem) => this.open(e, false)));
        this._register(vscode.commands.registerCommand('firejail.explorer.openInCurrentWindow', (e: JailItem) => this.open(e, true)));

        this._register(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('firejail.configFile')) {
                this.refresh();
            }
        }));
    }

    getTreeItem(element: JailItem): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(element.jail.name);
        treeItem.description = element.jail.privateDir;
        treeItem.iconPath = new vscode.ThemeIcon('shield');
        treeItem.contextValue = 'firejail.explorer.jail';
        treeItem.tooltip = `firejail ${[`--private=${element.jail.privateDir}`,
            ...(element.jail.privateTmp ? ['--private-tmp'] : []),
            ...(element.jail.noprofile ? ['--noprofile'] : []),
            ...element.jail.extraArgs].join(' ')}`;
        return treeItem;
    }

    async getChildren(element?: JailItem): Promise<JailItem[]> {
        if (element) {
            return [];
        }
        const store = await JailStore.loadFromFS();
        return store.getAllJails().map(j => new JailItem(j));
    }

    private refresh() {
        this._onDidChangeTreeData.fire();
    }

    private async addJail() {
        await addNewJail();
        this.refresh();
    }

    private async edit(element: JailItem) {
        await editJail(element.jail.name);
        this.refresh();
    }

    private async remove(element: JailItem) {
        await removeJail(element.jail.name);
        this.refresh();
    }

    private async open(element: JailItem, reuseWindow: boolean) {
        openJailWindow(element.jail.name, reuseWindow);
    }
}
