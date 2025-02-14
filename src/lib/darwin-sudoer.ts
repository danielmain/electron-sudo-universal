// src/lib/darwin-sudoer.ts
import { join, dirname, normalize } from 'path';
import { readFile, exec, spawn, mkdir } from './utils';
// import { BaseSudoer, SudoerOptions, CommonOptions, CustomChildProcess, ExecResult } from './types'; // WRONG
import { Sudoer as BaseSudoer } from './base-sudoer';  // Corrected import
import { SudoerOptions, CustomChildProcess, ExecResult, CustomExecOptions, CustomSpawnOptions } from './types';


const { env } = process;

export class SudoerDarwin extends BaseSudoer {
    private up: boolean;

    constructor(options: SudoerOptions = {}) {
        super(options);
        if (options.icns && typeof options.icns !== 'string') {
            throw new Error('options.icns must be a string if provided.');
        } else if (options.icns && options.icns.trim().length === 0) {
            throw new Error('options.icns must be a non-empty string if provided.');
        }
        this.up = false;
    }

    private isValidName(name: string): boolean {
        return /^[a-z0-9 ]+$/i.test(name) && name.trim().length > 0 && name.length < 70;
    }


    async exec(command: string, options: CustomExecOptions = {}): Promise<ExecResult> {
        const env = this.joinEnv(options);
        const sudoCommand = ['/usr/bin/sudo -n', env.join(' '), '-s', command].join(' ');
        let result: ExecResult;

        try {
            await this.reset();
            result = await exec(sudoCommand, options);
            return result;
        } catch (err) {
            await this.prompt();
            result = await exec(sudoCommand, options);
            return result;
        }
    }

    async spawn(command: string, args: string[], options: CustomSpawnOptions = {}): Promise<CustomChildProcess> {
        const bin = '/usr/bin/sudo';

        await this.reset();
        await this.prompt();
        const cp: CustomChildProcess = spawn(bin, ['-n', '-s', '-E', [command, ...args].join(' ')], options);
        cp.on('error', async (err) => {
            throw err
        });
        this.cp = cp;
        return cp;
    }

    private async reset(): Promise<ExecResult> {
        return exec('/usr/bin/sudo -k');
    }

    private async prompt(): Promise<string> {
        if (!this.tmpdir) {
            throw new Error('Requires os.tmpdir() to be defined.');
        }
        if (!env.USER) {
            throw new Error('Requires env[\'USER\'] to be defined.');
        }

        this.up = true;
        const icon = await this.readIcns();
        const hash = this.escapeDoubleQuotes(icon.toString('hex'));
        const source = join(`${dirname(__filename)}/bin`, 'applet.app');
        const target = join(this.tmpdir, hash, `${this.options.name}.app`);


        try{
            await mkdir(dirname(target));
        } catch(err: any) {
            if (err.code !== 'EEXIST'){throw err;}
        }


        await this.copy(source, target);
        await this.icon(target);
        await this.propertyList(target);
        await this.open(target);
        await this.remove(target);

        return hash;
    }

    private async readIcns(icnsPath?: string): Promise<Buffer> {
        if (!icnsPath || this.platform !== 'darwin') {
            return Buffer.alloc(0);
        }
        return await readFile(icnsPath);
    }

    private async copy(source: string, target: string): Promise<ExecResult> {
        source = this.escapeDoubleQuotes(normalize(source));
        target = this.escapeDoubleQuotes(normalize(target));
        return exec(`/bin/cp -R -p "${source}" "${target}"`);
    }


    private async remove(target: string): Promise<ExecResult> {
        if (!target.startsWith(this.tmpdir)) {
            throw new Error(`Try to remove suspicious target: ${target}.`);
        }
        target = this.escapeDoubleQuotes(normalize(target));
        return exec(`rm -rf "${target}"`);
    }

    private async icon(target: string): Promise<ExecResult | void> {
        if (!this.options.icns) { return; }
        return this.copy(
            this.options.icns,
            join(target, 'Contents', 'Resources', 'applet.icns')
        );
    }

    private async open(target: string): Promise<ExecResult> {
        target = this.escapeDoubleQuotes(normalize(target));
        return exec(`open -n -W "${target}"`);
    }

    private async propertyList(target: string): Promise<ExecResult> {
        const path = this.escapeDoubleQuotes(join(target, 'Contents', 'Info.plist'));
        const key = this.escapeDoubleQuotes('CFBundleName');
        const value = `${this.options.name} Password Prompt`;

        if (/'/.test(value)) {
            throw new Error('Value should not contain single quotes.');
        }
        return exec(`defaults write "${path}" "${key}" '${value}'`);
    }
}