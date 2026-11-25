# Animações editáveis (NEON ENGINE / NEON COAST)

Pegar um clipe pronto do GTA SA (`assets/anims/*.ifp`, não vão para o git), **duplicar** em JSON, editar e usar no jogo sem mexer no original. Um clipe editável com o **mesmo nome** de um `.ifp` o **substitui** em todo o jogo (jogador, NPCs, polícia, `playClip`, `npcPlay`, `AnimPlayer.play`), sem mudar código.

Arquivos:

| Arquivo | Papel |
|---|---|
| `projects/<proj>/data/anims/<id>.json` | clipe editável (versionado no git) |
| `projects/<proj>/data/anims/index.json` | lista `{version:1, clips:[{id,name,base,duration}]}`, mantida pelas rotas; o jogo lê isto |
| `projects/<proj>/data/.backup/anims/` | cópias de segurança (fora do build e do git) |
| `engine/tools/anim-validate.js` | validador compartilhado + `animStringify` + `BONE_NAMES` |
| `engine/tools/anim-bake.js` | leitor de `.ifp` em Node + bake `.ifp` -> JSON |
| `engine/app/engine-api.js` | rotas `/__engine/anim*` |
| `projects/neon-coast/js/entities/anim-edit.js` | runtime do jogo (carga, registro, IK, API `animEdit*`) |
| `projects/neon-coast/tools/test-anims.js` | testes de Node (125) |
| `projects/neon-coast/tools/test-anims-game.js` | teste no jogo real (Electron) |

## 1. Formato do JSON (`version: 1`)

```json
{
 "version": 1,
 "id": "gunmove_fwd",
 "name": "Andar mirando (mão esquerda corrigida)",
 "base": "GunMove_FWD",
 "fps": 30,
 "duration": 1,
 "loop": true,
 "bones": {
  "32": {
   "rot": [
    [0,-0.123,0.456,0.012,0.88],
    [0.0666,-0.12,0.46,0.01,0.88]
   ],
   "pos": [[0,0.0,0.0,0.0]]
  }
 },
 "ik": [
  { "chain": "lhand", "target": { "space": "weapon", "pos": [-0.26,-0.08,0.02] }, "weight": [[0,0],[0.1,1],[0.9,1],[1,0]], "hint": [0,-1,0] }
 ],
 "events": [ { "t": 0.5, "name": "passo" } ],
 "notes": "texto livre"
}
```

| Campo | Regra |
|---|---|
| `id` | `[a-z0-9_-]` 1 a 64. É o **nome do clipe no jogo** (comparação sem diferenciar maiúsculas: id `walk_player` = clipe `WALK_player`). Reservados: `index`, `con`, `nul`... |
| `name` | rótulo para o editor (até 80). Não afeta o jogo |
| `base` | nome do `.ifp` de origem ou `null`. Informativo |
| `fps` | grade sugerida para o editor (1 a 240). **Os quadros não precisam estar na grade**: tempos são livres |
| `duration` | segundos (> 0, até 120, >= último quadro). Se maior que o último quadro, o último quadro é mantido até o fim. O loop volta ao 0 em `duration` (para loop sem pulo, o último quadro deve repetir o primeiro) |
| `loop` | metadado para o editor/chamador. **Quem decide o loop em jogo é quem chama** `AnimPlayer.play(nome,{loop})` (padrão: loop) |
| `bones` | `{ "<idDoOsso>": { rot, pos? } }`, até 64 ossos. Osso que não está no clipe fica na pose de repouso |
| `bones.X.rot` | `[[t, x, y, z, w], ...]` obrigatório, 1 a 600 quadros, `t` **estritamente crescente** (s). Quaternio **normalizável** (norma entre 0,5 e 2); o validador devolve normalizado |
| `bones.X.pos` | `[[t, x, y, z], ...]` opcional (mesmos limites, `|x,y,z|` <= 20 m). `rot` e `pos` podem ter tempos diferentes (o runtime une os tempos) |
| `ik` | até 8 entradas, uma por cadeia (ver seção 5) |
| `events` | até 64 `{t, name}` (`name`: `A-Za-z0-9_.-`). Só dados: o jogo oferece `animEditEvents(clip,t0,t1)` |
| `notes` | texto até 2000 |

Campos desconhecidos são descartados ao salvar. Interpolação: slerp na rotação (com correção de sinal), linear na posição.

### Convenção de espaço (o que o editor deve usar ao ler e gravar)

