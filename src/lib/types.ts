// src/lib/types.ts
import { ChildProcess, SpawnOptions, ExecOptions } from 'child_process';
import { Stats } from 'fs';

export interface SudoerOptions {
    name?: string;
    icns?: string;
    env?: { [key: string]: string };
}

export interface ExecResult {
    stdout: string | Buffer;
    stderr: string | Buffer;
}

export interface BatchFiles {
    batch: string;
    output: string;
}

export interface CustomChildProcess extends ChildProcess {
    files?: BatchFiles;
    output?: {
        stdout: Buffer;
        stderr: Buffer;
    };
}

// Common options that work for both exec and spawn
export interface CommonOptions extends Omit<SpawnOptions, 'shell'>{
}

export interface CustomExecOptions extends CommonOptions, ExecOptions { // Add Custom Exec Options
    shell?: string;  // shell must be string or undefined for exec
}
export interface CustomSpawnOptions extends CommonOptions, SpawnOptions{
    shell?: string | boolean;
}

export type StatResult = Stats | null;

export type PromisifiedFunction<T> = (...args: any[]) => Promise<T>;