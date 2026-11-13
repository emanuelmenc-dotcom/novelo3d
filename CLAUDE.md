# Novelo3D — instruções para o Claude Code

Aplicativo web local para projetar amigurumis: modelagem 3D por peças, regiões de fio, conversão em pontos de crochê, receita escrita, gráfico de símbolos, tutorial 3D e o caminho inverso (receita → 3D editável). Nome provisório.

## Estado atual

**P0 a P3 e P3.5 concluídos em 2026-11-11 (fim de P3 = primeira versão utilizável). Próxima etapa: P4 (tutorial), ver `docs/12`.** P3.5: motor de pontos com uid permanente (`docs/15`), seleção interativa (ponto, volta, coluna, caminho, vizinhança, filtros, formas 3D e de tela), pincel/balde/listras/gradiente, tensão por ponto, biblioteca de fios (cor por comprimento, material, espessura EUA/UK-EU/Brasil, valores aproximados) e multipartes com montagem, costuras, fechar montagem, padrão de fios e costura nas configurações e lista de materiais flutuante (D-36 a D-42). P3: fios e pintura (paleta, voltas e pontos), trocas de fio na receita, cartões e halos no gráfico, cores no 3D, consumo por fio e painel Fios. P2: `packages/layout` (posições 3D por ponto, D-26), comando `graph.layout` e aba 3D no studio (pontos instanciados, clique ↔ volta da receita, grafo opcional, cubo de vistas chanfrado e atalhos estilo FreeCAD, menu Configurações > Interface e Layout; interface modular em janelas com abas, barras, presets e layouts do usuário; comandos `settings.*` e `workspace.*`). P1: colar receita (pt-BR/US/UK) -> tabela de verificação -> gráfico circular SVG/PDF A4 -> texto CrochetPARADE, numa tela só (`apps/studio`); comandos `pattern.*` e `chart.render` em `packages/commands`, todos chamáveis por MCP. `npm run check` (405 testes e 2 pulados com `npx vitest run --maxWorkers=3`; o número de processos está fixado em 3 em `vitest.config.ts` e `playwright.config.ts`: com mais, testes pesados estouram o tempo) e `npm run e2e` (44 passam e 19 ficam pulados pela pausa D-57: `render.spec.ts` e `criador.spec.ts`) passam. R3b (janela Render) aprovado pelo Fable em 2026-11-12; R3c (render só da seleção + relaxamento leve, `docs/15`) e R3d (forma do ponto base, render completo ponto a ponto com ritmo, reaproveitamento de blocos, AO) aprovados pelo Fable em 2026-11-12; repositório público: github.com/emanuelmenc-dotcom/novelo3d. R1 (modelo de ponto instanciado por variante, pacote `packages/stitch3d`, registro de tipos) concluído em 2026-11-12 (`docs/15`). R0 (correções da revisão do Fable) concluído em 2026-11-12: uids estáveis ao digitar, desfazer global, consumo com tensão, layout a quente. Em 2026-11-11 o plano foi revisado: **standalone com interoperabilidade opcional**, núcleo em **grafo de pontos** (malha 3D derivada), revolução como um gerador entre vários (ver D-17 a D-20 em `docs/14-decisoes-e-riscos.md` e `docs/12-roadmap.md`). A **F0 está fechada** (`docs/referencia-f0.md`). Os marcos antigos M0–M11 estão substituídos por F0 e P0–P6. Existe também o **servidor MCP** em `tools/mcp-server` (D-21; `.mcp.json` na pasta `Crochet`): ferramentas `novelo_status`, `novelo_run_script` e `novelo_bridge_call`; testado por protocolo, ainda não visto dentro do Claude (exige reiniciar a sessão e aprovar). Etapa H (fio relaxado com colisão) encerrada em 2026-11-13 sem sucesso em peças curvas (D-54); dialeto XVA pronto (D-55, `docs/07` seção 7); criador de pontos, etapa B (máquina de estados das alças, `stitchBuilder` no core) pronta (`docs/16`); etapa C (diagrama de nós, `stitchDiagramSvg` em `packages/charts`) aprovada pelo usuário; etapa D (janela "Criador de pontos", `docs/16`, D-56) pronta, mas **pausada em 2026-11-13 (D-57)**: Render, Criador de pontos e 3D realista estão desligados por interruptores em `packages/commands/src/features.ts` (código e testes mantidos) e o 3D voltou ao estilo CrochetPARADE (fio ao longo das ligações, opção "Só linhas"); a etapa E fica parada até o usuário retomar. Auditoria corrigida em 2026-11-13 (D-58): ponte MCP só aceita a origem do studio, projeto salvo em arquivo, limites de receita, gráfico sem erro em volta vazia, gráfico e 3D adiados em receita grande. Atualize esta seção ao fim de cada marco.

