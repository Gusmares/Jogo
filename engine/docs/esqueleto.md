# Esqueleto dos personagens e rig estendido (dedos)

Objetivo: poder animar até os dedos (mão esquerda segurando arma etc.). Este documento tem o diagnóstico do esqueleto atual, o projeto do esqueleto estendido, a ferramenta que o gera, o runtime e os testes. Só nomes de ossos e contagens: nada do conteúdo dos modelos de terceiros.

## 1. Diagnóstico

### Como os personagens são carregados
- `projects/neon-coast/assets/models/skins/<id>/` (pasta ignorada pelo git): `skin.json` (manifesto), `skin.bin` (malha), `atlas.png`, `skin_lod1.bin`, `skin_lod2.bin`, `textures/`. Foram convertidos de DFF/TXD do SA e de mods por `engine/tools/convert-skin.js`; ferramentas em `projects/neon-coast/tools/` (`skins.json`, `atlas-skins.js`, `catalog.js`). 152 pastas, 151 no catálogo.
- `skin.bin`, por vértice (little endian): posição 3 float, normal 3 float, uv 2 float, `skinIndex` 4 uint16, `skinWeight` 4 float; depois os índices (uint32). `skin.json`: `verts`, `indices`, `groups` (materiais), `materials`, `bones[]` (`id`, `name`, `parent`, `local` = matriz 4x4 em coluna relativa ao pai, `inverse` = matriz inversa de bind), `minY`, `atlas` e `lods[]` (mesmo formato, 1 material de atlas).
- `js/entities/skins.js`: `loadSkin(id)` monta `type = { id, man, geo, mats, atlasMat, lods }` (cache por id); `makeActor(type, useLod)` cria `THREE.Bone` por osso (decompõe `local`), `SkinnedMesh` (LOD 0 ou geometria de LOD) com `Skeleton(bones, inverses)` e devolve o ator `{ type, group, mesh, bones[], index{nome→i}, restW[], info = man.bones, ap = AnimPlayer }`.
- `AnimPlayer` (`js/entities/anim.js`) liga cada nó do IFP ao osso pelo `id` do SA (`idToIdx[id]`); osso sem nó no clipe fica como está.
- Quem chama `makeActor`: jogador/menu/celular sem LOD (`makeActor(type)`); NPCs, ocupantes e policiais com LOD (`makeActor(type, true)`).
- Detalhe do bind: a malha está no espaço DFF; para todo osso `W_repouso * inverse = D`, uma rotação constante (aprox. 90° em Z). Por isso o rig novo usa `inverse_novo = inv(H_osso) * inverse_mão` (H = osso no espaço da mão).

### Esqueleto real (idêntico nos 3 personagens do jogador; 32 ossos, nome(id))
`root(0)` > `pelvis(1)` > `spine(2)` (`belly(201)`), `spine1(3)` (`lbreast(302)`, `rbreast(301)`) > `neck(4)` > `head(5)` (`jaw(8)`, `lbrow(6)`, `rbrow(7)`) e as clavículas `lclav(31)` / `rclav(21)`; braço esquerdo `lclav(31)` > `lupperarm(32)` > `lforearm(33)` > `lhand(34)` > `lfinger(35)` > `lfinger01(36)`; braço direito `rclav(21)` > `rupperarm(22)` > `rforearm(23)` > `rhand(24)` > `rfinger(25)` > `rfinger01(26)`; pernas `lthigh(41)` > `lcalf(42)` > `lfoot(43)` > `ltoe(44)` e `rthigh(51)` > `rcalf(52)` > `rfoot(53)` > `rtoe(54)`.
Esquerda = 31..36, direita = 21..26 (o lado esquerdo é +X). **O SA só tem 3 ossos por mão: mão (34/24), "dedos" (35/25) e ponta (36/26), em cadeia; não existe osso de polegar.** Os 4 dedos e o polegar são geometria presa à mão e a essa cadeia.

### Pesos de pele nas mãos (`skin.bin`, malha completa; "qualquer peso / peso dominante")
| skin | vértices | mão E (34) | dedos E (35) | ponta E (36) | mão D (24) | dedos D (25) | ponta D (26) |
|---|---|---|---|---|---|---|---|
| player_argentina | 49 808 | 2653 / 2581 | 0 / 0 | 0 / 0 | 1975 / 1849 | 0 / 0 | 0 / 0 |
| player_bbthin | 34 903 | 507 / 190 | 116 / 0 | 294 / 254 | 758 / 399 | 196 / 0 | 0 / 0 |
| player_emmet | 38 745 | 2647 / 2590 | 0 / 0 | 0 / 0 | 1975 / 1876 | 0 / 0 | 0 / 0 |

