# Desempenho do NEON COAST — Batching de draw calls e materiais

Continuação de `desempenho-fase0.md`. Medido em 24/11/2026, mesma máquina (i5-10400F, GTX 1660 SUPER, janela 1264x655, escala 1,0). Dados brutos e scripts em `engine/docs/batching-data/`.

**Resultado em uma linha:** as chamadas de desenho caíram ~40% (centro de SP 1157 -> 695, avenida 899 -> 580, estresse 1295 -> 750), os materiais ~10-20% e o `postRender` (CPU de render) caiu **~2,0 ms no centro, ~1,7 ms na avenida e ~3,2 ms no estresse**. É um ganho real, mas modesto em ms por quadro: carros (~150 chamadas) e pedestres (~120) continuam intocados e a cena ainda tem ~500-700 chamadas. O fps do centro e da avenida já estava perto de 60 (o vsync esconde o ganho); a diferença aparece no estresse (42,9 -> 47,7 fps) e como folga de CPU.

## 1. Diagnóstico (antes)

Como foi feito: `tools/batching-diag/run-attr.js` serve o jogo com um gancho no `three.min.js` que anota em cada objeto adicionado à cena o arquivo:linha de quem o criou; `tools/batching-diag/census.js` percorre `scene.traverse`, descarta o que não está visível/dentro do frustum e agrupa por origem. Posições do jogador = cenários a (centro de SP) e b (avenida) do `perf-profile.js`, olhando para leste. A soma das chamadas estimadas bate com `renderer.info` (946 estimadas vs ~1145 no quadro inteiro; a diferença são ~190 da passada de sombra + ~5 do pós-processamento). A coluna "calls de sombra" das tabelas **subestima** a sombra real (o teste de frustum da luz que usei é grosseiro); o número confiável de sombra é a diferença entre o total do quadro e a cena (~190 antes, ~175 depois).

O que o censo mostrou (centro de SP, antes), em ordem:

1. **Placas de rua (`street-life.js`): 216 chamadas e 109 materiais** (~23% de todas as chamadas). Cada placa era um grupo com 4 objetos: um poste com `MeshLambertMaterial` novo + 2 placas, cada uma com material/textura próprios de 256x64.
2. Carros (`CARRO`): ~157 chamadas e ~260 materiais (multi-material por peça). **Intocados** (restrição do pedido).
3. Pedestres (skinned): ~120 chamadas, 1 material por pedestre. **Intocados.**
4. `city.js:21` (faixas de pedestre, letreiros e marcas, células de 150 m): 97 chamadas.
5. `util.js:46` (`GeoBatch`: fachadas/calçadas por bloco de 310 m): 76.
6. Vegetação instanciada (`foliage-lib.js`): 71 (já era instanciada e cortada por chunk/distância).
7. Terreno (`terrain.js:240`, 64 ladrilhos 8x8): 51 chamadas / 304 mil triângulos.
8. `street-life.js:93` (lixo, hidrantes, caçambas, células de 150 m): 30. `sp.js:36` (detalhes dos marcos): 27.
9. O resto é Rio (Cristo/bondinho/orla), favelas, semáforos, postes etc., poucas chamadas cada.

Outra descoberta importante: **metade do frustum, quando se olha para leste, é terreno/Rio/favelas além da névoa** (a névoa termina em 1200 m: `fog.far`). Esses blocos eram enviados à GPU para sair como a cor do fundo.

Tabelas completas (top 15 por origem, antes e depois, centro e avenida): `engine/docs/batching-data/census-tables.md`. Resumo:

| Cena | Chamadas (cena) antes | depois | Objetos na cena antes | depois | Materiais antes | depois |
|---|---|---|---|---|---|---|
| Centro de SP | 946 | 508 | 7107 | 6605 | 931 | 857 |
| Avenida | 1045 | 476 | 5333 | 4931 | 891 | 711 |

(Os materiais incluem os de carros/pedestres, que variam de uma execução para outra conforme o trânsito.)

## 2. O que foi feito (cada item tem interruptor)

`NOBATCH` (em `js/core/util.js`; também ligado por `?nobatch=1` na URL do jogo) desliga **tudo** de uma vez e foi o que usei para medir o "antes" no mesmo código. Cada item tem seu próprio interruptor no topo do arquivo dele:

