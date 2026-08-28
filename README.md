# Monitoramento de Pastas e Envio FTP

Este script Node.js monitora várias pastas locais e envia automaticamente qualquer arquivo criado ou modificado para um servidor FTP remoto.

Além do envio automático, o terminal também aceita comandos interativos para listar arquivos remotos e baixar arquivos do FTP para a máquina local.

## Pré-requisitos

- [Node.js](https://nodejs.org/)
- Extensão **Status Bar Text** no VS Code, caso queira exibir mensagens na barra de status
- Pacotes Node.js:
  - `basic-ftp`
  - `chokidar`

Instale os pacotes com:

```bash
npm install basic-ftp chokidar
```

## Estrutura de pastas

Coloque os scripts dentro de uma pasta `.vscode` na raiz que contém seus projetos:

```bash
raiz-do-projeto/
├── .vscode/
│   ├── ftp-watch.js
│   ├── ftp-watch-settings.json
│   ├── settings.json
│   └── updateStatusBar.js
├── pasta1/
├── pasta2/
└── pastaN/
```

## Configuração

Configure o arquivo `ftp-watch-settings.json` com as credenciais e informações do FTP:

```json
{
    "ftpUserConfig": {
        "host": "user.dominio.com.br",
        "port": 21,
        "user": "user",
        "password": "password",
        "secure": false,
        "rootRemote": "/public_html"
    },
    "updateStatusBarExtension": false
}
```

## Rodando o script

Dentro da pasta onde está o script, rode:

```bash
node ftp-watch.js
```

Caso ele esteja dentro de `.vscode`, rode a partir da raiz:

```bash
node .vscode/ftp-watch.js
```

Ao iniciar, o script continua observando alterações locais e mostra o prompt:

```txt
ftp>
```

## Comandos interativos

Listar a pasta configurada em `rootRemote`:

```txt
ftp> ls
```

Listar uma pasta específica dentro de `rootRemote`:

```txt
ftp> ls imagens
```

Listar uma pasta absoluta no FTP:

```txt
ftp> ls /public_html/imagens
```

Baixar um arquivo para a pasta atual:

```txt
ftp> get /public_html/index.php
```

Baixar um arquivo escolhendo o destino local:

```txt
ftp> get /public_html/index.php ./downloads/index.php
```

Usar caminhos com espaços:

```txt
ftp> ls "/public_html/minha pasta"
ftp> get "/public_html/minha pasta/arquivo.txt" "./downloads/arquivo.txt"
```

Ver os comandos disponíveis:

```txt
ftp> help
```

Encerrar o script:

```txt
ftp> exit
```

## Observações

- Caminhos remotos que começam com `/` são usados como caminhos absolutos no FTP.
- Caminhos remotos sem `/` no início são resolvidos a partir de `rootRemote`.
- O upload automático continua funcionando enquanto o prompt está aberto.
- Arquivos baixados pelo comando `get` são ignorados pelo upload automático para evitar reenvio imediato.
