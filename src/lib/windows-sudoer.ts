// src/lib/windows-sudoer.ts

import { watchFile, unwatchFile, unlink, createReadStream, createWriteStream } from 'fs';
import { join } from 'path';
import { Sudoer } from './base-sudoer';
import { exec, spawn, writeFile, readFile, stat } from './utils';
import {
    SudoerOptions,
    CustomChildProcess,
    WindowsChildProcess,
    ExecResult,
    CustomExecOptions,
    CustomSpawnOptions,
    BatchFiles
} from './types';

export class SudoerWin32 extends Sudoer {
    private readonly bundled: string;
    private binary: string | null;

    constructor(options: SudoerOptions = {}) {
        super(options);
        this.bundled = 'src\\bin\\elevate.exe';
        this.binary = null;
    }

    private async writeBatch(command: string, args: string[], options: CustomSpawnOptions): Promise<BatchFiles> {
        const { stdout } = await exec('echo %temp%');
        const tmpDir = stdout.toString().replace(/\r\n$/, '');
        const tmpBatchFile = join(tmpDir, `batch-${Math.random()}.bat`);
        const tmpOutputFile = join(tmpDir, `output-${Math.random()}`);

        const env = this.joinEnv(options);
        let batch = 'setlocal enabledelayedexpansion\r\n';

        if (env.length > 0) {
            batch += `${env.join('\r\nset ')}\r\n`;
        }

        batch += args && args.length > 0
            ? `${command} ${args.join(' ')}`
            : command;

        await writeFile(tmpBatchFile, `${batch} > ${tmpOutputFile} 2>&1`);
        await writeFile(tmpOutputFile, '');

        return {
            batch: tmpBatchFile,
            output: tmpOutputFile
        };
    }

    private async watchOutput(cp: WindowsChildProcess): Promise<WindowsChildProcess> {
        let lastPosition = 0;
        const output = await readFile(cp.files.output);
        cp.stdout.emit('data', output);

        watchFile(
            cp.files.output,
            { persistent: true, interval: 1 },
            async () => {
                const stream = createReadStream(cp.files.output, { start: lastPosition });
                let size = 0;

                stream.on('data', (data: Buffer) => {
                    size += data.length;
                    cp.stdout.emit('data', data);
                });

                stream.on('end', () => {
                    lastPosition += size;
                });
            }
        );

        lastPosition = output.length;
        cp.last = lastPosition;

        cp.on('exit', () => {
            this.clean(cp);
        });

        return cp;
    }

    private async prepare(): Promise<string> {
        if (this.binary) {
            return this.binary;
        }

        const target = join(this.tmpdir, 'elevate.exe');

        try {
            await stat(target);
            this.binary = target;
            return target;
        } catch {
            return new Promise<string>((resolve, reject) => {
                const writeStream = createWriteStream(target);
                const readStream = createReadStream(this.bundled);

                writeStream.on('close', () => {
                    this.binary = target;
                    resolve(target);
                });

                writeStream.on('error', reject);
                readStream.pipe(writeStream);
            });
        }
    }

    async exec(command: string, options: CustomExecOptions = {}): Promise<ExecResult> {
        const binary = await this.prepare();
        const files = await this.writeBatch(command, [], options);
        const fullCommand = `${this.encloseDoubleQuotes(binary)} -wait ${files.batch}`;

        try {
            return await exec(fullCommand, options);
        } finally {
            this.clean({ files } as WindowsChildProcess);
        }
    }

    async spawn(command: string, args: string[], options: CustomSpawnOptions = {}): Promise<CustomChildProcess> {
        const binary = await this.prepare();
        const files = await this.writeBatch(command, args, options);
        const sudoArgs = ['-wait', files.batch];

        const cp = spawn(binary, sudoArgs, options) as WindowsChildProcess;
        cp.files = files;

        return this.watchOutput(cp);
    }

    private clean(cp: WindowsChildProcess): void {
        unwatchFile(cp.files.output);
        unlink(cp.files.batch, () => {});
        unlink(cp.files.output, () => {});
    }
}