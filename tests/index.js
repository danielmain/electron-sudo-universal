import chai from 'chai';
import dirtyChai from 'dirty-chai';
import fs from 'fs';
import Sudoer from '../dist/index';

let {expect} = chai,
    {platform} = process,
    options = {
        name: 'electron sudo application'
    },
    sudoer = new Sudoer(options);

// Detect if we're running on NixOS
const isNixOS = (() => {
    try {
        const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
        return osRelease.includes('ID=nixos');
    } catch (err) {
        return false;
    }
})();

chai.use(dirtyChai);

describe(`electron-sudo :: ${platform}`, function () {
    this.timeout(100000);
    this.slow(100000);

    if (platform === 'linux') {
        if (isNixOS) {
            describe('[pkexec: exec] with ENV vars', async function () {
                it('should find pkexec in NixOS paths', async function () {
                    const nixPaths = [
                        '/run/wrappers/bin/pkexec'
                    ];
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

                it('should execute commands with pkexec', async function () {
                    // On NixOS, use printenv from its actual path
                    const result = await sudoer.exec('/run/current-system/sw/bin/id -u');
                    expect(result.stdout.trim()).to.equal('0');
                });
            });

            describe('[pkexec: spawn] with ENV vars', async function () {
                it('should execute commands with pkexec', function (done) {
                    (async () => {
                        try {
                            const cp = await sudoer.spawn('/run/current-system/sw/bin/id', ['-u']);
                            let output = '';

                            cp.stdout.on('data', (data) => {
                                output += data.toString();
                            });

                            cp.on('close', (code) => {
                                try {
                                    expect(code).to.equal(0);
                                    expect(output.trim()).to.equal('0');
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
        } else {
            // Original Linux tests for non-NixOS systems
            describe('[gksudo: exec] with ENV vars', async function () {
                it('should available environment variables', async function () {
                    sudoer.binary = './dist/bin/gksudo';
                    let result = await sudoer.exec('echo $PARAM', {env: {PARAM: 'VALUE'}});
                    expect(result.stdout.trim()).to.be.equals('VALUE');
                });
            });

            describe('[pkexec: exec] with ENV vars', async function () {
                it('should available environment variables', async function () {
                    sudoer.binary = '/usr/bin/pkexec';
                    let result = await sudoer.exec('echo $PARAM', {env: {PARAM: 'VALUE'}});
                    expect(result.stdout.trim()).to.be.equals('VALUE');
                });
            });

            describe('[gksudo: spawn] with ENV vars', async function () {
                it('should available environment variables', function (done) {
                    sudoer.binary = './dist/bin/gksudo';
                    sudoer.spawn('echo', ['$PARAM'], {env: {PARAM: 'VALUE'}})
                        .then((cp) => {
                            cp.on('close', () => {
                                expect(cp.output.stdout.toString().trim()).to.be.equals('VALUE');
                                expect(cp.pid).to.be.a('number');
                                done();
                            });
                        })
                        .catch(done);
                });
            });

            describe('[pkexec: spawn] with ENV vars', async function () {
                it('should available environment variables', function (done) {
                    sudoer.binary = '/usr/bin/pkexec';
                    sudoer.spawn('echo', ['$PARAM'], {env: {PARAM: 'VALUE'}})
                        .then((cp) => {
                            cp.on('close', () => {
                                expect(cp.output.stdout.toString().trim()).to.be.equals('VALUE');
                                expect(cp.pid).to.be.a('number');
                                done();
                            });
                        })
                        .catch(done);
                });
            });
        }
    }
});