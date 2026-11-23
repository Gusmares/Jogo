# NEON ENGINE + NEON COAST — regras para agentes (ChatGPT/Codex, Claude)

O repositório tem duas partes:
- **`engine/`** — o NEON ENGINE: programa desktop/editor de mapa (`engine/app`, `engine/editor`) e ferramentas (`engine/tools`: leitores DFF/TXD, conversores, servidor, empacotadores).
- **`projects/neon-coast/`** — o jogo NEON COAST, um projeto da engine: jogo 3D de mundo aberto estilo GTA SA (São Paulo + Rio de Janeiro), Three.js r128 em **scripts clássicos** (sem módulos, sem bundler), empacotado em `.exe` com Electron. Comentários e textos em português.

**Todos os caminhos do jogo abaixo são dentro de `projects/neon-coast/`.** Os comandos `npm run ...` rodam na raiz do repositório.

Dois agentes trabalham neste repositório ao mesmo tempo. **Cada um só mexe na sua área.** Se precisar de algo da área do outro, peça ao dono do projeto em vez de editar.

## Quem cuida do quê
- **ChatGPT — design da interface do jogo:** menu inicial/pausa, HUD, rádio (visual), roda de seleção, celular e lojas (visual).
- **Claude — código de jogo e engine:** física e dirigibilidade dos carros, trânsito/IA, polícia, pedestres, armas, câmera, controles, mapa (SP/RJ), conversão de modelos e mods, e todo o NEON ENGINE.

## ChatGPT PODE mexer (em `projects/neon-coast/`)
- `css/style.css`, `css/interface.css` — à vontade.
- `index.html` — só a marcação do menu/HUD/overlay (o HTML dentro do `<body>`). **Não mude a lista nem a ordem dos `<script>`.**
- `js/ui/*` (hud, selection-wheel, menu, phone…) — parte visual.
- `js/gameplay/radio.js` — parte de interface (exibição da estação/faixa, volume). A troca de estação e o áudio devem continuar funcionando.
- Novos arquivos de UI em `css/` ou `js/ui/` (se criar um `.js`, adicione o `<script>` junto dos outros de `js/ui/`, sem reordenar os existentes).

## ChatGPT NÃO PODE mexer
- **Toda a pasta `engine/`** (editor, app, ferramentas) e os arquivos de projeto `projects/neon-coast/neon.project.json` e `projects/neon-coast/package.json`.
- Física/veículos: `js/entities/car-physics-core.js`, `car-physics.js`, `vehicles.js`, `vehicle-models.js`, `damage.js`, `traffic-assets.js`, `police.js`, `emergency.js`, `npcs.js`, `pedestrians.js`, `occupants.js`, `anim.js`, `skins.js`, `player-model.js`, `models.js`, `gator.js`.
- Laço do jogo e controles: `js/main.js`, `js/gameplay/update.js`, `vehicle-anim.js`, `weapons.js`, `mission.js`, `health.js`, `js/core/*` (camera, input, engine, util, post).
- Mapa: tudo em `js/world/` (inclusive `placements.js`, que monta no jogo os objetos colocados no editor). O mapa salvo, `maps/world.json`, é conteúdo do dono do projeto: só muda pelo editor.
- Ferramentas e dados: `tools/`, `assets/` (modelos, catálogo, animações), `electron/` do jogo, `package.json` da raiz.

## Contratos que a interface tem que manter
O código do jogo usa estes IDs de elementos — **não renomeie nem remova** (pode mudar estilo, posição e o HTML em volta):
`overlay`, `help`, `money`, `clock`, `zone`, `speedo`, `spd`, `hpBar`, `hpTxt`, `stBar`, `prompt`, `vignette`, `toast`, `crosshair`, `hitmark`, `dead`, `deadMsg`, `objInfo`, `wanted`, `units`, `weaponHud`, `mm`, `c` (canvas do jogo),
`radioHud`, `radioStation`, `radioGenre`, `radioTrack`, `radioVolume`,
`selectionWheel`, `wheelCounter`, `wheelCursor`, `wheelDetail`, `wheelEyebrow`, `wheelGenre`, `wheelInstruction`, `wheelItems`, `wheelName`, `wheelSegments`, `wheelTitle`.

Funções globais chamadas pelo resto do jogo — mantenha nome e parâmetros: `startGame`, `toast`, `zoneName`, `drawMinimap`, `policeHud`, `updateRadio`, `radioReady`.

O editor do NEON ENGINE carrega o `index.html` do projeto inteiro: copia a marcação do `<body>` (escondida) e roda todos os `<script>` na ordem, menos `js/main.js`. Por isso os scripts de UI **não podem quebrar no carregamento quando o laço do jogo não roda**, e o canvas do jogo tem que continuar sendo `<canvas id="c">`. Quando o editor estiver aberto, `window.NEON_EDITOR === true`.

## Regras gerais
- Nada de framework, `import`/`export`, TypeScript ou empacotador: scripts clássicos carregados em ordem pelo `index.html`.
- Three.js é o `projects/neon-coast/vendor/three.min.js` (r128). Não troque a versão.
- Bibliotecas externas: evite; se precisar, coloque o arquivo em `vendor/` do projeto (o jogo roda offline no `.exe`).
- Commits pequenos e com mensagem clara do que mudou. Não reescreva arquivos inteiros da área do outro agente.

## Rodar
- A pasta `projects/neon-coast/assets/` (modelos, mods, músicas — vários GB) **não está no repositório** (é conteúdo de terceiros e passa do limite do GitHub); ela existe só no PC do dono. Sem ela o jogo abre sem carros/pessoas/rádio.
- `npm install`, depois (na raiz) `npm run serve` e abrir `http://localhost:8080`, ou `npm start` (Electron). `npm run build` gera o `.exe` do jogo; `npm run editor` abre o NEON ENGINE.
- Testes do jogo: `npm run test:interface`, `npx --no-install electron projects/neon-coast/tools/test-economy.js`, `npm run test:physics`; da engine: `npm run test:editor`.
- Mais detalhes: `README.md` (raiz), `engine/README.md` e `projects/neon-coast/README.md`.