- **Rotação e posição ficam no espaço de OSSO DO JOGO**, exatamente o que `AnimPlayer` grava em `bone.quaternion` e `bone.position` (Three.js, eixos do modelo: x esquerda, y cima, z frente). `rot` é a rotação **local** do osso em relação ao pai e **substitui** a de repouso (não é delta). `pos` é a posição local e também substitui a de repouso.
- Ou seja: ao editar um osso no viewport, grave `[t, bone.quaternion.x, .y, .z, .w]` direto. Ao ler, `bone.quaternion.set(x,y,z,w)`. **Não** aplique `ifpQuat` nem conjugação.
- Para apresentar o clipe pronto ao editor basta chamar a rota (ou `animEditFromClip` no jogo): ela já converte do IFP. A conversão (igual a `ifpQuat` com `IFP_CONJ=false`) é: quaternio IFP `(x,y,z,w)` -> jogo `(-x, z, y, w)`; translação IFP `(x,y,z)` -> `(-x, z, y)`. É a mesma operação nos dois sentidos. `tools/test-anims.js` confere que `IFP_CONJ` continua `false`; se alguém mudar, o bake da engine precisa mudar junto.
- Osso **0 (root)**: a `pos` dele é o deslocamento do movimento (root motion). O `AnimPlayer` **ignora** a posição do osso 0 na pose; ela só alimenta `clipSpeed(nome)` (velocidade natural, usada para casar passo e deslocamento) e `clipRootAt(nome,t)`. Editar a `pos` do osso 0 muda essas velocidades. Os eixos do osso 0 em `pos` seguem a mesma regra `(-x, z, y)`.
- Ossos que não existem no esqueleto do ator (ids sem osso) são ignorados no jogo sem erro.

### Ids dos ossos (ids do IFP) e nomes

Esqueleto de 32 ossos dos fardamentos (`skin.json` `.bones[].id/.name`; no jogo: `actor.info[i].id`, `actor.index[nome]`). Também vem em `GET /__engine/anims` (`boneNames`) e em `ANIM_BONE_NAMES` / `BONE_NAMES` do validador.

| id | nome | pai | id | nome | pai |
|---|---|---|---|---|---|
| 0 | root | - | 31 | lclav | neck |
| 1 | pelvis | root | 32 | lupperarm | lclav |
| 2 | spine | pelvis | 33 | lforearm | lupperarm |
| 3 | spine1 | spine | 34 | lhand | lforearm |
| 4 | neck | spine1 | 35 | lfinger | lhand |
| 5 | head | neck | 36 | lfinger01 | lfinger |
| 6 | lbrow | head | 41 | lthigh | pelvis |
| 7 | rbrow | head | 42 | lcalf | lthigh |
| 8 | jaw | head | 43 | lfoot | lcalf |
| 21 | rclav | neck | 44 | ltoe | lfoot |
| 22 | rupperarm | rclav | 51 | rthigh | pelvis |
| 23 | rforearm | rupperarm | 52 | rcalf | rthigh |
| 24 | rhand | rforearm | 53 | rfoot | rcalf |
| 25 | rfinger | rhand | 54 | rtoe | rfoot |
| 26 | rfinger01 | rfinger | 201 | belly | spine |
| | | | 301 / 302 | rbreast / lbreast | spine1 |

Clipes de arma (`rifle.ifp`, `colt45.ifp`...) só têm alguns ossos (braços/tronco). Alguns `.ifp` têm nós sem osso de personagem (id -1/lixo; portas e aviões): o bake os ignora e, se não sobrar nenhum, recusa o clipe.

### Limites (validador compartilhado: engine e jogo dão as mesmas mensagens)

`ossos <= 64`, `quadros por trilha <= 600`, `ik <= 8`, `eventos <= 64`, `duration <= 120 s`, arquivo `<= 2 MB`, `|pos| <= 20 m`, `|ik.target.pos| <= 10 m` (`world`: 10000), id `[a-z0-9_-]{1,64}`.

## 2. Rotas (`/__engine/...`)

Mesmas proteções de `sockets`: caminho **fixo** (`<projeto>/data/anims/<id>.json`; o cliente só manda o id), validação estrita, Host/Origin locais (senão 403), POST exige `Content-Type: application/json` (senão 415), corpo máx. 2 MB (`dup-anim`/`delete-anim`: 8 KB), escrita atômica (`.tmp` + rename), versão anterior copiada para `data/.backup/anims/<id>-<data>.json` (10 por id). Erro = `{ok:false, error:"texto em português"}` com 400 (falha de disco: 500 genérico).