Ou seja: argentina e emmet têm a mão inteira (dedos modelados em 3D) pesada 100% no osso da mão; só bbthin usa os ossos de dedo do SA. Mesmo assim os clipes IFP animam 35/36 em centenas de clipes (curvas até ~110°, ex.: recarga de pistola), então o runtime repassa essa animação (secção 4). Os ids do IFP casam com os do manifesto (idToIdx usa `bone.id`); os ids novos (> 400) não existem em nenhum IFP e ficam em repouso nele.

Três skins completas: `node engine/tools/skeleton-extend.js inspect <skinId>` imprime a lista de ossos (índice, id, nome, pai) e esta tabela.

## 2. Projeto do esqueleto estendido
15 ossos por mão (30 no total, esqueleto passa de 32 para 62), todos descendentes do osso da mão (34/24), em cadeia de 3 por dedo:

| dedo | juntas | nomes | ids (E / D) |
|---|---|---|---|
| polegar | carpo/metacarpo, proximal, distal | `L_Thumb1..3` / `R_Thumb1..3` | 411-413 / 511-513 |
| indicador | proximal, média, distal | `L_Index1..3` | 421-423 / 521-523 |
| médio | idem | `L_Middle1..3` | 431-433 / 531-533 |
| anelar | idem | `L_Ring1..3` | 441-443 / 541-543 |
| mínimo | idem | `L_Pinky1..3` | 451-453 / 551-553 |

`id = 400 (E) ou 500 (D) + (dedo+1)*10 + junta`, sem colisão com o SA (máx. 302). Metacarpos dos 4 dedos, dedos do pé e rosto ficaram de fora (opcionais; ver limites).
- **Hierarquia:** `X1` filho da mão; `X2` filho de `X1`; `X3` filho de `X2`.
- **Eixos locais de cada osso novo:** X ao longo do osso (para a ponta), Y = direção da palma, Z = eixo de curvatura. **Rotação positiva em Z curva o dedo para a palma.** Rotação em Y abre/fecha (afasta) os dedos.
- **Repouso:** a pose de repouso é a da própria malha (ossos e pesos saem da geometria em bind), então os clipes existentes continuam iguais. Em rig.json cada osso tem `local` (matriz de repouso relativa ao pai) para o editor mostrar deltas.
- **Animações IFP existentes não mudam:** os ossos novos não têm nó nelas; ficam em repouso (ou, no modelo bbthin, recebem a animação dos ossos 35/36, ver 4). Clipes futuros com ids 411.. 553 passam a ser aplicados pelo `AnimPlayer` (o runtime registra os ids em `a.ap.idToIdx`) e o runtime não toca num osso que o clipe atual anima.

## 3. Ferramenta `engine/tools/skeleton-extend.js` (Node puro)
```
node engine/tools/skeleton-extend.js inspect <skinId> [--json]
node engine/tools/skeleton-extend.js extend  <skinId|--all> [--dry]
node engine/tools/skeleton-extend.js verify  [skinId|--all]
```
`--project <pasta>` ou `NEON_PROJECT` escolhe o projeto. `extend` não altera nenhum arquivo da skin: grava `assets/rigs/<skinId>.rig.json` (+ `assets/rigs/index.json`, lista que o jogo consulta para não dar 404). `assets/` é ignorado pelo git.

### Conteúdo do `.rig.json`
`bones[]` (nome, id, pai, lado, dedo, junta, comprimento, `local`, `inverse`), `geoms.base/lod1/lod2` (pesos esparsos: índices dos vértices alterados e 4 índices/pesos por vértice no esqueleto de 62 ossos), `hands` (comprimento da mão, dedos encontrados, direção da palma, avisos), `driveSA`.

