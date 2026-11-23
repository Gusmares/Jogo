# NEON COAST

Jogo 3D de mundo aberto (Three.js) empacotado como aplicativo de desktop (Electron): cidade em grade, praias, colinas,
pântano com jacarés, ciclo dia/noite, vida/morte, missões de entrega, **polícia brasileira** (viaturas e fardamentos da
PMESP, em detalhe total) e serviços de emergência (SAMU e Bombeiros).

## Como jogar
Abra **`dist/NEON COAST-win32-x64/NEON COAST.exe`**. Não precisa de internet nem de navegador. `F11` alterna tela cheia.

O menu inicial oferece **Iniciar, Configurações e Sair**. Iniciar abre o catálogo completo de **151 skins**, incluindo fardamentos, com busca, filtros e prévia 3D. Selecione uma e clique em **Entrar na cidade**. Durante a pausa (`Esc`), é possível continuar, escolher outra skin ou ajustar volume da rádio, sensibilidade, qualidade gráfica e ajuda. As preferências e a última skin escolhida ficam salvas localmente.

| Tecla | Ação |
|---|---|
| WASD | mover / dirigir |
| Shift | correr (gasta estamina) |
| Espaço | pular, se soltar de um jacaré, freio de mão |
| Mouse ou setas | câmera |
| F | entrar / sair do carro (inclusive viaturas e a moto da ROCAM) |
| G | gestos (mãos ao alto, conversar, celular, aplaudir, dançar...) |
| O | trocar a roupa do personagem |
| L | ligar / desligar a sirene (dentro de uma viatura) |
| H | mostrar / esconder a ajuda |
| Alt (segurar, dentro do veículo) | roda das 12 estações + rádio desligado; mouse/setas escolhem, soltar confirma |
| Tab (segurar, a pé) | roda de armas por categoria; mouse escolhe, rolagem troca a arma da categoria, soltar equipa |
| R / Shift+R | próxima / anterior estação de rádio (dentro do veículo) |
| M / [ / ] | ligar ou desligar o rádio / diminuir ou aumentar volume |
| 1 / 2–0 / rolagem | desarmado / atalhos das armas / percorrer equipamento |
| Botão direito / clique esquerdo / T | mirar / atirar / recarregar |

## Assets brasileiros integrados

- **Pedestres:** os 40 civis usam as três skins já disponíveis (Argentina, bbthin e Emmet), com caminhada e espera do `ped.ifp`. Cada pedestre tem seu próprio esqueleto e fase de animação; as malhas/texturas são compartilhadas. As rotas e pausas foram mantidas. Não aparecem bonecos de blocos durante o carregamento nem à distância.

- **Trânsito:** Honda Biz, VW Gol G2, VW Fusca 1963, Peugeot 206 GTI e ônibus Mercedes OF-1618 Comil Svelto nas pinturas Belém, Sinoscap e São José. Presets próprios de velocidade, aceleração, freio, entre-eixos e frequência no trânsito. Há exemplares estacionados ao longo da rua próxima ao início (z=72 a 180).
- **Rádio offline:** 12 estações por gênero, 226 faixas e 5 intervalos do pacote GTA Brasil (um a cada quatro músicas). Cada veículo sorteia sua própria sintonia e tem 22% de chance de estar com o rádio desligado. A programação de cada estação começa em uma música e posição aleatórias, percorre todas as faixas embaralhadas e continua mesmo quando ninguém a escuta. Ao roubar um carro, o jogador herda a transmissão do NPC; voltar a um veículo preserva sua sintonia. A pé, até dois rádios de NPCs próximos são audíveis, com volume diminuindo pela distância. O volume é preferência do jogador; estação e ligado/desligado pertencem ao carro. Pausar congela a programação. Os `.atp` fornecidos contêm MP3, sem recompressão, servidos com HTTP Range.
- **Interface de armas:** roda em Tab com as 15 armas agrupadas por tipo, incluindo desarmado. A rolagem escolhe variantes dentro da categoria. O HUD mostra nome, munição e progresso da recarga. As rodas bloqueiam disparos e movimento da câmera, reduzem a velocidade da simulação e cancelam ao pausar ou perder foco.
- **Ocupantes:** jogador e motoristas civis/policiais com pose `CAR_sit`, braços `Drive_L`/`Drive_R` seguindo o volante; Biz usa `WF_Ride`. A pélvis é ancorada no banco após cada animação. Vidros transparentes e troca de roupa durante a direção. Policiais que desembarcam deixam o banco vazio.
- **Armas:** FN FAL e Taurus 24/7 equipáveis, com animações, munição por carregador, recarga, som e impactos visuais no cenário. Disparos podem chamar a atenção da polícia. Nesta etapa a reserva de munição é ilimitada e não foi criado um sistema de dano balístico em NPCs.
- **Ruas:** asfalto e calçadas do pack brasileiro, mantendo a sinalização da cidade.
- **Assalto desativado:** `Mod_de_ser_assaltado` fica somente como referência em `tools/assets.json`. Nenhum script CLEO, DLL ou ASI é executado. O Proper Shaders é um plugin do motor do GTA e também permanece desativado. Mecânicas futuras devem ser implementadas em módulos JavaScript do próprio jogo.

`npm run assets:import` prepara veículos, armas, ruas e rádio a partir dos originais. Use `node tools/import-assets.js --models`, `--radio` ou `--roads` para um grupo. O catálogo e os presets ficam em `tools/assets.json`; a saída de execução fica em `assets/catalog.json`, `assets/models`, `assets/world` e `assets/radio`. Os mods originais não entram no executável. O ônibus tem correções explícitas das rotações das peças no preset; vértices sem triângulos são descartados sem reduzir o detalhe renderizado.

