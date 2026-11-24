# Espalhar os packs no mapa (vegetação e props de rua)

Gerador: `engine/tools/scatter-packs.js` (+ `engine/tools/scatter-packs-game.js`, que roda dentro do jogo). Coloca os modelos importados dos packs (`assets/objects/<id>/model.glb`: prefixos `vp_ vf_ sp_ gp_` = vegetação, `sa_ sf_` e `orelhao` = props de rua) em `maps/world.json`, campo `objects`, como objetos editáveis do NEON ENGINE. `mr_` (ruas modulares) e `iv_*` não são usados. Os `assets/` não vão para o git: sem eles o gerador não faz nada e o jogo ignora os objetos (ver Limites).

## Comandos
```
node engine/tools/scatter-packs.js --dry            # só gera e mostra o resumo (nada é gravado)
node engine/tools/scatter-packs.js                  # gera e grava (backup automático antes)
node engine/tools/scatter-packs.js --seed 7         # outra semente (padrão 20261124; mesma semente + mesmo mapa = mesmo resultado)
node engine/tools/scatter-packs.js --veg-max 1500 --props-max 400
node engine/tools/scatter-packs.js --clean          # remove só os itens gerados (tag), grava com backup
node engine/tools/scatter-packs.js --rep            # SÓ a troca da vegetação procedural pelos packs (ver 'Troca da vegetação procedural'); não toca nos outros itens da tag
node engine/tools/pack-collide.js                    # recalcula o colisor de cada modelo (campo "colisor" do object.json; ver 'Colisão')
opções: --summary (omite a lista por modelo) · --show (mostra a janela do jogo) · --tag nome · --project pasta · --map maps/outro.json
```
Saída de referência (`--dry`, semente padrão): `engine/docs/espalhar-packs-data/saida-dry.txt`. Não rode o gerador (nem outro `run-game-script.js`) ao mesmo tempo que outra janela de teste do jogo: elas dividem o perfil do Electron e uma delas trava.

**Refazer/limpar:** cada item gerado leva `"tag":"packs-auto"`. Rodar de novo remove todos os itens com a tag e recoloca; itens sem tag (os do usuário) não são tocados (o gerador os trata como obstáculos, afasta 2,5 m) e o resto do arquivo (`vehicles`, `terrain`, `world`, `spawn`…) é preservado byte a byte: o texto do arquivo só é cortado e colado entre `"objects": [` e `"vehicles"`.
**Backup e conferência:** antes de gravar copia o mapa para `maps/backup/world-<data>.json` (pasta no `.gitignore` e excluída do `.exe` por `build-game.js`; é diferente de `maps/.backup/`, que o editor usa a cada "Salvar") e confere, ainda em memória, que tudo fora de `objects` é idêntico e que os itens do usuário não mudaram; se falhar, não grava.
**Editor:** mover/girar/escalar um item gerado faz ele perder a tag (vira do usuário e sobrevive à próxima geração); duplicar também remove a tag da cópia (`engine/editor/engine.js`). Apagar um item gerado não é lembrado: a próxima geração o recoloca (para impedir, ponha um objeto seu no lugar: o gerador evita itens sem tag).