## Modelos (regra do projeto, atualizada pelo usuário em 2026-11-13)

- **Todo planejamento, análise, viabilidade, mudança de rumo, otimização e revisão: ferramenta `advisor` (Opus 5.5).** O Sonnet (sessão principal) **só executa**: edita, testa, corrige, mede. Não use subagentes (`Agent`, inclusive `planejador`/Fable) para planejar ou revisar; a regra anterior (Fable por subagente) foi revogada.
- Ciclo: o advisor planeja → o Sonnet executa → o advisor revisa e pede alterações → o Sonnet executa → até o advisor aprovar. Só então dê o parecer final ao usuário. Sem aprovação, não declare nada pronto. Se o advisor estiver indisponível (limite de uso), diga isso, pare e não declare pronto; não planeje por conta própria.
- O advisor muda de modelo só depois de `/clear` ou `/compact` (ou numa sessão nova). Confirmado em 2026-11-13: após o `/compact`, o advisor respondeu como Opus.
- Ao fechar cada fase, peça ao advisor uma revisão curta; depois de corrigir os achados, uma SEGUNDA revisão. Antes de um plano novo, revisão rápida de tudo que foi feito.
- Limites honestos: isto é uma regra de trabalho, não uma trava técnica. A garantia técnica seria negar a ferramenta `Agent` nas permissões do projeto (decisão do usuário).

## Quem é o usuário

- O mantenedor tem conhecimento básico de programação e trabalha no Windows.
- Fale com ele em português do Brasil, com resposta direta e curta. Diga o resultado primeiro.
- Ele não revisa código linha a linha; valida pelo comportamento e pelas saídas. Por isso cada entrega precisa de testes automáticos e de algo que ele possa abrir e ver.
- Antes de uma mudança grande de direção, apresente a proposta e espere aprovação. Para o restante, siga a opção recomendada nos documentos.

## Onde está cada coisa

| Preciso saber                                   | Ler                                          |
| ----------------------------------------------- | -------------------------------------------- |
| O que o produto é e não é                       | `docs/00-visao-e-escopo.md`                  |
| O que já existe no mercado e por que construir  | `docs/01-pesquisa-de-ferramentas.md`         |
| Artigos e fatos geométricos                     | `docs/02-referencias-tecnicas.md`            |
| O que pode ser copiado de outros projetos       | `docs/03-licencas-e-reuso.md`                |
| Requisitos numerados                            | `docs/04-requisitos.md`                      |
| Pacotes, camadas e fluxo de dados               | `docs/05-arquitetura.md`                     |
| Tipos e regras de contagem                      | `docs/06-modelo-de-dados.md`                 |
| Dialetos, leitura de receita e validação        | `docs/07-notacao-e-validacao.md`             |
| Algoritmo geometria → receita                   | `docs/08-motor-direto.md`                    |
| Algoritmo receita → geometria e tutorial        | `docs/09-motor-reverso.md`                   |
| Formato do gráfico, PDF e tutorial 3D           | `docs/10-saidas-receita-grafico-tutorial.md` |
| Motor de pontos, seleção, tensão, peças         | `docs/15-motor-de-pontos.md`                 |
| Criador de pontos (etapas B a E, plano)         | `docs/16-criador-de-pontos.md`               |
| Telas e interações                              | `docs/11-interface.md`                       |
| Marcos e critérios de aceite                    | `docs/12-roadmap.md`                         |
| Casos de teste com valores esperados            | `docs/13-plano-de-testes.md`                 |
| Decisões tomadas, riscos e perguntas abertas    | `docs/14-decisoes-e-riscos.md`               |
| Termos de crochê em BR, US e UK                 | `docs/glossario.md`                          |
| Implementação de referência do gráfico (Python) | `referencia/graficos-python/chart.py`        |

