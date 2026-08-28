# Monitoramento de Pastas e Envio FTP

Este script Node.js monitora varias pastas locais e envia automaticamente qualquer arquivo criado ou modificado para um servidor FTP remoto.

Alem do envio automatico, o terminal tambem aceita comandos interativos para listar arquivos remotos, baixar arquivos ou pastas do FTP, enviar arquivos ou pastas locais e consultar o historico de envios da sessao.

## Pre-requisitos

- [Node.js](https://nodejs.org/)
- Extensao **Status Bar Text** no VS Code, caso queira exibir mensagens na barra de status
- Pacotes Node.js:
  - `basic-ftp`
  - `chokidar`

Instale os pacotes com:

```bash
npm install basic-ftp chokidar
```

## Estrutura de pastas

Coloque os scripts dentro de uma pasta `.vscode` na raiz que contem seus projetos:

```bash
raiz-do-projeto/
|-- .vscode/
|   |-- ftp-watch.js
|   |-- ftp-watch-settings.json
|   |-- settings.json
|   `-- updateStatusBar.js
|-- pasta1/
|-- pasta2/
`-- pastaN/
```

## Configuracao

Configure o arquivo `ftp-watch-settings.json` com as credenciais e informacoes do FTP:

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

Dentro da pasta onde esta o script, rode:

```bash
node ftp-watch.js
```

Caso ele esteja dentro de `.vscode`, rode a partir da raiz:

```bash
node .vscode/ftp-watch.js
```

Ao iniciar, o script continua observando alteracoes locais e mostra o prompt:

```txt
ftp>
```

## Comandos interativos

Listar a pasta configurada em `rootRemote`:

```txt
ftp> ls
```

Listar uma pasta especifica dentro de `rootRemote`:

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

Baixar uma pasta do FTP:

```txt
ftp> get /public_html/assets ./assets
```

Enviar um arquivo local para o FTP:

```txt
ftp> put ./index.php /public_html/index.php
```

Enviar uma pasta local para o FTP:

```txt
ftp> put ./assets /public_html/assets
```

Ver o historico de envios feitos neste terminal:

```txt
ftp> history
```

Usar caminhos com espacos:

```txt
ftp> ls "/public_html/minha pasta"
ftp> get "/public_html/minha pasta/arquivo.txt" "./downloads/arquivo.txt"
ftp> put "./minha pasta" "/public_html/minha pasta"
```

Ver os comandos disponiveis:

```txt
ftp> help
```

Encerrar o script:

```txt
ftp> exit
```

## Observacoes

- Caminhos remotos que comecam com `/` sao usados como caminhos absolutos no FTP.
- Caminhos remotos sem `/` no inicio sao resolvidos a partir de `rootRemote`.
- O upload automatico continua funcionando enquanto o prompt esta aberto.
- Arquivos e pastas baixados pelo comando `get` sao ignorados temporariamente pelo upload automatico para evitar reenvio imediato.
- O comando `history` mostra apenas os ultimos 100 envios feitos no terminal atual; o historico nao e salvo ao encerrar o script.
