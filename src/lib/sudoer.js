import {tmpdir} from 'os';
import {watchFile, unwatchFile, unlink, createReadStream, createWriteStream} from 'fs';
import {normalize, join, dirname} from 'path';
import {createHash} from 'crypto';

import {readFile, writeFile, exec, spawn, mkdir, stat} from '~/lib/utils';

let {platform, env} = process;


class Sudoer {

    constructor(options) {
        this.platform = platform;
        this.options = options;
        this.cp = null;
        this.tmpdir = tmpdir();
    }

    hash(buffer) {
        let hash = createHash('sha256');
        hash.update('electron-sudo');
        hash.update(this.options.name || '');
        hash.update(buffer || new Buffer(0));
        return hash.digest('hex').slice(-32);
    }

    joinEnv(options) {
        let {env} = options,
            spreaded = [];
        if (env && typeof env == 'object') {
            for (let key in env) {
                spreaded.push(key.concat('=', env[key]));
            }
        }
        return spreaded;
    }

    escapeDoubleQuotes(string) {
        return string.replace(/"/g, '\\"');
    }

    encloseDoubleQuotes(string) {
        return string.replace(/(.+)/g, '"$1"');
    }

    kill(pid) {
        if (!pid) {
            return;
        } else {
            return;
        }
    }
}


class SudoerUnix extends Sudoer {

    constructor(options={}) {
        super(options);
        if (!this.options.name) { this.options.name = 'Electron'; }
    }

    async copy(source, target) {
        return new Promise(async (resolve, reject) => {
            source = this.escapeDoubleQuotes(normalize(source));
            target = this.escapeDoubleQuotes(normalize(target));
            try {
                let result = await exec(`/bin/cp -R -p "${source}" "${target}"`);
                resolve(result);
            }
            catch (err) {
                reject(err);
            }
        });
    }

    async remove(target) {
        let self = this;
        return new Promise(async (resolve, reject) => {
            if (!target.startsWith(self.tmpdir)) {
                throw new Error(`Try to remove suspicious target: ${target}.`);
            }
            target = this.escapeDoubleQuotes(normalize(target));
            try {
                let result = await exec(`rm -rf "${target}"`);
                resolve(result);
            }
            catch (err) {
                reject(err);
            }
        });
    }

    async reset() {
        await exec('/usr/bin/sudo -k');
    }
}


class SudoerDarwin extends SudoerUnix {

    constructor(options={}) {
        super(options);
        if (options.icns && typeof options.icns !== 'string') {
            throw new Error('options.icns must be a string if provided.');
        } else if (options.icns && options.icns.trim().length === 0) {
            throw new Error('options.icns must be a non-empty string if provided.');
        }
        this.up = false;
    }

    isValidName(name) {
        return /^[a-z0-9 ]+$/i.test(name) && name.trim().length > 0 && name.length < 70;
    }

    joinEnv(options) {
        let {env} = options,
            spreaded = [];
        if (env && typeof env == 'object') {
            for (let key in env) {
                spreaded.push(key.concat('=', env[key]));
            }
        }
        return spreaded;
    }

