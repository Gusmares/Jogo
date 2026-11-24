# Desempenho do NEON COAST — Fase 0 (medição)

Medido em 24/11/2026 com `projects/neon-coast/tools/perf-profile.js` (roda dentro do jogo, no Electron, via `run-game-script.js --show`). Os dados brutos de cada cenário estão em `engine/docs/perf-fase0/*.json` (a, b, c, d, e = cenários; v = variantes de GPU).

## 1. Onde foi medido

| Item | Valor |
|---|---|
| CPU | Intel Core i5-10400F, 6 núcleos / 12 threads, 2,9 GHz |
| GPU | NVIDIA GeForce GTX 1660 SUPER (4 GB), driver 32.0.16.1088, via ANGLE/Direct3D11 (WebGL 2) |
| RAM | 15,9 GB |
| Sistema | Windows 11 Pro |
| Monitor | 1920x1080 a 60 Hz |
| Janela de teste | 1264x655 px (janela do Electron, não 1080p), escala de render 1,0 |

Observação: a GPU não é "modesta" para um jogo deste tamanho; os números de GPU abaixo valem para 1264x655 e **não foram medidos em 1920x1080**.

## 2. O que cada número significa (e limitações)

- **Sim 10 s** (`__run`): 600 quadros simulados de 1/60 s, sem esperar o vsync. Mede **CPU** por quadro (lógica + montagem da cena pelo three.js + envio de comandos). Se a GPU atrasar, o navegador pode bloquear dentro de `postRender` e inflar o "render". Cada fase é medida embrulhando a função com `performance.now()`.
- **fps real**: 5 s com `requestAnimationFrame` de verdade, limitado pelo vsync (60). É o número que o jogador sente. Resolução dinâmica desligada e escala fixa em 1,0 para ser repetível (no jogo normal ela cairia até 0,5 para segurar 60 fps).
- **GPU (timer query)**: tempo de GPU de `postRender` (sombras + cena + bloom + passe final), via `EXT_disjoint_timer_query_webgl2` (disponível nesta máquina).
- **`gl.finish()`**: mediu ~0,01 ms em todos os casos. No Chromium/ANGLE ele não bloqueia de verdade, então **não serve** para medir GPU aqui; a medida de GPU confiável é a timer query. (Está registrado nos JSON como `tempoRealFinish`, mas só o fps desse trecho é útil.)
- **Janela visível** (`--show`) e `backgroundThrottling:false`, para a GPU real e sem throttling. O jogo pausa sozinho quando a janela perde o foco (evento `blur`); o script força despausar (1 quadro em 1 execução precisou disso).
- **Ruído**: repetindo, o mesmo cenário varia ~±2-3 ms de CPU por quadro (ex.: estresse deu 19,2 ms numa execução e 16,3 ms noutra). Diferenças menores que ~2 ms não são conclusivas. Cada cenário foi medido uma vez (a, d) ou duas (b, c, e; a primeira de b/c ficou inválida por pausa/tempo esgotado e foi refeita).
- Não medido: 1080p, noite, jogo com a janela maximizada, custo de `updateMapGens` (roda por timer de 0,5 s fora do quadro; picos dele aparecem no "máx" do fps real), áudio, custo por pedestre/carro individual, polícia em perseguição ativa (no cenário de estresse a viatura estava presente, mas o nível de procurado lido no fim foi 0, então não afirmo que a perseguição estava ativa), WebGPU.
- Hora do jogo nos testes: 13:30 (dia).

## 3. Resultados por cenário

Tempos em ms por quadro, mediana/p95 (sim 10 s). "Lógica" = total menos render menos UI (minimapa, rádio, áudio). GPU = timer query (mediana).

| Cenário | fps real | Quadro CPU total | Lógica (carros / peds) | Render JS (`postRender`) | GPU | Draw calls (com / sem sombra) | Triângulos (com / sem sombra) | Entidades |
|---|---|---|---|---|---|---|---|---|
| a) Centro de SP, parado | 56,8 (59,6 em 2ª passada) | 17,2 / 21,4 | 4,9 (2,4 / 1,9) | 12,2 / 15,9 | 9,9 | 1097 / 923 | 1,83 M / 1,52 M | 130 peds, 69 carros |
| b) Avenida dirigindo (média 75 km/h, máx 117) | 58,0 (59,8) | 12,9 / 14,6 | 4,6 (2,8 / 1,4) | 8,2 / 9,4 | 7,7 | 998 / 848 | 1,53 M / 1,31 M | 98 peds, 63 carros |
| c) Favela (Morro da Esperança) | 59,2 (60,0) | 10,0 / 11,2 | 3,7 (2,1 / 1,3) | 6,2 / 6,8 | 7,2 | 678 / 642 | 1,31 M / 1,12 M | 73 peds, 68 carros |
| d) Praia / Rio de Janeiro | 53,4* (59,4) | 7,3 / 8,5 | 3,2 (1,8 / 1,0) | 4,0 / 4,9 | 6,9 | 214 / 168 | 0,72 M / 0,54 M | 66 peds, 64 carros |
| e) Estresse (peds e carros no máximo) | 43,6 (54,7) | 16,3 / 18,2 | 6,1 (3,4 / 2,2) | 10,1 / 11,3 | 10,2 | 1180 / 977 | 2,02 M / 1,63 M | 125 peds, 90 carros, 8 viaturas |

