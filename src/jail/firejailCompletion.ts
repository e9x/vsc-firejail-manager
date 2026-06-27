import * as vscode from 'vscode';
import { getJailsConfigPath } from './jailConfig';

type FirejailFlag = {
    flag: string;
    detail: string;
    /** Whether the flag takes a `=value` argument. */
    takesValue?: boolean;
};

/**
 * A curated subset of firejail options that are useful inside a jail's
 * `extraArgs`. This is not exhaustive; it covers the most common networking,
 * filesystem, and security flags. See `man firejail` for the full list.
 */
const FIREJAIL_FLAGS: FirejailFlag[] = [
    { flag: '--caps.keep', detail: 'Keep only the given Linux capabilities.', takesValue: true },
    { flag: '--whitelist', detail: 'Whitelist a directory or file.', takesValue: true },
    { flag: '--blacklist', detail: 'Blacklist a directory or file.', takesValue: true },
    { flag: '--read-only', detail: 'Mount a directory or file read-only.', takesValue: true },
    { flag: '--read-write', detail: 'Mount a directory or file read-write.', takesValue: true },
    { flag: '--bind', detail: 'Bind-mount a directory or file over another.', takesValue: true },
    { flag: '--tmpfs', detail: 'Mount an empty tmpfs filesystem on a directory.', takesValue: true },
    { flag: '--x11', detail: 'Sandbox the X11 server.', takesValue: true },
    { flag: '--env', detail: 'Set an environment variable in the jail (NAME=value).', takesValue: true },
    { flag: '--rmenv', detail: 'Remove an environment variable in the jail.', takesValue: true },
    { flag: '--cpu', detail: 'Set the CPU affinity.', takesValue: true },
    { flag: '--rlimit-as', detail: 'Set the maximum address space size.', takesValue: true },
    { flag: '--rlimit-nproc', detail: 'Set the maximum number of processes.', takesValue: true },
];

/**
 * Whether the cursor sits inside a string element of an `extraArgs` array.
 * This is a lightweight, line-based heuristic rather than a full JSON parse:
 * it scans backwards for the nearest `"extraArgs"` key and ensures the
 * enclosing array hasn't been closed before the cursor.
 */
function isInsideExtraArgs(document: vscode.TextDocument, position: vscode.Position): boolean {
    const offset = document.offsetAt(position);
    const text = document.getText();
    const before = text.slice(0, offset);

    const keyIdx = before.lastIndexOf('"extraArgs"');
    if (keyIdx < 0) {
        return false;
    }

    const openIdx = before.indexOf('[', keyIdx);
    if (openIdx < 0) {
        return false;
    }

    // If the array was closed between its opening bracket and the cursor,
    // we are no longer inside it.
    const closeIdx = before.indexOf(']', openIdx);
    return closeIdx < 0;
}

/** Heuristic: is `character` inside a double-quoted string on this line? */
function isCursorInsideString(line: string, character: number): boolean {
    let inString = false;
    for (let i = 0; i < character && i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && line[i - 1] !== '\\') {
            inString = !inString;
        }
    }
    return inString;
}

class FirejailFlagCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] | undefined {
        if (!isInsideExtraArgs(document, position)) {
            return undefined;
        }

        const line = document.lineAt(position.line).text;

        return FIREJAIL_FLAGS.map(({ flag, detail, takesValue }) => {
            const item = new vscode.CompletionItem(flag, vscode.CompletionItemKind.Value);
            item.detail = detail;
            item.documentation = new vscode.MarkdownString(
                `\`firejail ${flag}${takesValue ? '=<value>' : ''}\`\n\n${detail}`
            );

            // If the cursor is already inside a JSON string, insert the bare
            // flag; otherwise wrap it in quotes so it forms a valid array element.
            const insideQuotes = isCursorInsideString(line, position.character);
            const value = takesValue ? `${flag}=` : flag;
            item.insertText = insideQuotes ? value : `"${value}"`;

            if (takesValue) {
                item.command = { command: 'editor.action.triggerSuggest', title: 'Suggest' };
            }
            return item;
        });
    }
}

/**
 * Register a completion provider for firejail flags inside the `extraArgs`
 * array of the jails.json config file. Completion is offered only for the
 * active jails config document, identified by path.
 */
export function registerFirejailCompletionProvider(): vscode.Disposable {
    const provider = new FirejailFlagCompletionProvider();
    return vscode.languages.registerCompletionItemProvider(
        { language: 'json', scheme: 'file' },
        {
            provideCompletionItems(document, position) {
                if (document.uri.fsPath !== getJailsConfigPath()) {
                    return undefined;
                }
                return provider.provideCompletionItems(document, position);
            }
        },
        '"', '-'
    );
}
