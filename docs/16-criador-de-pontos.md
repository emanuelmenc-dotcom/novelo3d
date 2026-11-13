# Criador de pontos (etapas B a E)

Plano do advisor Opus, 2026-11-13. Chamado "criador B–E" nos documentos e relatórios, porque "Plano D" é o app desktop em Electron.

**Aviso:** com a etapa H encerrada (D-54), o criador não melhora o visual 3D. Pontos feitos nele são desenhados com o modelo procedural existente mais próximo. O valor do criador está em definir, diagramar e validar pontos.

## B: máquina de estados pura (`packages/core/src/stitches/`)

- Estado: lista de alças na agulha, da mais antiga à mais nova. Uma alça é a alça inicial, uma laçada ou uma alça puxada da base k.
- Comandos:
  - `yo` (laçada) acrescenta uma alça.
  - `insert(base, modo)` puxa uma alça da base escolhida. O modo é "as duas alças" por padrão; FLO, BLO, ponto alto de frente e de trás e espaço ficam guardados, mas desenham com o modelo padrão.
  - `draw(k)` passa a alça mais nova pelas k alças abaixo dela e remove essas k.
  - `finish` só é permitido com 1 alça.
- `allowed(estado)` devolve os comandos habilitados.
- Sequências (derivação do advisor, revisadas por ele antes de codar):

| Ponto                        | Sequência                                                                                                        | Tipo | Pernas | Consome | Produz |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---- | ------ | ------- | ------ |
| corrente                     | yo, draw 1                                                                                                       | CH   | 0      | 0       | 1      |
| pbx (baixíssimo)             | insert, draw 1                                                                                                   | SL   | 1      | 1       | 1      |
| pb                           | insert, yo, draw 2                                                                                               | SC   | 1      | 1       | 1      |
| mpa                          | yo, insert, yo, draw 3                                                                                           | HDC  | 1      | 1       | 1      |
| pa                           | yo, insert, (yo, draw 2) ×2                                                                                      | DC   | 1      | 1       | 1      |
| pad                          | yo, yo, insert, (yo, draw 2) ×3                                                                                  | TR   | 1      | 1       | 1      |
| pb2juntos                    | insert a, insert b, yo, draw 3                                                                                   | SC   | 2      | 2       | 1      |
| puff (mpa ×4 na mesma base)  | (yo, insert) ×4 na mesma base, depois yo, draw 9 (alças após cada par: 3, 5, 7, 9; yo: 10; draw: 1)              | HDC  | 1      | 1       | 1      |
| bobble (pa ×4 na mesma base) | (yo, insert, yo, draw 2) ×4 na mesma base, depois yo, draw 5 (alças após cada grupo: 2, 3, 4, 5; yo: 6; draw: 1) | DC   | 1      | 1       | 1      |

- **Ponto pronto:** com 1 alça depois de pelo menos um `draw`, só `finish` é aceito (`stitch_done`); senão "insert, yo, draw 2" seguido de outro "insert, yo, draw 2" viraria um pb2juntos. É o "fim do ponto" que destrava com 1 alça, como o usuário descreveu.
- **Limite de alças:** `MAX_LOOPS` = 16 limita o puff a 7 componentes (8 pedem 18 alças); não aumentar.

- **Registro (correção do advisor):** o registro **não tem** campo de pernas nem de altura. `wraps` (0/1/2/3) é um parâmetro visual ajustado à mão (mpa e pa têm uma laçada antes de inserir, mas `wraps` 1 e 2); as pernas vêm dos pais no grafo. Então cada sequência é mapeada a um **id de tipo** e `wraps` e `lengthFactor` são lidos do registro, não calculados. O registro não é alterado.
- **Módulo:** `packages/core/src/stitches/builder.ts`, puro, exportado pelo core. Sem comandos, interface nem mudança no registro.
  - Cada alça tem id estável: `{id, kind: "initial" | "yo" | "pulled", base?, mode?}`. O estado guarda o registro de eventos; cada `draw` guarda os ids das alças atravessadas (a etapa C usa isso).
  - Funções: `start()`, `apply(estado, cmd)` → `{ok, state} | {ok: false, reason}` (nunca lança nem altera a entrada), `allowed(estado)` → `{yo, insert, drawMax, finish}`, `replay(cmds)`, `undo(estado)` = `replay(cmds sem o último)`, `summarize(estado)` → `{type, legs, bases, consumed, produced, exact, modes, wraps, lengthFactor}`.
  - Regras: `draw(k)` exige 1 ≤ k ≤ alças − 1; `finish` exige exatamente 1 alça e pelo menos um `draw` feito; depois de `finish` tudo é recusado; `insert` exige base (índice na carreira de baixo); a mesma base pode se repetir (puff), mas só a última; bases distintas são consecutivas e crescentes (a receita só consome topos contíguos); no máximo 4 bases distintas (`MAX_LEGS` do stitch3d) e 16 alças.