## Como o jogo desenha (js/world/placements.js)
- Objeto `type:'gltf'` com `"veg":1` (vegetação, pincel do editor) ou `"batch":1` (props, rochas, troncos) é desenhado em lote: o mesmo modelo vira um `InstancedMesh` por submalha/material do GLB, agrupado em células de 200 m (`MAP_INST_CELL`), com corte por distância e por frustum por lote (`VEG_CHUNKS` / `updateVegetationCulling`). Nunca um Mesh clonado por objeto. Sem `veg`/`batch` o objeto continua sendo um grupo clonado (peças únicas do usuário).
- Alcance por tamanho do modelo: `clamp(50 + max(altura, 0,6·lado)·28, 80, 240)` m (capim e props ~80 m, arbusto ~95 m, árvore de 7 m ou mais 240 m). Sombra: só modelo de ≥8 m de altura projeta (e só a menos de 80 m, regra antiga do `foliage-lib.js`); capim, flores, arbustos e props pequenos não. Folhagem com alpha não recebe sombra (evita acne em folha de dupla face).
- Alpha mask e dupla face vêm do material do GLB e funcionam nas instâncias (conferido: `alphaTest 0.5`, `side 2`).
- Ajustes de material: o jogo desenha em espaço linear, então as texturas dos packs (que o GLTFLoader marca como sRGB) saíam escuras e copas inteiras ficavam pretas; as texturas passam a ser lidas como lineares, o normal map forte das folhas (escala 1,5–4) é descartado num clone do material e a folha ganha uma emissão fraca da própria textura, só de dia (`dayF`).
- Colisão: ver a seção 'Colisão' abaixo (mede a malha; a versão anterior usava a caixa do modelo e ficava muito maior que o objeto).
- Modelo ausente (outro PC): o lote é ignorado, só um `console.info` por modelo (o navegador ainda registra uma requisição 404 por modelo ausente, mas não há erro de script). No editor continua a caixa magenta. Testado com três refs inexistentes (veg, batch e solta): o jogo iniciou normalmente, sem erro e sem caixa magenta.
- Edição: o editor monta cada def como um grupo próprio (mover/girar/apagar/desfazer pelo mecanismo normal, com snapshots do mapa) e grava a def em `world.json`; o jogo reconstrói os lotes ao abrir o mapa. Não se edita a instância "dentro" do lote em jogo, e não precisa.

## Colisão (corrigida)
Bug anterior: prop, rocha e tronco caído colidiam com a CAIXA delimitadora inteira e a árvore com um raio de 0,28–0,6 m calculado pela altura, bem maior que o tronco real.
- `engine/tools/pack-collide.js` (Node puro, lê o `model.glb`) mede a malha e grava em `assets/objects/<id>/object.json` o campo `"colisor": { "tipo", "h", "c": [[x,z,r],...] }` (círculos no plano do modelo, escala 1). Rode de novo depois de importar um pack: `node engine/tools/pack-collide.js [--only vf_,sa_] [--dry|--list]` (209 modelos, 0 erros). Os `assets/` não vão para o git, então o campo também não.
- `placements.js` (`mapBatchColliders`) lê o campo (`mapLoadMeta`, uma requisição por modelo) e usa o MESMO colisor de sempre: `addCollider` com caixa quadrada de meio-lado r (equivale ao `addRound`; jogador, carros, NPCs, polícia e câmera já usam `nearby`/`pushOut` sobre isso). Cada círculo é movido, girado e escalado pela instância.
- Regras: **capim, grama, flores, rasteiras, mudas e arbustos ≤ 1,5 m: sem colisor** (tipo `nenhum`; 124 modelos). **Arbusto > 1,5 m** (já na escala do mapa): um círculo central de 0,12–0,3 m. **Árvore (≥ 5 m)**: um círculo só no tronco; o raio é a largura da casca (malha opaca) cortada a 1 m do chão (percentil 75 da distância ao eixo), limitado a 0,15–0,8 m depois da escala; a copa nunca entra. **Rocha e tronco caído**: casco convexo dos vértices e cortes da base (até 35% da altura), fatias ao longo do eixo principal, um círculo por fatia (rocha até 4, tronco até 6), raio = 85–90% da meia largura da fatia. **Props (lixeira, banco, hidrante, caçamba, barreira, placa, poste…)**: o mesmo método com a base (até 30% da altura), 92% da meia largura (mínimo 8 cm em prop de 0,5 m ou mais). Contagem: nenhum 124 · prop 53 · tronco 19 · arbusto 5 · tronco caído 2 · rocha 6.
- Sem o campo (assets antigos): folhagem = sem colisor; árvore alta = tronco fino de 0,2 m; prop/rocha ≥ 0,8 m = um círculo central de 35% do menor lado (nunca a caixa).
- O jogador tem raio 0,5 m (`pushOut(p, 0.5, …)`), então ele para a 0,5 m + r do centro: árvore ~0,65–0,8 m, lixeira ~0,72 m.
- Teste no jogo: `espalhar-packs-data/colisao-teste.js` (via `run-game-script.js`; o jogador anda de frente contra cada alvo por 4 s). Resultados em 'Verificação feita'.

