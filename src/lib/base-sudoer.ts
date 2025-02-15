import { tmpdir } from 'os';
import { createHash } from 'crypto';
import {
    SudoerOptions,
    CustomChildProcess,
    ExecResult,
    CustomExecOptions,
    CustomSpawnOptions,
    Platform
} from './types';

export abstract class Sudoer {
    protected readonly platform: Platform;
    protected readonly options: Required<SudoerOptions>;
    protected cp: CustomChildProcess | null;
    protected readonly tmpdir: string;

    private static defaultOptions: Required<SudoerOptions> = {
        name: 'Electron',
        icns: '',
        env: {}
    };

    constructor(options: SudoerOptions = {}) {
        const platform = process.platform;
        if (!this.isValidPlatform(platform)) {
            throw new Error(`Unsupported platform: ${platform}`);
        }

        this.platform = platform;
        this.options = { ...Sudoer.defaultOptions, ...options };
        this.cp = null;
        this.tmpdir = tmpdir();

        if (!this.tmpdir) {
            throw new Error('No temporary directory available');
        }
    }

    private isValidPlatform(platform: string): platform is Platform {
        return ['darwin', 'linux', 'win32'].includes(platform);
    }

    /**
     * Creates a hash for use in temporary file names and identifiers
     * @param buffer Optional buffer to include in hash calculation
     * @returns 32-character hexadecimal hash
     */
    protected hash(buffer?: Buffer): string {
        const hash = createHash('sha256');
        hash.update('electron-sudo');
        hash.update(this.options.name);
        hash.update(buffer || Buffer.alloc(0));
        return hash.digest('hex').slice(-32);
    }

    /**
     * Joins environment variables into an array of KEY=VALUE strings
     * @param options Options containing environment variables
     * @returns Array of environment variable strings
     */
    protected joinEnv(options: { env?: Record<string, string> }): string[] {
        const { env } = options;
        if (!env || typeof env !== 'object') {
            return [];
        }

        return Object.entries(env).map(([key, value]) =>
            `${this.escapeEnvVar(key)}=${this.escapeEnvVar(value)}`
        );
    }

    /**
     * Escapes special characters in environment variable values
     * @param value The value to escape
     * @returns Escaped string
     */
    private escapeEnvVar(value: string): string {
        return value.replace(/[\\"`$]/g, '\\$&');
    }

    /**
     * Escapes double quotes in a string
     * @param str String to escape
     * @returns Escaped string
     */
    public escapeDoubleQuotes(str: string): string {
        return str.replace(/"/g, '\\"');
    }

    /**
     * Encloses a string in double quotes
     * @param str String to enclose
     * @returns Quoted string
     */
    protected encloseDoubleQuotes(str: string): string {
        return `"${this.escapeDoubleQuotes(str)}"`;
    }

    /**
     * Kills a process by its process ID
     * @param pid Process ID to kill
     */
    protected kill(pid?: number): void {
        if (typeof pid === 'number' && pid > 0) {
            try {
                process.kill(pid);
            } catch (error) {
                // Process might already be dead, ignore error
            }
        }
    }

    /**
     * Cleanup resources when sudoer is no longer needed
     */
    public cleanup(): void {
        if (this.cp) {
            this.kill(this.cp.pid);
            this.cp = null;
        }
    }

    /**
     * Execute a command with elevated privileges
     * @param command Command to execute
     * @param options Execution options
     */
    abstract exec(command: string, options?: CustomExecOptions): Promise<ExecResult>;

    /**
     * Spawn a command with elevated privileges
     * @param command Command to spawn
     * @param args Command arguments
     * @param options Spawn options
     */
    abstract spawn(command: string, args: string[], options?: CustomSpawnOptions): Promise<CustomChildProcess>;
}