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
- **Sem cálculo de cruzamentos:** o por cima/por baixo vem dos eventos e da ordem de desenho: (1) costas dos anéis, (2) agulha, (3) fios, (4) frentes dos anéis com halo na cor do fundo. O fio passa entre as costas e a frente do anel que atravessa.
- **Desenho:** carreira de baixo (V por base, rótulo "base n") embaixo; agulha no topo com a ponta à direita e as alças em anéis (mais antiga à esquerda); alça puxada tem duas pernas até o V da sua base; cada `draw` fecha as alças atravessadas em anéis deitados, um nível por `draw` (o primeiro perto das bases) e um anel por alça; o fio da alça de cima desce pelos anéis na ordem de `through`. Cores: alça inicial cinza, laçada laranja, alça puxada verde.
- **Atributos para teste:** `data-part="back|front"` com `data-loop`, `data-kind` e `data-on-hook` nos anéis; `data-strand` + `data-through` em cada passagem do fio (e `data-tail` na ponta); `data-leg` + `data-base` nas pernas; `data-base-top` nos V.
- **Testes** (`packages/charts/test/stitch-diagram.test.ts`): para cada prefixo das 9 sequências, alças na agulha = estado, anéis fechados = alças atravessadas, passagens do fio na ordem dos eventos entre as costas e a frente de cada anel, pernas em cada base usada, saída idêntica em duas chamadas. `NOVELO_DIAGRAMS=1 npx vitest run packages/charts` grava `docs/imagens/ponto-<nome>.svg` e `ponto-pb-passo-N.svg`; os PNGs (`ponto-folha-9pontos.png`, `ponto-folha-pb-passos.png`) saem de um script temporário com o Edge, sem script no repositório.
- **Limite visível:** puff e bobble empilham 8 a 10 anéis com 12 px entre eles; legível, mas apertado.

## D: janela e comandos

- Comandos, todos chamáveis por MCP: `stitchEditor.state|selectBase|apply|undo|reset|save`.
- Painel no espaço de trabalho modular: diagrama em cima, botões habilitados por `allowed`, carreira de baixo sintética (5 bases) para escolher.
- e2e pela ponte: montar pb e pa; conferir que comandos inválidos são recusados e que `finish` só libera com 1 alça.

## E: pontos do usuário no projeto

- Perguntar ao usuário no início da etapa E: a abreviação deve valer nas receitas? Qual símbolo no gráfico?
- Guardar os pontos do usuário como dado do projeto (D-11), com versão. Só construir depois da resposta.

## Ritmo de cada etapa

1. Plano detalhado, revisado pelo advisor Opus.
2. Código.
3. `npm run check` e e2e.
4. Revisão do advisor Opus.
5. Commit local. Push só com aprovação do usuário.
