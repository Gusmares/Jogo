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
Opções: `--cat "<categoria>"` `--prefix p_` `--veg` (força vegetação; sem ele o tipo é detectado) `--max-tex 1024` `--only a,b` (trecho do nome/id) `--dry` (só planeja) `--scale k` `--zup | --no-zup` `--mode auto|roots|meshes|whole` `--file trecho-do-arquivo` `--max-tris N [--decimate]` `--redo` `--no-sheet` `--cols n`.

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
| `street-asset-pack` | 1 FBX em cm, 28 props (barreiras, hidrante, sinais, lixo) | `--cat "Urbano (Street Prop)" --prefix st_ --scale 0.005` (o automático dá ×0,01: objetos grandes demais) |
| `street-asset-pack-free` | zip com 1 DAE sem textura referenciada, 24 props | `--cat "Urbano (pack grátis)" --prefix sf_ --scale 22` (o automático dá ×10: pequeno demais) |
| `modular-roads-pack` | 1 FBX, 9 peças de rua (retas, cruzamentos, curvas) | `--cat "Ruas modulares" --prefix rd_ --scale 0.15` (ajuste à largura de rua do jogo; peças planas) |
| `orelhao` | 1 GLB, 1 orelhão (12 peças) | `--cat "Props urbanos (BR)" --scale 0.0058` (feito: 2,13 m de altura) |
| `realistic-trees-pack-of-2-free` | só `.blend` (dentro de zip) | converter para GLB (ver Limites), depois `--cat "Árvores (pacote)" --prefix rt_ --veg --max-tris 60000 --decimate` |
| `ground-cover-foliage-showcase` | só `.blend` (+ texturas de 4K a 30 MB) | converter para GLB, depois `--cat "Cobertura de solo" --prefix gc_ --veg --max-tex 1024` |
| `ground-cover-foliage-showcase(1)` | cópia idêntica da anterior (zip com o mesmo hash) | não importar |

O inventário agregado está em `engine/docs/packs-inventario.md`.