`npm run test:assets` valida os arquivos gerados e o streaming. `npm run test:game` verifica no Electron modelos, ocupantes, animações, áudio real e armas, com captura de tela na pasta temporária. `npm run build` atualiza o executável.

`npm run test:interface` verifica menu, skins, configurações, reprodução real da rádio, sintonia por carro, som de NPCs, intervalos e controles das rodas no Electron; salva capturas em `%TEMP%/neon-interface-captures`. `npm run assets:interface` reconstrói o catálogo de todas as skins convertidas e mede as durações de novos áudios com `ffprobe` (as durações existentes são reutilizadas; o jogo não precisa de ffprobe).

Créditos dos novos assets: autores e instruções preservados nas pastas originais. Rádio: equipe GTA Brasil (seleção), Jacobi (montagem), MKKJ (Advanced Track Player original); as músicas permanecem dos respectivos artistas. FN FAL: modelo de DayZ, conversão GTA V por Morrice e GTA SA por Jéssica Natália, configurações por Junior_Djjr, conforme o leia-me fornecido. Demais créditos estão nos leia-mes dos veículos, Taurus e Ruas Brasileiras/MixMods.

## Comandos (precisa do Node.js)
```
npm install                 instala Electron e o empacotador (só na primeira vez)
npm start                   abre o jogo numa janela (modo desenvolvimento)
npm run build               gera o executável em dist/
npm run serve               servidor local em http://localhost:8080 (depurar no navegador)
node tools/convert-dff.js --all      converte os veículos de assets/mods -> assets/models   (lista em tools/models.json)
node tools/convert-skin.js --all     converte fardamentos e skins do jogador                  (lista em tools/skins.json)
node tools/test-ifp.js <arq.ifp>     valida um arquivo de animação e lista os clipes
node tools/pak-list.js <arq.pak>     lista o conteúdo de um .pak do Unreal
```

## Estrutura de pastas
```
neon-coast/
├── index.html · css/ · package.json
├── electron/main.js            janela do aplicativo + servidor local interno (--selftest verifica o jogo)
├── js/
│   ├── core/                   util, engine, input, camera
│   ├── world/                  terrain, water, foliage-lib, city-textures, collision, city, vegetation, sky
│   ├── entities/               models · vehicles · gator · vehicle-models · anim · skins · player-model · police · emergency
│   ├── gameplay/               health · mission · update
│   ├── ui/hud.js · main.js
├── vendor/three.min.js         Three.js r128 (local)
├── assets/                     TODOS OS MODELOS 3D E ANIMAÇÕES
│   ├── anims/                  animações usadas em jogo (.ifp do GTA SA: ped.ifp + pacotes de armas, moto, dança, nado, luta...)
│   ├── mods/                   mods ORIGINAIS (crus; não vão para o executável), separados por situação — veja "Mods originais" abaixo
│   │   ├── 0-NOVOS/            jogue aqui os mods novos
│   │   ├── 1-USADOS/  2-PARCIAIS/  3-NAO-USADOS/
│   │   └── INVENTARIO.md       o que já foi usado e o que falta, mod a mod (gerado)
│   └── models/                 modelos CONVERTIDOS (usados pelo jogo)
│       ├── <veículo>/          model.json · body.bin (detalhe total) · body_lod.bin · wheel*.bin · textures/
│       └── skins/<fardamento>/ skin.json · skin.bin · textures/
├── tools/                      conversores, servidor local, gerador do .exe, inspetores de DFF/TXD
└── dist/                       executável gerado
```
**Ordem de carga importa:** são scripts clássicos no mesmo escopo; cada arquivo usa o que os anteriores definiram (ver `index.html`).

## Como a polícia funciona no jogo
Baseado em como atuam as polícias no Brasil (Constituição, art. 144: a PM faz o policiamento **ostensivo**; a Polícia Civil é
**investigativa**) e na estrutura da PMESP:

| Unidade | Veículos | Papel | Quando aparece |
|---|---|---|---|
| **RP** Radiopatrulha (190) | Palio, Spin | policiamento ostensivo básico, primeira a responder | ronda + 1★ em diante |
| **ROCAM** | Moto + motociclista | ronda e reforço rápido às RP | ronda + 1★ em diante |
| **TOR** Tático Ostensivo Rodoviário | Hilux TOR | policiamento tático de **rodovia** | ronda na estrada do pântano; reforço no 3★ |
| **FT** Força Tática | SW4 | reação rápida, ocorrência grave | 2★ em diante |
| **Polícia Civil** | TrailBlazer | investigativa: só em crime grave, nunca faz ronda | 2★ em diante |
| **ROTA** | Hilux Rota, TrailBlazer ROTA | alto risco | 3★ |

- **Ronda (sem procurado):** 2 RP + 2 ROCAM pela cidade e 1 TOR indo e voltando pela rodovia.
- **Procurado (★):** bater em carros em velocidade, roubar carro com policial por perto, roubar viatura, bater em viatura, ou correr
  muito diante delas. Cada nível acrescenta unidades (tabela). As viaturas seguem as ruas pelo caminho mais curto e usam sirene.
- **Policiais a pé:** quando a viatura chega, policiais com o fardamento da unidade descem, correm até você e fazem a abordagem
  (animação procedural por ossos). Parado por ~2,4 s: **preso** (multa de até $300).