| Rota | Pedido | Resposta |
|---|---|---|
| `GET anims` | - | `{ok, anims:[{id,name,base,duration,loop,fps,bones,ik,events,bytes}], index:{version,clips}\|null, boneNames:{id:nome}, limits:{...}}`. A lista vem da **pasta** (arquivo quebrado entra como `{id, invalid:true, erro}`) |
| `GET anim?id=<id>` | - | `{ok, anim:<JSON validado>}`; 404 se não existe; 400 id inválido |
| `GET anim-clips` | - | `{ok, clips:[{name,pack,duration,bones,maxFrames}], edited:[ids editáveis]}` — **todos** os clipes `.ifp` (`pack` = arquivo sem `.ifp`; `bones` = nº de nós de personagem, `0` = clipe de objeto/porta, não editável) |
| `POST save-anim` | o JSON do clipe (ou `{anim:{...}, overwrite?:false}`) | `{ok, id, bytes, anim:{resumo}}`. Valida, cria/sobrescreve (backup da anterior), reescreve `index.json`. `overwrite:false` recusa se o id já existe |
| `POST delete-anim` | `{id}` | `{ok, id, moved}`. **Não apaga**: move para `data/.backup/anims/<id>.deleted-<data>.json` e reescreve o índice |
| `POST restore-anim` | `{id, backup?}` | `{ok, id, restored, bytes, avisos, anim}`. Restaura a versão mais recente de `data/.backup/anims/` (ou a de nome `backup`, só nomes que a própria listagem reconhece). A versão atual também vai para o backup (dá para desfazer). Cópias novas: `<id>@<data>.json` (as antigas `<id>-<data>.json` continuam valendo); apagadas: `<id>.deleted-<data>.json`. Guarda as 10 últimas versões |
| `POST dup-anim` | `{from, to, name?, source?, pack?, fps?, resample?, overwrite?}` | `{ok, id, bytes, anim:{resumo}, from:'ifp'\|'edit', pack?, resampled?, reduced?, maxErrDeg?, fps?}` |

`dup-anim`:

- `from` = id de um editável **ou** nome de clipe `.ifp` (sem diferenciar maiúsculas). `source`: `auto` (padrão: editável de mesmo id se existir, senão `.ifp`), `edit` ou `ifp`. `pack` desambigua nomes repetidos entre pacotes (13 nomes se repetem; sem `pack` vale `ped.ifp` primeiro e depois ordem alfabética, como o jogo).
- `to` = novo id. **Já existe = erro 400** (a menos que `overwrite:true`, que faz backup). Para **substituir um clipe do jogo**, use `to` = o nome do `.ifp` em minúsculas (`{from:'WALK_player', to:'walk_player'}`).
- Bake de `.ifp`: **mantém os quadros-chave originais** (tempos e quaternios; só normaliza e arredonda: 6 casas, posição 5). Medido: erro < 0,07° e < 0,01 mm (WALK_civi, WALK_player, GunMove_FWD, IDLE_stance). `resample:true` + `fps` reamostra numa grade (perde detalhe; só se o usuário pedir).
- Trilha com mais de 600 quadros (4 clipes: `Crazed_bdance`, `urb_use_phone_1`, `urb_hand_ge_3`, `urb_angry_2`): em vez de reamostrar, remove os quadros que a interpolação dos vizinhos reproduz dentro de uma tolerância, subindo a tolerância **só naquela trilha** até caber. A resposta traz `reduced:true` e `maxErrDeg` (a pior tolerância usada; em `Crazed_bdance` 2,8°). O editor deve avisar.
- Duplicar nunca altera o `.ifp` original nem o JSON de origem.

Fluxo típico do editor: `GET anim-clips` (lista) -> `POST dup-anim` -> `GET anim?id` -> editar -> `POST save-anim` (a cada salvar) -> (jogo) `animEditSet(json)` para ver ao vivo.

## 3. Runtime no jogo (`js/entities/anim-edit.js`)

Linha de `<script>` (em `index.html`, logo depois de `anim.js`, linha ~132; `index.html` não foi alterado):

```html
<script src="js/entities/anim-edit.js"></script>
```

