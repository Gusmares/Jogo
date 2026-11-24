# IA e movimento do GTA IV — estudo e adaptação no NEON COAST

## O que dá para estudar
Como na física dos carros, o **código** da IA do GTA IV está compilado no `GTAIV.exe` (motor RAGE). O que o jogo deixa à vista são as **tabelas** que dirigem esse código, em `common/data/` (cópia local em `research/gta4/`, fora do git):

| Arquivo | O que define |
|---|---|
| `ShockingEvents.dat` | os ~30 **eventos chocantes** a que os pedestres reagem e como |
| `pedpersonality.dat` | a **personalidade** de cada tipo de pessoa (coragem, agilidade, luta, idade, sexo, marcas) |
| `decision/*.ped` | os **decision makers**: para cada evento, as respostas possíveis e a chance de cada uma |
| `decision/Combat/*.cmb` | estilos de combate (policial por nível de procurado, covarde, durão…) |
| `Relationships.dat` | quem gosta/odeia quem (gangues, polícia, jogador) |
| `moveblend.dat` | grupos de **movimento** (jeitos de andar) e de onde cada um herda o que falta |
| `Scenarios.dat`, `pedgrp.dat`, `popcycle.dat` | cenas fixas (sentado, encostado…), grupos e população por hora/lugar |

A “mágica” do movimento do IV vem também do **Euphoria** (NaturalMotion): física de corpo ativo que faz a pessoa se equilibrar, tropeçar, se apoiar e cair de jeito diferente a cada vez. Isso é código proprietário, não está em tabela; dá para imitar partes (inércia, inclinação, reações por direção), não copiar.

## Como o GTA IV decide a reação de um pedestre
1. **Um evento acontece** (tiro, alguém baleado, corpo no chão, atropelamento, batida, arma à mostra, roubo de carro, briga, explosão, carro na calçada, buzina, motorista louco…). Cada evento tem **prioridade** (0–3), **duração**, **alcance visual** e **sonoro** (tiro: ouvido a ~100 m; arma à mostra: só vista a ~10 m) e **tempos de observação**.
2. **Quem percebe** (viu ou ouviu) sorteia se vai reagir: a tabela tem uma chance para pedestre comum a pé, outra para quem está **dentro de carro** e outra quando **o jogador é a causa** (ex.: atropelamento 95%, carro roubado 100% a pé e 10% de carro).
3. **Escolhe UMA resposta** pelos pesos do evento (a tabela tem 5 colunas por perfil, H W G A F — na nossa leitura: sair apressado, olhar, ir ver de perto/aglomerar, reação agressiva/denúncia, fugir) e pela **personalidade**: a coragem (1 a 5) pesa muito — dos pedestres comuns do IV, **~60% têm coragem 1–2** e ~20% têm 5.
4. **Só troca de reação por algo mais grave** (prioridade maior); quem já está fugindo de um tiro não para para olhar uma batida.
5. A **polícia** fica sabendo por quem viu (policial por perto) ou por **testemunha que liga**.

## Polícia no GTA IV
- **Precisa te ver.** Viatura ou policial com linha de visão; prédios bloqueiam.
- **Perdeu de vista:** aparece o **círculo de busca** em volta do último ponto onde te viram (maior a cada estrela); as estrelas **piscam**; as viaturas vão para o círculo e procuram.
- **Para escapar:** sair do círculo e ficar sem ser visto até as estrelas sumirem. Dentro do círculo, o procurado não cai.
- **Reforços** são despachados para a área de busca (não nascem do seu lado).
- **Combate por nível** (`Cop_WL1/2/3.cmb`): o comportamento muda pouco entre os níveis; o que sobe é um valor de 60 → 65 → 70 (provavelmente a pontaria) e a agressividade; a maior diferença está no despacho (mais viaturas, unidades especiais, helicóptero).

## Motoristas no GTA IV
- Tiroteio por perto: **aceleram e fogem**; presos no trânsito, **largam o carro** e correm.
- Arma apontada: os medrosos **param e saem com as mãos para cima**; outros arrancam.
- Roubo do carro: a vítima é **puxada para fora** e, conforme a personalidade (`softjack` = entrega sem brigar), **foge** ou **parte para cima** do ladrão.
- Batida causada por você: alguns **descem irritados** para tirar satisfação.

