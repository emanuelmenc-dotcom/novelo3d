# 15 — Motor de pontos (identidade e propriedades)

Decisão de 2026-11-11 (D-36), otimizada para custo computacional sem perder versatilidade.

## Problema

O grafo atual guarda cada ponto como objeto e o endereça por `(volta, posição)`. Isso trava formatos livres (ramificados, sem voltas), custa memória e tempo em peças de 20.000 pontos e perde propriedades quando a receita muda.

## Decisão: três camadas

| Camada                             | O que é                                                                           | Por que                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Índice denso** `0..n-1`          | Posição do ponto nos vetores da peça atual                                        | Todo cálculo em lote (seleção, pintura, layout, 3D) é um laço sobre vetores tipados: O(n), sem objetos |
| **uid permanente** (`#1`, `#2`, …) | Número sequencial atribuído na criação e **nunca reutilizado**                    | É a identidade que o usuário vê e que a persistência guarda; sobrevive a edições                       |
| **Propriedades em colunas**        | Um vetor tipado por propriedade (`tension` Float32, `yarn` Uint8, `group` Int32…) | Acesso O(1), memória mínima, e novas propriedades não mudam a estrutura                                |

## Estrutura (`PointStore`, em `core/engine`)

- `uid: Int32Array`, `seq: Int32Array` (ordem de trabalho), `code: Uint8Array`, `counted: Uint8Array`.
- Topologia: `prev`/`next` (caminho do fio) e **CSR** de pontos de base (`pStart`, `pAdj`) mais o inverso (`cStart`, `cAdj`, filhos). Vizinhos = próximo, anterior, bases e filhos.
- `group`/`gIndex`: "volta" e posição na volta como **propriedades opcionais** (0 = sem grupo). Carreira, volta ou peça livre usam a mesma estrutura.
- `pos: Float32Array(3n)`: posição **relativa ao primeiro ponto** (menor `seq`), preenchida pelo layout.
- Colunas de propriedades registradas por nome (`PropDef`: tipo e valor padrão).
- Seleção = máscara `Uint8Array(n)`; operações booleanas em O(n).

## Persistência esparsa e realinhamento

- Só se guarda o que difere do padrão: `{propriedade: [[uid, valor], …]}`.
- Ao regenerar a peça (a receita mudou), compara-se a sequência de **assinaturas** dos pontos (`código, contado, nº de bases, início de grupo`) com a anterior por diferença de sequência (prefixo/sufixo comuns + Myers O(ND), com teto). Pontos casados **mantêm o uid**; novos recebem uids novos; removidos somem. A pintura e a tensão acompanham o ponto mesmo se forem inseridos pontos antes dele.
- Peças livres (sem receita): o uid é permanente por construção.
- Índice `uid → índice denso` em vetor (uids crescem sem buracos grandes).

## Custos esperados (20.000 pontos)

Construção O(n); seleção por filtro O(n); por caminho/vizinhança O(n+m) com BFS em CSR; aplicar propriedades O(k) em k pontos editados; layout O(n·pivôs); memória ≈ 60 bytes por ponto mais 4 por propriedade.

## Layout com tamanhos de ponto

`size: Float32Array` (derivado da tensão e do fio) vira comprimento-alvo das arestas `(size_i + size_j)/2`; distâncias por Dijkstra quando há tamanhos diferentes, BFS quando todos valem 1.

## Seleção e ferramentas

Todas as ferramentas recebem/produzem máscaras; pintura e tensão são "escritas" em colunas sobre uma máscara, registradas em um histórico (desfazer/refazer por instantâneo das sobreposições esparsas).

## Multipartes

Cada **parte** tem seu `PointStore`, uids próprios e sobreposições próprias. **Instância** referencia a parte de origem (lê o mesmo store, com transformação e opcionalmente espelho); **cópia** duplica texto e sobreposições em parte nova. **Costura** liga duas cadeias lineares `(parte, [uid…])`.

## Como ficou implementado (P3.5)

- **Código**: `packages/core/src/engine/{store,uids,props,select,tools}.ts`; estado e comandos em `packages/commands/src/{edit-store,edit-commands,parts-store,parts-commands}.ts`.
- **Fio por ponto**: a coluna `yarn` parte das regras de pintura por volta (P3) e recebe por cima as edições por uid. As edições viram regiões de pontos na hora de desenhar (`overrideRegions`), então gráfico, relatório e 3D não mudaram.
- **Tensão**: `tensão ∈ [-1, 1]`; tamanho = 1,4^(-tensão) x razão de espessura do fio. O layout usa `(tamanho_i + tamanho_j)/2` como comprimento-alvo; com todos os tamanhos iguais a 1 o resultado é idêntico ao anterior (BFS).
- **Seleção**: máscara `Uint8Array` por peça, guardada como conjunto de uids (sobrevive a mudar a receita). Formas na tela recebem a projeção dos pontos enviada pelo studio; a seleção pega o que está dentro da forma; com "Só pontos visíveis" ligado, o studio envia só os pontos não cobertos (quadro de identificadores), desligado atravessa a peça.
- **Peças**: cada peça original tem um "conjunto de edições" (uids, fio, tensão, seleção, histórico) e as suas regras de pintura; a paleta é do projeto. Instância e espelhada usam o conjunto da original. Trocar de peça ativa troca o conjunto.
- **Costura**: lado = lista de uids em ordem (validada por `orderChain`: linha contínua, aberta ou fechada, sem ramificação). Com proporção n:m, `n` pontos de A vão para `m` de B; a contagem precisa fechar.
- **Persistência** (navegador): `novelo3d.parts` (peças e costuras), `novelo3d.edit` (edições por peça, com os uids para realinhar) e `novelo3d.project` (paleta e pintura por peça). O formato antigo de uma peça só é lido e vira a peça 1.