- Na carga: `fetch('data/anims/index.json')` e um `fetch` por clipe; **qualquer falha = lista vazia** (o jogo segue igual). `ANIM_EDIT.ready` é a Promise.
- Registro: cada clipe vira o **mesmo formato do `parseIfp`** (`{name, duration, nodes:[{bone,times,quats,trans,frames}], ok}`, em espaço IFP, convertido do JSON) e entra em `ifpReady.__edit.anims[<id>]`; além disso `findClip` foi envolvido para consultar os editáveis **primeiro**. Por isso o `AnimPlayer`, `clipSpeed`, `clipRootAt` e qualquer chamada por nome funcionam sem mudança, e um editável de mesmo nome do `.ifp` o substitui independentemente da ordem de carga dos pacotes. O objeto do clipe tem também `_eid`, `loop`, `ik`, `events`, `data`.
- **Edição ao vivo**: `AnimPlayer.prototype.update` foi envolvido; se um editável for definido/removido, quem está tocando aquele nome troca para o clipe novo no próximo quadro (sem `restart`).
- `sockets.json` `byAnim` continua casando (a chave é o nome pedido, em minúsculas).

API global (todas devolvem dados simples; `animValidate` é o mesmo código da engine):

| Função | Uso |
|---|---|
| `animEditSet(json)` -> `{ok, erro, clip}` | valida e registra/substitui (preview ao vivo). Inválido não troca nada |
| `animEditRemove(id)` -> bool | remove (volta o `.ifp` de mesmo nome) |
| `animEditList()` / `animEditExport(id)` | lista `{id,name,base,duration}` / cópia do JSON validado |
| `animEditFromClip(clip, id, {name,fps,loop,notes}?)` -> `{ok, erro, data}` | bake **no jogo** de um clipe carregado (`findClip('WALK_player')`), quadros originais; falha com > 600 quadros (use a rota) |
| `animEditReload()` | relê `data/anims/` do servidor (depois de `save-anim`/`dup-anim`) |
| `animEditEvents(clip, t0, t1)` -> nomes | eventos em `(t0,t1]` (com volta de loop se `t1<t0`) |
| `animValidate(json)`, `animStringify(data)`, `ANIM_BONE_NAMES`, `ANIM_EDIT` | validador, texto canônico do arquivo, nomes dos ossos, estado (`byId`, `rev`) |
| `animEditBuild(data)` | JSON validado -> clipe no formato do parseIfp (sem registrar) |
| `animIkApply(actor, clip, time, ctx?)`, `animIkFinal(actor, ctx?)` | IK (seção 5) |

Pré-visualização no editor: página própria com `three` + `anim.js` + `anim-edit.js`, `ifpReady.ped = parseIfp(...)`, ator montado como `makeActor`, `ap.play(nome,{restart:true})` + `ap.update(dt)`; para "pausar em t": `ap.speed = 0.0001; ap.time = t; ap.update(0.0001)`.

## 4. Como o usuário conserta `WALK_player` / `GunMove_FWD`

1. `POST dup-anim {from:'GunMove_FWD', to:'gunmove_fwd', name:'Mira andando (corrigida)'}`.
2. Editar ossos (rot por quadro) e/ou adicionar IK (seção 5), `POST save-anim`.
3. Pronto: no próximo carregamento do jogo (ou `animEditReload()` / `animEditSet(json)` ao vivo) todo uso de `GunMove_FWD` toca o editável. Para desfazer: `POST delete-anim {id:'gunmove_fwd'}` (volta o `.ifp`; o JSON vai para `data/.backup/anims/`).

## 5. IK de mãos/pés por clipe

Entradas em `ik` (aplicadas **depois** da pose do clipe e do overlay):

```json
{ "chain": "lhand", "target": { "space": "weapon", "pos": [x,y,z], "rot": [rx,ry,rz] }, "weight": [[t,w],...], "hint": [x,y,z] }
```

- `chain`: `lhand` (lupperarm-lforearm-lhand), `rhand`, `lfoot` (lthigh-lcalf-lfoot), `rfoot`. Uma entrada por cadeia.
- `target.space` e `pos`:
  - `weapon`: `pos` no **espaço da arma** (o mesmo do ponto `lhand` de `wAnim(w).lhand`, em metros, `x` = ao longo do cano, negativo = para a frente do cabo). **`pos: null`** (ou ausente) em `lhand` = usa o ponto `lhand` da arma equipada (`wAnim(item).lhand`, já com a sobrescrita de `data/sockets.json`/`socketsExport`). O alvo acompanha a malha da arma (que é filha do osso `rhand`, com `weapons.mesh.position/quaternion`), então vale para qualquer pose. Sem arma equipada no ator (ex.: NPC) a entrada é ignorada sem erro; `ctx.weaponMatrix`/`ctx.lhand` permitem informar a arma à mão.
  - `bone`: `target.bone` = id (IFP) do osso de referência; `pos` no espaço local daquele osso (ex.: mão no rosto: osso 5).
  - `actor`: `pos` no espaço do modelo (x esquerda, y cima, z frente, a origem é a do grupo do ator).
  - `world`: `pos` em coordenadas de mundo (útil para pés no chão em testes).
