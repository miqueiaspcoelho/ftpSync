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
const downloadedFiles = new Map();
const downloadedDirs = new Map();
const downloadedFileIgnoreMs = 5000;
const uploadHistory = [];
const uploadHistoryLimit = 100;

function addUploadHistory(type, localPath, remotePath) {
    uploadHistory.push({
        time: new Date(),
        type,
        localPath,
        remotePath
    });

    if (uploadHistory.length > uploadHistoryLimit) {
        uploadHistory.shift();
    }
}

function showUploadHistory() {
    if (uploadHistory.length === 0) {
        console.log("Nenhum envio registrado neste terminal.");
        return;
    }

    console.log(`Ultimos ${uploadHistory.length} envios neste terminal:`);

    uploadHistory.forEach((item, index) => {
        const time = item.time.toLocaleTimeString("pt-BR", { hour12: false });
        console.log(`${String(index + 1).padStart(3, " ")}. ${time} [${item.type}] ${item.localPath} -> ${item.remotePath}`);
    });
}

function untrackDownloadedPath(filePath, storage) {
    const normalizedFilePath = path.resolve(filePath);
    const trackedFile = storage.get(normalizedFilePath);

    if (trackedFile) {
        clearTimeout(trackedFile.timeout);
        storage.delete(normalizedFilePath);
    }
}

function trackDownloadedPath(filePath, storage, durationMs = downloadedFileIgnoreMs) {
    const normalizedFilePath = path.resolve(filePath);
    untrackDownloadedPath(normalizedFilePath, storage);

    const timeout = durationMs === null
        ? null
        : setTimeout(() => {
            storage.delete(normalizedFilePath);
        }, durationMs);

    storage.set(normalizedFilePath, { timeout });
}

function untrackDownloadedFile(filePath) {
    untrackDownloadedPath(filePath, downloadedFiles);
}

function trackDownloadedFile(filePath, durationMs = downloadedFileIgnoreMs) {
    trackDownloadedPath(filePath, downloadedFiles, durationMs);
}

function untrackDownloadedDir(dirPath) {
    untrackDownloadedPath(dirPath, downloadedDirs);
}

function trackDownloadedDir(dirPath, durationMs = downloadedFileIgnoreMs) {
    trackDownloadedPath(dirPath, downloadedDirs, durationMs);
}

function shouldIgnoreDownloadedFile(filePath) {
    const normalizedFilePath = path.resolve(filePath);

    if (!downloadedFiles.has(normalizedFilePath)) {
        return false;
    }

    if (downloadedFiles.get(normalizedFilePath).timeout !== null) {
        trackDownloadedFile(normalizedFilePath);
    }

    return true;
}

function shouldIgnoreDownloadedDir(filePath) {
    const normalizedFilePath = path.resolve(filePath);

    for (const [dirPath, trackedDir] of downloadedDirs) {
        const relativePath = path.relative(dirPath, normalizedFilePath);
        const isInsideDir = relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);

        if (normalizedFilePath === dirPath || isInsideDir) {
            if (trackedDir.timeout !== null) {
                trackDownloadedDir(dirPath);
            }

            return true;
        }
    }

    return false;
}

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
    if (shouldIgnoreDownloadedFile(normalizedFilePath) || shouldIgnoreDownloadedDir(normalizedFilePath)) {
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
            addUploadHistory("auto", path.resolve(filePath), remoteFilePath);

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

async function uploadDirectory(dirPath) {
    const normalizedDirPath = path.resolve(dirPath);
    if (shouldIgnoreDownloadedDir(normalizedDirPath)) {
        return;
    }

    try {
        await withFtpClient(async (client) => {
            const relativeToRoot = path.relative(projectsRoot, normalizedDirPath);
            if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot) || relativeToRoot === "") {
                return;
            }

            const parts = relativeToRoot.split(path.sep);
            const projectName = parts[0];
            const relativePath = parts.slice(1).join("/");
            const remoteDirPath = path.posix.join(ftpConfig.rootRemote || "/", projectName, relativePath);

            await client.ensureDir(remoteDirPath);
            addUploadHistory("auto-dir", normalizedDirPath, remoteDirPath);

            const displayPath = relativePath || ".";
            console.log(`✔ [${projectName}] pasta ${displayPath} criada!`);
            if (updateStatusBarExtensionConfig) {
                updateStatusBar(`✔ [${projectName}] pasta ${displayPath} criada!`);
            }
        });
    } catch (err) {
        console.error(`✖ Erro ao criar pasta ${dirPath}:`, err);
        if (updateStatusBarExtensionConfig) {
            updateStatusBar(`✖ Erro ao criar pasta ${dirPath}`);
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
        const resolvedLocalPath = path.resolve(process.cwd(), localPath);

        if (fs.existsSync(resolvedLocalPath) && fs.statSync(resolvedLocalPath).isDirectory()) {
            return path.join(resolvedLocalPath, path.posix.basename(remotePath));
        }

        return resolvedLocalPath;
    }

    const rootRemote = ftpConfig.rootRemote || "/";
    const relativeToRoot = path.posix.relative(rootRemote, remotePath);

    if (relativeToRoot && !relativeToRoot.startsWith("..") && !path.posix.isAbsolute(relativeToRoot)) {
        return path.join(projectsRoot, ...relativeToRoot.split("/"));
    }

    return path.resolve(process.cwd(), path.posix.basename(remotePath));
}

