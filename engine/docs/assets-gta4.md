# Modelos e texturas do GTA IV no NEON ENGINE

## O que dá para ler direto da instalação
- Os recursos do GTA IV (motor RAGE) são arquivos **RSC versão 110**: cabeçalho de 12 bytes + dados zlib, que viram um bloco de **sistema** (estruturas) e um **gráfico** (vértices, índices, pixels). Ponteiros `0x5…` apontam para o sistema, `0x6…` para o gráfico.
- **Abertos na instalação:** `pc/models/plantsmgr.wdd` (as plantas do chão), `pc/textures/*.wtd` (126 dicionários de textura soltos) e todos os **`.ide`** (texto, com o nome, a textura e a distância de desenho de cada objeto).
- **Criptografados:** todos os `.img` (mapa e objetos: `pc/data/maps/**.img`, `pc/models/cdimages/*.img`). O índice deles é cifrado com uma chave que fica dentro do `GTAIV.exe`; a engine **não** quebra isso. Quem abre é o **OpenIV** (o programa de mod usado pela comunidade), na sua cópia do jogo.

## Fluxo
1. **OpenIV**: abra o `.img` (ex.: `pc/data/maps/props/vegetation/ext_veg.img`), selecione os objetos e use *Exportar* para uma pasta. Leve junto os `.wtd` (texturas). Boas fontes:
   - `props/vegetation/ext_veg.img` — árvores, arbustos, flores, plantas de vaso;
   - `props/roadside/` — `bins` (lixeiras, caçambas), `rubbish` (lixo, sacos, caixas), `lamppost` (postes), `traffic` (semáforos, cones), `sign` (placas), `fences` (cercas), `st_vend` (barracas), `crates`;
   - `props/street/` — `amenitie` (bancos, hidrantes, cabines), `elecbox` (caixas elétricas), `misc`, `rooftop`.
2. **Editor → Importar → GTA IV (OpenIV)…** (ou `node engine/tools/gta4-import.js <pasta> --cat "Rua (GTA IV)" --brasil`): converte cada modelo para **GLB** em `<projeto>/assets/objects/iv_<nome>/` (fora do git) e põe na biblioteca, na categoria escolhida. Os nomes dos objetos de dicionários (`.wdd`) vêm dos `.ide` copiados para `research/gta4/ide`.
3. Coloque no mapa pela biblioteca ou pelo **pincel de vegetação** (V).

## O conversor (`engine/tools/gta4/`)
- `rsc.js` — descompacta o RSC e resolve ponteiros.
- `textures.js` — dicionário de texturas (`.wtd` ou embutido no modelo): DXT1/3/5, A8R8G8B8, X8R8G8B8, L8 → RGBA → PNG.
- `drawable.js` — `rmcDrawable`: grupo de shaders (nome, `.sps`, textura difusa pelo hash `0x2b5170fd`), modelos de alto detalhe → geometrias → *vertex buffer* (declaração de elementos: posição, normal, cor, UV, em float, meio-float ou 10:10:10) e *index buffer*; Z para cima → Y para cima. `.wdd` lê o dicionário (hash Jenkins dos nomes), `.wft` procura o drawable dentro do fragmento.
- `glb.js` — escreve GLB 2.0 (posição, normal, UV, índices, PBR com textura PNG; folhagem e recortes com *alpha mask* e dupla face; vidro com transparência).
- `brasil.js` — **adaptação para o Brasil** (`--brasil`): recolore só as partes coloridas da textura, mantendo desenho e desgaste: lixeira/caçamba laranja (SP), hidrante vermelho, caixa de correio amarela (Correios), placa de rua azul, poste/semáforo cinza-escuro (tira o amarelo americano), caixa de jornal verde.
- `--grama` — texturas de planta com transparência viram PNG para a vegetação do jogo (`assets/world/gta4/`) e moitas de cartões cruzados na biblioteca.

**Testado** com os arquivos abertos da instalação (`plantsmgr.wdd`: 16 modelos lidos; `plantsmgr.wtd`: 16 texturas decodificadas). Os `.wdr`/`.wft` exportados pelo OpenIV seguem a mesma estrutura, mas **ainda não foram testados com arquivos reais** — se algum objeto vier vazio ou torto, mande o arquivo que eu ajusto.

## Já no jogo (sem precisar do OpenIV)
- **Grama do GTA IV**: as 8 texturas de planta do `plantsmgr.wtd` (capim alto, verde, escuro, mato florido, tufo seco, erva daninha, agave, galhos secos) substituem a grama desenhada e entram como espécies novas espalhadas pelo mapa (beira de estrada, encostas secas, perto do mar, parques da cidade) — ~17,7 mil moitas em instâncias.
- Sem os PNGs (outro PC), as espécies continuam aparecendo com a textura desenhada.
