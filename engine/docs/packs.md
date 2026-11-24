# Importar packs 3D (um arquivo com vários modelos -> um GLB por modelo)

Ferramenta: `engine/tools/pack-import.js` (código no repositório; os packs e o resultado ficam em `projects/neon-coast/assets/`, que o git ignora).
Roda com `node` e abre sozinha uma janela Electron oculta (usa os carregadores do three r128 do editor). Sem dependências novas.

```
node engine/tools/pack-import.js inspect <pack>                       # inventário (não grava modelo nenhum)
node engine/tools/pack-import.js split   <pack> --cat "Categoria" [opções]
node engine/tools/pack-import.js verify  <id1,id2|prefixo*> [--out contato.png]
node engine/tools/pack-import.js summary                               # refaz engine/docs/packs-inventario.md
```
`<pack>` = pasta (ou só o nome, procurado em `assets/`). Projeto: `--project <pasta>` ou `NEON_PROJECT` (padrão `projects/neon-coast`).

## inspect
1. Abre os `.zip` que ainda estão fechados (dentro do pack e o `<pack>.zip` ao lado) em `<pack>/_unzipped/<zip>/`. Nunca sobrescreve arquivo; zip idêntico a outro (hash SHA-256) e pasta "(1)" que copia outra geram aviso.
2. Lê FBX, GLB/glTF, OBJ(+MTL), DAE, 3DS, STL, PLY. Imprime a tabela e grava `assets/_inventario/<pack>.json`.
3. Por modelo: nome, tipo (`vegetação`, `natureza`, `urbano`, `estrada`, `outro`), triângulos, caixa em metros (L×A×C), materiais, texturas (tamanho, se têm alpha), LODs, texturas que faltam, avisos (escala suspeita, muito pesado, textura maior que 2K, material só com cor).
4. Por arquivo: Z-up (sim/não e por quê), escala sugerida, nós ignorados (chão do mostruário, rótulos "Text").
`--mode tree` imprime a árvore de nós do arquivo (para decidir o `--mode` certo).

## split
Opções: `--cat "<categoria>"` `--prefix p_` `--veg` (força vegetação; sem ele o tipo é detectado) `--max-tex 1024` `--only a,b` (trecho do nome/id) `--dry` (só planeja) `--scale k` `--zup | --no-zup` `--mode auto|roots|meshes|whole` `--file trecho-do-arquivo` `--max-tris N [--decimate]` `--tune arquivo.json` `--redo` `--no-sheet` `--cols n`.

Cada modelo vira `assets/objects/<prefixo><id>/model.glb` + `object.json`, o mesmo formato do importador do editor (`id,name,kind,format,cat,source,dims,triangles,veg,imported`) mais `pack, packFile, sourceNode, tipo, escala, zUp, maxTex` e, quando houver, `lods` e `decimated`.
- Só os materiais/texturas que o modelo usa; mesmo material = uma malha; sem esqueleto/animação (pose de ligação); AO e UV2 são descartados.
- Origem no centro da base (pés em y=0), Y para cima, metros.
- Texturas reduzidas para `--max-tex` (padrão 1024, mantém o aspecto). Cor sem transparência vira JPEG; com transparência fica PNG. Metal e rugosidade separados viram uma textura só (G e B).
- Folhagem: textura com alpha vira `alphaMode MASK` (corte 0,5) e dupla face; vidro/opacidade < 1 vira `BLEND`; o resto é opaco.
- IDs `[a-z0-9_]`, até 60 caracteres, sem colisão (sufixo `_2`, `_3`). Nomes em português quando óbvio (espécies, rua, lixeira…); o resto fica no original.
- Rodar de novo é seguro: o que já veio deste pack é pulado (`--redo` refaz só os objetos criados por este pack). Nunca mexe em objeto de outro pack ou do editor.
- LODs: nomes `LOD0/LOD1…` (no nó, ou empilhados no mesmo grupo) viram um modelo só (o de menor número; se a numeração estiver invertida, o mais pesado) e os outros ficam em `lods` no `object.json`.
- Modelo acima de `--max-tris`: com `--decimate` é simplificado (meshoptimizer, mantém UV/normais); sem ele é pulado com aviso.
- No fim reabre cada GLB (malha, triângulos, caixa, base em y=0, texturas, NaN, material invisível) e grava `assets/_inventario/<pack>_contato.png` com até 12 modelos lado a lado.
- A biblioteca da engine lista o resultado em `/__engine/models` (aba Modelos, pela categoria).