### Heurística (por mão; é uma aproximação)
1. **Região da mão:** vértices com >= 50% do peso nos ossos mão/dedos/ponta do SA, em coordenadas do osso da mão; F = direção do osso da mão para o osso "dedos" (frente); L = comprimento punho→ponta (percentil 99,5 de F).
2. **Dedos:** componentes conexas da malha acima de uma linha de altura variável (80%→50% de L) até aparecerem exatamente 4 pedaços (as pontas dos dedos separadas). Cada dedo cresce das pontas para a base ("bacia hidrográfica" por altura decrescente) até a linha dos nós (46% de L). A cadeia de cada dedo é a polilinha dos centroides de 7 fatias ordenadas pela distância ao longo da malha (Dijkstra), o que segue dedos curvados. Juntas a 45% e 75% do comprimento, base na linha dos nós. Indicador = o mais perto do polegar.
3. **Polegar:** lóbulo menor que se separa da massa principal mais abaixo; cresce por conectividade só por vértices perto do eixo do lóbulo (8 iterações); base na altura do carpo (22% de L); raio limitado a 1,5x o raio mediano dos dedos. Sem lóbulo, o polegar é estimado pela anatomia (aviso).
4. **Frame e lado da palma:** direção do polegar t (centro dos dedos → centro do polegar); palma = F×t (mão esquerda) ou t×F (direita). A curvatura medida (pontas dos dedos × bases) é comparada com isso e o `inspect` avisa se discordar (em mãos retas no bind, a medida é só ruído).
5. **Pesos:** por posição única (as costuras de UV não racham). Para cada dedo: distância a uma cápsula (raio = percentil 70 das distâncias dos vértices distais), com queda suave entre 1x e 1,9x o raio; competição normalizada entre dedos vizinhos (a pele entre os dedos reparte); transição suave (smoothstep) na junta do nó (fração 14% do comprimento), e entre proximal/média/distal (30% do segmento). O que sobra fica no osso da mão. Duas passadas de suavização pela malha (60% próprio, 40% vizinhos). Soma = 1; no máximo 4 influências por vértice (limite do skinning do three r128): as influências de fora do grupo mão/dedos do SA (antebraço etc.) são mantidas, e o peso total antes alocado a mão+35+36 é repartido entre a mão e os dedos que couberem. Feito para o LOD 0, LOD 1 e LOD 2 com o mesmo algoritmo.
6. **Pose de repouso idêntica:** cada osso novo tem `W*inverse = D` da própria mão; a soma dos pesos por vértice não muda. `verify` confere (erro máximo ~1e-5 m).

### `verify`
Confere ids únicos (> 400), bind dos ossos novos = bind da mão, soma de pesos, índices dentro do esqueleto, pose de repouso por vértice em cada LOD, e curva todas as juntas (fingers 1,3/1,5/1,0 rad, polegar 0,6/0,8/0,7) medindo o alongamento de aresta (estourar polígonos): falha se p99 > 3,5, avisa se > 2,4.

## 4. Runtime `projects/neon-coast/js/entities/rig-extend.js`
Linha para colocar em `index.html` depois de `skins.js`:
```html
<script src="js/entities/rig-extend.js"></script>
```
(Sem a linha ou sem o `.rig.json`, tudo roda como antes: `makeActor` só chama `rigHook` se existir. Também fiz 2 ganchos mínimos em `skins.js`: `rigHook(a, lodOn)` no fim de `makeActor` e `rigApply(a, true)` no fim de `poseActor`; ambos só agem se o ator tiver rig.)
- `RIG_FINGERS`: `'player'` (padrão: atores **sem LOD**: jogador e prévias de menu/celular), `'all'` (também NPCs e policiais) ou `'off'`/`false`. Ligar para NPCs: `RIG_FINGERS = 'all'` antes de criar os atores.
- `rigExtendActor(a)` (assíncrono): carrega o rig (cache por skin; falha = nada, sem erro), cria os `THREE.Bone` filhos das mãos, estende `a.bones`, `a.index`, `a.info` (cópia, o manifesto compartilhado não muda), `a.restW`, `a.ap.idToIdx`, troca em um passo só o `Skeleton` (62 ossos, bind preservado) e a geometria (cópia que compartilha posição/normal/uv/índices; só `skinIndex`/`skinWeight` novos, em cache por tipo), preservando material/atlas/LOD (`a.setLod` usa as geometrias estendidas). Os ossos novos ficam em repouso sobre a mão, então não há salto visual mesmo com o ator já animando. Os 3 LODs têm repeso.
- **Animação do SA nos dedos (bbthin e outras com peso nos ossos 35/36):** `rigExtendActor` embrulha `a.ap.update` e repassa o delta de `lfinger`/`lfinger01` aos ossos novos (proximal recebe o delta do 35; média e distal, metade do delta do 36 cada; polegar fica em repouso). Só vale quando a malha original tem peso nesses ossos (`driveSA`); nas outras (argentina, emmet) a malha original já não os usava, e o resultado continua idêntico.
- `rigCurl(a, 'l'|'r', 0..1, { digits })` (punho = 1), `rigPoseBone(a, 'L_Index2', x, y, z)` (Euler em rad, eixos locais do osso), `rigClear(a)`, `rigApply(a, reset)`, `rigBoneNames(a)`. As rotações ficam em `a.rig.user` e valem por cima de qualquer animação (inclusive `poseActor`).
- Custo: o shader do three r128 lê os ossos de uma textura (float vertex textures), sem limite de uniformes (62 ossos = textura 16x16); o programa de shader é o mesmo (sem recompilar). Os 4 ossos por vértice não mudam. LOD continua funcionando. Medido: 0,0189 ms (sem rig) vs 0,0188 ms (com rig) por ator por quadro na CPU (4 x 4000 iterações de IFP + matrizes + Skeleton.update); no jogo completo a diferença ficou dentro do ruído da medição (<= 0,8 ms em quadros de ~11 ms, sem tendência clara). Memória: +2 atributos (~1,2 MB para 50 mil vértices) por skin com rig.

