// src/lib/linux-sudoer.ts

import fs from 'fs';
import { exec, spawn, stat } from './utils';
import { Sudoer } from './base-sudoer';
import {
    SudoerOptions,
    CustomChildProcess,
    ExecResult,
    CustomExecOptions,
    CustomSpawnOptions
} from './types';

export class SudoerLinux extends Sudoer {
    private binary: string | null;
    private readonly isNixOS: boolean;
    private readonly paths: string[];

    constructor(options: SudoerOptions = {}) {
        super(options);
        this.binary = null;
        this.isNixOS = this.checkIfNixOS();
        this.paths = this.getSystemPaths();
    }

    // For testing purposes
    public setBinary(path: string): void {
        this.binary = path;
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

    private async validatePolkitInstallation(): Promise<void> {
        if (!this.isNixOS) return;

        try {
            await stat('/run/wrappers/bin/pkexec');
        } catch (error) {
            throw new Error(
                'Polkit is not properly configured on your NixOS system.\n' +
                'Please ensure the following configuration is present:\n\n' +
                'security.polkit.enable = true;\n' +
                'security.wrappers.pkexec = {\n' +
                '  owner = "root";\n' +
                '  group = "root";\n' +
                '  source = "${pkgs.polkit}/bin/pkexec";\n' +
                '  setuid = true;\n' +
                '};\n' +
                'environment.systemPackages = [ pkgs.polkit ];\n\n' +
                'Then rebuild with: sudo nixos-rebuild switch'
            );
        }
    }

    private async findBinary(): Promise<string> {
        if (this.isNixOS) {
            await this.validatePolkitInstallation();
        }

        const pathChecks = await Promise.all(
            this.paths.map(async (path) => {
                try {
                    await stat(path);
                    return path;
                } catch {
                    return null;
                }
            })
        );

        const binary = pathChecks.find(path => path !== null);
        if (!binary) {
            throw new Error(
                this.isNixOS
                    ? 'Could not find pkexec. Please ensure polkit is properly installed.'
                    : 'Could not find pkexec or gksudo. Please install either polkit or gksudo.'
            );
        }

        return binary;
    }

    private getCommandFlags(binary: string): string {
        if (!this.isNixOS && /gksudo/i.test(binary)) {
            return [
                '--preserve-env',
                '--sudo-mode',
                `--description="${this.escapeDoubleQuotes(this.options.name)}"`
            ].join(' ');
        }

        return '--disable-internal-agent';
    }

    private ensureDisplayExec(options: CustomExecOptions): CustomExecOptions {
        if (!options.env?.DISPLAY) {
            return {
                ...options,
                env: {
                    ...options.env,
                    DISPLAY: ':0'
                }
            };
        }
        return options;
    }

    private ensureDisplaySpawn(options: CustomSpawnOptions): CustomSpawnOptions {
        if (!options.env?.DISPLAY) {
            return {
                ...options,
                env: {
                    ...options.env,
                    DISPLAY: ':0'
                }
            };
        }
        return options;
    }

    async exec(command: string, options: CustomExecOptions = {}): Promise<ExecResult> {
        if (!this.binary) {
            this.binary = await this.findBinary();
        }

        const updatedOptions = this.ensureDisplayExec(options);
        const flags = this.getCommandFlags(this.binary);
        const fullCommand = `${this.binary} ${flags} ${command}`;

        try {
            return await exec(fullCommand, updatedOptions);
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('must be setuid root')) {
                    throw new Error(
                        'Elevation binary is not properly configured with setuid permissions.\n' +
                        (this.isNixOS
                            ? 'Please check your NixOS polkit configuration.'
                            : 'Please check your polkit or gksudo installation.')
                    );
                }
                if (error.message.includes('permission denied')) {
                    throw new Error(
                        'Permission denied. Please ensure you have the necessary permissions\n' +
                        'and that polkit/gksudo is properly configured.'
                    );
                }
            }
            throw error;
        }
    }

    async spawn(command: string, args: string[], options: CustomSpawnOptions = {}): Promise<CustomChildProcess> {
        if (!this.binary) {
            this.binary = await this.findBinary();
        }

        const updatedOptions = this.ensureDisplaySpawn(options);
        const flags = this.getCommandFlags(this.binary);
        const sudoArgs = [flags, command, ...args];

        try {
            return spawn(this.binary, sudoArgs, updatedOptions);
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('permission denied')) {
                    throw new Error(
                        'Permission denied while spawning elevated process.\n' +
                        'Please check your system configuration and permissions.'
                    );
                }
            }
            throw error;
        }
    }
}