- **Escapar:** sair da vista deles; o nível esfria rápido.
- **Emergência:** acidente de carro sério chama a **ambulância (SAMU 192)**; acidente grave chama também os **Bombeiros (193)**.
  Chegam com sirene, ficam no local e depois vão embora.
- Unidades e fardamentos são carregados sob demanda (a ronda básica carrega na abertura; FT, Civil e ROTA ao subir o nível).

## Detalhe total
Os conversores **não reduzem** os modelos: corpos com 120 mil a 1 milhão de triângulos e texturas em até 2048 px. O jogo troca
sozinho para uma versão leve (~10 mil triângulos) quando a viatura está a mais de ~70 m da câmera. Cada veículo tem colisão
e rodas calculadas a partir do próprio modelo (comprimento, largura, raio da roda).

## Animações (reais, do GTA San Andreas)
O jogo lê os arquivos `.ifp` (formato ANP3) de `assets/anims/` e anima o esqueleto de 32 ossos direto neles: 294 clipes do `ped.ifp` mais os pacotes de pistola,
rifle, shotgun, uzi, moto, dança, nado, luta e outros (29 arquivos).
- **Jogador:** parado (`IDLE_stance`), andar (`WALK_player`), correr (`run_player`), sprint (`sprint_civi`), pulo, queda, agarrado pelo jacaré, nocaute (`KO_shot_front`) e gestos na tecla **G**.
- **Policiais a pé:** correm armados (`run_armed`; ROTA e TOR com `swat_run`) e fazem a abordagem (`ARRESTgun`, `Gun_stand`, `WEAPON_crouch`).
- **Motociclista da ROCAM:** `BIKEh_Ride`.
- Se um clipe não existir, o jogo usa a animação procedural por código como reserva.
- A convenção dos quaternions foi validada por `tools/test-ifp-pose.js` (o corpo precisa ficar em pé, com 1,8 a 1,95 m).

## Personagem do jogador
Skins soltas em `assets/mods/*/player-skins/` (terno da Argentina, bbthin, Emmet) viram o personagem; **O** troca de roupa.

## Sobre o pacote SADE (Proper Player Retex)
É um mod de texturas do **GTA San Andreas Definitive Edition**: um `.pak` do Unreal Engine com 193 texturas das roupas do CJ (camisetas, calças, bonés,
tênis...), em formato cozinhado do Unreal. Os nomes **não coincidem** com os modelos que temos (0 de 18 texturas nos fardamentos da PMESP; só 2 a 6 por acaso
nas skins do jogador), então ele não foi aplicado. Para usá-lo seria preciso montar o CJ (a partir do `Nova Player.img V2`) e converter as texturas do Unreal.

## Física de veículos (carro, ônibus e moto)
Núcleo em `js/entities/car-physics-core.js` (sem dependência do desenho, testável fora do jogo com `node tools/test-car-physics.js`).
- **Motor e caixa:** curva de torque por rotação, marchas automáticas por categoria, embreagem na saída, limitador de giros e governador. A potência vem de cavalos
  e a massa decide o resto: compactos ~3-4,5 s de 0 a 60 km/h (Palio ~3 s, Fusca ~4,6 s), ônibus de 11 t ~8 s, moto ~2,4 s (ajuste arcade). Rampa: o peso puxa para trás; o torque e a marcha decidem se sobe.
- **Pneus:** força lateral por ângulo de deriva com saturação suave e círculo de atrito (aceleração e curva dividem a mesma aderência). A direção é ágil (esterço rápido, não
  murcha em alta) e uma assistência arcade leva a guinada para o que o volante pede, sem passar do limite do pneu; o traseiro tem folga (o Fusca não roda à toa).
- **Peso:** transferência de carga ao frear, acelerar e fazer curva (mergulho e rolagem); veículos altos (ônibus) têm limite contra capotamento.
- **Suspensão:** 4 pontos independentes. A posição de cada roda sai do curso da suspensão (nunca do terreno reprojetado), então a roda **não sai do chassi**
  em morro. O giro da roda é proporcional à velocidade real, igual nos dois lados.
- **Moto:** o guidão pede uma curva e a moto se inclina até a aceleração lateral certa (até ~45°); ela gira em torno da linha de contato com o chão.
- **Entrar e sair (F):** o personagem anda até a porta do motorista e toca as animações reais do GTA SA (`CAR_getin`/`CAR_getout` nos carros, `BIKEh_JumpOnL`/`BIKEh_GetOffLHS` nas motos; versão `BIKEs` na scooter). A pélvis desliza até o banco, sem pulos. Código em `js/gameplay/vehicle-anim.js`. O piloto da moto senta em cima do banco, perto do eixo traseiro.
- **Dano:** batidas estragam o veículo por região (frente tira potência, lado desalinha a direção, tudo limita o esterço) e há fumaça no capô quando a
  frente está destruída. **A lataria amassa visivelmente**: até 6 amassados por veículo (deslocamento de vértices no shader, só nos carros batidos), com a tinta escurecendo
  no ponto do impacto. **A roda solta é rara**: só em impacto acima de ~72 km/h (≈10% a 100 km/h, ≈20% a 130 km/h); o canto cai, o aro raspa no chão e a roda
  sai rolando. Backspace reposiciona e conserta o carro.

