# electron-sudo-universal

> Fork of [automation-stack/electron-sudo](https://github.com/automation-stack/electron-sudo) with TypeScript support and NixOS compatibility.

## Key Differences from Original
- Full TypeScript rewrite with proper type definitions
- Native NixOS support with automatic detection and configuration
- Improved error handling with detailed error messages
- Better process cleanup and resource management
- Comprehensive test suite for all platforms
- Modern ES module exports
- Updated dependencies
- Stricter type checking for options and configurations
- Better handling of environment variables
- Improved documentation including NixOS setup

All original features are maintained while adding type safety and better platform support.

## Electron subprocess with administrative privileges

Run a subprocess with administrative privileges, prompting the user with a graphical OS dialog if necessary. Useful for background subprocesses which run native Electron apps that need sudo.

- `Windows`, uses [elevate utility](https://github.com/danielmain/electron-sudo-universal/tree/master/src/vendor/win32) with native `User Account Control (UAC)` prompt (no `PowerShell` required)
- `OS X`, uses bundled [applet](https://github.com/danielmain/electron-sudo-universal/tree/master/src/bin/applet.app) (inspired by [Joran Dirk Greef](https://github.com/jorangreef))
- `Linux`, uses system `pkexec` or [gksudo](http://www.nongnu.org/gksu) (system or bundled)
- `NixOS`, uses system `pkexec` with proper setuid wrapper support

If you don't trust binaries bundled in `npm` package you can manually build tools and use them instead.

<img height="150px" src="./assets/win32.png"> <img height="150px" src="./assets/osx.png"> <img height="150px" src="./assets/linux.png"> <img height="150px" src="./assets/nixos.png">

## Features
- Supports `spawn` and `exec` subprocess behavior
- Supports applications packaged as `asar` archive
- Separate password prompt for each call (use `sh` or `bat` script for single prompt)
- No external dependencies, does not depend on OS versions
- Native NixOS support with automatic detection and configuration
- Full TypeScript support with proper type definitions
- Improved error handling and process management

## Installation
```bash
npm install electron-sudo-universal
```

### NixOS Setup

If you're using NixOS, ensure polkit is enabled in your configuration:

```nix
{
  # Enable polkit (required for electron-sudo)
  security.polkit.enable = true;
  
  environment.systemPackages = with pkgs; [
    polkit
  ];
}
```

Then rebuild your system:
```bash
sudo nixos-rebuild switch
```

## Usage

**Note: Your command should not start with the `sudo` prefix.**

### TypeScript Usage
```typescript
import BaseSudoer from 'electron-sudo-universal';
import { SudoerOptions } from 'electron-sudo-universal/types';

const options: SudoerOptions = {
    name: 'electron sudo application'
};
const sudoer = new BaseSudoer(options);

/* Spawn subprocess behavior */
const cp = await sudoer.spawn(
    'echo', ['$PARAM'], {env: {PARAM: 'VALUE'}}
);
cp.on('close', () => {
    /*
      cp.output.stdout (Buffer)
      cp.output.stderr (Buffer)
    */
});

/* Exec subprocess behavior */
const result = await sudoer.exec(
    'echo $PARAM', {env: {PARAM: 'VALUE'}}
);
/* result contains stdout and stderr as Buffer */
```

### JavaScript (CommonJS) Usage
```javascript
const { default: BaseSudoer } = require('electron-sudo-universal');

const sudoer = new BaseSudoer({
    name: 'electron sudo application'
});

// Use the same API as shown in TypeScript example
```

## Tests
```bash
# Install dependencies
npm install

# Run tests
npm test

# Run Windows-specific tests
npm run test-win32
```

## Usage with Webpack

Webpack configuration example:

```typescript
import path from 'path';

export default {
    entry: './src/index.ts',
    target: 'electron-main',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    output: {
        filename: 'index.js',
        path: path.resolve(__dirname, 'dist'),
    },
    node: {
        __dirname: true
    },
    externals: {
        electron: 'electron'
    }
};
```

## NixOS Development

For development on NixOS, you can use the provided `flake.nix`:

```nix
{
  description = "electron-sudo development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShell = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs
            electron
            polkit
          ];
        };
      });
}
```

## Troubleshooting

### NixOS

If you see "pkexec must be setuid root", ensure polkit is properly configured:

```nix
{
  # Enable polkit
  security.polkit.enable = true;

  # Configure setuid wrapper for pkexec
  security.wrappers.pkexec = {
    owner = "root";
    group = "root";
    source = "${pkgs.polkit}/bin/pkexec";
    setuid = true;
  };

  # Ensure polkit is installed
  environment.systemPackages = with pkgs; [
    polkit
  ];
}
```

## License

MIT
