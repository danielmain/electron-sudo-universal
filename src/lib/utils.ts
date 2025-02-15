// src/lib/utils.ts
import fs from 'fs';
import child from 'child_process';
import { ExecResult, CustomChildProcess, StatResult, PromisifiedFunction, CustomExecOptions, CustomSpawnOptions } from './types';

function promisify<T>(fn: Function): PromisifiedFunction<T> {
    return function(...args: any[]): Promise<T> {
        return new Promise((resolve, reject) => {
            fn(...args, function (err: Error | null, ...results: any[]) {
                if (err) {
                    reject(err);
                } else {
                    // If there's only one result, return it directly
                    // Otherwise, return the array of results
                    resolve(results.length === 1 ? results[0] : results as T);
                }
            });
        });
    };
}

export async function exec(cmd: string, options: CustomExecOptions = {}): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
        child.exec(cmd, options, (err, stdout, stderr) => {
            if (err) {
                // Enhance error with command information
                const enhancedError = new Error(`Command failed: ${cmd}\n${err.message}`);
                (enhancedError as any).code = err.code;
                (enhancedError as any).cmd = cmd;
                return reject(enhancedError);
            }
            return resolve({ stdout, stderr });
        });
    });
}

export function spawn(cmd: string, args: string[], options: CustomSpawnOptions = {}): CustomChildProcess {
    const cp = child.spawn(cmd, args, { ...options, shell: true }) as CustomChildProcess;

    // Initialize output buffers
    cp.output = {
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0)
    };

    // Handle stdout
    cp.stdout?.on('data', (data: Buffer | string) => {
        if (cp.output) {
            cp.output.stdout = Buffer.concat([
                cp.output.stdout,
                Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8')
            ]);
        }
    });

    // Handle stderr
    cp.stderr?.on('data', (data: Buffer | string) => {
        if (cp.output) {
            cp.output.stderr = Buffer.concat([
                cp.output.stderr,
                Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8')
            ]);
        }
    });

    // Add error handler
    cp.on('error', (err: Error) => {
        const enhancedError = new Error(`Spawn failed: ${cmd}\n${err.message}`);
        (enhancedError as any).code = (err as any).code;
        (enhancedError as any).cmd = cmd;
        cp.emit('error', enhancedError);
    });

    return cp;
}

export async function stat(target: string): Promise<StatResult> {
    const _stat = promisify<fs.Stats>(fs.stat);
    try {
        return await _stat(target);
    } catch (err) {
        return null;
    }
}

// File operation utilities with proper error handling
export const open: PromisifiedFunction<number> = promisify(fs.open);
export const mkdir: PromisifiedFunction<void> = promisify(fs.mkdir);
export const readFile: PromisifiedFunction<Buffer> = promisify(fs.readFile);
export const writeFile: PromisifiedFunction<void> = promisify(fs.writeFile);