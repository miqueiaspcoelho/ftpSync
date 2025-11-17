const fs = require('fs');
const path = require('path');

// Argumentos: mensagem e timeout
const args = process.argv.slice(2); 
const message = args[0] || "✔ Operação concluída!";
const timeout = parseInt(args[1]) || 3000;

// Caminho para o settings.json
const settingsPath = path.join(__dirname, 'settings.json');

// Lê o settings.json
let settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

// Guarda o texto padrão
const defaultText = settings.statusbartext.text || "";

// Atualiza para a mensagem temporária
settings.statusbartext.text = message;
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4), 'utf8');

// Volta para o texto padrão após timeout
setTimeout(() => {
    settings.statusbartext.text = defaultText;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4), 'utf8');
}, timeout);