- **Regra do tipo mais próximo** (reproduz exatamente cada tipo embutido): sem `insert` → CH; com `insert` e nenhuma `yo` → SL; senão conta as `yo` antes do primeiro `insert`: 0 → SC; 1 com exatamente um `draw` → HDC; 1 com dois ou mais `draw` → DC; 2 ou mais → TR (não há DTR). `legs` = bases distintas; `consumed` = `legs`; `produced` = 1. `exact` = a sequência (tipos de comando e k, ignorando as bases) é igual à canônica de um tipo embutido. Puff vira HDC com 1 perna, bobble vira DC com 1 perna, pb2juntos vira SC com 2 pernas.
- **Limites conhecidos:** puff e bobble desenham e consomem fio como o ponto-componente (HDC e DC), então o consumo de fio é subestimado (para a etapa E, sem resolver agora). Ponto personalizado com 2 ou mais pernas e tipo diferente de SC não tem `Op` na receita hoje.
- **Escopo:** a etapa B constrói **um ponto**. Aumento (1 → 2) e pular (1 → 0) são nível de receita e ficam em `simulate.ts`; corrente 0 → 1, pontos básicos 1 → 1, pb2juntos 2 → 1.
- **Testes** (`packages/core/test/`): (1) o pb do usuário (insert, yo, draw 2, finish) com 2, 3 e 1 alças e resultado SC, 1 perna, exato; (2) a tabela dos 9 pontos com a contagem de alças passo a passo e o resumo final; (3) oráculo executável com o pipeline do próprio repositório: cada linha da tabela vira uma operação de receita a partir do resumo e, por `buildGraph`, o tipo e o número de pais do nó são iguais a `type` e `legs`; (4) recusas (`finish` no início e com 2 alças, `draw(0)` e `draw(alças)`, `insert` sem base, base que pula (a, a+2) ou volta, quinta base distinta, limite de alças, qualquer comando depois de `finish`, e `stitch_done`: com o ponto pronto, só `finish`); (5) `allowed` concorda com `apply` em cada passo de cada sequência; (6) pureza (a entrada não muda; `replay` = passo a passo; `undo` = `replay` sem o último); (7) o modo FLO de um `insert` é guardado em `modes` e não muda mais nada.
- Fora do escopo: pipoca com alça solta, tunisiano, broomstick/hairpin, costura.
- **Nota para a etapa D:** "puxe pelas duas alças selecionadas" na interface é escolher k alças contadas da ponta da agulha; seleção não contígua é recusada, o que coincide com `draw(k)`.

## Cobertura conferida contra a biblioteca da DulceBella (2026-11-13)

- **Cobertos pela máquina de estados:** pontos básicos e fechados, conjuntos e dc2tog, puff, bobble, bean.
- **Nível da receita, não do criador:** ponto em V, conchas e leques (vários pontos na mesma base); ponto musgo e a maioria dos "pontos de biblioteca" (combinações de pontos básicos em várias carreiras). Pertencem à notação e a macros.
- **Limites conhecidos de B a E (não cobertos):** pontos spike (entram 2 ou mais carreiras abaixo; a faixa de baixo só mostra a carreira anterior); pontos cruzados e entrelaçados (exigem por cima/por baixo em relação a um ponto já feito, que a pilha de alças não representa); pipoca; pontos de relevo (FLO, BLO, FP, BP ficam guardados mas desenham com o modelo padrão; o FP DC ribbing é um caso popular).

## C: diagrama de nós esquemático (SVG puro)

- Faixa de baixo: os topos da carreira de baixo. Alças empilhadas sobre o desenho da agulha. A cada `draw`, a alça nova passa por cima e por baixo das alças que atravessa.
- Reaproveitar a técnica de interrupção no cruzamento de `cellDiagramSvg`, sem a célula 3D.
- Testes: o número de alças desenhadas é igual ao do estado; a saída é determinística.
- **Parada para o usuário:** diagramas finais das 9 sequências mais o pb passo a passo em `docs/imagens`, enviados ao usuário; perguntar se batem com a ideia antes de construir a janela.