## Multidão (NPCs) e Morro da Esperança
**NPCs** (`js/entities/npcs.js`, cenas em `js/world/scenes.js` e `js/world/favela.js`) — a lógica de cenas é inspirada no mod **Urbanize** (o pacote de animações dele, 172 clipes `urb_*`, foi
integrado: `assets/anims/urbanize.ifp`; os scripts CLEO do mod são binários do GTA SA e não rodam no navegador, então as cenas foram refeitas aqui).
- **Cenas fixas** que nascem perto do jogador: rodinhas de conversa, gente encostada na parede, fumando, no orelhão, sentada em bancos e banquinhos, vendedores de rua com guarda-sol,
  mendigos, dança (caixa de som), bar com mesas, dominó, vigias, gente tomando sol na praia.
- **Caminhantes** seguem as calçadas, atravessam a rua nas esquinas, param e olham em volta; nos becos da favela perambulam entre pontos. Até ~96 NPCs ao mesmo tempo, só em volta do jogador.
- **Física:** ninguém ocupa o mesmo lugar (espaço pessoal + colisão), não atravessam paredes, carros nem o jogador; desviam uns dos outros.
- **Carro em velocidade atropela:** o NPC é arremessado (animações reais `KO_skid`), cai, levanta e foge ou morre (testemunhas fogem, o SAMU é chamado, vira crime). Quem está distraído (celular, dormindo) não desvia.
  Carros do trânsito e da polícia **freiam** para quem está na frente. **Tiros** assustam a multidão e podem atingir NPCs.
- **Polícia:** as viaturas não se amontoam (repulsão + freio de quem está à frente) e os policiais a pé rodeiam o alvo em pontos diferentes, sem atravessar carros nem uns aos outros.

**Morro da Esperança** — favela num morro a leste da cidade, refeita como um morro de verdade (`js/world/favela.js`, relevo em `js/world/terrain.js`, planejamento com `node tools/plan-favela.js`):
- Crista alongada e irregular, encosta íngreme voltada para a cidade. Uma **ladeira estreita em zigue-zague** (curvas fechadas, ~9% de subida) leva do portão até uma **quadra de futebol/praça** no meio do morro: só ali chega carro.
- Do resto do morro em diante só há **vielas**: ~60 becos de ~2 m que serpenteiam pela encosta e se cruzam, com **escadarias** nos trechos íngremes, postes de madeira e fios. As casas (~450, de tijolo, laje e telhado, giradas conforme as curvas de nível, com pavimentos recuados) ficam coladas umas nas outras e as sobras formam os becos.
- Gente nas vielas (encostada, fumando, sentada, em rodinhas), boteco na quadra, dominó, dança, vigias nas curvas e barracas na ladeira.
- **Polícia:** a viatura para no portão; os policiais sobem **a pé pelo grafo de ladeira + vielas** (sem atravessar casas). Dentro do morro o nível de procurado esfria devagar.

## Cidade e tráfego
- **Distritos** (`js/world/city.js`, fachadas em `js/world/facades.js`): centro de torres de vidro sobre pódios com lojas, comércio/misto, bairros residenciais (casas com muro e jardim, prédios de tijolo), zona industrial (galpões, contêineres, tanques), praça com fonte, estádio, shopping e parques. Fachadas com texturas próprias (vidro, concreto, tijolo, lojas, galpão, casas), letreiros de lojas, painéis nos telhados e telhados com equipamentos.
- **Ruas**: faixas de pedestre e linhas de retenção em todos os cruzamentos e **semáforos** (verde, amarelo, vermelho geral) com defasagem por cruzamento.
- **Tráfego** (`js/world/traffic-lights.js`): os carros param no vermelho na linha de retenção, freiam para pessoas e para o carro da frente; o tráfego nasce e some em volta do jogador (até ~30 carros) e há **carros estacionados** nos meios-fios (dormem quando longe, para não pesar).
- **Pedestres** atravessam nas faixas e **esperam o sinal dos carros fechar**.

## Desempenho
O jogo foi otimizado para rodar bem em PCs modestos (placas integradas). Antes, uma rua da cidade chegava a **3,3 milhões de triângulos e ~1150 chamadas de desenho** por quadro; agora ficam em torno de **0,6 milhão e ~400** (incluindo sombras), e o custo de CPU do quadro é ~3 ms.
- **Resolução dinâmica** (`js/core/post.js`): a cena é desenhada numa textura que encolhe/cresce sozinha para manter ~60 fps; sem MSAA (anti-aliasing por FXAA no passe final). Se mesmo na escala mínima estiver pesado, as sombras se desligam.
- **Pós-processamento leve** inspirado no *Proper Shaders* (o pacote do GTA SA não roda no navegador, então foram recriados os efeitos principais em UM passe): FXAA, nitidez, exposição/contraste/saturação, tom filmico suave (ACES), bloom barato em 1/4 da resolução (mais forte à noite), vinheta e dithering.
- **NPCs**: cada skin ganhou um **atlas de textura** (1 material) e 2 níveis de detalhe simplificados (6,5 mil e 1,7 mil triângulos, antes ~60 mil e ~20 materiais). Gerados por `node tools/atlas-skins.js` (usa o meshoptimizer). O jogador mantém o modelo completo.
- **Veículos**: 3 níveis de detalhe. Só o carro do jogador (e quem está colado na tela) usa a malha completa; de longe vira uma malha única com cor por vértice, com as rodas "assadas" (3-6 chamadas de desenho em vez de ~25). Só o carro do jogador projeta sombra com o modelo completo.
- **Mundo**: prédios, calçadas e faixas viraram poucas malhas grandes (por bloco); terreno em blocos com culling; vegetação instanciada em blocos de 280 m com culling por frustum e distância; sombras só perto da câmera, atualizadas a cada 2 quadros; materiais Lambert no cenário; jacarés somem à distância; menos carros de trânsito.
- **CPU**: animação sem alocações por quadro; tiro com raio analítico (nada de varrer a cena).

