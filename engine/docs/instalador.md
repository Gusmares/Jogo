# Instalador (Setup.exe)

Fase 0 do plano. Usa **electron-builder (NSIS)** sobre a pasta já empacotada (`prepackaged`), então os arquivos do jogo são exatamente os do `npm run build` (lista `build.include` do `neon.project.json` e exclusões de `engine/tools/build-game.js`). O electron usado continua sendo o da devDependency do projeto.

## Como gerar
- Jogo: `npm run installer`  (roda o build do jogo e depois o instalador)
- Engine: `npm run installer:engine`  (roda `build:editor` e depois o instalador)

Configuração: `electron-builder.game.yml` e `electron-builder.engine.yml` (raiz). Saída: `dist/instalador/` (`dist/` está no .gitignore; nunca commitar binários nem `assets/`).

Arquivos: `NEON-COAST-Setup-1.0.0.exe` e `NEON-ENGINE-Setup-0.2.0.exe`. Tamanhos: ver a seção "Medido" abaixo.

## O que o instalador faz
- Um clique, sem assistente, **por usuário** (sem pedir administrador): instala em `%LOCALAPPDATA%\Programs\NEON COAST`.
- Cria atalho no menu Iniciar e na área de trabalho, e registra o desinstalador em "Aplicativos instalados".
- Ícone: não há `.ico` do jogo no projeto, então usa o padrão do Electron. Para trocar: colocar `build/icon.ico` (256x256) e apontar `win.icon` no yml.
- Não pergunta nada; no futuro reinstalar por cima atualiza.

## Teste silencioso
`Setup.exe /S /D=C:\caminho\pasta` instala sem interface (o `/D=` precisa ser o último argumento, sem aspas). Desinstalar: `"<pasta>\Uninstall NEON COAST.exe" /S`.

## Desinstalar
Configurações > Aplicativos > NEON COAST > Desinstalar (ou o `Uninstall NEON COAST.exe` da pasta de instalação). Remove a pasta e os atalhos. Dados do usuário (saves em AppData) são mantidos (`deleteAppDataOnUninstall: false`).

## Atualização automática (DESLIGADA — passo futuro)
Hoje `publish: null` e o jogo não usa `electron-updater`. Para ligar:
1. Criar o repositório/releases no GitHub e decidir o fluxo (releases públicos contêm só o Setup, **sem assets de terceiros**; hoje o instalador inclui assets locais, então o release público do jogo é inviável sem tratar a licença — a atualização pode ficar para a engine ou para um feed privado).
2. `npm i electron-updater` (dependência de runtime) e, no `main.js` do jogo, chamar `autoUpdater.checkForUpdatesAndNotify()` só quando empacotado.
3. Trocar `publish: null` por `publish: { provider: github, owner: <dono>, repo: <repo> }` no yml.
4. Gerar com `electron-builder --publish always` usando um `GH_TOKEN` (aí sai também `latest.yml`, que o updater lê), subindo o Setup + `latest.yml` + `.blockmap` num release com tag igual à versão do package.json.
5. Subir a versão a cada release. O que falta hoje: release publicado, token, e o código do updater.

## Medido (24/11/2026)
- `NEON-COAST-Setup-1.0.0.exe`: 1310 MB (~1,3 GB; o jogo empacotado tem ~2,1 GB com os assets locais). Instalação silenciosa levou ~54 s (descompactar 1,3 GB). Para "segundos" de verdade, é preciso reduzir os assets (fase de conteúdo/otimização).
- `NEON-ENGINE-Setup-0.2.0.exe`: 116 MB. Atenção: o editor lê a engine/projeto pelo caminho gravado em `engine.json` (pasta do repositório); o instalador da engine só funciona neste PC enquanto o repositório estiver no mesmo lugar.
- `assets/rigs` (rigs de dedos gerados por `skeleton-extend.js`) agora está em `build.include`: sem essa pasta o jogo empacotado ficaria sem dedos animados (`rig-extend.js` cai em silêncio no esqueleto de 32 ossos). Custo: +18 MB na pasta empacotada (rigs de todas as skins), sem mudança relevante no Setup final (~1,3 GB).
- Limite do NSIS: instaladores > 2 GB falham; o do jogo está a ~65% disso.
- O Setup do jogo contém assets de terceiros (GTA SA/mods): uso pessoal, não publicar.
