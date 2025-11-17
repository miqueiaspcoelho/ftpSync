# Monitoramento de Pastas e Envio FTP

Este script Node.js permite monitorar várias pastas e enviar automaticamente qualquer arquivo modificado para um servidor FTP remoto. Além disso, utiliza a extensão **Status Bar Text** do VS Code para exibir notificações de status diretamente na barra de status.

---

## Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- [Node.js](https://nodejs.org/)
- Extensão **Status Bar Text** no VS Code
- Pacotes Node.js:
  - `basic-ftp`
  - `chokidar`

Você pode instalar os pacotes executando:

```bash
npm install basic-ftp chokidar
```
## Estrutura de pastas
Para que o projeto funcione corretamente como esperado, adicione os scripts dentro de uma pasta **.vscode** dentro da pasta raiz do projeto. Como segue abaixo:
```bash
raiz-do-projeto/
│
├── .vscode/
│   └── ftp-watch.js
│   └── ftp-watch-settings.js
│   └── settings.js
│   └── updateStatusBar.js
├── pasta1/
├── pasta2/
└── pastaN/
```
## Inicializando o projeto
Dentro da pasta raiz do seu projeto rode o seguinte comando para inicializar o projeto node:
```bash
 npm init -y
```
Tendo inicializado o projeto, configure corretamente seu arquivo _ftp-watch-settings.js_, ele deve conter as credenciais e informações do seu servidor ftp de destino.
```json
{
	"ftpUserConfig": {
		"host": "user.dominio.com.br",
		"port": 0,
		"user": "user",
		"password": "password",
		"secure": false,
		"rootRemote": "pathRemote"
	}
}
```
## Rodando o script
Para rodar o script, dentro da pasta raiz do projeto, rode o seguinte comando:
```bash
node .vscode/ftp-watch.js
```
Esse comando pode ser configurado dentro do package json para ser algo mais simples, fica a cargo de quem está rodando o projeto.

## Finalizando
Ao rodar os comandos e seguir os passos, na barra de status do VsCode irá aparecer a mensagem: ***Editando...*** e sempre que um arquivo for salvo irá exibir o caminho de destino.