## R0 (2026-11-12): correções da revisão

- **Texto confirmado** (`engineFor(text, dialect, commit)`, `commitText`, comando `parts.commitText`): os uids de qualquer texto são calculados contra a receita confirmada; só a confirmação os grava. O estudo `uids.ts:assignUidsByRounds` casa as voltas (âncoras: mesmo rótulo e mesma estrutura, únicas nos dois lados, em subsequência crescente; entre âncoras, estrutura a partir do começo do bloco) e depois os pontos dentro de cada volta. Linhas iguais em sequência: a linha nova conta como inserida depois do bloco.
- **Persistência**: `jsonOf` grava o estado confirmado, ou o `pending` se a peça ainda não foi aberta; `exportEditAll/exportPaintAll(keep)` só gravam peças existentes.
- **Contexto**: `withPart` volta ao conjunto anterior (aninhável, síncrono). Contexto por peça passado por parâmetro fica para o render assíncrono (R3).
- **Desfazer**: `history.begin/end/get/undo/redo`, relógio comum em `history-tick.ts`; `assembly.close` é uma transação e `assembly.undoClose` restaura poses e sentido das costuras.
- **Desempenho**: `LayoutOptions.initial` (partida a quente, 8 épocas); a distância ponderada (Dijkstra) usa tolerância contra empates em float32 (antes era até 165x mais lenta em malhas grandes); `geomKey` e `benchmark(ms)` no 3D.
- **Ainda abertos**: costura fechada sem fase de partida (item 7 da revisão), orientação do ponto por um centroide só (item 9), contexto por peça assíncrono.
- **Limitações conhecidas (revisão do Fable)**: inserir uma volta e renumerar as seguintes entre voltas iguais pode deslocar a pintura uma volta (as âncoras por rótulo deixam de valer; sobra o casamento pela estrutura); o desfazer global usa o slot da peça ativa; a partida a quente deixa o layout dependente do histórico (depois de recarregar o resultado é o frio e pode diferir pouco).

## R1 (2026-11-12): modelo de ponto por variante

- **Contrato por ponto** (`packages/stitch3d/src/frames.ts`): entrada `E_i` = meio(P_ant, P_i), saída `X_i` = meio(P_i, P_seg) pela ordem de trabalho (então `X_i = E_(i+1)`, o fio é contínuo; o fio quebra nos limites das peças); base `B_i` = média das bases (sem bases: média dos filhos refletida); matriz de colunas `[X−E | C−B | z | C]` com `C` = meio(E, X); eixos limitados a 0,3–2,5 × o tamanho; determinante sempre positivo.
- **Modelo** (`models.ts`): arco do topo + haste(s) + voltas extras como tubo de seção quadrada (SC ~96 triângulos, TR ≤ 200). Chave `tipo@versão|L{pernas}|R{faixa de raio}|F{espelho}`; um modelo por chave, em cache.
- **Comandos**: `layoutOut` devolve `nodes[].g`, `geoms[]` e a `geomKey` inclui os modelos (mudar fio/espessura/material troca a faixa de raio e recria; mudar só cor atualiza as cores). `stitches.list` lista o registro.
- **Vista**: um lote instanciado por variante, a elipsoide de antes fica fora da cena só para clique e ID-buffer; `state()` informa `triangles`, `batches`, `buildMs`, `lod`.
- **Limitações**: normais aproximadas sob cisalhamento; inc/dec usam o número de bases como pernas (até 4); sem virada direito/avesso (os dados de carreira plana não a trazem); a troca automática para tubo é só por número de pontos (sem critério de tamanho na tela).
- **Revisão do R1 (Fable)**: corrigidos a montagem perder os modelos de ponto (`assembly.layout` agora funde os `geoms` das peças; e2e confere espelhada, diminuição e anel), o alvo de clique deslocado do desenho (a elipsoide de seleção e `projectAll` usam o meio da haste, no referencial do modelo) e a cor do tubo em peças curtas (cor pelo ponto de cada vértice). Fica para o R3: tensão como campo da chave de variante, nível de detalhe por distância, mover a montagem dos lotes para `stitch3d`, tampas nos tubos.
- **Terceira revisão do R0 (Fable)**: peças copiadas/removidas/desfeitas regravam as edições no disco (assinante de peças); `parts.commitText` avisa a interface só depois de voltar ao contexto da peça ativa; editar pontos sobre receita com erro é recusado. Notas sem correção: cada passo de desfazer copia os mapas inteiros (até 100 por peça); `removeSlot`/`removePaintSlot` não são chamados, então slots órfãos ficam na memória (não vão ao disco).

