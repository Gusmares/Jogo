# Física dos carros do GTA IV — estudo e adaptação no NEON ENGINE

## De onde vem a física do GTA IV
O GTA IV roda no motor **RAGE** (Rockstar Advanced Game Engine), com a física de carros da própria Rockstar (o solver de corpo rígido é derivado do Bullet/“rage::phInst”). O **código** dessa física está compilado dentro do `GTAIV.exe`: não dá para extraí-lo (nem seria permitido copiá-lo). O que o jogo expõe é a **configuração** que alimenta esse código: o arquivo `common/data/handling.dat` (mais um em cada episódio, `TLAD` e `TBoGT`), em texto, um carro por linha. É ele que faz cada carro ser diferente — e é ele que estudamos.

- **Cópia local:** `research/gta4/{IV,TLAD,TBoGT}/data/` (copiado da Steam; ~90 MB, só as pastas de dados — os outros 23 GB são modelos, texturas, áudio e vídeo e não influenciam a física). A pasta `research/` está fora do git: os arquivos são da Rockstar.
- **Extração:** `node engine/tools/gta4-handling.js` lê os três `handling.dat` e grava `projects/neon-coast/assets/physics/gta4-handling.json` (também fora do git): 147 carros e 19 motos, com nomes de campo legíveis.

## O que cada campo faz
| Campo (handling.dat) | Nome na tabela | O que faz | Faixa nos carros do IV |
|---|---|---|---|
| fMass | `mass` | massa (kg): inércia em retas, colisões | 1.000 – 9.000 |
| fDragMult | `drag` | arrasto do ar (limita a máxima junto com a força do motor) | 3 – 20 |
| CentreOfMass x/y/z | `comX/Y/Z` | deslocamento do centro de massa; **z negativo** (abaixa) é o padrão do IV: os carros rolam muito mas quase não capotam | z ≈ −0,1 a −0,23 |
| m_nDriveBias | `driveBias` | 0 = tração traseira, 1 = dianteira, entre os dois = integral com essa divisão | 0 / 0,2–0,5 / 1 |
| m_nDriveGears | `gears` | número de marchas | 4 – 6 |
| m_fDriveForce | `driveForce` | força do motor (≈ aceleração em g, antes do câmbio) | 0,10 – 0,25 |
| m_fDriveInertia | `driveInertia` | quão rápido o motor sobe de giro (ônibus 0,3) | 0,3 – 1,0 |
| m_fV | `vmax` | velocidade máxima de projeto (km/h) | 115 – 160 |
| m_fBrakeForce | `brake` | força de freio | 0,15 – 0,45 |
| m_fBrakeBias | `brakeBias` | fração do freio na dianteira | 0,55 – 0,70 |
| Thb | `handbrake` | força do freio de mão (ônibus/caminhão fracos) | 0,2 – 1,0 |
| m_fSteeringLock | `steer` | ângulo máximo das rodas (graus) | 30 – 40 |
| m_fTractionCurveMax | `tracMax` | **aderência no pico** (coeficiente) | 0,85 – 1,5 |
| m_fTractionCurveMin | `tracMin` | **aderência deslizando** (depois do pico) | 0,7 – 1,25 |
| m_fTractionCurveLateral | `tracLat` | **ângulo de deriva do pico (graus)** — a forma da curva | 12 – 20 |
| m_fTractionSpringDeltaMax | `tracSpring` | **mola de tração**: quanto o pneu deforma antes de escorregar (m) | 0,10 – 0,18 |
| m_fTractionBias | `tracBias` | divisão da aderência (abaixo de 0,5 = mais atrás, estável) | 0,45 – 0,49 |
| m_fSuspensionForce | `susForce` | dureza da mola (alto = esportivo, baixo = mole) | 1,0 – 2,4 |
| m_fSuspensionCompDamp / ReboundDamp | `susComp` / `susRebound` | amortecimento comprimindo / voltando (baixo = balança) | 0,7 – 1,8 |
| m_fSuspensionUpperLimit / LowerLimit | `susUpper` / `susLower` | curso da suspensão para cima / para baixo (m) | 0,10–0,20 / −0,13 a −0,25 |
| m_fSuspensionRaise / Bias | `susRaise` / `susBias` | altura extra / divisão da dureza frente-trás | 0 / 0,5 |
| m_fCollisionDamageMult… | `dmgCollision`, `dmgDeform`, `dmgEngine` | quanto o carro sofre na batida, deforma, quebra o motor | 0,5 – 1,5 |
| mFlags / hFlags | `mflags` / `hflags` | bits: ABS, tipo de eixo, rodas largas, off-road, low rider… | hex |