## Troca da vegetação procedural pelos packs
`js/world/vegetation.js` continua calculando TUDO (mesma sequência de `rnd/rr`: o mundo de fundo, os pântanos e a posição de cada árvore não mudam) e anota cada posição em `VEGREC` (entidades editáveis: árvore de rua, carvalho, cipreste, pinheiro e arbusto, com id `kind@x,z`) e `VEGREC_G` (tufos, capim, samambaia e gramado de parque). O interruptor é `PACK_VEG` (vegetation.js): liga quando o mapa tem objetos com o campo `"rep"` **e** os assets existem (HEAD síncrono em `assets/objects/vf_betula_1/model.glb`). Ligado, as instâncias procedurais das espécies trocadas (`trunk branch needle leaf moss knee bush grass fern tallGrass darkGrass weeds dryTuft twigs agave`) viram no-op e os colisores delas não são criados; sem os assets (outro PC) ou com `&packveg=0` na URL o jogo desenha a procedural de sempre. Mantidos: palmeiras (os packs não têm palmeira), juncos, vitórias-régias, troncos e rochas procedurais.
- **Árvores e arbustos** (entidades editáveis): `scatter-packs.js --rep` grava objetos `veg:1`, `tag:"packs-auto"`, `rep:"<id da entidade>"` em `maps/world.json`, nas MESMAS posições (`scatter-packs-game.js`, `genReplacements`). Espécie por contexto, 2 por célula de 200 m: árvore de rua = bétulas/carvalho/freixo/ameixeira/macieira (`urbanTrees`); carvalho de colina = carvalho/freixo/bétulas (`hillTrees`); pinheiro = pinheiro/abeto (`pines`); cipreste do pântano = pinheiro/coníferas mortas/abeto (`swampTrees`); arbusto = mudas e arbustos leves (`repShrubs`). `vf_arvore_024` ficou de fora das paletas (textura toda cinza 34/255, saía preta). Altura sorteada na faixa da espécie; o pé usa o ponto mais baixo em volta.
- **O que o usuário editou é respeitado**: entidade com `"del"` em `world` não é trocada (hoje 1323 de 2949: árvore de rua 491, cipreste 323, carvalho 190, arbusto 311, pinheiro 8); `d/r/s` (mover, girar, escalar) são aplicados à posição, ângulo e escala do modelo; objeto `rep` que o usuário mexeu no editor (perde a tag mas mantém o `rep`) não é duplicado nem regenerado; objetos sem tag nunca entram na regeneração. `placements.js` não acusa "alteração não achou o prédio" para esses ids. Com `--rep` os outros itens da tag (props, rochas, mato do espalhamento de antes) ficam como estão no arquivo, inclusive o que o usuário apagou à mão.
- **Tufos, capim, samambaia e gramado** (não eram editáveis): sem arquivo no mapa. `buildPackGrass()` (placements.js, no jogo e no editor) lê `VEGREC_G` e desenha UM modelo por mancha (dois se tinha 5 tufos ou mais) com `buildVegGroup` (InstancedMesh por modelo e célula de 200 m). Paleta por célula e grupo (`PACK_GRASS`): capim = `sp_grama_blades`, `gp_*_tall_patch`, `gp_green_alpha_tall_grama_*`, tundra; parque = grama/folha/patch menores; seco (encosta) = patches amarelos; samambaia = `sp_5_folha_ground_planta` (+ samambaias vp); flor/mato = dente-de-leão e camomila. As texturas dos packs são escuras (média ~64,53,22 nos `gp_*`), então os modelos mais verdes pesam mais. Isso evita ~8 mil objetos a mais em `world.json` (e 8 mil grupos no editor, com o desfazer guardando o mapa inteiro).
- **Editor**: as 2949 entidades procedurais saem da lista com `PACK_VEG` ligado (6249 → 3300; as 611 palmeiras ficam); as 1626 que não foram apagadas pelo usuário viram objetos `rep` (editáveis como qualquer objeto). O pincel "apagar originais" só enxerga o que ainda é entidade. O capim dos packs aparece no editor mas não é selecionável.