## R3a (2026-11-12): pré-requisitos do render

- **Chave de variante** `tipo@v|L|R|F|T|Q` (tensão em 9 níveis, qualidade 0–2); `parseModelKey` lê campos em qualquer ordem e aceita a chave antiga (T4, Q0). A vista de edição agrupa por chave canônica (sem T e Q), então os lotes não se multiplicam.
- **Malha** (`models.ts`): seção de 4, 8 ou 12 lados por qualidade, normais por vértice, tampas nas pontas abertas a partir da qualidade 1 (malha fechada e orientada), `param` por vértice (fio + posição), `Uint32Array` acima de 65.535 vértices. `centerlines(spec)` e `extrude(...)` são públicas.
- **Âncoras** (`frames.ts`): `computeFrames` devolve E, X, B, C e os eixos por ponto, além das matrizes.
- **Deformação por curva** (`deform.ts`): `deformPoint`/`deformToCurve` acompanham o arco E→C→X e extrudam com raio constante (corrige a espessura esticada pelo cisalhamento); a vista de edição continua linear.
- **Lotes** (`batches.ts`): `BatchTable.move(ponto, lote)` troca o modelo de um ponto sem mexer nos outros lotes; `ModelCache` ganhou `set`, `invalidate(prefixo)` e `has`.
- **Decisões do plano**: contexto por peça será um instantâneo imutável (não `withPart` assíncrono); a ponte MCP do render é uma máquina de estados síncrona em `commands` (`render.*`).
- **Revisão da R3a (Fable)**: a curva passou a Hermite com tangentes de junção simétricas (tX(i) = tE(i+1)), eixos interpolados entre vizinhos e referência da seção no mundo. Adiados para o R3b: normais na vista; `geoCache` por renderizador; `T` entra na chave mas não muda a geometria (o `ModelCache` gera malhas duplicadas por nível de tensão); e trocar para a referência heurística da seção no meio de um fio pode girar a seção de um anel para o outro (raro; solução: transporte paralelo da referência, se aparecer no render).

## R3b — janela Render (2026-11-12, após a 1ª revisão do Fable)

- `packages/commands/src/render-store.ts`: ajustes e máquina de estados `idle→running⇄paused→done|stopped|stale|error`; `render.*` só mexem no estado (síncronos). O número da rodada `run` nunca volta atrás (nem no `render.reset`); progresso monotônico e validado (finito, ≥ 0). `progress/complete/fail/stale/pngServed` são de uso interno do studio.
- `apps/studio/src/render/renderJob.ts`: executor único, fora de qualquer painel (assina o estado; Play por botão, MCP ou teste funciona com a aba Render fechada; trocar de aba não interrompe). Busca o layout na hora do Play, usa a câmera fixada, a do 3D ou um enquadramento automático. Pedidos de PNG são atendidos com um único download; sem imagem, avisa.
- `renderView.ts`: bake em blocos de 256 pontos (`deformToCurve`, raio ±3% por uid, cor por vértice), pré-visualização redesenhada a cada ~150 ms, sombras (PCF), amostras Halton acumuladas em ponto flutuante com alfa pré-multiplicado (fundo transparente correto), gate a cada bloco e após a última amostra; falha se nenhum ponto foi desenhado; libera luz, mapa de sombra e contexto GL.
- `RenderPanel.tsx`: só controles e a tela; campos numéricos com rascunho (confirma ao sair do campo ou Enter).
- Testes: `render.test.ts` (9) e `e2e/render.spec.ts` (7: play, pausa, PNG 1280×720, troca de aba, parar→play, fundo transparente, PNG sem imagem).
- Limitações conhecidas: `render.savePng` por MCP dispara o download no app mas não devolve os bytes; a variação de raio por ponto pode criar pequenos degraus nas junções; sem oclusão de ambiente (AO); "Seguir o 3D" não copia a abertura da câmera.
- Pendente (R3b+): normais na vista de edição, geoCache por renderer, tensão na geometria da variante.

## R3c — render só da seleção (2026-11-12)

