# NEON ENGINE — plano da engine e do jogo

Documento de direção. Foco atual: **a engine**. O jogo (NEON COAST) continua como o projeto que a engine edita e como o teste de tudo o que for construído.

## 1. O que queremos

**O jogo:** um mundo aberto brasileiro (SP + RJ), denso e populoso, inspirado no GTA V Online / GTA 6, em versão simplificada. Sem história. Free roam com muita coisa para fazer, feito para jogar e zoar com amigos, primeiro offline e depois online.

**A engine:** feita para esse jogo, mas sem travar a gente. Você edita o mapa, os modelos, as animações e a lógica dentro dela, e eu construo em cima. Tem que ser **otimizada desde o desenho**, porque densidade e online são os dois requisitos mais caros e não dá para colocá-los depois.

**Instalação:** um `Setup.exe` que instala em segundos, com atalho e atualização automática. Nada de zip.

## 2. Decisões de arquitetura (valem para tudo que vem depois)

1. **Simulação separada da imagem.** O mundo (posição, física, IA, dano, economia) vive num núcleo que não sabe desenhar nada. A tela só lê o estado e mostra. Isso é o que torna o online possível: o servidor roda o mesmo núcleo sem tela.
2. **Passo de tempo fixo** (por exemplo 30 ou 60 simulações por segundo, independente dos quadros). Necessário para online e para a física ficar igual em qualquer PC.
3. **Entidades com componentes** (Vida, Veículo, Mira, Socket, IA…), em vez de objetos grandes com tudo dentro. Dá velocidade (dados em fila), editor simples e rede simples.
4. **Tudo guiado por dados.** Armas, carros, NPCs, animações e atividades são arquivos editáveis na engine, não código.
5. **Camadas de simulação por distância** (a chave da densidade): perto, simulação completa; médio, simples; longe, estatística (a cidade "tem" 300 pessoas, mas só as próximas existem de verdade).
6. **Núcleo nativo, conteúdo em script.** O que pesa (multidão, trânsito, física, colisão, visibilidade) vai para um núcleo nativo; a lógica do jogo e das atividades fica em script com recarga ao vivo.

## 3. Tecnologia: o que usar

| Parte | Escolha | Motivo |
|---|---|---|
| Casca do programa e editor | **Electron** (como hoje) | Já funciona; a interface de editor em web é muito produtiva |
| Jogo em si, hoje | **Three.js** | Tudo o que existe roda nele |
| Núcleo da simulação | **Rust** (módulo nativo) | Rápido como C++, mais difícil de errar; roda no jogo **e** no servidor |
| Scripts do jogo | **TypeScript** | Recarga ao vivo, mesma API no cliente e no servidor |
| Servidor online | **Rust** (mesmo núcleo) | Mesma simulação, sem duplicar código |
| Renderização | **WebGPU** agora; decidir nativo (wgpu) na fase 5 | Alivia o gargalo sem reescrever |
| Instalador | **electron-builder** (NSIS) | Setup.exe + atualização automática |

Por que Rust e não C++: desempenho equivalente, mas sem os erros de memória que travam o jogo de forma aleatória e que custam mais para achar. É também a melhor opção para servidor.

**Caminho alternativo, mais radical:** engine 100% nativa (Rust + wgpu), sem Electron. É a que dá mais desempenho, mas começa do zero e leva mais tempo. A fase 5 existe para decidir isso com **números medidos**, não por palpite.

## 4. Fases

Cada fase termina com o jogo jogável.

### Fase 0 — Medir e instalar (curta)
- Perfilar o jogo no seu PC: quadros, tempo de lógica, tempo de desenho, número de draw calls, memória.
- Criar o **Setup.exe** com atualização automática.
- **Pronto quando:** temos uma tabela de onde o tempo vai e um instalador testado.

### Fase 1 — Base da engine
- Separar simulação e imagem (decisão 1) e passar a passo de tempo fixo.
- Entidades e componentes; migrar um sistema de cada vez (começando por NPCs, depois carros).
- API de scripts em TypeScript, com recarga ao vivo no editor.
- **Pronto quando:** NPCs e carros rodam pelo novo núcleo e o jogo se comporta como hoje.

### Fase 2 — Ferramentas de edição
- **Editor de sockets** (arma na mão, arrastando no preview com a animação rodando).
- **Grafo de animação** (estados, mistura, camadas, eventos na linha do tempo).
- **Editor de entidades e atividades** (montar um carro, uma arma, um NPC, um trabalho, só com dados).
- **Blueprints próprios** (editor de nós que gera o mesmo código dos scripts).
- **Pronto quando:** você cria uma arma nova e a posiciona na mão sem pedir código.

### Fase 3 — Densidade
- Núcleo nativo em Rust para multidão, trânsito e colisão, com camadas por distância.
- Carregamento do mapa por pedaços (streaming), níveis de detalhe automáticos, visibilidade por oclusão.
- Animação de multidão barata (animação gerada na GPU para os distantes).
- **Meta:** número de NPCs e carros ativos muito acima do atual, com os mesmos quadros por segundo. A meta numérica sai da medição da fase 0.

### Fase 4 — Online
- Servidor com autoridade (o servidor decide; o cliente prevê e corrige).
- Sincronização por interesse (cada jogador só recebe o que está perto).
- Salas de amigos por código ou convite; sem servidor dedicado no começo, o anfitrião hospeda.
- **Pronto quando:** você e um amigo dirigem, atiram e se encontram no mesmo mundo, sem ficar teletransportando.

### Fase 5 — Renderização
- Medir de novo e decidir: continuar com WebGPU ou mover o desenho para um renderizador nativo.
- Sombras, iluminação, clima e ciclo dia/noite de qualidade melhor; interiores.

### Fase 6 — Conteúdo do jogo (paralela a partir da fase 2)
Modelar o mapa, enriquecer, adicionar atividades. Ver a seção 5.

## 5. O jogo (alvo de conteúdo)

**Mundo vivo:** multidão e trânsito densos, polícia, clima, ciclo dia/noite, rádio, eventos ao acaso (briga, batida, perseguição, assalto), comércio e vida de rua.

**Para fazer no mundo aberto:** trabalhos e missões soltas (entrega, taxi, corrida, assalto a loja, roubo de carro por encomenda), corridas de rua, assaltos em grupo, atividades de lazer (jogos, esportes, praia), colecionáveis.

**Progressão e dinheiro:** economia, lojas de roupa e carro, garagem, imóveis, celular com serviços (isso já existe em parte).

**Personalização:** personagem, roupas, carros, armas.

**Zoeira com amigos:** modos livres, desafios, física divertida, ferramentas de criador (editar mapa e atividades dentro do jogo no futuro, já que a engine é feita para isso).

História fica **fora** por enquanto, por escolha.

## 6. Riscos e como lidar

- **Escopo gigante.** Cada fase termina com jogo funcionando; nenhuma exige "parar tudo".
- **Reescrever demais.** A migração é sistema por sistema, e o jogo atual continua sendo o teste.
- **Rust ser novo no projeto.** Começa pequeno (um sistema), com testes automáticos; se não valer o ganho, volta-se atrás.
- **Online é o ponto que mais quebra coisa.** Por isso as decisões 1 e 2 vêm primeiro.
- **Expectativa.** Não vamos igualar uma equipe de centenas de pessoas; vamos fazer algo muito bem feito *dentro de um recorte simplificado*.

## 7. Proposta de ordem imediata

1. Fase 0 (medir + instalador) — poucos dias de trabalho.
2. Fase 1 (base) — o maior bloco.
3. Fase 2 (editores) em seguida, para você já poder mexer em armas e animações.
