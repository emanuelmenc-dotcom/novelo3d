# Prompts para o Claude Code

Como usar: abra a pasta do projeto no Claude Code e cole o prompt do marco. Um marco por sessão. Ao fim, peça o relatório no formato do `CLAUDE.md` e teste o que foi entregue antes de aprovar.

---

## Prompt da Fase 0 (primeira sessão, revisado em 2026-11-11)

```
Leia o CLAUDE.md, docs/00-visao-e-escopo.md e a seção "F0" de docs/12-roadmap.md.

Objetivo: cumprir a Fase 0 e só ela. NÃO escreva código de produto.

Para cada um dos 7 itens da F0: execute a verificação, registre o resultado e dê
um go/no-go. Marque como "não verificado" o que não conseguir confirmar.
Entregue docs/referencia-f0.md e feche D-17, D-18 e D-19 em docs/14-decisoes-e-riscos.md.
Peça ao usuário as capturas do Knotly (item 5) antes de especificar a visualização.
Relate no formato do CLAUDE.md.
```

> Os prompts abaixo (M0 a M2) são do plano antigo; os marcos novos são P0–P6 de `docs/12-roadmap.md`. Reescreva-os quando chegar a vez de cada marco.

## Prompt do marco M0 (plano antigo)

```
Você vai iniciar o projeto Novelo3D. Leia o CLAUDE.md, depois docs/05-arquitetura.md,
docs/03-licencas-e-reuso.md e a seção "M0 — Fundação" de docs/12-roadmap.md.

Objetivo desta sessão: cumprir o marco M0, e só ele.

Antes de escrever qualquer arquivo:
1. Confira as versões estáveis atuais das dependências listadas em
   docs/03-licencas-e-reuso.md com `npm view <pacote> version license`.
2. Me apresente o plano em até 10 linhas: estrutura de pastas, versões escolhidas
   e qualquer ponto em que pretende divergir dos documentos, com o motivo.
3. Aguarde minha aprovação.

Depois de aprovado:
- Execute as 6 tarefas do marco M0.
- Trabalho no Windows: os scripts npm precisam funcionar no PowerShell.
- Não implemente nada dos marcos seguintes.
- Ao terminar, rode `npm run check` e `npm run e2e` e me mostre o resultado.
- Atualize a seção "Estado atual" e a lista de comandos do CLAUDE.md.
- Registre em docs/14-decisoes-e-riscos.md qualquer decisão nova.

Relate no formato definido no CLAUDE.md e diga exatamente o que devo fazer
para ver a tela inicial funcionando.
```

## Prompt do marco M1

```
Leia o CLAUDE.md, docs/06-modelo-de-dados.md, docs/07-notacao-e-validacao.md,
a seção "M1" de docs/12-roadmap.md e as seções 2, 3 e 4 de docs/13-plano-de-testes.md.

Objetivo: cumprir o marco M1 (núcleo de receita), sem interface gráfica.

Ordem de trabalho:
1. Escreva primeiro os testes dos casos V1 a V8 e N1 a N12, usando os valores
   do plano de testes. Eles devem falhar.
2. Implemente `core` até os casos V passarem.
3. Implemente `notation` até os casos N passarem.
4. Acrescente os testes de propriedade da seção 9 do plano de testes.
5. Crie o comando `npm run pattern -- verificar <arquivo>`.

Regras:
- Não altere valores esperados para fazer teste passar. Se achar que um valor
  do plano está errado, pare e me explique.
- Use só receitas escritas para o projeto (P-BOLA, P-TUBO, P-BABADO).
- Motores sem DOM e sem aleatoriedade sem semente.

Ao terminar, me mostre a tabela de verificação de P-BOLA gerada pelo comando
e a de uma versão de P-BOLA com o total da volta 3 trocado para 19.
```

## Prompt do marco M2

```
Leia o CLAUDE.md, docs/10-saidas-receita-grafico-tutorial.md (seções 2 e 3),
a seção "M2" de docs/12-roadmap.md, a seção 7 de docs/13-plano-de-testes.md
e o arquivo referencia/graficos-python/chart.py.

Objetivo: portar o gerador de gráficos para o pacote `charts`, em TypeScript.

Atenção:
- O chart.py é a referência de comportamento. Porte a lógica de layout
  (função `layout`), os símbolos, os anéis tracejados, a ligação híbrida,
  os rótulos, as marcas de início e fim, o cartão de fio, a legenda e as notas.
- Não use a pasta referencia/sessao-sapo/ em testes: ela contém receita de terceiros.
- Gere os casos G1 a G6. Converta cada página em PNG e inspecione a imagem
  antes de me mostrar: sobreposição, rótulos cortados, texto no rodapé.
- Implemente a checagem automática de sobreposição de símbolos.

Me apresente primeiro só o caso G1 para aprovação visual. Depois de aprovado,
gere os demais e o PDF.
```

## Modelo para os marcos seguintes

```
Leia o CLAUDE.md e os documentos indicados para o marco M<n> em docs/12-roadmap.md.

Objetivo: cumprir o marco M<n>, e só ele.

1. Me apresente o plano em até 10 linhas e aguarde aprovação.
2. Escreva os testes dos critérios de aceite antes da implementação.
3. Implemente, rode `npm run check` e os testes de navegador do marco.
4. Para tudo o que é visual, gere a imagem ou abra a tela e confira antes de relatar.
5. Atualize CLAUDE.md (estado atual), docs/14-decisoes-e-riscos.md e qualquer
   documento que tenha ficado diferente do código.

Relate no formato do CLAUDE.md.
```

## Prompts úteis no dia a dia

| Situação                          | Prompt                                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retomar o trabalho                | `Leia o CLAUDE.md e me diga em 5 linhas em que marco estamos, o que falta para o aceite e qual é a próxima tarefa.`                                         |
| Defeito                           | `Encontrei este comportamento: <descrição>. Reproduza com um teste que falha, corrija e me mostre o teste passando.`                                        |
| Dúvida de desenho                 | `Antes de implementar <coisa>, me apresente 2 ou 3 opções com prós e contras e a sua recomendação. Não escreva código ainda.`                               |
| Revisão antes de aprovar um marco | `Faça uma revisão crítica do marco M<n>: critérios de aceite um a um, o que foi verificado e como, e o que ficou frágil.`                                   |
| Atualizar a pesquisa              | `Refaça a conferência das ferramentas da seção 4 de docs/01-pesquisa-de-ferramentas.md (licença, último commit, novas capacidades) e atualize o documento.` |