| # | Mudança | Interruptor | Arquivo | Efeito |
|---|---|---|---|---|
| 1 | **Placas de rua em lote**: postes e placas viram geometria juntada por bloco de 320 m (`GeoBatch`); todos os postes dividem 1 material e todas as placas dividem 1 atlas de textura (1024x2048, 256x64 por placa, com paginação automática acima de 128 placas) | `SL_SIGN_BATCH` | `js/world/street-life.js` | -216 chamadas e -108 materiais no centro; -267 e -144 na avenida |
| 2 | **Corte por névoa** (`updateFarCull`): bloco estático (ladrilho do terreno, `GeoBatch`, células de cidade, favela) cuja esfera está inteira além de `fog.far` (profundidade de vista) fica `visible=false`. Seria só a cor da névoa (= cor do fundo), então o pixel não muda. Só liga quando fundo e névoa têm a mesma cor (no pântano a névoa encurta e o fundo é misturado: aí volta a desenhar tudo) | `FAR_CULL` | `js/core/util.js` (registro `FARC`, `farCullAdd`), `js/world/foliage-lib.js` (`updateFarCull`, chamada de dentro de `updateVegetationCulling`), registros em `terrain.js`, `city.js`, `sp.js`, `street-life.js`, `favela.js` | tira terreno/Rio/favelas distantes: terreno 51 -> 27 chamadas, `GeoBatch` 76 -> 27 etc. |
| 3 | **Células de 300 m** para faixas/marcas (`cityMarks`) e letreiros (`citySigns`): pouca geometria e sem sombra | `BIG_CELLS` | `js/world/city.js` | `city.js:21` 97 -> 18 chamadas |

Editabilidade (restrição "a"): as placas de rua continuam entidades do mundo (`placa-rua@x,z`, 107 delas). Antes eram um `Group` em `e.objs`; agora são geometria dentro de malha juntada, registrada por `GeoBatch.add` (`geo.__ent`) e `gsegs`, o mesmo caminho dos prédios, então o editor move/gira/apaga mexendo nos vértices (`entApply`). Não toquei em `collision.js` nem `placements.js`. O corte por névoa só mexe em `visible` de malhas que ele mesmo registra (nunca em `e.objs`) e lê `geometry.boundingSphere` a cada quadro, então prédio/terreno editado (que recalcula a esfera) continua certo.

Não mexi em carros, pedestres, polícia, HUD, `css/`, `index.html`, `js/ui/*`, economia/telefone.

## 3. Antes / depois (perf-profile.js, 2 execuções por modo, intercaladas)

"Antes" = o mesmo código com `&nobatch=1`. Valores = média das 2 execuções; entre parênteses, cada execução. Tempos em ms por quadro (sim 10 s); `postRender` = CPU de render.

| Cenário | | Chamadas (c/ sombra) | Materiais | Objetos na cena | `postRender` ms | Quadro total ms | GPU ms (timer) | fps real |
|---|---|---|---|---|---|---|---|---|
| a) Centro de SP | antes | 1157 (1139; 1175) | 1046 | 7844 | 9,59 (9,40; 9,77) | 14,06 | 8,82 | 59,6 |
| | depois | **695** (695; 694) | **856** | 7399 | **7,65** (7,75; 7,55) | 12,39 | 8,21 | 59,5 |
| b) Avenida (dirigindo) | antes | 899 (826; 972) | 1045 | 6405 | 8,70 (8,15; 9,25) | 13,38 | 8,37 | 54,1 |
| | depois | **580** (552; 608) | **909** | 6790 | **7,00** (6,82; 7,17) | 11,98 | 7,24 | 58,1 |
| e) Estresse | antes | 1296 (1269; 1322) | 1308 | 8831 | 11,78 (11,12; 12,44) | 18,88 | 9,37 | 42,9 |
| | depois | **750** (719; 781) | **1031** | 8360 | **8,60** (8,36; 8,84) | 15,16 | 8,53 | 47,7 |