\* O fps do cenário d na primeira passada caiu por um único quadro de 133 ms (carregamento/geração de mapa); a segunda passada, sem ele, fechou 59,4.

p95 do intervalo entre quadros no tempo real (quanto menor, mais fluido; 16,8 = 60 fps cravado): a) 16,8, b) 16,8, c) 16,8, d) 16,9, **e) 50,0** (quedas para 20-30 fps). Pior quadro isolado no tempo real: a) 83 ms, b) 67 ms, c) 51 ms, d) 133 ms, e) 233 ms.

Censo da cena (todos os cenários, ordem de grandeza): 2300-2700 malhas (≈1000-1150 visíveis), 4900-8800 objetos na cena, ~1000-1250 materiais, ~1000 geometrias, 300-480 texturas, 57-70 programas de shader, 6 luzes, 350-380 malhas que projetam sombra, 135-145 malhas com esqueleto (pedestres), **678 malhas instanciadas com ~94.800 instâncias** (vegetação etc.; já é barato). Memória JS: 410-570 MB (cresce 20-50 MB durante os 10 s e cai de novo, compatível com lixo para o coletor; não vi vazamento em 10 s, mas 10 s não prova nada).

### Variantes de GPU/render (cenário de estresse, 4 s cada, fps real e CPU médio por quadro)

| Variante | fps | CPU do quadro (ms) | GPU timer (ms) |
|---|---|---|---|
| Base | 51,9 | 18,2 | 8,3 |
| Sem sombras | 59,5 | 15,8 | 7,5 |
| Render em metade da resolução (0,5) | 55,4 | 17,0 | 7,9 |
| Sem bloom | 58,5 | 16,3 | 7,9 |
| Sem pós-processamento | 58,7 | 16,0 | 8,4 |
| Sem desenhar nada (só lógica) | 60,0 | 5,6 | 0 |

Leitura: a variante base é a primeira e pode carregar ruído de aquecimento (sem bloom/sem pós ganharem ~2 ms de CPU é suspeito de ser ruído, não só efeito real). O que é robusto: (1) desligar o desenho derruba o quadro de 18 ms para 5,6 ms, ou seja, **~12 ms dos 18 são o render por CPU**; (2) a GPU fica em ~7-10 ms em tudo e **quase não responde à resolução** (0,5x resolução tira só ~0,4 ms), logo o trabalho de GPU é de geometria (2 M de triângulos), não de pixels.

## 4. O que domina

1. **CPU do render (JS do three.js + envio de comandos)**: 8-12 ms dos 13-19 ms em cenas densas (≈60-70% do quadro). Com ~1000-1200 draw calls, 7-9 mil objetos na cena e ~1200 materiais, o custo está em percorrer a cena, atualizar matrizes, trocar estado/material e emitir os draw calls.
2. **GPU**: 7-10 ms, praticamente constante entre cenários e insensível a resolução. Não é o gargalo hoje (cabe nos 16,7 ms), mas é o segundo maior bloco e crescerá com densidade. Medido só em 1264x655.
3. **Lógica**: 3-6 ms (carros ≈ 2-3,4 ms, pedestres ≈ 1-2,2 ms, polícia ≤ 0,3 ms; o resto é desprezível). Hoje é a menor fatia, mas é a que escala com o objetivo de densidade.
4. **Picos de quadro**: no estresse, p95 de 50 ms e máximos de 100-230 ms. A causa não foi isolada (suspeitos: coleta de lixo, `updateMapGens`, compilação de shader/entrada de modelos).

Com o CPU (≈16-20 ms) acima dos 16,7 ms e a GPU em ~10 ms, o limite de fps no cenário de estresse é **a CPU (thread principal)**, não a GPU.

## 5. Os 5 principais gargalos (por ganho provável)

1. **CPU de render: draw calls, materiais e objetos demais (10-12 ms nos cenários densos; 8,2 ms na avenida).**
   Dados: 1000-1200 draw calls, 1100-1250 materiais, 7-9 mil objetos na cena, 145 pedestres com esqueleto cada um com seu material.
   Ação: fundir geometria estática da cidade por quadra/chunk (mesmo material), atlas de texturas para derrubar materiais de ~1200 para algumas dezenas, instanciar carros iguais e props repetidos, `matrixAutoUpdate=false` em tudo que não se mexe, culling por distância/chunk em vez de objeto a objeto, e um agrupador de pedestres por modelo. É exatamente o item "agrupar draw calls" que a engine nova precisa.
   Estimativa: cortar metade dos draw calls e a maior parte dos materiais deve render **3-6 ms por quadro** nos cenários densos (palpite; só confirmado quando implementado). É o maior ganho disponível.

