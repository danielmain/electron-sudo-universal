import {expect} from "chai";
import { exec, spawn } from '../src/lib/utils';

describe('Utilities', () => {
    describe('exec', () => {
        it('should execute commands and return output', async () => {
            const result = await exec('echo test');
            expect(result.stdout.toString().trim()).to.equal('test');
        });

        it('should handle command errors', async () => {
            try {
                await exec('nonexistent-command');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).to.be.an('error');
            }
        });
    });

    describe('spawn', () => {
        it('should spawn processes and capture output', async () => {
            const cp = spawn('echo', ['test']);

            let output = '';
            cp.stdout.on('data', (data) => {
                output += data.toString();
            });

            await new Promise<void>((resolve) => {
                cp.on('close', (code) => {
                    expect(code).to.equal(0);
                    expect(output.trim()).to.equal('test');
                    resolve();
                });
            });
        });
    });
});