// src/lib/linux-sudoer.ts
import fs from 'fs';
import { SpawnOptions } from 'child_process';
import { normalize } from 'path';
import { exec, spawn, stat } from './utils';
import { Sudoer } from './base-sudoer';
import { SudoerOptions, CustomChildProcess, ExecResult, CustomExecOptions, CustomSpawnOptions } from './types';

export class SudoerUnix extends Sudoer {

    constructor(options: SudoerOptions = {}) {
        super(options);
        if (!this.options.name) { this.options.name = 'Electron'; }
    }

    async copy(source: string, target: string): Promise<ExecResult> {
        return new Promise((resolve, reject) => {
            source = this.escapeDoubleQuotes(normalize(source));
            target = this.escapeDoubleQuotes(normalize(target));
            exec(`/bin/cp -R -p "${source}" "${target}"`).then(resolve).catch(reject);
        });
    }

    async remove(target: string): Promise<ExecResult> {
        if (!target.startsWith(this.tmpdir)) {
            throw new Error(`Try to remove suspicious target: ${target}.`);
        }
        target = this.escapeDoubleQuotes(normalize(target));
        return exec(`rm -rf "${target}"`);
    }

    async reset(): Promise<ExecResult> {
        return exec('/usr/bin/sudo -k');
    }
}

export class SudoerLinux extends SudoerUnix {
    private binary: string | null;
    private readonly isNixOS: boolean;
    private readonly paths: string[];

    constructor(options: SudoerOptions = {}) {
        super(options);
        this.binary = null;
        this.isNixOS = this.checkIfNixOS();
        this.paths = this.getSystemPaths();
    }

    private checkIfNixOS(): boolean {
        try {
            const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
            return osRelease.includes('ID=nixos');
        } catch {
            return false;
        }
    }

    private getSystemPaths(): string[] {
        const paths = [
            '/run/wrappers/bin/pkexec',
            '/usr/bin/pkexec',
            '/usr/bin/gksudo'
        ];

        if (!this.isNixOS) {
            paths.push('./bin/gksudo');
        }

        return paths;
    }

    private getErrorMessage(): string {
        return this.isNixOS
            ? 'Could not find pkexec. ' +
            'Please ensure polkit is enabled in your NixOS configuration:\n\n' +
            'security.polkit.enable = true;\n' +
            'environment.systemPackages = [ pkgs.polkit ];\n\n' +
            'And rebuild with: sudo nixos-rebuild switch'
            : 'Could not find pkexec or gksudo';
    }

    private async findBinary(): Promise<string> {
        const pathChecks = await Promise.all(
            this.paths.map((path) => stat(path).then(() => path).catch(() => null))
        );

        const binary = pathChecks.find(path => path !== null);
        if (!binary) {
            throw new Error(this.getErrorMessage());
        }

        return binary;
    }

    private getCommandFlags(): string {
        if (!this.binary) {
            throw new Error('Binary path not initialized');
        }

        if (!this.isNixOS && /gksudo/i.test(this.binary)) {
            return [
                '--preserve-env',
                '--sudo-mode',
                `--description="${this.escapeDoubleQuotes(this.options.name || '')}"`,
            ].join(' ');
        }

        return '--disable-internal-agent';
    }

    private ensureDisplay(options: CustomSpawnOptions): CustomSpawnOptions { // <--- Changed to CustomSpawnOptions
        if (options.env && !options.env.DISPLAY) {
            return {
                ...options,
                env: { ...options.env, DISPLAY: ':0' }
            };
        }
        return options;
    }


    async exec(command: string, options: CustomExecOptions = {}): Promise<ExecResult> {
        if (!this.binary) {
            this.binary = await this.findBinary();
        }
        const updatedOptionsExec = this.ensureDisplayExec(options);
        const flags = this.getCommandFlags();
        const fullCommand = `${this.binary} ${flags} ${command}`;

        try {
            return await exec(fullCommand, updatedOptionsExec);
        } catch (error) {
            if (this.isNixOS && error instanceof Error && error.message.includes('must be setuid root')) {
                error.message += '\nOn NixOS, please enable polkit wrapper:\n\n' +
                    'security.wrappers.pkexec = {\n' +
                    '  owner = "root";\n' +
                    '  group = "root";\n' +
                    '  source = "${pkgs.polkit}/bin/pkexec";\n' +
                    '  setuid = true;\n' +
                    '};\n';
            }
            throw error;
        }
    }
    private ensureDisplayExec(options: CustomExecOptions): CustomExecOptions { // <--- Changed to CustomSpawnOptions
        if (options.env && !options.env.DISPLAY) {
            return {
                ...options,
                env: { ...options.env, DISPLAY: ':0' }
            };
        }
        return options;
    }


    async spawn(command: string, args: string[], options: CustomSpawnOptions = {}): Promise<CustomChildProcess> {
        if (!this.binary) {
            this.binary = await this.findBinary();
        }

        const updatedOptions = this.ensureDisplay(options);  // Now uses CustomSpawnOptions
        const sudoArgs = [this.getCommandFlags(), command, ...args];

        return spawn(this.binary, sudoArgs, updatedOptions);
    }
}