## Regras de colocação (usa a geometria real do jogo)
O gerador abre o jogo (Electron oculto, com o mapa sem os itens da tag) e usa `carGroundHeight` (terreno com a escultura do usuário, calçada a 0,3 m), `CITY_BLOCKS`, colisores dos prédios, `WENT` (entidades de `street-life.js`), `FAVS`, `onHighway`, pântano/água etc. Cada item verifica: dentro do mapa, fora d'água, sem colisor de prédio por perto, a ≥3 m das entidades do street-life (placas, hidrantes, lixo, caçamba, entulho, papelão), a ≥4,5 m das árvores já existentes, longe dos postes, do carro e do spawn do mapa, e sem sobrepor outro item gerado. O pé do objeto usa o ponto mais baixo em volta (nada flutua em encosta) e afunda um pouco.
- **Parques e praças**: árvores onde o ruído de baixa frequência é alto, arbustos/flores em outras manchas, capim e rasteiras em manchas mais finas; nunca nos caminhos, no lago (raio de 8,6 m do ponto onde o jogo pode ter um) nem fora do gramado; bancos junto aos caminhos virados para eles, em anel na praça virados para a fonte; lixeiras.
- **Calçadas**: árvores de rua a cada 18–25 m por lado (probabilidade por tipo de quarteirão), alternando as 2 espécies da paleta da célula, afastadas dos cantos (poste, placa, faixa de pedestre); arbustos/vasos só encostados em fachada; lixeiras (em ~34% das esquinas e a cada ~35 m nas calçadas movimentadas), hidrantes esparsos, orelhão perto de esquinas movimentadas, ponto de ônibus e caixa de correio raros, cones/tambores/barreira só ocasionais perto de cruzamento, caçamba em quadra residencial, lixo miúdo (garrafa, copo, caixa) em poucos pontos.
- **Fora da cidade**: manchas (capim denso + arbustos + às vezes árvore, rocha e tronco) nas margens da Via Dutra, bordas das cidades (baldios), encostas (rochas em grupos pequenos) e orla/margem (de 0,35 a 2,4 m acima da água); nunca em pista, cidade (+7 m), pântano, água ou favela.
- **Favelas**: pouca vegetação (franja do morro) e mais lixo: sacos, papelão, tambores e caçamba ao longo da ladeira, fora da pista.
- **Paletas por célula de 200 m**: cada célula usa só 2 espécies de árvore, 1 de arbusto, 1 de flor e 2–3 de rasteira (sorteio determinístico que favorece modelos com menos primitivas e menos triângulos). É isso que segura as chamadas de desenho: o custo é (espécies × lotes visíveis × submalhas). A massa usa modelos de <8 mil triângulos; `orelhao` (11 mil) e arbustos de ~6 mil entram como destaque. `vf_bordo` foi tirado das paletas (renderizava escuro demais mesmo com os ajustes).
- **Orçamento**: `--veg-max 2500` e `--props-max 800` são tetos duros; cada categoria também tem teto (árvores 62%, arbustos 20%, rasteiras 50% do teto de vegetação). Com a configuração atual os props não chegam ao teto (565 de 800).

## Contagens (semente 20261124)
Vegetação `veg:1`: 2213 (de 2500) · props e rochas `batch:1`: 691 (props 565 de 800 + 107 rochas + 19 troncos) · total 2904 objetos · 63 modelos distintos · 497 lotes (modelo × célula de 200 m) em 716 InstancedMesh (um por submalha). Lista completa por modelo em `saida-dry.txt`.
Por categoria de colocação: árvores 463 · arbustos 500 · rasteiras/flores 1250 · props 565 · rochas 107 · troncos 19.
Por categoria dos packs: Vegetação (pacotes) 2213 · Props urbanos (BR) 453 · Lixo de rua 69 · Floresta (pacote: rochas e troncos) 126. Maiores grupos: `gp_green_tall_patch` 199, `gp_yellow_tall_patch` 153, `sp_grama_blades` 149, `vf_caducifolia_arbusto` 145, `sf_lixeira_azul` 142, `vp_silvery_glade_samambaia_var_g` 139, `sf_lixeira_de_rua` 103, `vf_betula_2` 78, `vf_betula_3` 70, `vf_carvalho` 57, `vf_freixo` 52, `vf_betula_1` 51, `sf_banco_de_praca` 38, `orelhao` 14.

