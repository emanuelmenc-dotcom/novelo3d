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
- Sequências (derivação do advisor; escrever o modelo e esta tabela aqui antes de codar e mandar para revisão):

| Ponto                        | Sequência                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| corrente                     | yo, draw 1                                                                                         |
| pbx (baixíssimo)             | insert, draw 1                                                                                     |
| pb                           | insert, yo, draw 2                                                                                 |
| mpa                          | yo, insert, yo, draw 3                                                                             |
| pa                           | yo, insert, (yo, draw 2) ×2                                                                        |
| pad                          | yo, yo, insert, (yo, draw 2) ×3                                                                    |
| pb2juntos                    | insert a, insert b, yo, draw 3                                                                     |
| puff (mpa ×4 na mesma base)  | repetir (yo, insert) 4 vezes, cada uma sem fechar (deixa 2 alças), depois yo, draw de todas        |
| bobble (pa ×4 na mesma base) | repetir (yo, insert, yo, draw 2) 4 vezes, cada uma deixando 1 alça extra, depois yo, draw de todas |

- Antes de codar: ler os campos que `registry.ts` realmente tem para pernas e altura e derivar a saída do ponto desses campos, sem inventar campos novos.
- Teste 1: cada linha da tabela produz as pernas e a altura do registro.
- Oráculo de consumo (inspirado na tabela da documentação do Knotly, só a convenção): corrente 0 → 1; pontos básicos 1 → 1; aumento 1 → 2 (dois pontos terminados na mesma base); pb2juntos 2 → 1; pular 1 → 0. Cada sequência deve produzir o consumo e a produção certos.
- Teste 2: passos inválidos são recusados (`finish` com 2 alças, `draw(k ≥ alças)`, `insert` sem base escolhida).
- Fora do escopo: pipoca com alça solta, tunisiano, broomstick/hairpin, costura.

## C: diagrama de nós esquemático (SVG puro)

- Faixa de baixo: os topos da carreira de baixo. Alças empilhadas sobre o desenho da agulha. A cada `draw`, a alça nova passa por cima e por baixo das alças que atravessa.
- Reaproveitar a técnica de interrupção no cruzamento de `cellDiagramSvg`, sem a célula 3D.
- Testes: o número de alças desenhadas é igual ao do estado; a saída é determinística.
- **Parada para o usuário:** diagramas finais das 8 sequências mais o pb passo a passo em `docs/imagens`, enviados ao usuário; perguntar se batem com a ideia antes de construir a janela.

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