Honestidade sobre o ganho:
- As chamadas de desenho caíram de forma determinística (~40%) e os triângulos da cena também (terreno e Rio distantes): a 1,86 M -> 1,69 M, b 1,46 M -> 1,21 M, e 2,23 M -> 1,90 M.
- O `postRender` caiu em **todas as execuções emparelhadas** (a: -1,6 a -2,2 ms; b: -1,0 a -2,4; e: -2,3 a -4,1), mas o ruído conhecido é de ±2-3 ms no quadro; por isso o número em que confio é "~1,7-3,2 ms", não os centésimos da tabela. A parte da lógica (carros/pedestres) não mudou (4,4 -> 4,6 ms no centro: ruído), como esperado.
- O fps real de a/b já estava no teto do vsync e o ganho vira folga de CPU; a avenida variou muito entre execuções do "antes" (56,7 e 51,4 fps). No estresse o ganho aparece no fps (42,9 -> 47,7), que ainda não chega a 60 porque ali carros/pedestres (lógica e ~270 chamadas de carros/skinned) dominam.
- O ganho depende da direção da câmera: olhando para o interior da cidade (sem Rio/terreno distante no frustum) o corte por névoa ajuda menos; o das placas (item 1) vale sempre.
- A GPU melhorou ~0,6-1,1 ms (menos triângulos), mas não era o gargalo.
- As medições foram feitas com outras instâncias do Electron abertas no PC (trabalho em paralelo de outra pessoa), o que acrescenta ruído; por isso as execuções foram intercaladas (antes/depois/antes/depois).

## 4. Comparação visual (antes/depois)

`tools/batching-diag/run-shot.js` captura só o canvas do jogo com `Math.random` semeado, carros/pedestres escondidos e câmera/sol/semáforo/vento congelados, com e sem `nobatch=1`; `diff.js` compara. Imagens e mapas de diferença em `engine/docs/batching-data/img/` (`<ponto>_on.png` = depois, `<ponto>_off.png` = antes, `diff_<ponto>.png`).

| Ponto | Pixels com diferença > 12/255 | O que difere |
|---|---|---|
| Centro de SP, rua (câmera a 3 m olhando leste) | 0,18% | só as pilhas de saco de lixo (`Math.random` em jogo) |
| Avenida (olhando leste) | 0,24% | idem |
| Placa de rua (câmera a ~8 m do poste) | **0%** (diferença máxima 1/255) | nada: o atlas reproduz as placas pixel a pixel |
| Elevado sobre SP olhando oeste (terreno/pântano ao fundo) | 0,81% | uma coluna translúcida de marcador de missão (o objetivo é aleatório e sorteou posições diferentes nas duas execuções) e uns poucos sacos de lixo |

Não-deterministas nos dois modos (por isso aparecem no diff mesmo sem mudança minha): água (animada por tempo real), pilhas de lixo, marcador de missão. Prédios, ruas, faixas, letreiros, calçadas, terreno e placas ficaram idênticos. Diferença conhecida e aceita: o corte por névoa revelaria o disco do sol se ele estivesse atrás de relevo a mais de 1200 m e quase no horizonte (o relevo distante o ocultaria); o jogo hoje fica fixo às 13:30 (`CLOCK_RUNS=false`), então não ocorre.

## 5. Autotestes

- `npx electron projects/neon-coast/electron/main.js --selftest` (da raiz do repositório): `"ok":true`.
- `npx electron engine/app --selftest`: `"ok":true` (`erros:""`, 39 prefabs, 216 modelos).
- Teste extra do editor (`--script engine/docs/batching-data/editor-entities.js`): as **6249 entidades do mundo continuam as mesmas** (antes e depois; 107 `placa-rua`), e mover 7 m uma entidade de cada tipo (`placa-rua`, `predio`, `casa`, `torres`, `hidrante`, `lixo`, `marco-masp`) desloca os vértices 7 m, e `entApply(e, null)` volta ao original (erro 0). `placa-rua` agora tem 3 partes (poste + 2 placas) em vez de 1 objeto solto. Saídas em `selftest-editor-before.txt` e `selftest-editor-after.txt`.

## 6. O que ficou de fora e por quê

- **Carros e pedestres** (~270 chamadas, ~3000 objetos de osso/esqueleto só nos pedestres): restrição do pedido. É o maior bloco que sobrou (instanciar carros iguais, agrupar pedestres por modelo, `matrixAutoUpdate=false` nos ossos distantes).
- **Sombras**: a passada de sombra tem ~175 chamadas (antes ~190) e quase todas são de carros e pedestres, que projetam sombra; a parte do mundo é só ~25 chamadas (`GeoBatch` ~14, células de 150 m ~8). Limitar casters por distância mexeria em carros/pedestres; o que sobrou do mundo é pequeno demais para valer o risco. Não mudei distância/qualidade da sombra.
- **Mesclar `cityFlat` + `SL_BATCH` + `LM` (todos `propMat`, 150 m, com sombra) numa malha por célula**: economizaria ~15-20 chamadas (~3%), mas exige adiar a construção (os três geradores rodam em arquivos diferentes e em momentos diferentes) e arrisca a ordem de montagem das entidades. Não valeu.
- **Atlas de fachadas / unir os 8 materiais de fachada**: o `GeoBatch` já junta por bloco x material (poucas chamadas: 76 -> 27 após o corte), e as texturas se repetem por UV (`RepeatWrapping`); um atlas exigiria reescrever UVs e mudaria repetição/mipmap. Risco visual alto para ~20 chamadas.
- **Vegetação instanciada** (~71 chamadas): já é `InstancedMesh` com corte por chunk/distância (`VEG_CHUNKS`); só faria sentido agrupar tipos no mesmo mesh/material, o que muda o desenho e a edição das árvores.
- **Terreno**: 64 ladrilhos compartilham buffers e 1 material; com o corte por névoa caiu de 51 para ~27 chamadas visíveis. Ladrilhos maiores perderiam o culling.
- **Grupos soltos** (Cristo, bondinho, farol: ~10 chamadas): são entidades editáveis com `e.objs` e `visible` controlado pelo editor; não mexi.
- **Corte por distância além do que a névoa já esconde** (objetos pequenos sem `castShadow`, instâncias por faixa): mudaria o visual.