## Por que o GTA IV tem “aquele jeito”
1. **Pico do pneu em ângulo grande (12–20°).** Pneus reais (e o nosso modo NEON) chegam ao máximo em ~5–7° de deriva. No IV o carro precisa “deitar” bem mais para curvar no limite: a resposta é mais lenta, o carro parece pesado, e a perda de aderência é **progressiva** — dá para segurar a derrapagem.
2. **Deslizando ainda segura 75–85%** (`tracMin/tracMax`): sem efeito sabão; a traseira sai e volta.
3. **Mola de tração.** A força do pneu não aparece na hora: ela “carrega” enquanto o pneu deforma alguns decímetros. Isso dá o balanço na troca de direção e o “peso” do carro.
4. **Suspensão mole e pouco amortecida, curso longo.** Rolagem e mergulho grandes; o carro balança depois de lombadas. O centro de massa abaixado (`comZ` negativo) impede que isso vire capotagem.
5. **Freio puxado para a frente (~65%)**: o nariz mergulha e a traseira fica leve.
6. **Nenhuma assistência**: sem controle de estabilidade; o freio de mão trava a traseira com força própria por carro.
7. **Cada carro**: esportivos (Banshee, Infernus) têm pico menor (12–13°), mola dura e mais aderência; muscle (Dukes, Sabre) pico em 18–20°, mola mole e menos aderência — saem de traseira; caminhões e ônibus têm pouca aderência e freio de mão fraco.

## Como foi adaptado no NEON COAST
Arquivo: `projects/neon-coast/js/entities/car-physics-core.js` (`applyIV`, `ivClass`, `IV_CLASS`, `IV_GENERIC`).

- **Cada carro nosso mantém a identidade** (massa, potência, máxima, aderência, tração — do handling do mod do SA) e **pega o “jeito” do carro equivalente do GTA IV**. A classe é escolhida por tipo, peso, aceleração, máxima e serviço: super (Infernus/Turismo), esportivo (Banshee/Comet; integral → Sultan), muscle (Dukes/Sabre GT), compacto (Blista/Futo), sedã (Admiral/Primo), viatura (Police), SUV (Cavalcade/Patriot), picape, van (Burrito/Speedo), caminhão (Benson/Mule), ônibus (Bus). O nome do carro do IV usado aparece na bancada e no aviso do F7.
- **O que vira parâmetro da nossa física:**
  - `tracLat` → pico da curva do pneu (`peak`, × 0,8 porque a nossa curva cresce mais rápido no começo);
  - `tracMin/tracMax` → `slide` (quanto segura deslizando); `tracMax` escala a aderência do carro (±15%); `tracBias` divide frente/trás;
  - `tracSpring` → **comprimento de relaxação** do pneu (`relax` ≈ 4 × tracSpring = 0,4–0,7 m): a deriva “chega” ao pneu depois de rolar essa distância;
  - `susForce` → frequência da mola (0,85 + 0,32 × força Hz) → afundamento estático; `susComp/Rebound` → amortecimento **separado** na compressão e no retorno; `susUpper/Lower` → curso; `susBias` → mola dianteira × traseira;
  - `comZ` → abaixa o centro de massa; carroceria com menos amortecimento de rolagem/arfagem e um **batente** a ~9° (a suspensão encosta);
  - `brakeBias`, `handbrake` → divisão de freio e força/aderência do freio de mão;
  - `dmgDeform` → multiplica o amassado das batidas (`damage.js`);
  - assistências: estabilidade e contra-esterço automáticos caem para ~30–60% do modo NEON (ficou uma ajuda leve, porque no teclado o volante é tudo-ou-nada).