- `packages/stitch3d/src/relax.ts`: relaxamento de espaçamento (Jacobi) só dos pontos livres (a seleção), vizinhos fixos como contorno; alvo = k·(tamanho_a + tamanho_b)/2 com k global (mesma regra do layout); só arestas com ponta livre; limite de deslocamento 0,5·k·tamanho; para se o resíduo piorar. Sem colisão (R3d).
- Ajustes novos em `render.set`: `scope` (all | selection), `context` (0..2 saltos de vizinhos fixos), `relaxIterations` (0..100), `fitSelection`. `render.status.info` traz `selected`, `context`, `drawn` e o relaxamento (resíduo antes/depois); `render.info` é de uso interno do studio.
- `renderJob.ts`: a seleção é fotografada no Play (mesma regra de peça do destaque azul do 3D); seleção vazia → erro claro; a câmera mantém a direção e enquadra o que será desenhado. `renderView.run(..., subset)` relaxa, recalcula os quadros com as posições novas e desenha só seleção + contexto.
- Pendências do R3b fechadas: última câmera do 3D guardada em `cameraStore.ts` (o gancho `__view3d` é limpo ao desmontar), e e2e de rodada obsoleta.
- Após a revisão: o passo de Jacobi é reduzido (1, 1/2, 1/4…) até o resíduo baixar, então as iterações continuam úteis; o enquadramento usa o maior raio do subconjunto (margem 1,05); e2e do grupo Alcance pela interface.
- Medido (antes do passo reduzido): no cesto de teste (voltas 7–9, 108 pontos + 72 de contexto), o relaxamento manteve 1 iteração e baixou o resíduo de 7,6% para 7,5% (deslocamento máximo 0,02): o layout já vem quase no alvo, então o ganho visual é pequeno, como previsto.
- Fica para o R3d: colisão, cache por uid e contexto, "simular todos", AO.

## R3d-1 — motor puro da simulação ponto a ponto (2026-11-12)

- `packages/stitch3d/src/{spatial,simulate,context,offsets}.ts`: grade espacial (`createGrid`), simulação em ordem de trabalho (`createSimulation`: `step(n)` retomável, só pontos de índice ≤ ao simulado, espaçamento das arestas + colisão opcional a 0,7·k·tamanho entre não adjacentes, `moveBases` com limite de 0,25·k·tamanho nas bases sujas e 0,5 no próprio ponto, passo reduzido até a energia baixar), hash de contexto sem posições (`contextHashes`, FNV-1a: tipo, tamanho e uid do ponto e dos vizinhos a 1 salto + parâmetros + `SIM_VERSION`) e deslocamentos no quadro do ponto (`toFrameOffsets`/`applyFrameOffsets`, eixos unitários ex/ey/ez em unidades de k·tamanho). `relaxSelection` (R3c) ficou como está; a colisão vive só em `simulate.ts` (desvio do plano, que pedia extrair `relaxLocal`).
- Testes: `simulate.test.ts` (grade = força bruta, determinismo, `step(1)` = `step(64)` = `step(n)`, ponto limpo idêntico, `moveBases`, limite, colisão, hash, ida e volta dos deslocamentos incluindo rotação rígida) e `sim-measure.test.ts` (medição + 20 mil pontos).
- **Correções da revisão do Fable:** o alvo de cada aresta é o comprimento dela no layout base (o base é o equilíbrio; o k global só serve ao limiar de colisão e aos limites); limite único de 0,5·k·tamanho a partir do base, com teto de 0,25·k·tamanho por ponto simulado para as bases. A 1ª medição (média 0,375·k, máx 0,50·k) era artefato do alvo global k e da ordem.
- **Medição final (exemplo de 433 pontos, tudo sujo):** uniforme, com tensão variada (1,4/0,8) e com fio grosso (1,6) nas voltas 6–12, com colisão, com e sem bases: **média 0,0000·k, máx 0,0000·k**, e 0 pares não adjacentes abaixo de 0,7·k no layout base. Sintético de 20 143 pontos: média 0,004·k, máx 0,24·k (só em pontos isolados), 1,4 s. Conclusão: o layout base já é um bom equilíbrio e mover posições não acrescenta nada visível; guardar deslocamentos por uid (R3d-2) não se justifica. Dívida: a lógica de relaxamento está duplicada entre `relax.ts` e `simulate.ts`.

## R3d-2' — forma do ponto de base (2026-11-12; rumo escolhido pelo usuário)

