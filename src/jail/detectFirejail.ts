import * as cp from 'child_process';
import * as vscode from 'vscode';

/**
 * Resolve the configured firejail binary (defaults to `firejail`, looked up on PATH).
 */
function getFirejailPath(): string {
    return vscode.workspace.getConfiguration('firejail').get<string>('firejailPath', 'firejail') || 'firejail';
}

/**
 * Detect whether the firejail binary is installed and runnable.
 *
 * Runs `firejail --version`; resolves true if the process exits with code 0.
 * Any spawn error (ENOENT for a missing binary) or non-zero exit resolves false.
 */
export function isFirejailInstalled(): Promise<boolean> {
    const firejailPath = getFirejailPath();
    return new Promise((resolve) => {
        let child: cp.ChildProcessWithoutNullStreams;
        try {
            child = cp.spawn(firejailPath, ['--version']);
        } catch {
            return resolve(false);
        }

        // Drain output so the pipe buffers don't fill and stall the child.
        child.stdout.on('data', () => { /* ignore */ });
        child.stderr.on('data', () => { /* ignore */ });

        child.on('error', () => resolve(false));
        child.on('close', (code) => resolve(code === 0));
    });
}

/**
 * Check for firejail and, if it's missing, surface a warning to the user.
 * Non-blocking and best-effort: failures are swallowed so activation never breaks.
 */
export async function warnIfFirejailMissing(log?: { error(message: string, data?: unknown): void }): Promise<void> {
    try {
        if (await isFirejailInstalled()) {
            return;
        }
    } catch (err) {
        log?.error('Failed to detect firejail', err);
        return;
    }

    log?.error('firejail binary not found');
    void vscode.window.showWarningMessage(
        'firejail does not appear to be installed. Install it to create and open jails. ' +
        'If it is installed in a non-standard location, set "firejail.firejailPath".',
    );
}
