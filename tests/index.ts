import chai from 'chai';
import dirtyChai from 'dirty-chai';
import { platform } from 'process';
import { SudoerDarwin } from '../src/lib/darwin-sudoer';
import { SudoerLinux } from '../src/lib/linux-sudoer';
import { SudoerWin32 } from '../src/lib/windows-sudoer';
import fs from 'fs';
import { WindowsChildProcess } from "../src/lib/types";

const { expect } = chai;
chai.use(dirtyChai);

const options = {
    name: 'electron sudo application'
};

describe('electron-sudo', function() {
    this.timeout(100000);
    this.slow(100000);

    const isNixOS = (() => {
        try {
            const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
            return osRelease.includes('ID=nixos');
        } catch (err) {
            return false;
        }
    })();

    describe('Base functionality', () => {
        let sudoer;

        before(() => {
            switch (platform) {
                case 'darwin':
                    sudoer = new SudoerDarwin(options);
                    break;
                case 'linux':
                    sudoer = new SudoerLinux(options);
                    break;
                case 'win32':
                    sudoer = new SudoerWin32(options);
                    break;
                default:
                    throw new Error(`Unsupported platform: ${platform}`);
            }
        });

        it('should initialize with default options', () => {
            expect(sudoer.options.name).to.equal('electron sudo application');
            expect(sudoer.options.icns).to.equal('');
            expect(sudoer.options.env).to.deep.equal({});
        });

        it('should have required methods', () => {
            expect(sudoer.exec).to.be.a('function');
            expect(sudoer.spawn).to.be.a('function');
            expect(sudoer.cleanup).to.be.a('function');
        });
    });

    if (platform === 'linux') {
        if (isNixOS) {
            describe('NixOS specific tests', () => {
                let sudoer: SudoerLinux;

                before(() => {
                    sudoer = new SudoerLinux(options);
                });

                it('should detect NixOS', () => {
                    expect(sudoer['isNixOS']).to.be.true();
                });

                it('should find pkexec in NixOS paths', async () => {
                    const nixPaths = ['/run/wrappers/bin/pkexec'];
                    let pkexecExists = false;

                    for (const path of nixPaths) {
                        try {
                            await fs.promises.access(path);
                            pkexecExists = true;
                            break;
                        } catch (err) {
                            continue;
                        }
                    }
                    expect(pkexecExists).to.be.true('pkexec not found in NixOS paths');
                });

                describe('privileged operations', function() {
                    beforeEach(function() {
                        if (process.getuid() !== 0) {
                            this.skip();
                        }
                        try {
                            fs.accessSync('/run/wrappers/bin/pkexec');
                        } catch (err) {
                            this.skip();
                        }
                    });

                    it('should execute commands with pkexec', async function() {
                        const result = await sudoer.exec('whoami');
                        expect(result.stdout.toString().trim()).to.be.a('string');
                    });

                    it('should spawn processes with pkexec', function(done) {
                        (async () => {
                            try {
                                const cp = await sudoer.spawn('whoami', []);
                                let output = '';

                                cp.stdout.on('data', (data) => {
                                    output += data.toString();
                                });

                                cp.on('close', (code) => {
                                    try {
                                        expect(code).to.equal(0);
                                        expect(output.trim()).to.be.a('string');
                                        expect(cp.pid).to.be.a('number');
                                        done();
                                    } catch (err) {
                                        done(err);
                                    }
                                });
                            } catch (err) {
                                done(err);
                            }
                        })();
                    });
                });
            });
        } else {
            describe('Linux specific tests (non-NixOS)', () => {
                let sudoer: SudoerLinux;

                before(() => {
                    sudoer = new SudoerLinux(options);
                });

                it('should detect non-NixOS', () => {
                    expect(sudoer['isNixOS']).to.be.false();
                });

                describe('gksudo tests', () => {
                    beforeEach(function() {
                        try {
                            fs.accessSync('./dist/bin/gksudo');
                        } catch (err) {
                            this.skip();
                        }
                    });

                    it('should handle environment variables with gksudo', async () => {
                        sudoer.setBinary('./dist/bin/gksudo');
                        const result = await sudoer.exec('echo $PARAM', { env: { PARAM: 'VALUE' } });
                        expect(result.stdout.toString().trim()).to.equal('VALUE');
                    });
                });

                describe('pkexec tests', () => {
                    beforeEach(function() {
                        try {
                            fs.accessSync('/usr/bin/pkexec');
                        } catch (err) {
                            this.skip();
                        }
                    });

                    it('should handle environment variables with pkexec', async () => {
                        sudoer.setBinary('/usr/bin/pkexec');
                        const result = await sudoer.exec('echo $PARAM', { env: { PARAM: 'VALUE' } });
                        expect(result.stdout.toString().trim()).to.equal('VALUE');
                    });
                });
            });
        }
    }

    if (platform === 'win32') {
        describe('Windows specific tests', () => {
            let sudoer: SudoerWin32;

            before(() => {
                sudoer = new SudoerWin32(options);
            });

            it('should handle environment variables', async () => {
                const result = await sudoer.exec('echo %TEST_VAR%', { env: { TEST_VAR: 'TEST_VALUE' } });
                expect(result.stdout.toString().trim()).to.equal('TEST_VALUE');
            });

            it('should properly clean up temporary files', async () => {
                const cp = await sudoer.spawn('echo', ['test']) as WindowsChildProcess;
                let output = '';

                await new Promise<void>((resolve) => {
                    cp.stdout.on('data', (data) => {
                        output += data.toString();
                    });

                    cp.on('close', () => {
                        expect(output.trim()).to.equal('test');
                        expect(() => fs.accessSync(cp.files.batch)).to.throw();
                        expect(() => fs.accessSync(cp.files.output)).to.throw();
                        resolve();
                    });
                });
            });
        });
    }

    if (platform === 'darwin') {
        describe('macOS specific tests', () => {
            let sudoer: SudoerDarwin;

            before(() => {
                sudoer = new SudoerDarwin(options);
            });

            it('should validate icns option', () => {
                expect(() => new SudoerDarwin({ ...options, icns: 123 as any }))
                    .to.throw('options.icns must be a string if provided.');

                expect(() => new SudoerDarwin({ ...options, icns: '' }))
                    .to.throw('options.icns must be a non-empty string if provided.');
            });

            it('should handle environment variables', async () => {
                const result = await sudoer.exec('echo $TEST_VAR', { env: { TEST_VAR: 'TEST_VALUE' } });
                expect(result.stdout.toString().trim()).to.equal('TEST_VALUE');
            });
        });
    }
});