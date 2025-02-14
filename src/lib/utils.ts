// src/lib/utils.ts
import fs from 'fs';
import child from 'child_process';
import { ExecResult, CustomChildProcess, CommonOptions, StatResult, PromisifiedFunction, CustomExecOptions, CustomSpawnOptions } from './types';

function promisify<T>(fn: Function): PromisifiedFunction<T> {
    return function(...args: any[]): Promise<T> {
        return new Promise((resolve, reject) => {
            fn(...args, function (...callbackArgs: any[]) {
                if (callbackArgs[0] instanceof Error) {
                    reject(callbackArgs[0]);
                } else {
                    resolve(callbackArgs[1]); // Corrected line
                }
            });
        });
    };
}

export async function exec(cmd: string, options: CustomExecOptions = {}): Promise<ExecResult> { //Use Custom Exec Options
    return new Promise((resolve, reject) => {
        child.exec(cmd, options, (err, stdout, stderr) => {
            if (err) { return reject(err); }
            return resolve({ stdout, stderr });
        });
    });
}

export function spawn(cmd: string, args: string[], options: CustomSpawnOptions = {}): CustomChildProcess { // Use Custom Spawn Options
    const cp = child.spawn(cmd, args, options) as CustomChildProcess;
    cp.output = {
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0)
    };

    cp.stdout?.on('data', (data: Buffer | string) => {
        if (cp.output) {
            cp.output.stdout = Buffer.isBuffer(data)
                ? Buffer.concat([cp.output.stdout, data])
                : Buffer.concat([cp.output.stdout, Buffer.from(String(data), 'utf8')]);
        }
    });

    cp.stderr?.on('data', (data: Buffer | string) => {
        if (cp.output) {
            cp.output.stderr = Buffer.isBuffer(data)
                ? Buffer.concat([cp.output.stderr, data])
                : Buffer.concat([cp.output.stderr, Buffer.from(String(data), 'utf8')]);
        }
    });

    return cp;
}

export async function stat(target: string): Promise<StatResult> {
    const _stat = promisify<fs.Stats>(fs.stat);
    try{
        const fileStat = await _stat(target);
        return fileStat
    } catch (err) {
        return null;
    }
}

export const open: PromisifiedFunction<number> = promisify(fs.open);
export const mkdir: PromisifiedFunction<void> = promisify(fs.mkdir);
export const readFile: PromisifiedFunction<Buffer> = promisify(fs.readFile);
export const writeFile: PromisifiedFunction<void> = promisify(fs.writeFile);