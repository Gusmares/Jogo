# NEON ENGINE + NEON COAST

Este repositório tem duas partes:

- **`engine/` — NEON ENGINE:** o programa desktop para montar mapas (editor com biblioteca de objetos, gizmo, planta da cidade, importação de modelos do GTA SA, testar e gerar o `.exe`). Detalhes em [`engine/README.md`](engine/README.md).
- **`projects/neon-coast/` — NEON COAST:** o jogo, um projeto criado e editado na engine (mundo aberto estilo GTA SA com São Paulo e Rio de Janeiro). Detalhes em [`projects/neon-coast/README.md`](projects/neon-coast/README.md).

```
engine/             NEON ENGINE
  app/              programa desktop (NEON ENGINE.exe) e API local
  editor/           interface do editor
  tools/            leitores DFF/TXD, conversores, servidor, empacotadores
projects/
  neon-coast/       o jogo (neon.project.json, index.html, js/, maps/, assets/, electron/, tools/)
dist/               executáveis gerados (fora do git)
```

## Começar
1. `npm install`
2. A pasta `projects/neon-coast/assets/` (modelos, mods, músicas — vários GB) **não vai para o GitHub** (conteúdo de terceiros); ela existe só no PC do dono.
3. Editor: `npm run editor` (ou `dist/NEON ENGINE-win32-x64/NEON ENGINE.exe`). Jogo: `npm start`. Executáveis: `npm run build:editor` e `npm run build`.

Regras para os agentes (ChatGPT e Claude) que trabalham aqui: [`AGENTS.md`](AGENTS.md).