- Decisão: "modificar o ponto base" = mudar a **forma** do topo (não a posição). Vem só da topologia e dos quadros; nada é gravado nem entra no desfazer; só aparece no Render (o 3D de edição segue neutro).
- `packages/stitch3d/src/shape.ts`: `topShapes({frames, parents, legs, upTo?})` dá por ponto `{open 0|1|2, leanX, leanZ}` (média dos pés dos filhos − topo do ponto, projetada nos eixos ex/ez e dividida pelo quadrado do comprimento do eixo; limites ±0,25 e ±0,15; passos de 0,05). `centerlines(spec, shape?)` e `deformToCurve(..., shape?)` aplicam: os 3 pontos internos do arco (pesos 0,5/1/0,5) se deslocam e levam o topo das pernas; anel, laço e tipos com cordões próprios ignoram; neutro = resultado idêntico ao anterior.
- `render.set { baseShape }` (padrão true); `render.status.info` ganha `shaped` (pontos com forma alterada) e `geomChecksum` (FNV dos vértices em 1e-4, ao fim do bake).
- Testes: `shape.test.ts` (8) e e2e pela ponte (shaped > 0, checksum difere de `baseShape: false`, determinismo).
- Olhado (voltas 4–5, seleção, mesma câmera, qualidade fina): a diferença é real mas **sutil** (anéis externos mais cheios e topos levemente inclinados); a vista de seleção ainda deixa a peça em ~60% da largura. Aguardando decisão do Fable de seguir para o R3d-3'.

### R3d-2' — correções da revisão (2026-11-12)

- Inclinação em peça espelhada: `deformToCurve` nega `leanZ` quando `spec.mirror` (o `open` espelha junto com o modelo). Teste novo.
- A inclinação agora aponta para o **centro do filho** (`frames.C`), não para o pé (que cai em cima da própria base e dava `d ≈ 0`); no aumento (`open 2`) os controles 1 e 3 do arco se alargam em x por 1,15. Testes novos: filho em +x → `leanX > 0` (máx 0,25), diminuição com sinais opostos nas duas bases, quadros degenerados sem NaN, espelho. `topShapeAt`/`childrenOf` (por ponto) alimentam `topShapes` e o modo completo.
- O ganho de z do `open` ficou em 0,04 (o close já é legível); o enquadramento a ~60% da largura é o limite do enquadramento pela esfera na abertura vertical, não defeito.

## R3d-3 — modo completo ponto a ponto e reaproveitamento de blocos (2026-11-12)

- `render.set { mode: "fast" | "full" }`. Blocos de 32 pontos nos dois modos. Cada bloco guarda o hash das entradas reais do bake (qualidade, tipo/variante, raio, E/X/tE/tX/ex/ey/ez do ponto e ey/ez dos vizinhos de fio, forma do topo) e um hash separado das cores; entre rodadas as malhas ficam em cache: hash igual = reaproveita; só a cor mudou = regrava o atributo de cor; senão refaz. `render.status.info.chunks = { rebuilt, reused }`.
- Modo completo: para cada bloco, em ordem de trabalho, as bases dos pontos novos recalculam a forma (`topShapeAt` com os filhos já trabalhados) e os blocos anteriores que contêm essas bases são refeitos; ao fim, bases cujos filhos ficaram fora do alcance recebem a forma final. A geometria final é igual à do modo rápido (`geomChecksum` combinado dos blocos em ordem de índice). Pausar/parar valem a cada bloco; parar mantém a imagem parcial.
- Sem comando "simular todos": o próprio Play só refaz o que mudou (ver `chunks`). A simulação que move posições (R3d-1) foi encerrada: ver D-53.
- Testes: e2e pela ponte (completo = rápido; só a luz muda → `rebuilt: 0`; pausar/continuar e parar/replay dão o mesmo checksum; mudar a tensão → refaz).
- Não verificado: peça de 20 mil pontos em modo completo (tempo e interface), imagem parada a ~40% (a rodada de 433 pontos termina rápido demais para pausar a meio), memória das malhas em cache entre rodadas.

### R3d-3 — correções da revisão e R3d-4 AO (2026-11-12)

- **Ponto a ponto de verdade:** `render.set { pace }` (pontos por segundo, 0–2000, padrão 60, 0 = o mais rápido possível; só no modo completo). Cada ponto do bloco aparece no seu ritmo (`geometry.setDrawRange` com os índices acumulados por ponto), com `gate()` (pausa/parada) e redesenho a cada ponto; o progresso conta pontos revelados. Um bloco que ficou pela metade volta inteiro no cache (`setDrawRange` reposto ao reaproveitar).
- **PNG depois de parar no meio:** o critério "há imagem" passou a ser `RenderView.hasImage` (ligado no primeiro `blit`), não `stats.blocks`.
- **Reaproveitamento:** o modo completo sempre começa com as formas neutras (para "assistir de novo"), então o hash dos blocos não bate com o cache final da rodada anterior; o reaproveitamento vale para o modo rápido (mudar só luz/câmera/amostras/cor → `rebuilt: 0`; coberto por e2e, incluindo só a cor).
- **AO (R3d-4):** `render.set { ao }` 0–1 (padrão 0,5). Segunda luz direcional com sombra (mapa 1024) cuja direção muda a cada amostra (Halton, ponderado pelo cosseno no hemisfério +z); parte do ambiente sai da luz de hemisfério (`ambient·(1−ao)`) e vai para essa luz (`ambient·ao·1,6`). Só com sombras e pelo menos 8 amostras; com menos, é ignorado (o painel avisa). Teste: luminância média da peça menor com `ao: 1` que com `ao: 0`, mesma geometria (checksum igual), fundo transparente com alfa 0 no canto.
- **Medido (20 143 pontos, modo completo, pace 0, 960×540):** 8,2 s no total; pausa respondeu em 41 ms; 1 885 blocos refeitos (630 + refeitos por mudança de forma das bases). Imagem parada a 40% olhada: peça parcial, sem travar a interface.
- Testes: `sim-measure` com 20 mil pontos agora só roda com `NOVELO_BENCH=1` (competia com o teste de tempo de matrizes, que ganhou timeout de 30 s).
- Imprecisões aceitas: no modo completo as bases mudam de forma por bloco de 32, no início da revelação do bloco (não filho a filho); com `pace` > 60 vários pontos aparecem por quadro; o AO deixa 20% da luz de hemisfério (faces voltadas para baixo não ficam pretas) e usa ganho 1,5 na luz de AO; com AO aparecem sombras fracas em círculos no chão (uma por direção de amostra).

