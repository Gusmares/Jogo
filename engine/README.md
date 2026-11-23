# NEON ENGINE

Engine e editor de mapa para jogos de mundo aberto no estilo GTA San Andreas, feitos com Three.js (r128, scripts clássicos) e empacotados com Electron. Ela trabalha com **projetos**: pastas com um `neon.project.json`. O primeiro projeto é o **NEON COAST** (`projects/neon-coast`).

## O que é da engine e o que é do projeto
| Engine (`engine/`) | Projeto (`projects/<nome>/`) |
|---|---|
| `app/` — o programa desktop (NEON ENGINE.exe) e a API local `/__engine/*` | `neon.project.json` — nome, ponto de entrada, mapa e o que entra no `.exe` |
| `editor/` — interface do editor (viewport, biblioteca, gizmo, planta, importação) | `index.html`, `js/`, `css/`, `vendor/three.min.js` — o jogo (mundo, física, gameplay, HUD) |
| `tools/` — leitores do SA (`rw`, `dff`, `txd`), conversores de carro/arma/skin/objeto, servidor, empacotadores | `maps/world.json` — o mapa salvo pelo editor |
| | `assets/` — modelos convertidos, animações, rádio e os mods originais (fora do git) |
| | `electron/` — o app do jogo; `tools/` — configurações de mods, catálogo e testes do jogo |

As ferramentas da engine sempre gravam **no projeto aberto**: variável `NEON_PROJECT`, senão o projeto do script que chamou, senão a pasta atual, senão `projects/neon-coast` (`engine/tools/project.js`).

O mundo do NEON COAST (cidades, física, `js/world/placements.js` que monta os objetos do mapa) ainda é código do projeto. A engine abre o projeto carregando o `index.html` dele (todos os `<script>` na ordem, menos `js/main.js`) e põe as ferramentas por cima. Por isso o editor mostra exatamente o mundo do jogo. Separar um "runtime" genérico (para criar projetos novos do zero) é o próximo passo.

## Abrir
- **Programa:** `dist/NEON ENGINE-win32-x64/NEON ENGINE.exe` (gerado com `npm run build:editor`). Abre o último projeto usado; o botão com o nome do projeto, no canto de cima, mostra os projetos e abre outra pasta. O `.exe` usa a pasta `engine/` do repositório (o caminho fica em `engine/app/engine.json`), então melhorias no editor não exigem gerar o `.exe` de novo — só se a pasta do repositório mudar de lugar.
- **Desenvolvimento:** `npm run editor` (ou `npx electron engine/app --project <pasta>`).
- **Navegador:** `npm run serve` e `http://localhost:8080/__ed/editor.html` (o jogo fica em `http://localhost:8080`).

## Editor de mapa
- **Câmera:** botão direito + WASD voa, Q/E desce/sobe, Shift acelera, roda do mouse aproxima (com o botão direito, muda a velocidade), botão do meio arrasta, **T** vista de cima, **F** foca o selecionado.
- **Biblioteca (esquerda):** *Objetos* prontos (cubo, plataforma, rampa, cilindro, muro, prédio com fachada da cidade, casa, galpão, poste, orelhão, banca, ponto de ônibus, lixeiras, banco, cone, barreira, árvores, palmeira, mesas, guarda-sol…), *Modelos* convertidos de mods e *Veículos* do catálogo. Clique e depois clique no mapa; **Shift** coloca vários, **R** gira 15°, **Esc** ou botão direito cancela. Dá para empilhar sobre outros objetos.
- **Editar:** **W** mover, **E** girar, **R** escala (gizmo com encaixe na grade, **X** liga/desliga; **L** eixos do mundo/do objeto), **G** assenta no chão, **Ctrl+D** duplica, **Del** apaga, **Ctrl+Z / Ctrl+Y** desfaz/refaz. O painel da direita lista a cena e mostra as propriedades: posição, rotação, escala, medidas, material, cores, e se o objeto **colide** e é **pisável** no jogo. Arrastar o nome do campo (X, Y, Z…) ajusta o valor.
- **No jogo:** objetos sólidos viram colisão; **rampas e pisos baixos são pisáveis** (carro sobe na rampa e pula; o personagem anda por cima). Carros colocados são **geradores**: aparecem estacionados quando o jogador chega perto. O **ponto de partida** define onde o jogador começa.
- **Planta da cidade:** grade com cada quarteirão das cidades do projeto. Pinte o tipo (residencial, prédios médios, torres, industrial, shopping, estádio, parque, praça, orla, **terreno vazio**) ou um marco de SP e aplique: o editor salva e recarrega o mundo. "Planta original" volta ao mapa do código. Mudar a planta sorteia de novo os prédios da cidade.
- **Importar DFF:** traz um objeto de mod do GTA SA (`.dff` + `.txd`) para a biblioteca do projeto, com textura (`engine/tools/import-object.js`). Fica em `<projeto>/assets/models/<id>` com `kind: "object"`.
- **Testar (F5):** salva e abre o jogo do projeto começando onde a câmera aponta (`<entrada>?test=x,y,z,graus`). **Gerar .exe** salva e roda `engine/tools/build-game.js` no projeto.

## Arquivo do mapa (`maps/world.json`)
Um objeto por linha (bom para o git): `layouts` (planta), `landmarks` (marcos de SP), `objects` (`type` prefab/model, `ref`, `pos`, `rot` em graus, `scale`, `p` parâmetros, `solid`/`walk`), `vehicles` (geradores: `model`, `pos`, `h`, `color`) e `spawn`. Cada "Salvar" guarda uma cópia em `maps/.backup/` (as 30 últimas, fora do git). É o equivalente aos IDE/IPL do SA.

## Arquivo do projeto (`neon.project.json`)
```json
{ "format": "neon-project", "version": 1, "name": "NEON COAST", "engine": "0.2", "entry": "index.html", "map": "maps/world.json",
  "build": { "name": "NEON COAST", "include": ["index.html", "package.json", "css", "js", "vendor", "electron", "maps", "assets/models", "..."] } }
```
O projeto também tem um `package.json` com `"main"` apontando para o app Electron do jogo (`electron/main.js`).

## Comandos (na raiz do repositório)
| Comando | O que faz |
|---|---|
| `npm run editor` | abre o NEON ENGINE |
| `npm run build:editor` | gera `dist/NEON ENGINE-win32-x64/NEON ENGINE.exe` |
| `npm run test:editor` | abre o editor no NEON COAST, espera o mundo montar e sai com o resultado |
| `npm run serve` | servidor do projeto + editor no navegador |
| `npm start` / `npm run build` | roda / empacota o projeto NEON COAST (`dist/NEON COAST-win32-x64/NEON COAST.exe`) |
| `node engine/tools/build-game.js <pasta>` | empacota qualquer projeto |

## Código
`editor/editor.html` + `editor/boot.js` (carrega o projeto), `editor/engine.js` (câmera, seleção, gizmo, desfazer, salvar), `editor/ui.js` (painéis e janelas), `editor/editor.css`, `editor/vendor/TransformControls.js` (gizmo do three r128). `app/main.js` (janela, projetos recentes em `neon-engine.json` no perfil do usuário, janela de teste do jogo) e `app/engine-api.js` (salvar, listar modelos, importar, gerar `.exe`, trocar de projeto). O servidor monta a pasta do projeto na raiz e a interface do editor em `/__ed/`.