- `rot` (opcional, graus Euler XYZ): orientação final da mão/pé = (orientação do espaço do alvo) x Euler(rot). Sem `rot`, a mão mantém a orientação que a cadeia lhe der.
- `weight`: `[[t, peso 0..1],...]`, tempos crescentes, interpolação linear, mantém os extremos; padrão `[[0,1]]`. Peso 0 não mexe na pose; intermediário mistura a pose do clipe com a do IK.
- `hint` (opcional): direção (espaço do modelo) para onde o cotovelo/joelho aponta. Sem `hint`, o cotovelo continua para o lado em que a animação o deixou. Ex.: mão esquerda segurando fuzil: `[0,-1,0]`.
- Alvo fora do alcance: o membro estica na direção do alvo (sem NaN); o erro aparece no retorno.

Matemática: é o `leftHandIK` do `player-model.js` (IK analítico de dois ossos, 2 rotações em espaço de mundo) copiado e parametrizado por cadeia e alvo (`animIkApply`, sem editar o `player-model.js`).

`animIkApply(actor, clip, time, ctx?)` -> `[{chain, weight, err}]` (`err` = distância em metros entre a mão/pé e o alvo depois do IK). `ctx`: `{weaponMatrix?: THREE.Matrix4 (mundo, escala 1), lhand?: [x,y,z] (espaço da arma), only?: 'lhand'|...}`.

### Como liga ao laço do ator

`anim-edit.js` envolve `AnimPlayer.prototype.update`: depois do update normal, se o clipe atual tem `ik`, chama `animIkApply(actor, clip, tempoDentroDoLoop)` e guarda `actor._ikLast = {clip, t}`. Isso já corrige NPCs e o jogador **no instante do update**.

Limitação: no jogador, `updatePlayerActor` ainda mexe nos braços **depois** do `ap.update` (`applyAimPitch`, `alignWeaponArm`, `leftHandIK`), e a arma se move junto. Medido no jogo com `GunMove_FWD` + fuzil: mão a 0 cm do alvo logo após o update, 11 cm depois do `alignWeaponArm`. O patch sugerido (1 linha, no `player-model.js`, que eu não editei) refaz o IK do clipe no fim:

```js
// player-model.js, em updatePlayerActor, logo DEPOIS desta linha existente:
//   if (ok && armed && ws && weapons.reloading <= 0 && !wAnim(ws).melee) { ... alignWeaponArm / leftHandIK ... }
if (ok && typeof animIkFinal === 'function') animIkFinal(a);
```

(com isso a mão fica a 0,01 cm do alvo). O `leftHandIK` do jogo para fuzil continua como está; o IK do clipe vence porque roda por último. Para pistola de uma mão (sem `lhand`) é o único IK da mão esquerda.

## 6. Testes

```
node projects/neon-coast/tools/test-anims.js
npx electron projects/neon-coast/tools/run-game-script.js projects/neon-coast/tools/test-anims-game.js
```

Cobrem: validação (engine = jogo, 50+ entradas ruins), bake de WALK_civi/GunMove_FWD/WALK_player/IDLE_stance (erro < 0,07°), bake de todos os 805 clipes, redução de > 600 quadros, substituição por nome (incl. troca ao vivo), IK em espaços `actor`/`weapon`/`bone`/`world`, rotas num servidor com pasta temporária (proteções, backup, índice, delete recuperável), e no jogo real (clipe editável muda a pose do jogador em 42°; IK leva a mão esquerda ao alvo com um fuzil).

## 7. Limites e pendências

- A normalização muda levemente o `.ifp` original: os quaternios quantizados do SA têm norma 0,94 a 1,16; o jogo original os usa assim (com leve escala nos ossos), o bake normaliza. Diferença medida < 0,07°.
- `loop` do JSON é metadado; o jogo não o aplica sozinho.
- Não há mesclagem/camadas (overlay) no JSON; overlays continuam sendo clipes por nome.
- `data/.backup/` foi adicionado ao `.gitignore`.


## Velocidade de locomoção
Clipes com id `walk_*`, `run_*`, `sprint_*` ou `woman_*` são usados pelo jogo para definir a velocidade de NPCs/polícia (`clipSpeed`). O validador devolve `avisos` (não é erro; `save-anim` repassa) se a velocidade média da raiz passar de 15 m/s, e o jogo limita `clipSpeed` de clipes editáveis a 15 m/s.
