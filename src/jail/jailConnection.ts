import * as cp from 'child_process';
import * as vscode from 'vscode';
import { JailConfiguration, buildFirejailArgs } from './jailConfig';

/**
 * Local replacement for SSHConnection. Instead of opening an SSH channel,
 * it runs commands inside a firejail sandbox via `firejail <jailArgs> bash -lc '<cmd>'`.
 *
 * Only the surface consumed by installCodeServer (exec / execPartial) is
 * implemented — there are no tunnels, SOCKS, or auth: the VSCode server
 * started inside the jail listens on 127.0.0.1:<port>, which the resolver
 * connects to directly.
 */
export default class JailConnection {

    private readonly firejailPath: string;
    private readonly jailArgs: string[];

    constructor(jail: JailConfiguration) {
        this.firejailPath = vscode.workspace.getConfiguration('firejail').get<string>('firejailPath', 'firejail') || 'firejail';
        this.jailArgs = buildFirejailArgs(jail);
    }

    /**
     * Run a command inside the jail and resolve once the process closes.
     * `onData` (if given) receives each chunk of stdout/stderr as it arrives,
     * letting callers stream progress live instead of waiting for close.
     */
    exec(cmd: string, onData?: (channel: 'stdout' | 'stderr', chunk: string) => void): Promise<{ stdout: string; stderr: string }> {
        return this.spawn(cmd, undefined, onData);
    }

    /**
     * Run a command inside the jail, resolving early once `tester` returns true
     * for the accumulated output (the process may keep running in the background,
     * e.g. the long-lived server process).
     */
    execPartial(cmd: string, tester: (stdout: string, stderr: string) => boolean, onData?: (channel: 'stdout' | 'stderr', chunk: string) => void): Promise<{ stdout: string; stderr: string }> {
        return this.spawn(cmd, tester, onData);
    }

    private spawn(cmd: string, tester?: (stdout: string, stderr: string) => boolean, onData?: (channel: 'stdout' | 'stderr', chunk: string) => void): Promise<{ stdout: string; stderr: string }> {
        // Pass the script via stdin rather than as an argv string. firejail caps
        // individual argv entries (arg-max-len, ~4128 bytes), and the server
        // install script exceeds that. `bash -ls` reads the script from stdin.
        const args = [...this.jailArgs, 'bash', '-ls'];
        return new Promise((resolve, reject) => {
            let child: cp.ChildProcessWithoutNullStreams;
            try {
                child = cp.spawn(this.firejailPath, args);
            } catch (err) {
                return reject(err);
            }

            child.stdin.write(cmd);
            child.stdin.end();

            let stdout = '';
            let stderr = '';
            let resolved = false;

            const tryResolve = () => {
                if (tester && !resolved && tester(stdout, stderr)) {
                    resolved = true;
                    // The script backgrounds a long-lived server, so the child
                    // (firejail) won't close until the server exits. Detach our
                    // listeners and unref so we stop accumulating output and stop
                    // pinning the event loop, WITHOUT killing the server.
                    child.stdout.removeAllListeners('data');
                    child.stderr.removeAllListeners('data');
                    child.stdout.resume();
                    child.stderr.resume();
                    child.unref();
                    resolve({ stdout, stderr });
                }
            };

            child.stdout.on('data', (data: Buffer | string) => {
                const chunk = data.toString();
                stdout += chunk;
                onData?.('stdout', chunk);
                tryResolve();
            });
            child.stderr.on('data', (data: Buffer | string) => {
                const chunk = data.toString();
                stderr += chunk;
                onData?.('stderr', chunk);
                tryResolve();
            });
            child.on('error', (err) => {
                if (!resolved) {
                    resolved = true;
                    reject(err);
                }
            });
            child.on('close', () => {
                if (!resolved) {
                    resolved = true;
                    resolve({ stdout, stderr });
                }
            });
        });
    }
}
