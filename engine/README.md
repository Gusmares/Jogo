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
- **Editar o mapa original:** clique em qualquer prédio, casa, torre, marco (MASP, Copan, Cristo, bondinho…) ou casa de favela da cidade gerada pelo código: dá para **mover, girar, mudar o tamanho, assentar no chão e apagar** como um objeto colocado. São ~2.200 entidades (tipo@x,z), capturadas enquanto a cidade é montada (`collision.js`: `WENT`); a alteração mexe só nos vértices daquela entidade dentro das malhas juntadas (mesmo desempenho) e nas colisões dela. Apagados e alterados aparecem na lista da cena com **Restaurar original**. No arquivo: `world: { "<id>": { d: [dx,dy,dz], r: graus, s: escala } | { del: 1 } }`. Se a planta do quarteirão mudar, os prédios dele mudam de id e a alteração antiga deixa de valer (o jogo avisa no console).
- **Terreno (B):** pincéis **Subir, Descer, Suavizar, Nivelar e Irregular**, com tamanho (4–240 m, `[` `]`) e força; Shift inverte. Baixar abaixo do nível do mar vira água (lagos, baías, canais); subir no mar cria terra — dá para mudar o desenho da costa e do mapa dentro da área da grade (≈4 km × 1,7 km). Atualiza a malha ao vivo, entra no desfazer e é salvo como diferença do relevo original (`terrain: { unit, rows }`, só as linhas que mudaram). Árvores e grama se acomodam ao recarregar; prédios e ruas não sobem junto.
- **Importar modelo 3D:** **FBX, glTF/GLB, OBJ (+MTL), DAE, STL, PLY e 3DS**, com texturas PNG/JPG/TGA/DDS/BMP (escolha os arquivos ou a pasta inteira). O editor acerta a unidade (automático, metros, centímetros da Unreal/3ds Max/Maya, polegadas), o eixo (Z para cima) e põe a base no chão; mostra prévia, medidas e texturas que faltaram; e grava um **GLB** em `<projeto>/assets/objects/<id>/model.glb` (o jogo só lê GLB, com `vendor/GLTFLoader.js`). Personagens com esqueleto entram parados na pose de ligação. **GTA SA (DFF + TXD)** continua no mesmo botão (`engine/tools/import-object.js`, vai para `assets/models/<id>`).
- **Exportar:** o selecionado (objeto colocado, carro do jogo ou prédio da cidade original), todos os objetos colocados, ou uma **região do mapa** em volta da câmera (terreno, cidade recortada, árvores/postes e objetos; raio até 800 m) em **GLB** (com texturas — abre na Unreal Engine 5 nativamente, no Blender e na Unity com o pacote glTFast) ou **OBJ** (só geometria, abre em tudo). Metros e Y para cima. FBX não dá para exportar (o three.js não tem exportador de FBX); de GLB o Blender converte para FBX se precisar.
- **Testar (F5):** salva e abre o jogo do projeto começando onde a câmera aponta (`<entrada>?test=x,y,z,graus`). **Gerar .exe** salva e roda `engine/tools/build-game.js` no projeto.

## Arquivo do mapa (`maps/world.json`)
Um objeto por linha (bom para o git): `layouts` (planta), `landmarks` (marcos de SP), `objects` (`type` prefab/model, `ref`, `pos`, `rot` em graus, `scale`, `p` parâmetros, `solid`/`walk`), `vehicles` (geradores: `model`, `pos`, `h`, `color`) e `spawn`. Cada "Salvar" guarda uma cópia em `maps/.backup/` (as 30 últimas, fora do git). É o equivalente aos IDE/IPL do SA.

## Arquivo do projeto (`neon.project.json`)
```json
{ "format": "neon-project", "version": 1, "name": "NEON COAST", "engine": "0.2", "entry": "index.html", "map": "maps/world.json",
  "build": { "name": "NEON COAST", "include": ["index.html", "package.json", "css", "js", "vendor", "electron", "maps", "assets/models", "..."] } }
```
O projeto também tem um `package.json` com `"main"` apontando para o app Electron do jogo (`electron/main.js`).

## Física estilo GTA IV
A física dos carros tem um **modo GTA IV** (padrão; F7 no jogo alterna com o modo NEON). Ele usa o `handling.dat` da cópia local do GTA IV: `node engine/tools/gta4-handling.js` lê `research/gta4/*/data/handling.dat` (fora do git) e gera `<projeto>/assets/physics/gta4-handling.json`. O estudo completo — o que cada campo faz, por que o IV tem aquele jeito, como foi adaptado, medidas e o que dá para ajustar — está em [`docs/fisica-gta4.md`](docs/fisica-gta4.md).

## IA e movimento estilo GTA IV
Pedestres com personalidade e jeito de andar próprios, reações a eventos (tiro, briga, batida, atropelamento, roubo de carro…), motoristas que fogem, largam o carro ou descem irritados, polícia com linha de visão e círculo de busca, e movimento do jogador com inércia. Estudo e medidas em [`docs/ia-gta4.md`](docs/ia-gta4.md). Para testar IA dentro do jogo: `npx electron projects/neon-coast/tools/run-game-script.js <script.js>` (o script pode usar `__run(segundos)`).

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
`editor/editor.html` + `editor/boot.js` (carrega o projeto), `editor/engine.js` (câmera, seleção, gizmo, desfazer, salvar, edição da cidade original), `editor/terrain-tool.js` (pincéis de terreno), `editor/io3d.js` (importar/exportar 3D), `editor/ui.js` (painéis e janelas), `editor/editor.css`, `editor/vendor/` (gizmo, leitores FBX/glTF/OBJ/MTL/DAE/STL/PLY/3DS/TGA/DDS e exportadores GLB/OBJ do three r128). `npm run test:editor -- --script <arquivo.js>` roda um script dentro do editor aberto e imprime o resultado. `app/main.js` (janela, projetos recentes em `neon-engine.json` no perfil do usuário, janela de teste do jogo) e `app/engine-api.js` (salvar, listar modelos, importar, gerar `.exe`, trocar de projeto). O servidor monta a pasta do projeto na raiz e a interface do editor em `/__ed/`.