    async exec(command, options={}) {
        return new Promise(async (resolve, reject) => {
            let self = this,
                env = self.joinEnv(options),
                sudoCommand = ['/usr/bin/sudo -n', env.join(' '), '-s', command].join(' '),
                result;
            await self.reset();
            try {
                result = await exec(sudoCommand, options);
                resolve(result);
            } catch (err) {
                try {
                    // Prompt password
                    await self.prompt();
                    // Try once more
                    result = await exec(sudoCommand, options);
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            }
        });
    }

    async spawn(command, args, options={}) {
        return new Promise(async (resolve, reject) => {
            let self = this,
                bin = '/usr/bin/sudo',
                cp;
            await self.reset();
            // Prompt password
            await self.prompt();
            cp = spawn(bin, ['-n', '-s', '-E', [command, ...args].join(' ')], options);
            cp.on('error', async (err) => {
                reject(err);
            });
            self.cp = cp;
            resolve(cp);
        });
    }

    async prompt() {
        let self = this;
        return new Promise(async (resolve, reject) => {
            if (!self.tmpdir) {
                return reject(
                    new Error('Requires os.tmpdir() to be defined.')
                );
            }
            if (!env.USER) {
                return reject(
                    new Error('Requires env[\'USER\'] to be defined.')
                );
            }
            // Keep prompt in single instance
            self.up = true;
            // Read ICNS-icon and hash it
            let icon = await self.readIcns(),
                hash = self.hash(icon);
            // Copy applet to temporary directory
            let source = join(`${dirname(__filename)}/bin`, 'applet.app'),
                target = join(self.tmpdir, hash, `${self.options.name}.app`);
            try {
                await mkdir(dirname(target));
            } catch (err) {
                if (err.code !== 'EEXIST') { return reject(err); }
            }
            try {
                // Copy application to temporary directory
                await self.copy(source, target);
                // Create application icon from source
                await self.icon(target);
                // Create property list for application
                await self.propertyList(target);
                // Open UI dialog with password prompt
                await self.open(target);
                // Remove applet from temporary directory
                await self.remove(target);
            } catch (err) {
                return reject(err);
            }
            return resolve(hash);
        });
    }

    async icon(target) {
        let self = this;
        return new Promise(async (resolve, reject) => {
            if (!this.options.icns) { return resolve(); }
            let result = await self.copy(
                this.options.icns,
                join(target, 'Contents', 'Resources', 'applet.icns')
            );
            return resolve(result);
        });
    }

    async open(target) {
        let self = this;
        return new Promise(async (resolve, reject) => {
            target = self.escapeDoubleQuotes(normalize(target));
            try {
                let result = await exec(`open -n -W "${target}"`);
                return resolve(result);
            } catch (err) {
                return reject(err);
            }
        });
    }

    async readIcns(icnsPath) {
        return new Promise(async (resolve, reject) => {
            // ICNS is supported only on Mac.
            if (!icnsPath || platform !== 'darwin') {
                return resolve(new Buffer(0));
            }
            try {
                let data = await readFile(icnsPath);
                return resolve(data);
            } catch (err) {
                return reject(err);
            }
        });
    }

    async propertyList(target) {
        let self = this;
        return new Promise(async (resolve, reject) => {
            let path = self.escapeDoubleQuotes(join(target, 'Contents', 'Info.plist')),
                key = self.escapeDoubleQuotes('CFBundleName'),
                value = `${self.options.name} Password Prompt`;
            if (/'/.test(value)) {
                return reject(new Error('Value should not contain single quotes.'));
            }
            let result = await exec(`defaults write "${path}" "${key}" '${value}'`);
            return resolve(result);
        });
    }
}

class SudoerLinux extends SudoerUnix {
    constructor(options={}) {
        super(options);
        this.binary = null;

        // Detect if running on NixOS
        this.isNixOS = false;
        try {
            const fs = require('fs');
            const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
            this.isNixOS = osRelease.includes('ID=nixos');
        } catch (err) {
            // If we can't read the file, assume it's not NixOS
        }

        // NixOS-specific paths first, then fall back to standard paths
        this.paths = [
            // NixOS wrapper path (this is the correct setuid location)
            '/run/wrappers/bin/pkexec',
            // Standard Linux paths as fallback
            '/usr/bin/pkexec',
            '/usr/bin/gksudo'
        ];

        if (!this.isNixOS) {
            // Only add the bundled gksudo for non-NixOS systems
            this.paths.push('./bin/gksudo');
        }
    }

    async getBinary() {
        let availablePaths = await Promise.all(
            this.paths.map(async (path) => {
                try {
                    await stat(path);
                    return path;
                } catch (err) {
                    return null;
                }
            })
        );

        let binary = availablePaths.filter(v => v)[0];

        if (!binary) {
            if (this.isNixOS) {
                throw new Error(
                    'Could not find pkexec. ' +
                    'Please ensure polkit is enabled in your NixOS configuration:\n\n' +
                    'security.polkit.enable = true;\n' +
                    'environment.systemPackages = [ pkgs.polkit ];\n\n' +
                    'And rebuild with: sudo nixos-rebuild switch'
                );
            } else {
                throw new Error('Could not find pkexec or gksudo');
            }
        }

        return binary;
    }

    async exec(command, options={}) {
        return new Promise(async (resolve, reject) => {
            if (!this.binary) {
                this.binary = await this.getBinary();
            }

            if (options.env instanceof Object && !options.env.DISPLAY) {
                options.env = Object.assign(options.env, {DISPLAY: ':0'});
            }

            let flags = '--disable-internal-agent';

            // Only use gksudo-specific flags if we're actually using gksudo
            if (!this.isNixOS && /gksudo/i.test(this.binary)) {
                flags = '--preserve-env --sudo-mode ' +
                    `--description="${this.escapeDoubleQuotes(this.options.name)}"`;
            }

            const fullCommand = `${this.binary} ${flags} ${command}`;

            try {
                const result = await exec(fullCommand, options);
                resolve(result);
            } catch (err) {
                if (this.isNixOS && err.message.includes('must be setuid root')) {
                    err.message += '\nOn NixOS, please enable polkit wrapper:\n\n' +
                        'security.wrappers.pkexec = {\n' +
                        '  owner = "root";\n' +
                        '  group = "root";\n' +
                        '  source = "${pkgs.polkit}/bin/pkexec";\n' +
                        '  setuid = true;\n' +
                        '};\n';
                }
                reject(err);
            }
        });
    }