## Ajuste fino por objeto (--tune)
`--tune engine/tools/pack-tunes/<pack>.json` (versionado; fica no repositório, ao contrário dos assets). Chaves = slug ORIGINAL do objeto (coluna "nome" do inspect, minúsculo com `_`):
- `names`: nome em português (muda também o id: prefixo + slug do nome novo).
- `targets`: `{"h": m}` altura final, `{"len": m}` maior lado horizontal ou `{"max": m}` maior dimensão; multiplica o modelo depois da `--scale` do arquivo (escala por objeto).
- `colors`: `{"trecho do nome do material": "#rrggbb"}` para material sem textura casada.
Para refazer um objeto: apague a pasta `assets/objects/<id>` (ou use `--redo`; o id antigo é mantido) e rode de novo com `--only`.
Outras mudanças: o casamento de textura por nome agora aceita arquivo truncado pelo exportador (`..._BaseColo.png`, `..._Dama.png`); **metalness é limitado a 0,3** (o jogo não tem envMap: metal cheio sai preto); a folha de contato (`verify --out`) mostra uma figura de referência laranja de **1,75 m** ao lado de cada modelo e as medidas L×A×C (`--no-ref` desliga).

## Colisor por modelo (depois do split)
`node engine/tools/pack-collide.js` mede a malha de cada `model.glb` e grava `"colisor"` (círculos x,z) no `object.json`; o jogo usa isso em vez da caixa do modelo (árvore = só tronco, capim/arbusto baixo = nenhum, rocha/prop = pegada da base). Rode depois de importar um pack. Detalhes: `engine/docs/espalhar-packs.md`, seção Colisão.

## Como ele separa os modelos
1. Atravessa invólucros de um filho só. Irmãos com nome próprio (não genérico: `Cube`, `Sphere`, `Mesh`…) que não são "partes" (`trunk`, `leaves`, `lid`…) viram um modelo cada; irmãos de mesmo nome-base que se tocam (`Dumpster`, `Dumpster pCube3`) viram um só.
2. Peças de nome genérico (o orelhão: esferas, cubos, cilindros) são agrupadas pela caixa que se sobrepõe/encosta.
3. Ignora rótulos (`Text…`), câmeras, luzes e o chão do mostruário (peça plana ou cartão de poucos triângulos, bem maior que os modelos, que encosta em 3 ou mais).
4. Se errar, use `--mode roots` (cada filho direto = um modelo), `meshes` (cada malha) ou `whole` (arquivo inteiro = um modelo).

## Eixo e escala (heurística)
- Os carregadores já aplicam a hierarquia, `up_axis` e unidade do Collada. glTF é sempre Y para cima.
- Z-up automático só em FBX/OBJ/3DS/STL/PLY: conta os modelos "em pé" no eixo Z (peças planas: eixo mais fino = Z); precisa de pelo menos 2 e mais que o dobro dos em Y. Force com `--zup` / `--no-zup`.
- Escala é do arquivo inteiro (mantém o tamanho relativo): mediana do maior lado entre 0,15 e 60 m = fica; fora disso multiplica pela potência de 10 que leva a mediana perto de 2 m (cm do FBX -> ×0,01). **É só um palpite**: tamanho de verdade depende do pack; confira na folha de contato e passe `--scale k`. A caixa que aparece no `inspect` já é a exata (por vértice) com a escala sugerida.

