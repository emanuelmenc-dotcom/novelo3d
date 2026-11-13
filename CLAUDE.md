# Novelo3D — instruções para o Claude Code

Aplicativo web local para projetar amigurumis: modelagem 3D por peças, regiões de fio, conversão em pontos de crochê, receita escrita, gráfico de símbolos, tutorial 3D e o caminho inverso (receita → 3D editável). Nome provisório.

## Estado atual

**P0 a P3 e P3.5 concluídos em 2026-11-11 (fim de P3 = primeira versão utilizável), aguardando aprovação do usuário para P4.** P3.5: motor de pontos com uid permanente (`docs/15`), seleção interativa (ponto, volta, coluna, caminho, vizinhança, filtros, formas 3D e de tela), pincel/balde/listras/gradiente, tensão por ponto, biblioteca de fios (cor por comprimento, material, espessura EUA/UK-EU/Brasil, valores aproximados) e multipartes com montagem, costuras, fechar montagem, padrão de fios e costura nas configurações e lista de materiais flutuante (D-36 a D-42). P3: fios e pintura (paleta, voltas e pontos), trocas de fio na receita, cartões e halos no gráfico, cores no 3D, consumo por fio e painel Fios. P2: `packages/layout` (posições 3D por ponto, D-26), comando `graph.layout` e aba 3D no studio (pontos instanciados, clique ↔ volta da receita, grafo opcional, cubo de vistas chanfrado e atalhos estilo FreeCAD, menu Configurações > Interface e Layout; interface modular em janelas com abas, barras, presets e layouts do usuário; comandos `settings.*` e `workspace.*`). P1: colar receita (pt-BR/US/UK) -> tabela de verificação -> gráfico circular SVG/PDF A4 -> texto CrochetPARADE, numa tela só (`apps/studio`); comandos `pattern.*` e `chart.render` em `packages/commands`, todos chamáveis por MCP. `npm run check` (283 testes) e `npm run e2e` (46 testes) passam. R3b (janela Render) aprovado pelo Fable em 2026-11-12; R3c (render só da seleção + relaxamento leve, `docs/15`) aprovado pelo Fable em 2026-11-12. R1 (modelo de ponto instanciado por variante, pacote `packages/stitch3d`, registro de tipos) concluído em 2026-11-12 (`docs/15`). R0 (correções da revisão do Fable) concluído em 2026-11-12: uids estáveis ao digitar, desfazer global, consumo com tensão, layout a quente. Em 2026-11-11 o plano foi revisado: **standalone com interoperabilidade opcional**, núcleo em **grafo de pontos** (malha 3D derivada), revolução como um gerador entre vários (ver D-17 a D-20 em `docs/14-decisoes-e-riscos.md` e `docs/12-roadmap.md`). A **F0 está fechada** (`docs/referencia-f0.md`). Os marcos antigos M0–M11 estão substituídos por F0 e P0–P6. Existe também o **servidor MCP** em `tools/mcp-server` (D-21; `.mcp.json` na pasta `Crochet`): ferramentas `novelo_status`, `novelo_run_script` e `novelo_bridge_call`; testado por protocolo, ainda não visto dentro do Claude (exige reiniciar a sessão e aprovar). Atualize esta seção ao fim de cada marco.

## Modelos (regra do projeto, definida pelo usuário em 2026-11-12)

- **Pedidos de mudança, análise, viabilidade e todo planejamento: Fable.** Antes de implementar qualquer pedido novo, chame o agente `planejador` (`subagent_type: planejador`, modelo Fable; definido em `.claude/agents/planejador.md`) e siga o plano dele. Revisões de plano e de código também vão para ele.
- **Execução de código (editar, testar, corrigir): Sonnet**, na sessão principal. Não reinterprete o plano: se ele estiver errado ou incompleto, devolva ao `planejador`.
- **Ciclo padrão de trabalho (regra do usuário, 2026-11-12):** o Fable planeja, o Sonnet executa, o Fable revisa e pede alterações, o Sonnet executa as alterações, e assim até o Fable APROVAR. Só então dê o parecer final ao usuário. Sem aprovação do Fable, não declare nada pronto; diga ao usuário em que passo está e o que falta. Se o Fable estiver indisponível (limite de uso), diga isso e não declare pronto.
- Ao fechar cada fase, peça ao `planejador` uma revisão curta do que foi feito antes de declarar pronto; depois de corrigir os achados, peça uma SEGUNDA revisão (regra do usuário, 2026-11-12).
- Sempre que iniciar um novo plano com o `planejador`, peça antes uma revisão rápida de tudo que foi feito até então, resolva os pontos, e só então inicie o plano novo (regra do usuário, 2026-11-12).

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