    async spawn(command, args, options={}) {
        if (!this.binary) {
            this.binary = await this.getBinary();
        }

        if (options.env instanceof Object && !options.env.DISPLAY) {
            options.env = Object.assign(options.env, {DISPLAY: ':0'});
        }

        let sudoArgs = ['--disable-internal-agent'];

        // Only use gksudo-specific args if we're actually using gksudo
        if (!this.isNixOS && /gksudo/i.test(this.binary)) {
            sudoArgs = [
                '--preserve-env',
                '--sudo-mode',
                `--description="${this.escapeDoubleQuotes(this.options.name)}"`
            ];
        }

        // Add the command and its args
        sudoArgs.push(command);
        if (Array.isArray(args)) {
            sudoArgs.push(...args);
        }

        return spawn(this.binary, sudoArgs, options);
    }
}

class SudoerWin32 extends Sudoer {

    constructor(options={}) {
        super(options);
        this.bundled = 'src\\bin\\elevate.exe';
        this.binary = null;
    }

    async writeBatch(command, args, options) {
        let tmpDir = (await exec('echo %temp%'))
                .stdout.toString()
                .replace(/\r\n$/, ''),
            tmpBatchFile = `${tmpDir}\\batch-${Math.random()}.bat`,
            tmpOutputFile = `${tmpDir}\\output-${Math.random()}`,
            env = this.joinEnv(options),
            batch = `setlocal enabledelayedexpansion\r\n`;
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
            batch: tmpBatchFile, output: tmpOutputFile
        };
    }

    async watchOutput(cp) {
        let self = this,
            output = await readFile(cp.files.output);
        // If we have process then emit watched and stored data to stdout
        cp.stdout.emit('data', output);
        let watcher = watchFile(
                cp.files.output, {persistent: true, interval: 1},
                () => {
                    let stream = createReadStream(
                            cp.files.output,
                            {start: watcher.last}
                        ),
                        size = 0;
                    stream.on('data', (data) => {
                        size += data.length;
                        if (cp) { cp.stdout.emit('data', data); }
                    });
                    stream.on('close', () => {
                        cp.last += size;
                    });
                }
            );
        cp.last = output.length;
        cp.on('exit', () => {
            self.clean(cp);
        });
        return cp;
    }

    async prepare() {
        let self = this;
        return new Promise(async (resolve, reject) => {
            if (self.binary) { return resolve(self.binary); }
            // Copy applet to temporary directory
            let target = join(this.tmpdir, 'elevate.exe');
            if (!(await stat(target))) {
                let copied = createWriteStream(target);
                createReadStream(self.bundled).pipe(copied);
                copied.on('close', () => {
                    self.binary = target;
                    return resolve(self.binary);
                });
                copied.on('error', (err) => {
                    return reject(err);
                });
            } else {
                self.binary = target;
                resolve(self.binary);
            }
        });
    }

    async exec(command, options={}) {
        let self = this, files, output;
        return new Promise(async (resolve, reject) => {
            try {
                await this.prepare();
                files = await self.writeBatch(command, [], options);
                command = `${self.encloseDoubleQuotes(self.binary)} -wait ${files.batch}`;
                // No need to wait exec output because output is redirected to temporary file
                await exec(command, options);
                // Read entire output from redirected file on process exit
                output = await readFile(files.output);
                return resolve(output);
            } catch (err) {
                return reject(err);
            }
        });
    }

    async spawn(command, args, options={}) {
        let files = await this.writeBatch(command, args, options),
            sudoArgs = [],
            cp;
        sudoArgs.push('-wait');
        sudoArgs.push(files.batch);
        await this.prepare();
        cp = spawn(this.binary, sudoArgs, options, {wait: false});
        cp.files = files;
        await this.watchOutput(cp);
        return cp;
    }

    clean (cp) {
        unwatchFile(cp.files.output);
        unlink(cp.files.batch);
        unlink(cp.files.output);
    }
}


export {SudoerDarwin, SudoerLinux, SudoerWin32};