## Limites conhecidos
- `.blend` não é lido sem o Blender. Se o `blender.exe` estiver instalado (Program Files\Blender Foundation, variável `BLENDER` ou `--blender <exe>`), o `inspect`/`split` converte para `<pack>/_converted/*.glb` e segue; sem ele, exporte o `.blend` para GLB (Blender: Arquivo > Exportar > glTF 2.0) e coloque na pasta do pack. A conversão pelo Blender ainda não foi testada (não havia Blender aqui).
- Sem animação nem esqueleto; sem AO baked; textura DDS comprimida é ignorada; `KHR_texture_transform` é mantido.
- Pack sem referência de textura no modelo (DAE sem `library_images`, OBJ sem MTL): tenta casar por nome do material/malha com `albedo/basecolor/alpha/normal/roughness/metallic/emissive`. O que não casar sai só com cor (aviso "material sem textura").
- Packs com tamanhos relativos inconsistentes entre si (comum em pack grátis) precisam de ajuste fino no editor.
- Modelos de mostruário com vários níveis de detalhe muito diferentes (centenas de milhares de triângulos) pedem `--max-tris`.

## Todos os packs (recomendação de comando)
Prefixos diferentes por pack evitam colisão e mostram a origem. Rode `inspect` antes e olhe a folha de contato depois.

| Pack | Conteúdo | Comando `split` recomendado |
|---|---|---|
| `grass-pack-lp` | DAE, 9 tufos/gramados com alpha | `--cat "Vegetação (pacotes)" --prefix gp_ --veg` (feito) |
| `vegetation-pack` | 1 GLB, 76 plantas (13 espécies × variações), alguns com 100 mil+ triângulos | `--cat "Vegetação (pacotes)" --prefix vp_ --veg --max-tris 40000 --decimate` (feito) |
| `various-forest-assets-pack` | 1 GLB, 35 árvores, arbustos, pedras, troncos | `--cat "Floresta (pacote)" --prefix ff_ --max-tris 30000 --decimate` (sem `--veg`: pedras e troncos não são vegetação) |
| `scanned-plants-and-grass-free-download` | zip com 1 OBJ sem MTL, 19 plantas (casa textura por nome) | `--cat "Vegetação (pacotes)" --prefix sp_ --veg --max-tris 40000 --decimate` |
| `street-asset-pack` | 1 FBX em cm, 28 props (barreiras, hidrante, sinais, lixo) | `--cat "Props urbanos (BR)" --prefix sa_ --scale 0.005 --tune engine/tools/pack-tunes/street-asset-pack.json --max-tris 10000 --decimate` (feito; lixo miúdo em `--cat "Lixo de rua" --only bottle,shard,cup`) |
| `street-asset-pack-free` | zip com 1 DAE sem textura referenciada, 24 props | `--cat "Props urbanos (BR)" --prefix sf_ --scale 10 --tune engine/tools/pack-tunes/street-asset-pack-free.json --max-tris 10000 --decimate` (feito; alturas por objeto, ver 'Escalas calibradas') |
| `modular-roads-pack` | 1 FBX, 9 peças de rua (retas, cruzamentos, retornos) | `--cat "Ruas modulares" --prefix mr_ --scale 0.47368 --tune engine/tools/pack-tunes/modular-roads-pack.json` (feito: pista de 18 m = `RW` do jogo) |
| `orelhao` | 1 GLB, 1 orelhão (12 peças) | `--cat "Props urbanos (BR)" --scale 0.0058` (feito: 2,13 m de altura) |
| `realistic-trees-pack-of-2-free` | só `.blend` (dentro de zip) | converter para GLB (ver Limites), depois `--cat "Árvores (pacote)" --prefix rt_ --veg --max-tris 60000 --decimate` |
| `ground-cover-foliage-showcase` | só `.blend` (+ texturas de 4K a 30 MB) | converter para GLB, depois `--cat "Cobertura de solo" --prefix gc_ --veg --max-tex 1024` |
| `ground-cover-foliage-showcase(1)` | cópia idêntica da anterior (zip com o mesmo hash) | não importar |

O inventário agregado está em `engine/docs/packs-inventario.md`.

## Escalas calibradas
Medidas reais usadas como alvo: poste de luz 6-9 m, semáforo 3-5 m, lixeira ~1 m, hidrante ~0,8 m, banco 1,8 m de comprimento, placa 2,2-3 m, cone ~0,7 m, barreira de concreto ~1 m, caçamba 1,5 m, garrafa ~0,28 m, copo ~0,12 m.

