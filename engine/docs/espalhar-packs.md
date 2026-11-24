# Espalhar os packs no mapa (vegetação e props de rua)

Gerador: `engine/tools/scatter-packs.js` (+ `engine/tools/scatter-packs-game.js`, que roda dentro do jogo). Coloca os modelos importados dos packs (`assets/objects/<id>/model.glb`: prefixos `vp_ vf_ sp_ gp_` = vegetação, `sa_ sf_` e `orelhao` = props de rua) em `maps/world.json`, campo `objects`, como objetos editáveis do NEON ENGINE. `mr_` (ruas modulares) e `iv_*` não são usados. Os `assets/` não vão para o git: sem eles o gerador não faz nada e o jogo ignora os objetos (ver Limites).

## Comandos
```
node engine/tools/scatter-packs.js --dry            # só gera e mostra o resumo (nada é gravado)
node engine/tools/scatter-packs.js                  # gera e grava (backup automático antes)
node engine/tools/scatter-packs.js --seed 7         # outra semente (padrão 20261124; mesma semente + mesmo mapa = mesmo resultado)
node engine/tools/scatter-packs.js --veg-max 1500 --props-max 400
node engine/tools/scatter-packs.js --clean          # remove só os itens gerados (tag), grava com backup
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
- Colisão: árvore alta (≥5 m) ganha um tronco redondo; prop/rocha ≥0,8 m ganha a caixa do modelo; mato e lixo miúdo não colidem.
- Modelo ausente (outro PC): o lote é ignorado, só um `console.info` por modelo (o navegador ainda registra uma requisição 404 por modelo ausente, mas não há erro de script). No editor continua a caixa magenta. Testado com três refs inexistentes (veg, batch e solta): o jogo iniciou normalmente, sem erro e sem caixa magenta.
- Edição: o editor monta cada def como um grupo próprio (mover/girar/apagar/desfazer pelo mecanismo normal, com snapshots do mapa) e grava a def em `world.json`; o jogo reconstrói os lotes ao abrir o mapa. Não se edita a instância "dentro" do lote em jogo, e não precisa.

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

## Limites e o que não foi verificado
- Não medi 1080p, noite, PC fraco nem o fps do editor com 2904 grupos (abre normalmente; o desfazer guarda um snapshot do mapa inteiro, ~0,55 MB cada, até 300).
- Não olhei de perto a orla/praia, favela por dentro, hidrante/orelhão/ponto de ônibus nem todos os parques; o gerador relatou 24 itens com altura "suspeita" (>0,6 m acima ou >1 m abaixo do chão) em encostas, não inspecionados um a um.
- Orientação dos bancos/ponto de ônibus supõe a frente do modelo em +z; não conferi a frente de cada um.
- Colisores novos (tronco, caçamba, banco, rocha) não foram testados com trânsito/IA nem com a polícia.
- Se o relevo for esculpido de novo depois de gerar, itens podem ficar flutuando/enterrados: rode o gerador de novo.
- O lago dos parques existe em ~50% (sorteio do jogo); o gerador deixa o espaço vazio nos dois casos.
- `street-life.js` e `vegetation.js` não foram alterados: o jogo continua gerando os procedurais (hidrante, saco de lixo, caçamba, árvores) e o gerador só se afasta deles.