### C: como ficou (2026-11-13)

- **Módulo:** `packages/charts/src/stitch-diagram.ts`, exportado por `@novelo/charts`: `stitchDiagramSvg(state, { bases?, caption? })`. Puro e determinístico (coordenadas com `toFixed(1)`). A janela da etapa D usa o mesmo módulo.
- **Camadas:** o por cima/por baixo vem da ordem de desenho: (1) costas dos anéis, (2) agulha, (3) fios, (4) frentes dos anéis com halo na cor do fundo. Isso sozinho não prova nada (qualquer layout satisfaz); quem garante as ligações é o layout, conferido pelo teste de furos abaixo.
- **Layout em árvore por faixas:** o fio de cada laço atravessa, em ordem, os laços que os seus `draw` fecharam (os "filhos" dele). Cada folha tem a sua faixa (60 px); um laço com filhos fica na faixa do primeiro filho, os outros filhos descem em degraus (14 px) à direita; quem puxou uma alça da base e tem filhos ganha faixa própria. Um laço que é o de cima de dois `draw` seguidos (`yo, yo, draw 1, draw 1`) continua o mesmo fio, que sai pela frente do último anel de um `draw` e segue para o anel seguinte.
- **Mão que segura a agulha** (`hand`, padrão `"right"`; sem interface ainda, é só a opção do módulo): na **mão direita** a ponta da agulha fica à esquerda e o cabo à direita; as bases correm da direita para a esquerda (base 0 na direita: 4 3 2 1 0); cada alça nova entra na ponta e as mais antigas deslizam 60 px em direção ao cabo, e um `draw` devolve as que ficam para perto da ponta. A **mão esquerda** é o espelho exato (mesma largura, `x → largura − x`, textos iguais). Tudo é calculado no desenho da mão esquerda e espelhado só na saída; a largura é sempre múltipla de 60, o que mantém as casas da agulha, ancoradas na ponta, a 30 px das faixas. Na mão direita as metades costas e frente dos anéis da agulha trocam de lado (o sentido do arco inverte). Texto nunca é espelhado. A agulha tem a pontinha do gancho (`data-hook-tip`) e o cabo grosso (`data-hook-handle`).
- **Símbolo da alça (U) e pernas duplas** (2026-11-13): toda alça na agulha é um **U** pendurado na agulha (laçada e alça inicial: um U curto; metade de trás e metade da frente, uma de cada lado da agulha). A alça puxada de uma base é um **U comprido**: os dois braços saem da agulha (ou do fundo do anel, quando a alça já está fechada), descem a **GAP = 12 px** um do outro, atravessam numa **pista própria** abaixo de todos os anéis e entram na base na sua casa do V; a curva do U fica por baixo do V, que é desenhado por cima, então a alça lê como passando por baixo do V. Só há trechos retos (horizontais e verticais, deslocamento de ±6 px da linha central, quinas em ângulo reto): a distância entre os braços é constante e não há diagonais. Casas do V a **PITCH = 23 px** (GAP + traço + folga); o V alarga para caber o leque de pernas de uma base (puff e bobble: quatro pares lado a lado). **Ordem das pistas:** quanto mais longe da base a alça cai, mais baixa a pista; e se a casa de entrada de um par fica a menos de PITCH de onde outro desce, a pista dele é mais baixa (senão os trechos verticais se sobreporiam). **Bases:** o espaço entre duas bases é múltiplo de 60 (os V continuam longe das faixas e das casas da agulha) e deixa no mínimo PITCH entre a última casa de uma e a primeira da seguinte. Os anéis fechados no poste continuam elipses deitadas, porque o fio precisa passar pelo furo deles.
- **Cores:** alça inicial cinza, laçada laranja, alça puxada verde.
- **Atributos para teste:** `data-part="back|front"` com `data-loop`, `data-kind`, `data-on-hook`, `data-cx` e `data-cy` nas alças (o centro vem sempre de `data-cx`/`data-cy`, nunca da geometria do traço); na alça puxada que está na agulha, `data-part` fica nas primeiras peças dos braços; `data-strand` + `data-draw` (número do `draw`) + `data-through` em cada passagem do fio, e `data-exit` na saída pela frente do último anel; `data-leg` + `data-base` + `data-side` + `data-seg` (número da peça) em cada peça reta das pernas, e `data-leg-curve` na curva; `data-base-top` com `data-cx` e `data-hw` (meia largura) nos V.
- **Testes** (`packages/charts/test/stitch-diagram.test.ts`), para cada prefixo das 9 sequências, nas duas mãos, e para 300 caminhadas aleatórias com semente fixa (gerador próprio; `fast-check` não está instalado): alças na agulha = estado; as passagens de cada `draw` são o `through` do evento, na ordem; **teste de furos:** os segmentos de cada `draw` atravessam os furos de exatamente as alças do `through` e de mais nenhuma; nenhuma perna atravessa o furo de um anel; **teste de folga:** nenhum anel fechado a menos de 20 px do centro de um V; **pernas duplas:** as duas linhas de cada alça puxada são paralelas, a 12 px, em todas as peças; **sem sobreposição:** trechos paralelos de alças diferentes que se sobrepõem ficam a pelo menos 10 px (estrito em todos os prefixos das 9 sequências); **continuidade:** os braços começam a ±6 px do centro da alça (na agulha ou no fundo do anel), as duas últimas peças terminam nas duas pontas da curva e a curva fica dentro do V da sua base; saída idêntica em duas chamadas. Testes das mãos: base 0 na direita e crescendo para a esquerda; ponta e cabo do lado certo; alça mais nova na ponta, mais antigas a 60 px uma da outra, `yo`/`insert` empurram 60 px e `draw(k)` devolve 60·k; a esquerda é o espelho exato da direita. Histórico: o teste de furos falhou na versão de uma coluna só e o de folga falha sem o deslocamento da tira; o teste das pernas duplas falhou no desenho anterior (pernas a 8 px). O teste de sobreposição não pôde ser conferido contra aquele desenho, porque ele não olhava diagonais.
- **Imagens:** `NOVELO_DIAGRAMS=1 npx vitest run packages/charts` grava `docs/imagens/ponto-<nome>.svg` e `ponto-pb-passo-N.svg`; os PNGs (`ponto-folha-9pontos.png`, `ponto-folha-pb-passos.png`) saem de um script temporário com o Edge, sem script no repositório.
- **Tentativa descartada:** alinhar cada anel puxado sobre a sua base e manter as laçadas longe das bases obrigava o fio a ziguezaguear pela figura inteira (puff e bobble alternam alça puxada e laçada no mesmo `draw`) e ainda deixava um caso aleatório falhar no teste de furos; ficou pior de ler e foi revertida.
- **Limite conhecido:** em sequências com duas ou mais puxadas em cada uma de duas bases vizinhas (por exemplo `yo i0 i0 i1 i1 d3 d2 finish`) cada par cai a menos de um passo de onde o outro desce, e nenhuma ordem de pistas resolve: há trechos verticais a menos de 10 px (30 estados em 300 caminhadas, todos nesse caso; os testes só aceitam sobreposição nele). Nenhum ponto de crochê comum tem essa forma.
- **Detalhes visuais a confirmar com o usuário:** um degrau de 30 px na linha dupla logo acima da base 0 (pb, mpa, pa, pad), que vem de manter os anéis fora do V; uma pequena dobra no par mais à direita do puff e do bobble; e a pergunta aberta sobre pôr a ponta da agulha sobre a base 0.

