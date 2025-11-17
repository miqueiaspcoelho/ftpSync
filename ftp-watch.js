const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');
const ftpSyncConfigJson = path.join(__dirname, 'ftp-watch-settings.json');
const chokidar = require('chokidar');
const { exec } = require('child_process');

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

// Pasta local que contém todos os projetos
const projectsRoot = path.resolve(__dirname, "../");

// Pastas que queremos ignorar
const ignored = /node_modules|\.vscode|\.git/;

// Caminho do script de status bar
const statusScript = path.join(__dirname, "updateStatusBar.js");

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
updateStatusBar("✎ Editando...", 3000);

// ------------------------------
// Função para enviar arquivo para FTP
// ------------------------------
async function uploadFile(filePath) {
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
        updateStatusBar(`✔ [${projectName}] ${relativePath} enviado!`);
    } catch (err) {
        console.error(`❌ Erro ao enviar ${filePath}:`, err);
        updateStatusBar(`❌ Erro ao enviar ${filePath}`);
    }

    client.close();
}

// ------------------------------
// Inicializa watcher
// ------------------------------
const watcher = chokidar.watch(projectsRoot, { ignored, ignoreInitial: true });

watcher.on('add', uploadFile);
watcher.on('change', uploadFile);

console.log(`Observando todos os projetos em ${projectsRoot}...`);