## Tiro e mira
- **Botão direito**: mira por cima do ombro (câmera chega perto, FOV fecha, sensibilidade cai). A mira em cruz **abre com a dispersão** (andando, atirando, sem mirar) e aparece um marcador de acerto (vermelho = tiro na cabeça).
- **Pistola**: pose de mira com o braço estendido e recuo visual (a arma "chuta" e volta, o braço não levanta mais a cada tiro).
- **Andar mirando** (animações reais `GunMove_FWD/BWD/L/R`): o corpo acompanha a câmera, anda de lado e de costas sem correr; a arma fica no ombro (pose do clipe de tiro). Armado sem mirar usa `IDLE/WALK/run_armed`.
- **Tiro**: dispersão e recuo (a mira sobe e a câmera treme), pistola semi-automática e FN FAL automático, coice da arma, clarão no cano, tracer, poeira/faíscas no impacto e som de estampido. O cano aponta para onde a câmera mira. Recarga com a animação real (`colt45_reload`, `RIFLE_load`).
- NPCs apontados de perto levantam as mãos ou fogem; tiros assustam a multidão e atingem pessoas e carros.

## Animações (revisão)
- **Pé no chão em qualquer pose**: as animações do GTA ignoram o deslocamento da raiz, então poses agachadas/deitadas ficavam no ar. Agora, a cada atualização, o osso mais baixo do corpo é medido e o personagem é assentado no chão (`plantActor` em `js/entities/skins.js`) — vale para NPCs, jogador e policiais (agachar, cair, deitar, levantar).
- **Arma na mão de verdade**: a arma é filha do osso da mão (como no GTA), com a empunhadura calibrada na pose de mira de cada arma. A mira para cima/baixo inclina o **tronco** (coluna) junto, então mãos e arma continuam coerentes.
- **Entrar/sair de carro**: o personagem anda até a porta, **abre a porta** (clipe `CAR_open` + a **própria porta do modelo do carro**, articulada na dobradiça), entra girando o corpo até ficar de frente para o volante (sem "pulo" no fim) e a porta fecha. Na saída a porta abre, ele sai e ela fecha atrás. Moto: monta/desce pelo lado esquerdo, também sem pulo.
- **Carros de média distância**: novo nível de detalhe médio (~40 mil triângulos, gerado por `node tools/decimate-vehicles.js`) entre ~14 e ~50 m, com pintura/vidro/lanternas texturizados; a malha completa só perto (e no carro do jogador).

### Correções (rodada de testes)
- **Mira não "sobe" mais ao atirar**: o recuo da câmera agora é limitado e devolvido aos poucos (`weapons.recoilAcc`); o fuzil também segura a pose de mira (sem reiniciar o clipe a cada tiro), então o personagem não é empurrado para cima.
- **Porta real do carro**: o conversor (`tools/convert-dff.js`) separa a porta do motorista (`door_lf_ok`, pivô `door_lf_dummy`) em `door.bin`; o jogo abre/fecha essa malha na dobradiça (amassados e pintura continuam valendo). Nos níveis de detalhe médio/longe a porta fica fechada e embutida. Depois de reconverter, rode `node tools/decimate-vehicles.js`.
- **Sempre de dia**: o relógio do jogo está parado em ~13:30 (`CLOCK_RUNS=false` em `js/world/sky.js`) até decidirmos ciclo/clima.

### Armas (empunhadura)
- O clipe de tiro da pistola só define o braço direito; o resto do corpo ficava com a pose "que sobrou" da animação anterior, e a arma apontava para qualquer lado (parado, andando, correndo). Agora, armado, o corpo usa sempre uma base conhecida (`IDLE_stance` parado / `GunMove_FWD` andando) com o braço/tronco do clipe da arma por cima (`UPPER_BONE_IDS`), e `alignWeaponArm` (em `js/entities/player-model.js`) gira o ombro (pistola) ou o tronco (fuzil) o mínimo para o cano apontar para a frente — ou para onde a câmera mira. Vale parado, andando, correndo, mirando e atirando; durante o recarregar a animação do clipe manda.
- **Fuzil com as duas mãos**: a pose é a de mira (`pose: 0.32` do clipe `RIFLE_fire`, arma no ombro) e a mão esquerda é levada por IK de dois ossos (`leftHandIK`) até o guarda-mão da arma (`lhand` em `WEAPON_ANIM`, no espaço da arma) — antes as duas mãos ficavam coladas no punho.
- A empunhadura de cada arma é calibrada com essa mesma composição (`calibrateGrip` em `js/gameplay/weapons.js`; flags `oneHand`/`twoHand` em `WEAPON_ANIM`).

## Mods originais (organização)
Tudo que veio dos mods fica em `assets/mods/`, num balde por situação:
| Pasta | Significa |
|---|---|
| `0-NOVOS` | mods recém-chegados (descompactados) — ainda não classificados |
| `1-USADOS` | tudo que presta do mod já está no jogo |
| `2-PARCIAIS` | parte já está no jogo, parte falta |
| `3-NAO-USADOS` | nada usado ainda |