### street-asset-pack (FBX em cm) — escala do arquivo **0,005** (o automático ×0,01 dobrava tudo; 0,005 deixou ~18 dos 28 plausíveis)
Ajustes por objeto (altura final):
| Objeto | Altura-alvo (m) | Fator sobre 0,005 |
|---|---:|---:|
| Garrafa | 0,28 | ×0,74 |
| Garrafa deitada (maior lado) | 0,28 | ×1,05 |
| Cone de trânsito | 0,70 | ×0,85 |
| Placas (alerta, pare, preferência, proibido parar) | 2,60 | ×0,86 |
| Haste de placa 1 / 2 | 2,40 | ×2,9 / ×2,8 (eram 0,83 m: o pack os faz pequenos) |
| Hidrante | 0,80 | ×0,71 |
| Lixeira | 1,00 | ×1,01 |
| Tambor de obra | 0,90 | ×0,91 |
| Barreira de concreto | 1,00 (comprimento 1,9 m; as medidas 2-3 m exigiriam 1,6 m de altura) | ×0,93 |
Sem ajuste (ficaram em 0,005): barreiras de metal (2,15 e 3,05 m de comprimento, 1,17 m de altura), barreira vermelha plástica (1,41 m), caixas de papelão, sacos de lixo (0,7-0,8 m), copos (0,12 m), cacos de vidro (3-7 cm).

### street-asset-pack-free (DAE) — escala do arquivo **×10** + altura por objeto (proporções inconsistentes entre os props: em ×10 o poste de luz saía com 3 m e a lixeira com 0,4 m, não existe um fator único)
| Objeto | Altura-alvo (m) | Fator sobre ×10 |
|---|---:|---:|
| Poste de luz | 7,5 | ×2,44 |
| Poste de luz duplo | 8,0 | ×2,61 |
| Poste de luz clássico | 4,0 | ×2,37 |
| Placa de rua verde / Placa de nome de rua | 3,0 | ×2,18 |
| Placas (50, 40, estacionamento, ônibus, proibido entrar, losangos, ferrovia, pare) | 2,4 | ×2,70 a ×2,95 |
| Ponto de ônibus | 2,5 (3,8 m de comprimento) | ×2,49 |
| Cabine telefônica | 2,3 | ×1,67 |
| Caçamba | 1,5 | ×1,83 |
| Hidrante | 0,8 | ×2,07 |
| Lixeira de rua / Lixeira azul | 1,0 / 0,95 | ×2,25 / ×2,06 |
| Caixa de correio de poste / azul | 1,2 / 1,3 | ×2,17 / ×3,43 |
| Parquímetro | 1,3 | ×2,29 |
| Banco de praça (comprimento) | 1,8 | ×2,01 |

### modular-roads-pack (FBX em cm) — escala do arquivo **0,47368**
O jogo usa `RW = 18` m de rua e `P = B + RW = 74` m entre cruzamentos (`projects/neon-coast/js/core/util.js`: `N=8,B=56,RW=18,P=B+RW`, `roadC(i)`). A pista crua do pack tem 38 unidades, então 38 × 0,47368 = 18,0 m (17,96 medido). Resultado: cruzamentos 18×18 m; reta 1x = 69,3 m (≈ o passo P de 74 m), 2x = 138,6 m, 4x = 277 m; retornos semicirculares 62/106/194 m. Os segmentos retos não encaixam exatamente em P (faltam ~5 m); os cruzamentos sim.

### Cores e texturas
- Texturas "faltando" do street-asset-pack (8): 3 eram só nome truncado (`Concrete_Barrier_..._BaseColo.png`, `..._Roughnes.png`, `Metal_BarrierN_Damaged_..._Dama.png`) e passaram a casar. Ficam sem textura as 4 de normal/rugosidade das barreiras de metal danificadas (só existe a cor, no arquivo truncado); o material usa a cor + rugosidade padrão. Nenhuma cor manual foi necessária.
- street-asset-pack-free: o DAE não referencia texturas; casam por nome do material (albedo/normal/metálico/emissivo). Os sinais "pretos" eram metalness 1 sem envMap (o jogo não tem), resolvido com o limite de 0,3 do importador; as placas mostram a face de trás cinza escuro na folha (a frente tem o desenho).
