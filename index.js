const core = require('@actions/core');
const exec = require('@actions/exec');
const io = require('@actions/io');
const {spawnSync} = require('child_process');
const path = require('path');
const fs = require('fs');
const {URL} = require('url');
const {https} = require('follow-redirects');
const AdmZip = require('adm-zip');

function installWindows() {
    return new Promise((resolve, reject) => {
        const destDir = 'ccache-dist';
        const platform = "windows-64";
        const version = "4.2.1";
        const url = new URL(`https://github.com/ccache/ccache/releases/download/v${version}/ccache-${version}-${platform}.zip`);

        core.info(`downloading ${url}`);
        const request = https.get(url, {followAllRedirects: true}, result => {
            const data = [];

            result.on('data', chunk => data.push(chunk));

            result.on('end', () => {
                const length = data.reduce((len, chunk) => len + chunk.length, 0);
                const buffer = Buffer.alloc(length);

                data.reduce((pos, chunk) => {
                    chunk.copy(buffer, pos);
                    return pos + chunk.length;
                }, 0)

                const zip = new AdmZip(buffer);
                const binaryName = "ccache.exe";
                let entryPath = binaryName;
                for(const ent of zip.getEntries()) {
                    if(ent.name === binaryName) {
                        entryPath = ent.entryName;
                    }
                }

                const fullDestDir = path.resolve(process.cwd(), destDir);
                if (!fs.existsSync(fullDestDir)) {
                    fs.mkdirSync(fullDestDir, {recursive: true});
                }

                zip.extractEntryTo(entryPath, fullDestDir, false, true);

                const fullFileDir = path.join(fullDestDir, binaryName);
                if (!fs.existsSync(fullFileDir)) {
                    reject(`failed to extract to '${fullFileDir}'`);
                }

                fs.chmodSync(fullFileDir, '755');

                core.info(`extracted '${binaryName}' to '${fullFileDir}'`);

                core.addPath(fullDestDir);
                core.info(`added '${fullDestDir}' to PATH`);

                const result = spawnSync(binaryName, ['--version'], {encoding: 'utf8'});
                if (result.error) {
                    reject(result.error);
                }

                const versionOutput = result.stdout.trim();
                let installedVersion = "";
                const r = versionOutput.match(/version\s+([.\d]+)/);
                if(r != null && r.length > 1) {
                    installedVersion = r[1];
                }

                core.info(`$ ${binaryName} --version`);
                core.info(installedVersion);

                if (installedVersion !== version) {
                    core.warning('incorrect version detected');
                }

                resolve();
            });
        });
        request.on('error', error => {
            reject(error);
        });
    });
}

async function install() {
    const platform = process.platform;
    if (platform === "darwin") {
        await exec.exec("brew install ccache");
    } else if (platform === "linux") {
        await exec.exec("sudo apt-get install -y ccache");
    } else if (platform === "win32") {
        await installWindows();
    } else {
        core.info("unknown platform: " + platform);
    }
}

async function run() {
    let ccachePath = await io.which("ccache", false);
    if (!!ccachePath) {
        core.info("ccache found in path " + ccachePath);
    }
    else {
        await install();
    }
}

run().then();