function resolveRemoteUploadPath(localPath, remotePathInput) {
    const normalizedLocalPath = path.resolve(localPath);

    if (remotePathInput) {
        const remotePath = resolveRemotePath(remotePathInput);

        if (remotePathInput.endsWith("/") || remotePathInput.endsWith("\\")) {
            return path.posix.join(remotePath, path.basename(normalizedLocalPath));
        }

        return remotePath;
    }

    const relativeToRoot = path.relative(projectsRoot, normalizedLocalPath);
    const parts = relativeToRoot.split(path.sep);

    if (parts.length >= 2 && !relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot)) {
        return path.posix.join(ftpConfig.rootRemote || "/", parts[0], parts.slice(1).join("/"));
    }

    return path.posix.join(ftpConfig.rootRemote || "/", path.basename(normalizedLocalPath));
}

async function resolveRemoteUploadTarget(client, localPath, localStats, remotePathInput) {
    const remotePath = resolveRemoteUploadPath(localPath, remotePathInput);

    if (!localStats.isDirectory() || !remotePathInput || remotePathInput.endsWith("/") || remotePathInput.endsWith("\\")) {
        return remotePath;
    }

    const remoteItems = await tryListRemote(client, remotePath);
    if (remoteItems !== null) {
        return path.posix.join(remotePath, path.basename(localPath));
    }

    return remotePath;
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

async function tryListRemote(client, remotePath) {
    let currentDir = null;

    try {
        currentDir = await client.pwd();
        await client.cd(remotePath);
        return await client.list();
    } catch (err) {
        return null;
    } finally {
        if (currentDir !== null) {
            try {
                await client.cd(currentDir);
            } catch (err) {
                // Ignora falha ao restaurar diretório; os demais comandos usam caminhos absolutos.
            }
        }
    }
}

async function downloadRemoteDirectory(client, remoteDir, localDir) {
    fs.mkdirSync(localDir, { recursive: true });
    trackDownloadedDir(localDir, null);

    const items = await client.list(remoteDir);

    for (const item of items) {
        const remoteItemPath = path.posix.join(remoteDir, item.name);
        const localItemPath = path.join(localDir, item.name);

        if (item.isDirectory) {
            await downloadRemoteDirectory(client, remoteItemPath, localItemPath);
            continue;
        }

        trackDownloadedFile(localItemPath, null);
        try {
            await client.downloadTo(localItemPath, remoteItemPath);
            trackDownloadedFile(localItemPath);
        } catch (err) {
            untrackDownloadedFile(localItemPath);
            throw err;
        }
    }

    trackDownloadedDir(localDir);
}

async function downloadRemote(remotePathInput, localPathInput) {
    if (!remotePathInput) {
        console.log("Uso: get <arquivo-ou-pasta-remota> [destino-local]");
        return;
    }

    const remotePath = resolveRemotePath(remotePathInput);
    const localPath = resolveLocalDownloadPath(remotePath, localPathInput);
    const normalizedLocalPath = path.resolve(localPath);

    await withFtpClient(async (client) => {
        const remoteItems = await tryListRemote(client, remotePath);

        if (remoteItems !== null) {
            try {
                await downloadRemoteDirectory(client, remotePath, normalizedLocalPath);
            } catch (err) {
                untrackDownloadedDir(normalizedLocalPath);
                throw err;
            }

            console.log(`✔ Pasta baixada: ${remotePath} -> ${normalizedLocalPath}`);
            return;
        }

        fs.mkdirSync(path.dirname(normalizedLocalPath), { recursive: true });
        trackDownloadedFile(normalizedLocalPath, null);
        try {
            await client.downloadTo(normalizedLocalPath, remotePath);
            trackDownloadedFile(normalizedLocalPath);
        } catch (err) {
            untrackDownloadedFile(normalizedLocalPath);
            throw err;
        }
        console.log(`✔ Baixado: ${remotePath} -> ${normalizedLocalPath}`);
    });
}

async function uploadLocalDirectory(client, localDir, remoteDir) {
    await client.ensureDir(remoteDir);

    const items = fs.readdirSync(localDir, { withFileTypes: true });

    for (const item of items) {
        const localItemPath = path.join(localDir, item.name);
        const remoteItemPath = path.posix.join(remoteDir, item.name);

        if (item.isDirectory()) {
            await uploadLocalDirectory(client, localItemPath, remoteItemPath);
            continue;
        }

        if (item.isFile()) {
            await client.ensureDir(path.posix.dirname(remoteItemPath));
            await client.uploadFrom(localItemPath, remoteItemPath);
            addUploadHistory("manual", localItemPath, remoteItemPath);
        }
    }
}

async function uploadLocal(localPathInput, remotePathInput) {
    if (!localPathInput) {
        console.log("Uso: put <arquivo-ou-pasta-local> [destino-remoto]");
        return;
    }

    const localPath = path.resolve(process.cwd(), localPathInput);

    if (!fs.existsSync(localPath)) {
        console.log(`Caminho local nao encontrado: ${localPath}`);
        return;
    }

    const localStats = fs.statSync(localPath);

    await withFtpClient(async (client) => {
        const remotePath = await resolveRemoteUploadTarget(client, localPath, localStats, remotePathInput);

        if (localStats.isDirectory()) {
            await uploadLocalDirectory(client, localPath, remotePath);
            console.log(`✔ Pasta enviada: ${localPath} -> ${remotePath}`);
            return;
        }

        if (!localStats.isFile()) {
            console.log(`Caminho local nao e arquivo nem pasta: ${localPath}`);
            return;
        }

        await client.ensureDir(path.posix.dirname(remotePath));
        await client.uploadFrom(localPath, remotePath);
        addUploadHistory("manual", localPath, remotePath);
        console.log(`✔ Enviado: ${localPath} -> ${remotePath}`);
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

showHelp = function() {
    console.log(`
Comandos disponiveis:
  ls [pasta-remota]                              Lista arquivos/pastas no FTP
  get <arquivo-ou-pasta-remota> [destino-local] Baixa arquivo ou pasta do FTP
  put <arquivo-ou-pasta-local> [destino-remoto] Envia arquivo ou pasta para o FTP
  history                                        Mostra os ultimos envios deste terminal
  help                                           Mostra esta ajuda
  exit                                           Encerra o script

Observacao:
  Caminhos remotos sem "/" no inicio sao resolvidos a partir de rootRemote.
`);
};

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
            } else if (command === 'put') {
                await uploadLocal(args[0], args[1]);
            } else if (command === 'history') {
                showUploadHistory();
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

watcher.on('addDir', uploadDirectory);
watcher.on('add', uploadFile);
watcher.on('change', uploadFile);

console.log(`Observando todos os projetos em ${projectsRoot}...`);
startCommandPrompt();