## Movimento no GTA IV (o que dá a sensação de “realista”)
- **Grupos de movimento** por tipo de pessoa (`moveblend.dat`): casual, executivo, velho, gordo, gangue, durão, “sexy”, turista… cada um com andar/correr/parar próprios; os que faltam vêm do grupo genérico.
- **Inércia**: arrancar, correr e parar levam tempo; parar correndo tem animação de freada; meia-volta correndo derrapa antes.
- **Inclinação nas curvas** (o comentário do `moveblend.dat` diz isso: sem as animações de curva, “o pedestre não inclina ao fazer curvas”).
- **Olhar**: cabeça vira para o que chama atenção e, no jogador, para onde a câmera olha.
- **Euphoria**: tropeços, quedas e reações a tiro com física (não reproduzido; usamos as animações por direção do SA).

## O que foi adaptado no NEON COAST
Arquivos: `projects/neon-coast/js/entities/ped-ai.js` (novo), `npcs.js`, `police.js`, `gameplay/update.js`, `player-model.js`, `vehicle-anim.js`.

**Pedestres**
- **Personalidade** (`pedInit`): coragem 1–5 com a mesma proporção do IV (36/24/15/5/20%), agilidade, sexo (pelo nome da skin), facção (mais corajosa, anda de gangue), velho/gordo (mais medroso e lento).
- **Jeito de andar próprio** com as animações do SA: homem comum, “jogador”, gangue 1 e 2, velho, gordo, arrastado; mulher comum, apressada, de compras, sensual, velha, gorda — cada um com a corrida que combina, a corrida de pânico (`sprint_panic`, `woman_runpanic`) e o **olhar para os dois lados antes de atravessar** (`roadcross`, `_female`, `_old`, `_gang`).
- **Eventos** (`aiEvent`): tiro, pessoa baleada, corpo, atropelamento, batida, arma à mostra, roubo de carro, briga, explosão — com prioridade, duração, alcance de visão (só pela frente) e de som, valores próprios inspirados nos do IV.
- **Reações**: olhar (parado, virado para o evento, com animações de curioso), **ir ver de perto** (forma roda a 3,5–6,5 m), sair apressado, fugir (velocidade pela agilidade), se encolher, **ligar para a polícia** (celular na orelha por alguns segundos; uma denúncia por ocorrência gera procurado mesmo sem polícia por perto) e **tirar satisfação** (vai até você, gesticula com raiva; os de coragem 5 partem para o soco — 4–8 de dano).
- **Cabeça e corpo**: olham para o evento ou para você quando chega perto; inclinam nas curvas.

**Motoristas**: fogem acelerando de tiroteio (e largam o carro se ficarem presos); com arma apontada, ~65% param e fogem a pé, os outros arrancam; no **roubo do carro a vítima cai do carro** (`CAR_jackedLHS`/`CAR_fallout_LHS`) e foge ou briga; depois de uma batida causada por você, ~35% param e descem irritados.

**Polícia**: linha de visão com os prédios (`losClear`), último ponto conhecido, **círculo de busca** (1★ 100 m, 2★ 145 m, 3★ 190 m), viaturas procurando dentro dele, **reforços despachados para a área**, estrelas piscando com “PROCURANDO”; fora do círculo sem ser visto você despista em ~10 s.

**Jogador**: inércia (até correr em ~0,7 s; do sprint para em ~4 m / 0,9 s com `Run_stop`), curva com raio, **meia-volta derrapando** (`Run_stopR`), corpo inclinado na curva (até ~9°) e para a frente ao arrancar, **cabeça acompanhando a câmera**. Mirando, o movimento continua direto (andar de lado).

## Medidas (testes dentro do jogo, `tools/run-game-script.js`)
- Tiro perto do jogador, pessoas até 100 m: 29 fugiram, 16 se encolheram, 9 saíram apressadas, 7 não ligaram.
- Briga: 5 formaram roda a 3,6–6,1 m, 1 foi tirar satisfação, 1 ligou para a polícia, o resto olhou ou saiu.
- Atropelamento: 9 pararam para olhar, 2 ligaram (vira procurado “denunciado por testemunha”), 4 fugiram.
- Polícia: some do círculo → viaturas procurando (3–5), estrelas piscando, procurado zerado em ~10 s fora do círculo.

## Ainda não feito (próximos passos)
Gesto de mãos para cima dentro do carro; pedestres armados/gangues revidando tiros (estilos de combate); relacionamentos entre gangues e polícia (`Relationships.dat`); população por horário (`popcycle.dat`); reações a tiro com tropeço por direção (`HIT_L/R/front/back`) para imitar o Euphoria; o círculo de busca desenhado no minimapa (o HUD é da área do ChatGPT: `police.lkp` e `police.searchR` estão prontos para ele usar).