## Desempenho antes/depois
`projects/neon-coast/tools/perf-profile.js` (cenários a = centro de SP parado, b = avenida dirigindo, e = estresse), 2 execuções cada, em sequência, mesma máquina de `desempenho-fase0.md` (i5-10400F, GTX 1660 SUPER, janela 1264x655). "Antes" = o mesmo jogo com o mapa original (`&map=maps/backup/world-2026-11-24T14-48-14.json`, sem objetos); "depois" = mapa com os 2904 itens. Dados brutos em `engine/docs/espalhar-packs-data/perf/`, resumo em `perf-resumo.txt` (`summarize-perf.js`).

| Cenário | | Chamadas c/ sombra (sem) | Triângulos c/ sombra | Materiais | Malhas instanciadas / instâncias | `postRender` ms | Quadro ms | GPU ms | fps real |
|---|---|---|---|---|---|---|---|---|---|
| a) centro SP | antes | 720 (538) | 1,45 M | 908 | 678 / 94,8 mil | 9,08 | 14,4 | 8,8 | 55,4 |
| | depois | 784 (589) | 2,01 M | 978 | 1394 / 98,6 mil | 8,44 | 14,1 | 8,0 | 58,7 |
| b) avenida | antes | 578 (439) | 1,17 M | 805 | 678 / 94,7 mil | 7,45 | 12,4 | 7,8 | 55,3 |
| | depois | 616 (479) | 1,47 M | 960 | 1394 / 98,5 mil | 7,40 | 12,5 | 7,7 | 57,6 |
| e) estresse | antes | 766 (572) | 1,66 M | 1030 | 678 / 94,8 mil | 8,94 | 15,3 | 8,1 | 47,8 |
| | depois | 883 (667) | 2,19 M | 1127 | 1394 / 98,6 mil | 9,37 | 16,0 | 8,6 | 44,4 |

Leitura honesta: o custo em chamadas de desenho é de +38 (b) a +64 (a) com sombra e +117 no estresse (onde as duas execuções "antes" já variavam de 695 a 837 chamadas por causa da multidão). O `postRender` ficou dentro do ruído de ±2–3 ms (−0,6, −0,05 e +0,4 ms), abaixo do limite de 1,5 ms, e a GPU também. O limite de ~60 chamadas foi ultrapassado em a (por 4) e em e (muito, mas dentro do ruído do cenário), sem custo mensurável de render; aceitei porque cortar mais exigiria esvaziar células já esparsas. Triângulos subiram 0,3–0,55 M (a GPU não respondeu). A primeira versão (3 árvores por célula, alcance até 440 m) custava +85/+135/+108 chamadas e +4,0/+0,7/+1,6 ms (dados em `perf/v1-primeira-versao/`); o que reduziu foi o alcance máximo 440→240 m e paletas menores favorecendo modelos leves. Para custar menos ainda: `--veg-max`/`--props-max` menores, ou reduzir `NPAL` em `scatter-packs-game.js`.

## Verificação feita
- Capturas no jogo (praça de SP, parque do Rio, avenida de SP, descida de morro do Rio, Morro da Esperança): escala certa (árvores 7–12 m, lixeira ~1 m, banco ~1,8 m), folhagem com textura e recorte de alpha, nada flutuando, enterrado ou no meio da rua nessas vistas.
- `npx electron projects/neon-coast/electron/main.js --selftest` e `npx electron engine/app --selftest`: `ok:true`.
- Editor (`engine/docs/espalhar-packs-data/editor-packs.js` via `--selftest --script`): os 2904 itens aparecem como entidades; um de vegetação e um prop foram selecionados, movidos/girados (perdem a tag), desfeitos (a tag volta), apagados e restaurados.
- `maps/world.json`: fora de `objects` idêntico ao original (conferido por comparação de JSON e das linhas depois de `objects`).