## 7. Riscos conhecidos

- **Corte por névoa**: assume que o pixel totalmente enevoado é igual à cor de fundo. Vale enquanto `scene.background` == `scene.fog.color` (verificado a cada quadro com tolerância; no pântano desliga sozinho). Se alguém trocar o fundo (skybox/gradiente), o corte mostraria diferença (blocos com `fog:false` ou `ShaderMaterial` nem são registrados). Para desligar: `FAR_CULL = false` em `util.js`.
- **Placas em atlas**: as 256x64 compartilham uma textura com mipmaps; muito longe pode haver um fio de cor da placa vizinha (todas têm a mesma moldura azul; não notei nada nas capturas). O prefab `placa_rua` do editor (placas colocadas à mão) continua com `slStreetSign`, como antes.
- **Culling mais grosso** nas placas (células de 320 m) e nas marcas/letreiros (300 m): geometria pequena, mas se a cidade ganhar muito mais, reduzir.
- `entApply` em geometria de placas depende do `GeoBatch.flush` ter rodado antes do `DOMContentLoaded` (já roda, em `street-life.js`, junto de `SL_BATCH.build()`); qualquer outro gerador de placas deve usar `SL_SIGN_GB.add` antes dessa linha.
- O editor usa a mesma `camera`/`fog` do jogo e chama `updateVegetationCulling`, então o corte também vale lá; as seleções por raio não dependem de `visible`. Vale conferir visualmente no editor ao esculpir terreno longe (o corte só olha `geometry.boundingSphere`). Não testei o editor visualmente, só o selftest/entidades.
- Medição: variação de ±2-3 ms por execução; repita `tools/perf-profile.js` antes de concluir sobre ganhos pequenos.

## 8. Como repetir

```
cd projects/neon-coast
# antes (tudo desligado) e depois, no mesmo código (um cenário por execução, janela em foco):
npx electron tools/run-game-script.js tools/perf-profile.js --show --test "37,0.3,80,180&perf=a&nobatch=1"
npx electron tools/run-game-script.js tools/perf-profile.js --show --test "37,0.3,80,180&perf=a"
node ../../engine/docs/batching-data/summarize-perf.js          # resume os perf-*.txt

# censo por origem (p=a centro, p=b avenida; &nobatch=1 = antes)
npx electron tools/batching-diag/run-attr.js tools/batching-diag/census.js --test "37,0.3,80,180&p=a"

# captura determinística e diff
npx electron tools/batching-diag/run-shot.js --pos "[roadC(4), 3, roadC(4)+9, 90, 0]" --out a.png --q "&nobatch=1"
npx electron tools/batching-diag/run-shot.js --pos "[roadC(4), 3, roadC(4)+9, 90, 0]" --out b.png
npx electron tools/batching-diag/diff.js a.png b.png diff.png

# autotestes (da raiz do repositório)
npx electron projects/neon-coast/electron/main.js --selftest
npx electron engine/app --selftest --script engine/docs/batching-data/editor-entities.js
```

Arquivos alterados: `projects/neon-coast/js/core/util.js`, `js/world/foliage-lib.js`, `js/world/terrain.js`, `js/world/city.js`, `js/world/sp.js`, `js/world/street-life.js`, `js/world/favela.js`. Novos: `projects/neon-coast/tools/batching-diag/*`, `engine/docs/desempenho-batching.md`, `engine/docs/batching-data/*`. Nenhuma linha nova em `index.html` foi necessária.