- `node tools/mods-inventory.js --organizar` varre os mods, descobre o que é usado (citado em `tools/assets.json`, `models.json`, `skins.json`, listado em `tools/mods-usage.json`, ou copiado para `assets/models|anims|radio|world`), move cada pasta para o balde certo e reescreve `assets/mods/INVENTARIO.md` (e `inventario.json`). Sem `--organizar` só atualiza o relatório.
- As configurações apontam para `mods/<Pasta>/arquivo` **sem o balde**, então mover a pasta não quebra nada (`tools/mods.js` acha o balde).
- Para integrar um mod: coloque em `0-NOVOS`, registre o veículo/skin/arma em `tools/assets.json`, `models.json` ou `skins.json`, rode `node tools/import-assets.js` (ou `convert-dff.js`/`convert-skin.js`) e depois o inventário.
- O executável só leva `assets/models`, `anims`, `radio`, `world` e `catalog.json`; `assets/mods` nunca entra.

## Mapa: São Paulo + Rio de Janeiro
- **Grade única de ruas**: as duas cidades ficam na mesma grade (espaçamento de quadra P); o cruzamento (i,j) está sempre em (roadC(i), roadC(j)). São Paulo ocupa i,j 0..8 (a cidade original) e o Rio i 26..36, j 1..7. `CITIES`, `HWY`, `nodeOK`, `blockOK`, `cityAt` em `js/core/util.js`. Tráfego, semáforos, polícia, SAMU, pedestres e entregas usam essa grade — por isso andam nas duas cidades e na rodovia sem código separado.
- **Via Dutra** (`js/world/rio.js`): rodovia de ~1,3 km entre as cidades, perfil suavizado sobre a serra (rampa máx. 5,5%, taludes), defensas, postes, pórticos com placas, praça de pedágio e placas de boas-vindas. Carros, polícia e entregas usam a rodovia.
- **Rio de Janeiro**: Centro com torres, zona norte residencial, Maracanã, praças e a **orla** (prédios de frente para o mar, calçadão com o desenho de ondas, quiosques, postos de salva-vidas, guarda-sóis, vôlei e gente na praia); **Cristo Redentor** no alto do Corcovado; **Pão de Açúcar** e Urca no mar com o **bondinho** andando.
- **Favelas nas duas cidades**: o gerador de morro virou genérico (`FAVS` em `js/world/terrain.js`, `buildFavela(F)` em `js/world/favela.js`): cada morro tem crista, ladeira em zigue-zague, vielas, escadarias, casas empilhadas, fios, quadra e boteco. SP: Morro da Esperança; Rio: Complexo do Alemão e Rocinha (maior, casas de até 5 andares).
- **Polícia por região**: em SP RP/ROCAM/FT/BAEP/Civil/ROTA/TOR (PM-SP); no Rio a PMERJ (viaturas e motos do pack) e o **BOPE com o Caveirão** em 2-3★. Mapeamento em `RJ_UNIT` (`js/entities/police.js`).
- O nome da região aparece no HUD (São Paulo, Rio de Janeiro, Via Dutra, favelas, Pântano, serra).

## Packs de mods integrados
- `node tools/mods-catalog.js` lê os packs em `assets/mods` e gera `tools/auto-catalog.json` (veículos, skins e armas com nome, tipo e unidade). `node tools/import-mods.js` converte tudo (só o que falta; `--force`, `--only vehicles|skins|weapons`, `--id`, `--prefix`) e reescreve `assets/catalog.json`. Depois: `node tools/decimate-vehicles.js` (detalhe médio dos carros pesados) e `node tools/atlas-skins.js` (atlas/LOD das skins para a multidão).
- **Veículos (~180)**: pack GTA Brasil v4.1 (nomes brasileiros vindos do `vehiclenames.fxt`, física a partir do handling original do SA: massa, velocidade, aceleração, tração, freio), carros rebaixados, motos, Flamengo, viaturas PM-SP/PMERJ/BAEP. Cores "mágicas" do SA viram pintura/faróis/lanternas; texturas do `vehicle.txd` genérico (que não vêm nos mods) viram cores neutras. O tráfego usa um **rodízio** de ~14 modelos que troca um a cada 20 s (carregar todos estoura memória/rede). `?showroom` na URL estaciona todos lado a lado.
- **Skins (~140)**: viram gente na rua (rodízio de ~14, troca a cada 25 s) e roupas do jogador (**O** / **Shift+O**, mais de 130). Policiais das fardas só nas unidades.
- **Armas (15)**: pistola, taser (derruba sem matar), Desert Eagle, Uzi, Tec-9, escopeta de cano serrado, MP5, FN FAL, AK-47, fuzil de precisão (luneta com zoom), escopeta calibre 12 e de combate (vários bagos), faca e katana (golpes com animação real). **1** desarmado, **2-0** ou a **roda do mouse** trocam.
- Ficaram de fora: aviões/helicópteros/barcos/trens (ainda não há voo nem navegação), 5 carros sem malha de roda e dois zips com senha (`favela_completa...`, `pack_de_41_veiculos...`). Detalhes em `assets/mods/INVENTARIO.md`.

## Texturas genéricas dos carros
- Muitos modelos dos packs usam texturas do `vehicle.txd` do próprio jogo (grade, cromados, borrachas, faróis/lanternas, pneus, volante, painel), que não vêm no mod. O pack GTA Brasil traz a versão dele em `_CFG/generic`: `node tools/generic-vehicle-tex.js` extrai, amplia 2× (Catmull-Rom + nitidez) e grava UMA cópia em `assets/models/_generic/` — todos os carros apontam para ela (`../_generic/...`) e o jogo guarda num cache só.
- Placa: o jogo desenha placas **Mercosul** aleatórias (faixa azul BRASIL, bandeira, ABC1D23) em canvas; cada carro sorteia uma (`plateTexture` em `js/entities/vehicle-models.js`).
- O leitor de TXD tratava o formato 888 como se tivesse alfa (tudo transparente) — corrigido em `tools/txd.js`.
- Depois de mexer nessas texturas: `node tools/import-mods.js --force --only vehicles`, `node tools/convert-dff.js --all` e `node tools/decimate-vehicles.js`.

