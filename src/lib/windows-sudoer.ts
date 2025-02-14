// src/lib/windows-sudoer.ts

import { watchFile, unwatchFile, unlink, createReadStream, createWriteStream } from 'fs';
import { SpawnOptions } from 'child_process';
import { Sudoer } from './base-sudoer';
import { exec, spawn, writeFile, readFile, stat } from './utils';
import { SudoerOptions, CustomChildProcess, BatchFiles, ExecResult, CustomExecOptions, CustomSpawnOptions } from './types';

export class SudoerWin32 extends Sudoer {
    private bundled: string;
    private binary: string | null;

    constructor(options: SudoerOptions = {}) {
        super(options);
        this.bundled = 'src\\bin\\elevate.exe';
        this.binary = null;
    }

    private async writeBatch(command: string, args: string[], options: SpawnOptions): Promise<BatchFiles> {
        const tmpDir = (await exec('echo %temp%'))
            .stdout.toString()
            .replace(/\r\n$/, '');
        const tmpBatchFile = `${tmpDir}\\batch-${Math.random()}.bat`;
        const tmpOutputFile = `${tmpDir}\\output-${Math.random()}`;
        const env = this.joinEnv(options);
        let batch = `setlocal enabledelayedexpansion\r\n`;

        if (env.length) {
            batch += `set ${env.join('\r\nset ')}\r\n`;
        }
        if (args && args.length) {
            batch += `${command} ${args.join(' ')}`;
        } else {
            batch += command;
        }
        await writeFile(tmpBatchFile, `${batch} > ${tmpOutputFile} 2>&1`);
        await writeFile(tmpOutputFile, '');
        return {
            batch: tmpBatchFile,
            output: tmpOutputFile
        };
    }

    private async watchOutput(cp: CustomChildProcess): Promise<CustomChildProcess> {
        let lastPosition = 0;
        const output = await readFile(cp.files.output);
        cp.stdout.emit('data', output);

        watchFile(
            cp.files.output,
            { persistent: true, interval: 1 },
            () => {
                const stream = createReadStream(
                    cp.files.output,
                    { start: lastPosition }
                );
                let size = 0;
                stream.on('data', (data) => {
                    size += data.length;
                    if (cp) { cp.stdout.emit('data', data); }
                });
                stream.on('close', () => {
                    lastPosition += size;
                });
            }
        );

        lastPosition = output.length;
        cp.on('exit', () => {
            this.clean(cp);
        });

        return cp;
    }

    private async prepare(): Promise<string> {
        if (this.binary) { return this.binary; }

        const target = `${this.tmpdir}\\elevate.exe`;
        try {
            await stat(target);
            this.binary = target;
            return this.binary;
        } catch {
            return new Promise((resolve, reject) => {
                const copied = createWriteStream(target);
                createReadStream(this.bundled).pipe(copied);
                copied.on('close', () => {
                    this.binary = target;
                    resolve(this.binary);
                });
                copied.on('error', reject);
            });
        }
    }

    async exec(command: string, options: CustomExecOptions = {}): Promise<ExecResult> { // Pass CustomExecOptions
        await this.prepare();
        const files = await this.writeBatch(command, [], options);  // Keep options, as it might contain env vars
        const fullCommand = `${this.encloseDoubleQuotes(this.binary)} -wait ${files.batch}`;
        return exec(fullCommand, options); // options is already correct type
    }

    async spawn(command: string, args: string[], options: CustomSpawnOptions = {}): Promise<CustomChildProcess> {
        const files = await this.writeBatch(command, args, options);
        const sudoArgs = ['-wait', files.batch];
        await this.prepare();

        const cp = spawn(this.binary, sudoArgs, options) as CustomChildProcess;
        cp.files = files;
        await this.watchOutput(cp);
        return cp;
    }


    private clean(cp: CustomChildProcess): void {
        if (cp.files) {
            unwatchFile(cp.files.output);
            unlink(cp.files.batch, () => {});
            unlink(cp.files.output, () => {});
        }
    }
}