## Troca da procedural: desempenho e verificação (24/11/2026)
Mesmo método de 'Desempenho antes/depois' (perf-profile.js, `--show`, mesma máquina). "Antes" = o mapa de antes da troca (`maps/backup/world-2026-11-24T18-58-18.json`: procedural que o usuário não apagou + packs espalhados) com `&map=`; "depois" = `PACK_VEG` ligado (1626 árvores/arbustos `rep` + capim dos packs em execução). Cenário a: 2 execuções; b: 4; e: 1 antes (a segunda falhou/travou) e 2 depois. Dados brutos e resumo em `espalhar-packs-data/perf-troca/`.

| Cenário | | Chamadas c/ sombra (sem) | Triângulos c/ sombra | Materiais | Malhas instanciadas / instâncias | `postRender` ms | Quadro ms | GPU ms |
|---|---|---|---|---|---|---|---|---|
| a) centro SP | antes | 737 (575) | 1,93 M | 970 | 1272 / 97,7 mil | 8,54 | 13,3 | 7,96 |
| | depois | 722 (546) | 1,67 M | 938 | 1551 / 39,6 mil | 8,13 | 12,8 | 8,42 |
| b) avenida | antes | 626 (475) | 1,29 M | 922 | 1272 / 97,7 mil | 7,21 | 12,0 | 8,72 |
| | depois | 542 (407) | 1,29 M | 973 | 1551 / 39,5 mil | 7,46 | 12,5 | 6,88 |
| e) estresse | antes | 819 (639) | 1,71 M | 1276 | 1272 / 97,7 mil | 9,28 | 15,8 | 7,62 |
| | depois | 706 (495) | 1,76 M | 1038 | 1551 / 39,6 mil | 8,71 | 15,1 | 7,73 |

Leitura honesta: as chamadas de desenho caem em todos (−15, −84 e −113 com sombra); o `postRender` fica dentro do ruído (−0,4, +0,25 e −0,6 ms; em b as execuções de "antes" vão de 6,7 a 7,7 ms e as de "depois" de 6,7 a 8,1 ms, por causa do trânsito aleatório). Não melhorou de forma mensurável o tempo de render, só as chamadas. O número de instâncias cai de 97,7 mil para 39,5 mil (1 modelo por mancha em vez de 4–8 cartões) e os materiais ficam parecidos; as malhas instanciadas sobem de 1272 para 1551 (mais modelos distintos, mas poucas visíveis por vez).

Contagens (semente 20261124): entidades procedurais trocadas = 1626 (árvore de rua 78, cipreste 17, carvalho 590, pinheiro 252, arbusto 689); 1323 já estavam apagadas pelo usuário (`del`) e continuam apagadas; 19 modelos distintos nas árvores/arbustos (244 lotes, 405 primitivas); capim: 8068 manchas procedurais → 8471 modelos dos packs em 15 modelos distintos (capim 5620, parque 929, samambaia 617, flor 695, seco 610), 0 chamadas extras por colisor.