## Criador de pontos — etapa A: fio contínuo à mão (2026-11-13)

- Pedido do usuário (render dos pontos insatisfatório): o Fable avaliou o criador de pontos por comandos e diagrama de nós como **viável com ressalvas** (22–37 dias; primeira versão com pb e pa em 9–14). Etapa A = prototipar à mão o dado que o criador emitirá.
- `registry.ts`: `ModelStrand.sub?`; `postStrands(wraps)` dá, para pb, mpa, pa e pad, **um traço contínuo da entrada E à saída X** (desce por trás até o olho da base, sobe pela frente em torno da haste, passa por cima e sai) mais as laçadas como arcos que contornam a haste.
- `models.ts`: `strandsFor` usa os fios próprios só no **render** (qualidade ≥ 1) e com 1 perna; a edição (Q0) e as diminuições em V seguem no modelo procedural (orçamento de triângulos preservado). `shapeCustom` aplica a forma do topo aos fios próprios (só a parte alta; pontas E/X fixas).
- Testes: forma em fio contínuo, pb/mpa/pa/pad com as linhas esperadas, a edição continua simples. Olhado em close (render fino): laçadas reais e fio contínuo; **não é foto** (tubo liso, sem torção de cabos nem fibras).
- Próximo (se o usuário aprovar a imagem): B máquina de estados, C gerador de trilha + diagrama SVG, D janela, E registro dinâmico.

### Etapa A — correções da revisão do Fable (2026-11-13)

- **Fio contínuo de verdade:** as laçadas de mpa, pa e pad deixaram de ser arcos soltos: são voltas (meia volta por laçada, em elipse em torno da haste) do **mesmo traço** que sobe pela frente; cada ponto de haste é um fio só. O trecho de volta pelo topo passa por trás (z < 0), então o fio não se atravessa no topo.
- **Afastamento:** em `centerlines` o z dos fios próprios é escalado por `max(1, ρ/0,1)` conforme a faixa do fio, para frente e trás da haste ficarem separados; teste de distância mínima entre trechos não adjacentes (≥ 1,5ρ, janela de 12 pontos de controle) nas cinco faixas.
- **Comparação antes/depois:** (ajuste substituído em H2 por `render.set { yarnModel: simple|traced|relaxed }`; `continuousYarn` deixou de existir; `traced` = o fio contínuo desta etapa, padrão true na época; caixa "Fio contínuo (pb, mpa, pa)" no painel). Imagens em `docs/imagens/tecido-{pb,pa}-{antes,depois}.png` (mesma câmera, tecido com aumento e diminuição).
- **Limitações da etapa A (a resolver com as etapas seguintes):** (1) diminuições (2 pernas), pbx, corrente e anel seguem no modelo procedural dentro do render: a mesma peça mistura os dois estilos; (2) o topo tem um fio só (x de 0 a 0,5): o V de dois fios, que invade o ponto vizinho, exige as portas entre instâncias (etapa F), já que `deformPoint` limita x a ±0,5; (3) tubo liso, sem torção de cabos; (4) as laçadas do pa ainda parecem contas empilhadas em vista geral.
- **Versão do tipo:** não foi aumentada (a geometria muda só em qualidade ≥ 1, e o cache de modelos vive só em memória; o hash dos blocos do render já inclui o modelo do fio).
- **AO:** com o AO ligado a luminância média quase não muda (a luz é redistribuída: frestas mais escuras, faces expostas um pouco mais claras); o teste agora mede o **contraste** (desvio-padrão da luminância dos pixels cobertos), que aumenta com o AO. A linha "menor luminância média" do R3d-4 deve ser lida assim.

### Etapa A — 2ª revisão do Fable: **resultado visual negativo** (2026-11-13)