## 5. Testes (`projects/neon-coast/tools/test-rig-fingers.js`)
```
npx electron projects/neon-coast/tools/test-rig-fingers.js [skinId,...] [--out pasta] [--fps]
```
Para cada skin com rig: renderiza original e estendido em idle, andando, correndo, mirando (`ARRESTgun`) e atirando (`colt45_fire_2hands`), corpo inteiro e close das duas mãos, compara pixels (diferença de canal > 8) e grava a folha de contato (com as mãos curvadas a 50% e 100% por 2 ângulos) em `assets/_inventario/rigs/<skinId>_rig.png` (ignorada pelo git). Resultado obtido: **0% de pixels diferentes** em todas as 25 imagens por skin, para player_argentina, player_bbthin, player_emmet, rp_lapd, sk_acefoe, band_pessoa_15.
Resultados da ferramenta em todo o catálogo: `extend --all` gerou 143 de 151 skins (5 s); `verify --all`: 119 ok, 24 com estiramento > 3,5x (p99) quando todas as juntas vão ao máximo.

## 6. Limites e problemas conhecidos
- **O repeso é automático e aproximado.** Em argentina/emmet a mão fica boa (curvar dedos fecha o punho sem estourar); o ponto mais fraco é o **polegar**: a malha dele se funde com a palma, então ao curvar a base pode puxar um pouco da palma e a ponta alonga (fica fino). Os dedos finos de mínimo/anelar curvam bem.
- 8 skins sem rig por mão fechada/luva (os dedos não se separam na malha): com_morador_do_morro, pmsp_policial_pm_sp_280/281/282/284, sk_terror, sk_tupac_amaru_sharkur, zio_pessoa_19. Sem rig elas continuam com o esqueleto de 32 ossos.
- 48 skins (incluindo `player_bbthin`, uma mão de poucos polígonos com os dedos retos no bind) tiveram o polegar posicionado pela anatomia em vez de achado na malha; em 44 a direção de curvatura medida discordou da regra anatômica (em mãos retas é só ruído). Nelas o polegar e o lado da palma podem estar errados: conferir na folha de contato.
- 24 rigs com alongamento de aresta forte ao curvar o máximo; nos testes visuais não houve estouro até 100% de curvatura nas 3 skins do jogador, mas em outras pode haver.
- O `driveSA` aproxima a animação do SA (pivôs diferentes), não é idêntico quando o clipe curva muito 35/36 em skins que usam esses ossos (nos testes: 0% de diferença nos poses de arma testados em bbthin, que é o único com SA nos dedos entre as 3).
- Metacarpos, dedos do pé e rosto não foram feitos.
- **Próximo passo recomendado:** pintura manual de pesos na engine para os casos acima (polegar em especial) e nas skins mais usadas; a ferramenta sobrescreve só `assets/rigs/<skin>.rig.json`, então o ajuste manual deve gravar num arquivo à parte (`<skin>.weights.json`) lido pelo runtime por cima do automático.
