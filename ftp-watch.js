const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');
const chokidar = require('chokidar');
const readline = require('readline');
const { exec } = require('child_process');

const ftpSyncConfigJson = path.join(__dirname, 'ftp-watch-settings.json');
const updateStatusBarConfigFile = path.join(__dirname, 'ftp-watch-settings.json');

// ------------------------------
// Configuração FTP
// ------------------------------
const userFtpConfig = JSON.parse(fs.readFileSync(ftpSyncConfigJson, 'utf-8'));
const ftpUserConfig = userFtpConfig.ftpUserConfig;
const ftpConfig = {
    host: ftpUserConfig.host,
    port: ftpUserConfig.port,
    user: ftpUserConfig.user,
    password: ftpUserConfig.password,
    secure: ftpUserConfig.secure,
    rootRemote: ftpUserConfig.rootRemote // pasta raiz no FTP
};

// Configuração de exibição de status na extensão status bar
const userUpdateStatusBarConfig = JSON.parse(fs.readFileSync(updateStatusBarConfigFile, 'utf-8'));
const updateStatusBarExtensionConfig = userUpdateStatusBarConfig.updateStatusBarExtension;

// Pasta local que contém todos os projetos
const projectsRoot = path.resolve(__dirname, "../");

// Pastas que queremos ignorar
const ignored = /node_modules|\.vscode|\.git/;

// Caminho do script de status bar
const statusScript = path.join(__dirname, "updateStatusBar.js");
const downloadedFiles = new Set();

// ------------------------------
// Função para atualizar barra de status
// ------------------------------
let statusTimeout = null;
function updateStatusBar(message, duration = 3000) {
    // Limpa timeout anterior
    if (statusTimeout) clearTimeout(statusTimeout);

    exec(`"C:/Program Files/nodejs/node.exe" "${statusScript}" "${message}" ${duration}`, (err) => {
        if (err) console.error("Erro ao atualizar Status Bar:", err);
    });

    // Volta para "Editando..." após duração
    if (message.startsWith("✔")) {
        statusTimeout = setTimeout(() => {
            exec(`"C:/Program Files/nodejs/node.exe" "${statusScript}" "✎ Editando..." 3000`);
        }, duration);
    }
}

// Inicializa barra de status
if (updateStatusBarExtensionConfig) {
    updateStatusBar("✎ Editando...", 3000);
}

// ------------------------------
// Função para executar comandos no FTP
// ------------------------------
async function withFtpClient(callback) {
    const client = new ftp.Client();
    client.ftp.verbose = false;

    try {
        await client.access({
            host: ftpConfig.host,
            port: ftpConfig.port,
            user: ftpConfig.user,
            password: ftpConfig.password,
            secure: ftpConfig.secure
        });

        return await callback(client);
    } finally {
        client.close();
    }
}

// ------------------------------
// Função para enviar arquivo para FTP
// ------------------------------
async function uploadFile(filePath) {
    const normalizedFilePath = path.resolve(filePath);
    if (downloadedFiles.has(normalizedFilePath)) {
        downloadedFiles.delete(normalizedFilePath);
        return;
    }

    try {
        await withFtpClient(async (client) => {
            // Determina o projeto (subpasta)
            const relativeToRoot = path.relative(projectsRoot, filePath);
            const parts = relativeToRoot.split(path.sep);
            if (parts.length < 2) return; // ignora arquivos fora de projetos

            const projectName = parts[0];
            const relativePath = parts.slice(1).join("/");

            const remoteFilePath = path.posix.join(ftpConfig.rootRemote, projectName, relativePath);

            // Cria pastas remotas caso não existam
            await client.ensureDir(path.posix.dirname(remoteFilePath));

            // Envia o arquivo
            await client.uploadFrom(filePath, remoteFilePath);

            console.log(`✔ [${projectName}] ${relativePath} enviado!`);
            if (updateStatusBarExtensionConfig) {
                updateStatusBar(`✔ [${projectName}] ${relativePath} enviado!`);
            }
        });
    } catch (err) {
        console.error(`✖ Erro ao enviar ${filePath}:`, err);
        if (updateStatusBarExtensionConfig) {
            updateStatusBar(`✖ Erro ao enviar ${filePath}`);
        }
    }
}