- Parecer do Fable: o fio contínuo escrito à mão **não resolve a insatisfação**: o "antes" lê como tecido regular; o "depois" lê como emaranhado de tubos grossos, sem o V do ponto; o pa parece contas empilhadas; o topo da peça é idêntico (diminuições procedurais), então a mistura de estilos pega boa parte da peça. Causa provável: com raio realista, as duas pernas mais o topo não cabem na caixa de um ponto **sem portas entre vizinhos e sem relaxamento com colisão**; escalar z só engrossa. Linha central melhor, sozinha, não basta; o criador por diagrama de nós teria o mesmo problema ao virar 3D.
- Consequência: as etapas F (portas entre instâncias) e H (relaxamento do fio com colisão) são o caminho crítico do render; proposta: protótipo de H só para o pb antes da janela do criador (etapas C e D). A máquina de comandos e o diagrama 2D (B e C) continuam viáveis e independentes do render.
- Por isso o fio contínuo (hoje `yarnModel: "traced"`) passou a ter padrão **desligado** (decisão final do usuário). `modelOptions` global foi trocado por parâmetro (`centerlines(spec, shape, opts)`, `deformToCurve(..., opts)`): mesma entrada, mesma saída.
- Continuidade provada em teste: a saída do fio do ponto i = a entrada do ponto i+1 no mundo (erro < 1e-4) em toda a volta de pb. As pontas de tubo cortadas que se veem no "depois" **não** vêm da junção entre pontos: vêm dos pontos que seguem no modelo procedural (diminuições, pbx, corrente, anel), cujas pernas e arcos são tubos soltos com tampas.

## Etapa H — protótipo de colisão do pb (2026-11-13; plano do Fable, escolha do usuário)

- **Ideia:** simular uma célula periódica de 1 pb no espaço do modelo (cadeia periódica: último nó = primeiro + (1, 0, 0), colidindo com as 9 cópias deslocadas em x e y), exportar uma polilinha por faixa de raio e instanciá-la com `deformToCurve`. Nada é simulado no mundo. Sub-etapas: H1a traçado + diagrama (revisão da topologia), H1b solver PBD + testes, H2 `deformPointWide` + `render.set { yarnModel }` + e2e + imagens. Teto de 5 dias; parar e concluir "não funciona" se H1b não chegar a `minDist ≥ 1,9ρ` na faixa 2 em 2 dias, ou se em H2 o tecido não ler como crochê.
- **H1a (feito):** `yarn-cell.ts` (`scCellPath`: o traçado à mão do fio do pb em A/B/C — alça deitada vinda do ponto anterior, alça puxada pela base com as duas pernas passando sob os trilhos da volta de baixo, alça final que vira o topo do ponto seguinte; `resample`, `pathLength`) e `yarn-diagram.ts` (`cellDiagramSvg`: projeção frontal de 3×3 cópias, o trecho de menor z interrompido nos cruzamentos). Diagrama gerado com `NOVELO_DIAGRAMS=1 npx vitest run packages/stitch3d/test/yarn-cell.test.ts` → `docs/imagens/celula-pb.svg` (e `.png`).
- **H1a — ajustes do Fable (2026-11-13):** `resample` com `period` (tangentes periódicas nas pontas), diagrama com halo na cor do fundo (quem passa por cima corta quem passa por baixo), janela recortada, e teste de topologia por coordenadas (C fura o U de B; as pernas de B passam sob os trilhos da cópia de baixo).
- **H1b (feito):** `yarn-relax.ts` — `segSegDist` (Ericson, comparado com força bruta), `cellMinDist` (9 cópias, sem adjacentes), `relaxCell` (PBD em 96 segmentos: distância entre vizinhos aplicada de novo depois da colisão, curvatura mínima 1,5ρ, colisão cápsula-cápsula a 2ρ contra as 9 cópias, deslocamento limitado a ρ/2 por nó, inflação de ρ₀ = 0,03 ao alvo em 20 estágios, 300 iterações de acomodação e fase de aperto). Devolve `minDist`, `maxPenetration`, `minDistEver` (menor distância vista em qualquer iteração: enquanto longe de zero, o fio nunca atravessou fio, a topologia se preserva).
- **Medido (traçado do plano, célula 1×1, ~0,6 s por raio):** ρ = 0,06 → 1,96ρ; 0,08 → 1,99ρ; 0,09 → 1,98ρ; **0,10 → 2,00ρ com o fio 1,4% mais curto**; 0,11 → 1,90ρ (penetração 10%, fio +1%); 0,12 (faixa 1) → 1,79ρ (+4% de fio); 0,16 (faixa 2) → 1,26ρ (+21%); 0,24 → a topologia se rompe (`minDistEver` ≈ 0). Encurtar o fio junto com a inflação (`lengthScale` < 1) **piora** (rompe a topologia já em ρ = 0,12 com escala 0,7).
- **Leitura:** a célula de 1 pb com o traçado do plano **só cabe até ρ ≈ 0,10** (diâmetro ≈ 20% da largura do ponto); as faixas 1 a 4 de `RHO_BANDS` (0,12 a 0,34) não cabem sem esticar o fio. Critério de parada do plano (1,9ρ na faixa 2): **não atingido**. A causa não é o solver: é o volume (10,2 larguras de fio por ponto contra a caixa de 1 × 1,3 × ~0,6). Opções: (a) usar o relaxado só até ρ = 0,10 (faixa 0, fio fino); (b) refazer o traçado mais curto/compacto (menos fio por pb); (c) mudar a escala do modelo (ρ em outra unidade) para que as faixas atuais correspondam a ρ ≤ 0,10.
- Diagramas: `docs/imagens/celula-pb.{svg,png}` e `celula-pb-relaxada.{svg,png}` (o halo com tampas retas deixa o diagrama de leitura difícil; é só conferência).