## São Paulo reconstruída
- Bairros com nome no HUD (`SP_BAIRROS` em `js/world/sp.js`): Vila Madalena (casas, grafites, "Beco do Batman"), Bom Retiro, Luz, Centro, Sé, 25 de Março, Liberdade, Mooca (galpões com chaminés de tijolo), Av. Paulista, Ibirapuera, Itaim Bibi (torres de vidro), Pacaembu, Marginal Pinheiros e Morumbi.
- Marcos (`SP_BUILD`): Estação da Luz (torre do relógio e gare), Mercadão, Edifício Itália, Copan (lâmina em S com brises), Catedral da Sé e a praça com palmeiras e marco zero, Banespa e Martinelli, Theatro Municipal, Liberdade (lanternas suzuran e torii sobre a rua), MASP (caixa suspensa nos pórticos vermelhos, vão livre com gente), FIESP, Conjunto Nacional (letreiro no topo), antenas vermelhas e brancas da Paulista, Parque Trianon e Ibirapuera (Obelisco, Oca, marquise, lago com chafariz).
- Oeste: **Rio Pinheiros** canalizado (água abaixo da rua, paredes, gradil com colisão, margens com ciclovia), **Ponte Estaiada** com o mastro em X e os cabos (a pista fica sobre um aterro escondido pelo tabuleiro: carro e pedestre andam no terreno normal) e o **Morumbi** do outro lado.
- Rua: pisos novos procedurais em alta (`js/world/pavements.js`) — calçada paulista de pedra portuguesa com o mapa do estado, cimentado com juntas e rachaduras, intertravado, asfalto com agregado e trincas, grama — e uma variação em escala grande no shader (`addMacro`) que acaba com a repetição. Meio-fio, piso tátil nas esquinas, bueiros/tampas/remendos/óleo no asfalto, fiação nos postes de concreto (as duas cidades), orelhões, bancas de jornal, pontos de ônibus e ciclovia na Paulista, lixeiras laranjas, árvores de rua (e uns ipês) no lugar das palmeiras, pichação no alto dos prédios.
- Mais gente: até 54 pedestres andando por perto em SP (40 no Rio), limite total 150, com vagas reservadas para quem anda (as cenas paradas não lotam).

## Física dos carros (v3)
- `js/entities/car-physics-core.js` foi refeito na parte de pneu, direção, freio e assistências. **Cada carro tem o próprio perfil**: `deriveCar` transforma o `handling.cfg` original do pack (massa, inércia de giro, centro de massa, tração, perda de tração, distribuição de aderência, aceleração, velocidade máxima, freio, ângulo de direção, suspensão, tração dianteira/traseira/4x4, flags off-road) em parâmetros físicos. Carros sem handling usam um tipo-base (compacto, sedã, SUV, van, caminhão, ônibus) + ajustes em `MODEL`. Viaturas ganham um pouco mais de motor, aderência e estabilidade.
- Pneu com pico de aderência e queda suave (no máximo até 66-93%, conforme o carro): nada de "sabão". Freio com ABS; o freio de mão trava a traseira e é o que faz o carro rodar. Direção vira tudo o que o pneu deixa naquela velocidade. Assistências por carro: estabilidade (corta giro excessivo e contra-esterça), controle de tração (tração traseira forte sai de traseira no acelerador, ex.: Sultan), manobra em baixa velocidade. Veículos altos/estreitos têm a aderência limitada pelo tombamento; pesados seguram menos e são mais estáveis.
- `node tools/vehicle-handling.js` grava o handling (`physics.sa`) e o serviço em cada `model.json` (o `import-mods.js` já faz isso nos novos).
- Bancada: `node tools/test-car-physics.js` (carros de referência), `... br_sultan vw_gol` ou `--all` (frota inteira): 0-100, máxima, frenagem 100-0, g laterais, raio de giro, resposta da direção, tendência de rodar, freio de mão, saída de traseira, slalom e terra.
- Câmera do carro: distância/altura pelo tamanho do veículo e puxa um pouco para a direção real do movimento (derrapagem fica legível).

## Personagem: calçada e armas em descanso
- O jogador usa o mesmo chão dos pedestres e carros (`footGround` em `js/gameplay/update.js`): terreno + calçadas/lajes. Sobe meio-fio e degraus de até 45 cm sem pular.
- Armas sem mirar: pistola, taser, Desert Eagle, Uzi, Tec-9 e cano serrado ficam na mão, apontando para o chão ao lado do corpo, com a locomoção normal; fuzis, escopetas e MP5 vão nas duas mãos, atravessados na frente do peito, com o grupo "armed" do SA (`IDLE_armed`, `WALK_armed`, `run_armed`) e a mão esquerda no guarda-mão (IK). Só ao mirar (botão direito), atirar ou recarregar o personagem levanta a arma; a troca é suave (`restWeaponPose` em `js/gameplay/weapons.js`).