- **Sem a tabela** (outro PC, repositório recém-clonado) o modo GTA IV usa perfis por classe com valores típicos (`IV_GENERIC`).
- **No jogo:** o modo GTA IV é o padrão; **F7** alterna para o NEON (v3, com assistências) e mostra qual carro do IV está sendo usado. A escolha fica salva no PC.

## Medidas (bancada `npm run test:physics -- --modo gta4` × `--modo neon`)
| Carro | Modo | Perfil IV | 0-100 | máx km/h | frenagem 100→0 | g a 60 | deriva solta | deriva no pé | freio de mão (giro) | rolagem máx |
|---|---|---|---|---|---|---|---|---|---|---|
| Gol | NEON | — | 9,8 s | 140 | 37 m | 1,10 | 8° | 20° | 104° | 4° |
| Gol | IV | Blista | 9,8 s | 140 | 38 m | 1,36 | 9° | 24° | 100° | 7° |
| Sultan (SA) | NEON | — | 7,2 s | 164 | 36 m | 1,15 | 5° | 49° | 96° | 4° |
| Sultan (SA) | IV | Dukes | 7,3 s | 164 | 43 m | 0,95 | 12° | 65° | 79° | 7° |
| Infernus | NEON | — | 5,8 s | 204 | 34 m | 1,04 | 4° | 19° | 130° | 2° |
| Infernus | IV | Infernus | 5,7 s | 204 | 39 m | 1,16 | 8° | 49° | 135° | 2° |
| Hilux ROTA | NEON | — | 7,1 s | 153 | 46 m | 0,88 | 6° | 14° | 78° | 6° |
| Hilux ROTA | IV | Cavalcade | 7,1 s | 153 | 47 m | 1,03 | 11° | 39° | 83° | 10° |
| Ônibus | NEON | — | — | 91 | 75 m | 0,58 | 2° | 11° | 93° | 4° |
| Ônibus | IV | Bus | — | 91 | 75 m | 0,72 | 6° | 11° | 85° | 9° |

Leitura: no modo IV os carros andam igual (motor e máxima são do próprio carro), **escorregam mais e de forma progressiva** (deriva 2–3× maior), **rolam quase o dobro**, freiam um pouco mais longo (freio na frente) e saem bem mais de traseira no acelerador — sem rodar sozinhos ao soltar o pedal. Nenhum dos ~190 veículos ficou “ruim” na bancada (roda sozinho, não vira ou não anda), e o trânsito da IA anda normal (deriva máxima 14°, nenhum capotando).

## O que dá para ajustar
- **Por carro:** trocar a classe/referência (`IV_CLASS`) ou forçar uma referência no `MODEL` do carro.
- **No modelo:** o fator 0,8 do pico (mais alto = mais “barco”), o `relax` (4 × tracSpring), a frequência da mola, o batente de rolagem (`rollStop`), quanto sobra das assistências (`stab`, `counter`), a influência de `tracMax` na aderência.
- **Ainda não usado:** `driveInertia` (só som/giro), `driveForce`/`vmax`/`drag` (o desempenho continua o do mod do SA — dá para trocar pelo do IV se quiser os carros iguais aos do IV), flags de eixo (McPherson/eixo rígido), `susRaise`, os campos das motos (a moto continua com o modelo próprio).

## Próximos passos possíveis
Motos com os parâmetros do IV; arrasto/força do motor do IV como opção; painel no editor para mexer nos números de cada carro ao vivo e salvar no projeto; usar os flags de eixo para geometria de suspensão diferente na frente e atrás.