## Etapa H: raio do fio alvo (2026-11-13, estimativa)

Entradas (hipóteses, não medições): fio Círculo Amigurumi, TEX 492 (125 g / 254 m, algodão mercerizado, anúncios de varejo); densidade aparente do fio 0,6 (solto) a 0,9 g/cm³ (firme); largura do ponto baixo com agulha 2,5 mm entre 3,5 e 5,0 mm (faixa plausível, a confirmar com a tensão real da usuária). A receita "coelho Miguel" da Círculo é de tricô (agulha 3,5 mm, sem tensão) e não serve de base.

d = √(4·TEX/(1000·π·dens)) → 1,02 mm (0,6) e 0,83 mm (0,9). ρ = (d/2)/w:

| w (mm)   | 3,5   | 4,0   | 4,5   | 5,0   |
| -------- | ----- | ----- | ----- | ----- |
| dens 0,6 | 0,146 | 0,128 | 0,114 | 0,102 |
| dens 0,9 | 0,119 | 0,104 | 0,093 | 0,083 |

Limiar da H1b: o modelo relaxado cabe até ρ≈0,12 (0,11 → 1,90ρ; 0,12 → 1,79ρ). A grade cruza o limiar (0,083 a 0,146), então a decisão depende da tensão real: pontos baixos por 10 cm com agulha 2,5 mm e Amigurumi Círculo (w = 100/n mm).

### H2 — modelo relaxado no render e conclusão (2026-11-13)

- **Código:** `relaxedScCell(rho)` (uma célula por raio, em cache, limite ρ ≤ 0,12), `deformPointWide` (x fora de [-0,5; 0,5] passa para o ponto vizinho, quantos forem precisos), `ModelOptions.cell`, `render.set { yarnModel: "simple"|"traced"|"relaxed", yarnRho: 0,06 a 0,12 (padrão 0,10) }`, seletor no painel (marcado experimental). Vale só para SC com ≤ 1 perna em qualidade ≥ 1. Testes: `yarn-model.test.ts` e um e2e.
- **Fiada plana** (12 pb sobre 12 pontos): o fim do fio de um ponto coincide com o começo do seguinte (< 1e-6) e a distância mínima entre fios de pontos diferentes é ≥ 1,7ρ.
- **Esfera de 9 voltas (151 pontos), ρ = 0,10, distâncias normalizadas pela escala do ponto** (escala 1,03; |ex| 0,93 e |ey| 1,13, anisotropia de 22%). Pares de pontos vizinhos (centros a até 2,2 larguras), pela distância mínima entre os fios:

| Grupo                                                                                     | Pares | < 1,0ρ | 1,0 a 1,5ρ | 1,5 a 1,8ρ | ≥ 1,8ρ |
| ----------------------------------------------------------------------------------------- | ----- | ------ | ---------- | ---------- | ------ |
| (a) pontos puros (SC, 1 perna, base com um só filho, vizinhos também puros): 54 pontos    | 249   | 5      | 25         | 74         | 145    |
| (b) o resto dos SC com ≤ 1 perna (aumentos, diminuições, anel, vizinhos deles): 81 pontos | 601   | 88     | 76         | 72         | 365    |

- **Conclusão:** o grupo (a) não chega a 1,7ρ (5 cruzamentos e 12% abaixo de 1,5ρ): **célula periódica única não funciona em peças curvas.** Critério de parada da etapa H cumprido; a regra de costura (usar a célula só em pb de uma perna cujos vizinhos também são puros) não foi implementada porque só valeria se (a) passasse.
- **Causa provável (não provada):** a metade de baixo da célula (y abaixo de −0,5) é mapeada pelo quadro do ponto filho, que numa peça curva não coincide com o topo real do ponto pai; a anisotropia (22%) reduz as separações em x em cerca de 7 a 10%.
- **Caminho possível no futuro (não construir agora):** deformar a metade de baixo pelo quadro do ponto pai.
- **Imagens:** `docs/imagens/h2-esfera-{simple,relaxed}.png`. O modelo simples é desenhado na faixa 0,16 (mais grosso que o fio real, ≈ 0,10), então a comparação não é com a mesma espessura.
