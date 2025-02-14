import {platform} from 'node:process';
import {SudoerDarwin} from '~/lib/darwin-sudoer';
import {SudoerWin32} from '~/lib/windows-sudoer';
import {SudoerLinux} from '~/lib/linux-sudoer';

export default (() => {
    switch (platform) {
        case 'darwin':
            return SudoerDarwin;
        case 'win32':
            return SudoerWin32;
        case 'linux':
            return SudoerLinux;
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
})();
