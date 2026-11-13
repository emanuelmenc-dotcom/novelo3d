# Novelo3D

Aplicativo web local para projetar amigurumis. Nome provisório.

- **Direto:** modelar a peça em 3D → pintar as regiões de cada fio → gerar receita escrita, gráfico de símbolos e tutorial 3D.
- **Reverso:** colar uma receita → conferir as contagens → ver o modelo 3D → editar e gerar de novo.

## Estado

Fase de especificação. Este repositório contém a pesquisa, a especificação e o roteiro; o código começa no marco M0.

## Por onde começar

| Quem                                | Ler primeiro                                       |
| ----------------------------------- | -------------------------------------------------- |
| Quer entender o projeto             | `docs/00-visao-e-escopo.md`                        |
| Quer saber se já existe algo pronto | `docs/01-pesquisa-de-ferramentas.md`               |
| Vai desenvolver com o Claude Code   | `CLAUDE.md` e `docs/prompts/01-primeira-sessao.md` |
| Quer ver o roteiro                  | `docs/12-roadmap.md`                               |

## Documentos

| Arquivo                                      | Conteúdo                                                |
| -------------------------------------------- | ------------------------------------------------------- |
| `docs/00-visao-e-escopo.md`                  | O que é, para quem, o que entra e o que fica fora       |
| `docs/01-pesquisa-de-ferramentas.md`         | Ferramentas existentes e veredito                       |
| `docs/02-referencias-tecnicas.md`            | Artigos, métodos e fatos geométricos                    |
| `docs/03-licencas-e-reuso.md`                | O que pode ser reaproveitado e sob quais condições      |
| `docs/04-requisitos.md`                      | Requisitos funcionais e não funcionais                  |
| `docs/05-arquitetura.md`                     | Pacotes, camadas e fluxo de dados                       |
| `docs/06-modelo-de-dados.md`                 | Tipos, tabela de pontos e arquivo de projeto            |
| `docs/07-notacao-e-validacao.md`             | Dialetos, leitura de receitas e verificação de contagem |
| `docs/08-motor-direto.md`                    | Geometria → receita                                     |
| `docs/09-motor-reverso.md`                   | Receita → geometria; roteiro do tutorial                |
| `docs/10-saidas-receita-grafico-tutorial.md` | Receita, formato do gráfico, PDF e tutorial 3D          |
| `docs/11-interface.md`                       | Telas e interações                                      |
| `docs/12-roadmap.md`                         | Marcos com critérios de aceite                          |
| `docs/13-plano-de-testes.md`                 | Casos de teste com valores esperados                    |
| `docs/14-decisoes-e-riscos.md`               | Decisões, perguntas abertas e riscos                    |
| `docs/glossario.md`                          | Termos de crochê e do projeto                           |
| `docs/prompts/01-primeira-sessao.md`         | Prompts prontos para cada marco                         |
| `referencia/`                                | Material da sessão que deu origem ao projeto            |

## Licença

GPL-3.0-or-later. O arquivo `LICENSE` com o texto oficial é criado no marco M0. Origem de código e conteúdo de terceiros em `NOTICE.md`.