## D: janela e comandos

- Comandos, todos chamáveis por MCP: `stitchEditor.state|selectBase|apply|undo|reset|save`.
- Painel no espaço de trabalho modular: diagrama em cima, botões habilitados por `allowed`, carreira de baixo sintética (5 bases) para escolher.
- e2e pela ponte: montar pb e pa; conferir que comandos inválidos são recusados e que `finish` só libera com 1 alça.
- **Pontos a resolver no plano de D:** (1) a largura do desenho cresce com o pico de alças; a janela precisa de uma largura fixa ou mínima para os quadros não pularem entre os passos. (2) Com a ponta à esquerda e a base 0 à direita, a alça puxada na base 0 (pb, passos 1 e 2) tem uma perna que atravessa a figura inteira; na prática de crochê destro a ponta entra na base 0 e as bases não trabalhadas ficam à sua esquerda. Perguntar ao usuário se quer a ponta sobre a base 0.

## E: pontos do usuário no projeto

- Perguntar ao usuário no início da etapa E: a abreviação deve valer nas receitas? Qual símbolo no gráfico?
- Guardar os pontos do usuário como dado do projeto (D-11), com versão. Só construir depois da resposta.

## Ritmo de cada etapa

1. Plano detalhado, revisado pelo advisor Opus.
2. Código.
3. `npm run check` e e2e.
4. Revisão do advisor Opus.
5. Commit local. Push só com aprovação do usuário.
