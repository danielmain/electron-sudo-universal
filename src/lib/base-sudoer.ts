import { tmpdir } from 'os';
import { createHash } from 'crypto';
import { SudoerOptions, CustomChildProcess } from './types';

const { platform } = process;

export abstract class Sudoer {
    protected platform: string;
    protected options: SudoerOptions;
    protected cp: CustomChildProcess | null;
    protected tmpdir: string;

    constructor(options: SudoerOptions) {
        this.platform = platform;
        this.options = options;
        this.cp = null;
        this.tmpdir = tmpdir();
    }

    protected hash(buffer?: Buffer): string {
        const hash = createHash('sha256');
        hash.update('electron-sudo');
        hash.update(this.options.name || '');
        hash.update(buffer || Buffer.alloc(0));
        return hash.digest('hex').slice(-32);
    }

    protected joinEnv(options: { env?: { [key: string]: string } }): string[] {
        const { env } = options;
        const spreaded: string[] = [];
        if (env && typeof env == 'object') {
            for (const key in env) {
                spreaded.push(key.concat('=', env[key]));
            }
        }
        return spreaded;
    }

    public escapeDoubleQuotes(string: string): string {
        return string.replace(/"/g, '\\"');
    }

    protected encloseDoubleQuotes(string: string): string {
        return string.replace(/(.+)/g, '"$1"');
    }

    protected kill(pid?: number): void {
        if (!pid) {
            return;
        } else {
            return;
        }
    }
}