2. **Sombras (≈170-200 draw calls e ≈0,4 M triângulos extras em quadros que atualizam o mapa; ≈350-380 casters).**
   Dados: quadro com sombra gasta ~1,7 ms de render a mais que sem (a: 13,0 vs 11,3; e: 10,7 vs 9,4). Na variante, tirar as sombras deu 52 → 59,5 fps e ~2,4 ms de CPU a menos (uma medição, ruidosa). O jogo já atualiza o mapa a cada 2-3 quadros.
   Ação: limitar casters por distância (só prédios/carros/peds num raio curto), tirar vegetação e props pequenos do mapa de sombra, atualizar a cada 3-4 quadros para o que é estático, ou sombra cacheada para o cenário fixo.
   Estimativa: **1,5-2,5 ms** de CPU nos quadros com sombra e ~0,5-1 ms de GPU.

3. **Lógica de carros (stepCars): 2,2 ms no centro, 3,4 ms no estresse com 90 carros.**
   Dados: `updateCars` é o maior item de lógica; o laço de colisão compara todos os pares de carros (O(n²), ~4000 pares com 90 carros) a cada passo físico, além de IA com laços sobre todos os carros por carro.
   Ação: grade espacial (broadphase) para colisão e para "tem carro à frente", dormir/simplificar carros longe da câmera (a camada "média/longe" do plano), reduzir a taxa de IA dos distantes.
   Estimativa: **1-2 ms** com 90 carros; o ganho cresce rápido se a densidade subir.

4. **Lógica de pedestres (updateNpcs): ~15 µs por pedestre, 1,9-2,2 ms com 125-130.**
   Dados: custo linear; a meta de densidade (centenas/milhares) com este código daria 6-15+ ms só em NPCs. Mais 135-145 esqueletos animados que também pesam no render.
   Ação: camadas de simulação por distância (longe = estatístico), animar menos quadros os distantes, e depois mover a IA/movimento para o núcleo nativo ou worker (decisões 5 e 6 do plano).
   Estimativa: hoje só **~1 ms** de ganho; é o item que **decide se a densidade do plano é possível**, não o que mais ajuda agora.

5. **Triângulos e picos de quadro (GPU 7-10 ms constante; p95 de 50 ms e máximos de 100-230 ms no estresse).**
   Dados: 1,3-2,0 M de triângulos por quadro; a GPU quase não muda com resolução, logo é limitada por geometria. Os picos têm causa não isolada.
   Ação: LOD de modelos (carros, pedestres, prédios) e descarte de triângulos escondidos; para os picos, evitar alocações por quadro (`cars.slice()` em `manageTraffic`, closures em `updateAICar`, `Math.hypot` em laços), pools de objetos, e perfilar com DevTools (alocação/GC) antes de decidir.
   Estimativa: LOD pode tirar **1-3 ms de GPU** (importante para PCs mais fracos e para 1080p+); os picos são o que mais prejudica a sensação de fluidez no estresse, mas não consigo quantificar o ganho sem achar a causa.

## 6. Conclusões para a decisão da engine

- Nesta máquina, o jogo atual roda a ~59-60 fps em cenas normais (favela, praia, avenida) e a 54-57 no centro de SP; só o estresse (peds+carros no limite) cai para ~44-55 fps com travadas.
- O gargalo é **CPU de render single-thread no three.js/WebGL**, não a lógica de jogo e não os pixels. Reduzir draw calls/materiais (item 1) vale mais que mover IA para worker ou Rust, **hoje**. A lógica só vira problema quando a densidade subir (itens 3 e 4).
- Isso reforça a ideia do plano de decidir renderização nativo/WebGPU na fase 5 com números: submissão de draw calls é onde um renderizador nativo ou WebGPU (bundles de comandos) ganha mais; o three.js r128 sobre WebGL gasta ~10 ms só nisso com ~1100 draw calls.
- Falta medir: 1080p, noite, PC mais fraco (a 1660 SUPER com i5-10400F não é um PC de entrada), e o instalador (a parte "Setup.exe" da fase 0 não faz parte deste documento).

## 7. Como repetir

```
cd projects/neon-coast
npx electron tools/run-game-script.js tools/perf-profile.js --show --test "37,0.3,80,180&perf=a"
```
`perf=` aceita `a` (centro SP), `b` (avenida dirigindo), `c` (favela), `d` (praia/RJ), `e` (estresse) e `v` (variantes de GPU). Rode um por vez (o runner mata o script em 240 s) e mantenha a janela em foco. Ferramentas novas apenas; nenhum código do jogo foi alterado.