function resolveRemotePath(inputPath = "") {
    if (!inputPath || inputPath === ".") {
        return ftpConfig.rootRemote || "/";
    }

    if (inputPath.startsWith("/")) {
        return inputPath;
    }

    return path.posix.join(ftpConfig.rootRemote || "/", inputPath);
}

function resolveLocalDownloadPath(remotePath, localPath) {
    if (localPath) {
        return path.resolve(process.cwd(), localPath);
    }

    return path.resolve(process.cwd(), path.posix.basename(remotePath));
}

async function listRemote(remotePathInput) {
    const remotePath = resolveRemotePath(remotePathInput);

    await withFtpClient(async (client) => {
        const items = await client.list(remotePath);

        if (items.length === 0) {
            console.log(`Pasta vazia: ${remotePath}`);
            return;
        }

        console.log(`Conteúdo de ${remotePath}:`);
        for (const item of items) {
            const type = item.isDirectory ? "DIR " : "FILE";
            const size = item.isDirectory ? "" : `${item.size} bytes`;
            console.log(`${type.padEnd(5)} ${item.name.padEnd(35)} ${size}`);
        }
    });
}

async function downloadRemote(remotePathInput, localPathInput) {
    if (!remotePathInput) {
        console.log("Uso: get <arquivo-remoto> [arquivo-local]");
        return;
    }

    const remotePath = resolveRemotePath(remotePathInput);
    const localPath = resolveLocalDownloadPath(remotePath, localPathInput);
    const normalizedLocalPath = path.resolve(localPath);

    await withFtpClient(async (client) => {
        fs.mkdirSync(path.dirname(normalizedLocalPath), { recursive: true });
        downloadedFiles.add(normalizedLocalPath);
        try {
            await client.downloadTo(normalizedLocalPath, remotePath);
            setTimeout(() => downloadedFiles.delete(normalizedLocalPath), 5000);
        } catch (err) {
            downloadedFiles.delete(normalizedLocalPath);
            throw err;
        }
        console.log(`✔ Baixado: ${remotePath} -> ${normalizedLocalPath}`);
    });
}

function parseCommandLine(input) {
    const args = [];
    const regex = /"([^"]*)"|'([^']*)'|[^\s]+/g;
    let match;

    while ((match = regex.exec(input)) !== null) {
        args.push(match[1] || match[2] || match[0]);
    }

    return args;
}

function showHelp() {
    console.log(`
Comandos disponíveis:
  ls [pasta-remota]                    Lista arquivos/pastas no FTP
  get <arquivo-remoto> [arquivo-local] Baixa um arquivo do FTP
  help                                 Mostra esta ajuda
  exit                                 Encerra o script

Observação:
  Caminhos sem "/" no início são resolvidos a partir de rootRemote.
`);
}

function startCommandPrompt() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'ftp> '
    });

    console.log("Digite 'help' para ver os comandos disponíveis.");
    rl.prompt();

    rl.on('line', async (line) => {
        const input = line.trim();
        if (!input) {
            rl.prompt();
            return;
        }

        const [command, ...args] = parseCommandLine(input);

        try {
            if (command === 'ls') {
                await listRemote(args[0]);
            } else if (command === 'get') {
                await downloadRemote(args[0], args[1]);
            } else if (command === 'help') {
                showHelp();
            } else if (command === 'exit' || command === 'quit') {
                rl.close();
                return;
            } else {
                console.log(`Comando desconhecido: ${command}`);
                showHelp();
            }
        } catch (err) {
            console.error(`✖ Erro ao executar comando '${command}':`, err.message);
        }

        rl.prompt();
    });

    rl.on('close', () => {
        watcher.close().then(() => process.exit(0));
    });
}

// ------------------------------
// Inicializa watcher
// ------------------------------
const watcher = chokidar.watch(projectsRoot, { ignored, ignoreInitial: true });

watcher.on('add', uploadFile);
watcher.on('change', uploadFile);

console.log(`Observando todos os projetos em ${projectsRoot}...`);
startCommandPrompt();