Colisão medida no jogo (jogador a pé andando de frente contra o alvo, `colisao-teste.js`, raio do jogador 0,5 m; "parou a" = distância do centro do alvo):
| Alvo | Escala | Colisor (meio-lado) | Resultado |
|---|---|---|---|
| bétula `vf_betula_2` | 0,39 | 0,15 m, altura 8,6 m | bloqueia, para a 0,74 m |
| carvalho `vf_carvalho` | 0,46 | 0,15 m, altura 8,7 m | bloqueia, para a 0,55 m |
| arbusto alto `vf_conifera_arbusto` (1,8–1,9 m) | 0,56–0,6 | 0,15–0,16 m | bloqueia no centro, para a 0,65 m |
| muda/arbusto baixo `vp_rose_hip_var_b` | 1,73 | nenhum | atravessa |
| capim `sp_grama_blades`, `gp_green_tall_patch` | 3,4 / 1,86 | nenhum | atravessa |
| lixeira `sf_lixeira_azul` | 1 | 0,22 m (bbox 0,55 m) | bloqueia, para a 0,72 m |
| banco `sf_banco_de_praca` | 1 | 2 × 0,31 m | bloqueia, para a 1,04 m |
| rocha `vf_rocha_lisa_grande` | 0,88–1,02 | 1,16–1,34 m (bbox 3,4 m ≈ meio-lado 1,7) | bloqueia, para a 1,6–1,8 m |
| tronco caído | 1,16 | 6 círculos de 0,17–0,37 m | bloqueia, para a 0,6 m |
Antes: árvore 0,28–0,6 m, lixeira/banco/rocha/tronco = caixa inteira do modelo (lixeira 0,275, banco 0,5×0,9, rocha 1,7, tronco caído ~3,5×0,4 m).

Capturas (`run-game-script.js --shot`, olhadas): parque de SP (-37,63), avenida com árvores de rua (-19,-215) e morro/colina do Rio (1179,-5), "antes" (`&map=` do backup) e "depois": escala certa (árvore de rua ~9–12 m), texturas e recorte de folha, nada flutuando, nada na pista, copas não pretas. Diferenças visíveis: a folhagem dos packs é mais amarelada/oliva que a procedural (texturas de folha ~65,77,12), o capim fica mais escuro e menos denso nas encostas, e as bétulas de rua ficam bem maiores que as procedurais. As capturas ficam em `espalhar-packs-data/` não: foram feitas na pasta temporária de testes.
- `npx electron projects/neon-coast/electron/main.js --selftest` e `npx electron engine/app --selftest`: `ok:true` (editor: 3906 objetos, 0 erros). `editor-packs.js`: um item `rep` (bétula) e um prop selecionados, movidos (perdem a tag), desfeitos, apagados e restaurados sem erro.
- Editor: entidades (`WENT`) 6249 → 3300 e objetos 2280 → 3906 (os 1626 `rep`).

## Limites e o que não foi verificado
- Não medi 1080p, noite, PC fraco nem o fps do editor com 2904 grupos (abre normalmente; o desfazer guarda um snapshot do mapa inteiro, ~0,55 MB cada, até 300).
- Não olhei de perto a orla/praia, favela por dentro, hidrante/orelhão/ponto de ônibus nem todos os parques; o gerador relatou 24 itens com altura "suspeita" (>0,6 m acima ou >1 m abaixo do chão) em encostas, não inspecionados um a um.
- Troca da procedural: o capim só foi visto em parque de SP e na colina do Rio; não olhei pântano (ciprestes trocados por pinheiro/abeto/coníferas mortas: 17 restantes), morro de favela, praia nem a noite; a copa dos packs fica amarelada/oliva (limite das texturas). O espalhador completo (sem `--rep`) recoloca também o que o usuário apagou à mão dos itens antigos; use `--rep` para só trocar a procedural. `pack-collide.js` mede o corte a 1 m só da malha opaca: árvore sem casca opaca cai em 'tronco fino' (0,2 m). Colisão de arbusto > 1,5 m depende da escala do mapa (o arbusto de 1,4 m não colide).
- Orientação dos bancos/ponto de ônibus supõe a frente do modelo em +z; não conferi a frente de cada um.
- Colisores (tronco, caçamba, banco, rocha) medidos só com o jogador a pé; não testados com trânsito/IA nem com a polícia (carros usam o mesmo `pushOut`, mas não rodei um carro contra eles).
- Se o relevo for esculpido de novo depois de gerar, itens podem ficar flutuando/enterrados: rode o gerador de novo.
- O lago dos parques existe em ~50% (sorteio do jogo); o gerador deixa o espaço vazio nos dois casos.
- `street-life.js` não foi alterado (hidrante, saco de lixo e caçamba continuam procedurais e o gerador se afasta deles). `vegetation.js` agora tem o interruptor `PACK_VEG` (ver 'Troca da vegetação procedural').