## Batidas (deformação real)
- `js/entities/damage.js`: cada batida deforma os vértices da malha do próprio carro (completa, média, longe e a porta), a partir do ponto e da **altura** do impacto (para-choque de carro, para-choque alto de caminhão/ônibus, parede inteira, poste/árvore estreito, teto ao cair capotado), da direção, do **raspão** (o amassado se alonga) e da força (velocidade × peso do outro lado). Zona de deformação que encolhe a frente, amassado local, dobras com ruído próprio de cada batida, capô que estufa, teto que cede. Nunca sai igual.
- Metal amassado com sombreado facetado e arranhões (metal aparecendo); vidros trincam e estouram só onde bateu; faróis/lanternas atingidos apagam; roda atingida entorta e é empurrada junto com a lataria; em batida muito forte a roda pode soltar. Faíscas, cacos de vidro, pedaços de plástico e de lataria na cor do carro; fumaça com a frente destruída.
- Desempenho: grade espacial dos vértices (só a região atingida é percorrida); até 12 carros amassados ao mesmo tempo; carros da IA longe da câmera guardam só o dano numérico. Backspace (parado) conserta e desamassa.

## NEON ENGINE (editor de mapa)
Programa desktop para montar o mapa sem mexer em código. Abre o **mesmo mundo do jogo** (carrega todos os scripts do `index.html`, menos o laço do jogo) e grava tudo em **`maps/world.json`**, que o jogo lê ao abrir.
- **Abrir:** `dist/NEON ENGINE-win32-x64/NEON ENGINE.exe` (gerado com `npm run build:editor`; ele usa a pasta do projeto, não uma cópia), ou `npm run editor`. No navegador: `npm run serve` e `http://localhost:8080/editor.html`.
- **Câmera:** botão direito + WASD voa, Q/E desce/sobe, Shift acelera, roda do mouse aproxima (com o botão direito, muda a velocidade), botão do meio arrasta, **T** vista de cima, **F** foca o selecionado.
- **Biblioteca (esquerda):** *Objetos* prontos (cubo, plataforma, rampa, cilindro, muro, prédio com fachada da cidade, casa, galpão, poste, orelhão, banca, ponto de ônibus, lixeiras, banco, cone, barreira, árvores, palmeira, mesas, guarda-sol…), *Modelos* convertidos de mods e *Veículos* do catálogo. Clique e depois clique no mapa; **Shift** coloca vários, **R** gira 15°, **Esc** ou botão direito cancela. Dá para empilhar sobre outros objetos.
- **Editar:** **W** mover, **E** girar, **R** escala (gizmo com encaixe na grade, **X** liga/desliga; **L** eixos do mundo/do objeto), **G** assenta no chão, **Ctrl+D** duplica, **Del** apaga, **Ctrl+Z / Ctrl+Y** desfaz/refaz. O painel da direita lista a cena e mostra as propriedades: posição, rotação, escala, medidas, material (cor, asfalto, concreto, pedra portuguesa, grama, fachadas…), cores, e se o objeto **colide** e é **pisável** no jogo. Arrastar o nome do campo (X, Y, Z…) ajusta o valor.
- **No jogo:** objetos sólidos viram colisão; **rampas e pisos baixos são pisáveis** (carro sobe na rampa e pula; o personagem anda por cima). Carros colocados são **geradores**: o carro aparece estacionado quando você chega perto e volta depois que você vai embora. O **ponto de partida** define onde o jogador começa.
- **Planta da cidade:** grade com cada quarteirão de SP e do Rio. Pinte o tipo (residencial, prédios médios, torres, industrial, shopping, estádio, parque, praça, orla, **terreno vazio**) ou um marco de SP (MASP, Copan, Sé…) e aplique: o editor salva e recarrega o mundo. "Planta original" volta ao mapa do código. Mudar a planta sorteia de novo os prédios da cidade.
- **Importar DFF:** traz um objeto de mod do GTA SA (`.dff` + `.txd`) para a biblioteca, com textura (`tools/import-object.js`, o mesmo conversor dos carros). Fica em `assets/models/<id>` com `kind: "object"`.
- **Testar (F5):** salva e abre o jogo começando onde a câmera aponta (`index.html?test=x,y,z,graus`). **Gerar .exe** salva e roda o `npm run build` com o mapa atual.
- **Arquivo:** `maps/world.json` (um objeto por linha, bom para o git): `layouts` (planta), `landmarks` (marcos de SP), `objects` (`type` prefab/model, `ref`, `pos`, `rot` em graus, `scale`, `p` parâmetros, `solid`/`walk`), `vehicles` (geradores: `model`, `pos`, `h`, `color`) e `spawn`. Cada "Salvar" guarda uma cópia em `maps/.backup/` (as 30 últimas, fora do git). É o equivalente aos IDE/IPL do SA: o código (`js/world/placements.js`) monta os objetos iguais no jogo e no editor.
- **Código:** `editor.html`, `editor/boot.js` (carrega o jogo), `editor/engine.js` (câmera, seleção, gizmo, desfazer, salvar), `editor/ui.js` (painéis), `editor/editor.css`, `editor/app/` (app desktop e rotas `/__engine/*`), `vendor/TransformControls.js` (gizmo do three r128). `npm run test:editor` abre o editor, espera o mundo e sai com o resultado.

## Créditos
- Viatura "Hilux SW4 Rota": mod para GTA San Andreas. Sistema de luzes: LM3D, Patifuck. Créditos: S4K4N4S, Abreu_3D, Abner_3D,
  Bruno Silva e LukasR (`assets/mods/*/hilux-rota/Créditos.txt`). https://gtamontesclaros-mg.blogspot.com.br/
- Pack de viaturas e skins PMESP: Chokito Fusion (`assets/mods/*/pmesp/CREDITOS.txt`); os autores originais dos modelos são
  desconhecidos pelo próprio criador do pack.
- Three.js: https://threejs.org/ · Electron: https://www.electronjs.org/