Leia o documento do assunto antes de implementar. Não releia tudo a cada sessão.

## Pilha

TypeScript estrito · React · Vite · three.js (@react-three/fiber, drei) · zustand + immer · Vitest + fast-check · Playwright · Biome · workspaces npm. Versões de referência e licenças em `docs/03-licencas-e-reuso.md`.

## Comandos

Mantenha esta lista igual ao `package.json`. Todo comando novo do app entra em `packages/commands` e é exercitado via `novelo_bridge_call` (D-21).

```
npm install          # instalar dependências
npm run dev          # abrir o aplicativo em http://localhost:5173
npm test             # testes de unidade e de propriedades
npm run typecheck    # TypeScript
npm run lint         # Biome
npm run e2e          # testes de navegador (Playwright)
npm run check        # typecheck + lint + test, nesta ordem
```

No Windows, use comandos que funcionem no PowerShell; evite scripts que dependam de bash.

## Regras de trabalho

1. **Um marco por vez.** Não comece o próximo antes de cumprir os critérios de aceite do atual e de o usuário aprovar.
2. **Teste antes de declarar pronto.** Rode `npm run check`. Para o que é visual, gere a imagem e olhe. Relate o que foi verificado e o que não foi.
3. **A contagem manda.** Toda receita, gerada ou importada, passa por `core.validate()`. Nenhuma saída esconde divergência de contagem.
4. **Motores puros.** `core`, `notation`, `engine-*`, `charts` e `tutorial` não usam DOM, relógio nem aleatoriedade sem semente. Mesma entrada, mesma saída.
5. **Dependência entre pacotes só para baixo**, conforme `docs/05-arquitetura.md`.
6. **Valores de referência não mudam para o teste passar.** Se um valor de `docs/13-plano-de-testes.md` parecer errado, pare e explique ao usuário.
7. **Formato do gráfico: contrato suspenso (D-15, 2026-11-11).** Até o usuário confirmar o formato em P1, trate `docs/10-saidas-receita-grafico-tutorial.md` e `referencia/graficos-python/chart.py` como referência, e peça aprovação visual antes de fixar mudanças.
8. **Dependências novas:** confira a licença com `npm view <pacote> license` e registre em `docs/03-licencas-e-reuso.md`.
9. **Decisões novas** entram em `docs/14-decisoes-e-riscos.md` com data e motivo.
10. **Documentação acompanha o código.** Se a implementação divergir de um documento, corrija o documento no mesmo trabalho.

## Licença e conteúdo de terceiros

- Código próprio: GPL-3.0-or-later, com cabeçalho SPDX em cada arquivo.
- Pode copiar, com atribuição em `NOTICE.md`: CrochetPARADE e CrochetPARADE Remesher (GPL-3.0-or-later).
- **Não copie** código do repositório AmiGo em Python (CC BY-NC-SA) nem de repositórios sem licença. Reimplemente a partir dos artigos.
- **Não copie** código do CrochetBuilder (AGPL-3.0-only) sem aprovação explícita do usuário.
- **Não inclua receitas de terceiros** no repositório. Casos de teste usam formas geométricas e receitas escritas para o projeto.
- `referencia/sessao-sapo/` contém material de uma receita comercial para uso pessoal do usuário. Está no `.gitignore`. Nunca publique nem copie o conteúdo dela para testes.

## Convenções de código

- Identificadores, nomes de arquivo e códigos de erro em inglês. Comentários, mensagens ao usuário e documentação em português do Brasil.
- Unidades internas: milímetros e radianos. Converta só na borda da interface.
- Arredondamento de contagens: `Math.floor(x + 0.5)`.
- Funções dos motores devolvem `Result` com lista de `Issue`; não lançam exceção por entrada do usuário.
- Arquivos pequenos e funções com uma responsabilidade. Sem classes onde uma função resolve.
- Cada função pública de motor tem teste; cada correção de defeito ganha um teste que falhava antes.

## Como relatar o trabalho ao usuário

1. O que foi entregue, em uma frase.
2. Como ver ou testar (comando ou tela).
3. O que foi verificado e o que ficou sem verificar.
4. Decisões que tomou e que ele deve conhecer.
5. Próximo passo proposto.
