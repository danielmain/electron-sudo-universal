const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const { chmod } = require('fs/promises');

const srcPath = './src';
const distPath = './dist';

async function makeExecutable(filePath) {
    try {
        await chmod(filePath, '755');
        console.log(`Made executable: ${filePath}`);
    } catch (error) {
        console.error(`Failed to make executable: ${filePath}`, error);
    }
}

class ChmodPlugin {
    apply(compiler) {
        compiler.hooks.afterEmit.tapPromise('ChmodPlugin', async (compilation) => {
            const files = [
                path.join(distPath, 'bin/applet.app'),
                path.join(distPath, 'bin/applet.app/Contents/MacOS/applet'),
                path.join(distPath, 'bin/gksudo')
            ];

            await Promise.all(files.map(makeExecutable));
        });
    }
}

module.exports = {
    entry: './src/index.ts',
    target: 'electron-main',
    mode: 'production',
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
        alias: {
            '~': path.resolve(__dirname, 'src')
        }
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'index.js',
        library: {
            type: 'umd',
            name: 'electron-sudo'
        },
        clean: true
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: path.join(srcPath, 'bin'),
                    to: 'bin',
                    noErrorOnMissing: true
                }
            ]
        }),
        new ChmodPlugin()
    ],
    externals: {
        electron: 'electron'
    }
};