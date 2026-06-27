import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import JailStore, { defaultJail, getJailsConfigPath } from './jail/jailConfig';
import { getRemoteAuthority } from './authResolver';
import { untildify } from './common/files';

export function openJailWindow(jailName: string, reuseWindow: boolean) {
    vscode.commands.executeCommand('vscode.newWindow', { remoteAuthority: getRemoteAuthority(jailName), reuseWindow });
}

export async function promptOpenJailWindow(reuseWindow: boolean) {
    const store = await JailStore.loadFromFS();
    const jails = store.getAllJails();
    if (!jails.length) {
        const create = 'Create Jail';
        const choice = await vscode.window.showInformationMessage('No jails configured.', create);
        if (choice === create) {
            await addNewJail();
        }
        return;
    }
    const pick = await vscode.window.showQuickPick(
        jails.map(j => ({ label: j.name, description: j.privateDir, jail: j })),
        { title: 'Select a jail to open' }
    );
    if (!pick) {
        return;
    }
    openJailWindow(pick.jail.name, reuseWindow);
}

async function promptForName(existing: Set<string>, initial?: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
        title: 'Jail name',
        value: initial,
        validateInput: (v) => {
            if (!v) { return 'Name is required'; }
            if (/\s/.test(v) || /[\\/]/.test(v)) { return 'Name cannot contain whitespace or path separators'; }
            if (existing.has(v)) { return `A jail named "${v}" already exists`; }
            return undefined;
        }
    });
}

async function promptForPrivateDir(defaultDir: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
        title: 'Private directory (--private=DIR)',
        value: defaultDir,
        validateInput: (v) => v ? undefined : 'Private directory is required'
    });
}

export async function addNewJail(): Promise<void> {
    const store = await JailStore.loadFromFS();
    const existing = new Set(store.getAllJails().map(j => j.name));
    const name = await promptForName(existing);
    if (!name) { return; }

    const defaultDir = path.join(os.homedir(), 'jails', name);
    const privateDir = await promptForPrivateDir(defaultDir);
    if (!privateDir) { return; }

    await store.addJail(defaultJail(name, untildify(privateDir)));
    vscode.window.showInformationMessage(`Jail "${name}" created (firejail --private=${privateDir} --private-tmp --noprofile).`);
}

export async function editJail(name: string): Promise<void> {
    // Editing happens by opening the jails.json file directly; richer UI can come later.
    void name;
    await openJailConfigFile();
}

export async function removeJail(name: string): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
        `Remove jail "${name}"? This does not delete files on disk.`,
        { modal: true },
        'Remove'
    );
    if (confirm !== 'Remove') { return; }
    const store = await JailStore.loadFromFS();
    await store.removeJail(name);
}

export async function openJailConfigFile(): Promise<void> {
    const configPath = getJailsConfigPath();
    const uri = vscode.Uri.file(configPath);
    try {
        await vscode.workspace.fs.stat(uri);
    } catch {
        const dir = vscode.Uri.file(path.dirname(configPath));
        await vscode.workspace.fs.createDirectory(dir);
        await vscode.workspace.fs.writeFile(uri, Buffer.from('[]\n', 'utf8'));
    }
    await vscode.commands.executeCommand('vscode.open', uri);
}
