# 00 — Visão e escopo

> Revisado em 2026-11-11: abordagem standalone com interoperabilidade opcional; núcleo em grafo de pontos; revolução deixa de ser limite de escopo. Ver D-17 a D-20 em `14-decisoes-e-riscos.md`.

## 1. O que é

**Novelo3D** (nome provisório; conferir disponibilidade antes de publicar) é um aplicativo web local para projetar peças de crochê (amigurumi em primeiro lugar) e, depois de provada a viabilidade, de tricô. O usuário importa ou escreve uma receita, ou modela uma forma; o programa mantém um **grafo de pontos** e, a partir dele, gera a verificação de contagem, a receita, o gráfico de símbolos, a visualização 3D com pintura de fios e o tutorial passo a passo.

O CrochetPARADE e o Crochet Charts são referências e fontes de interoperabilidade (leitura e escrita da linguagem de receita, símbolos SVG). O Novelo3D **não depende** deles para funcionar.

## 2. Para quem

| Perfil                      | Necessidade principal                                                    |
| --------------------------- | ------------------------------------------------------------------------ |
| Quem cria amigurumis        | Testar a forma antes de crochetar e obter receita com contagens corretas |
| Quem está aprendendo        | Seguir gráfico e tutorial 3D com ajudas de leitura                       |
| Quem tem uma receita pronta | Conferir contagens, ver a forma e gerar o gráfico                        |

O mantenedor tem conhecimento básico de programação e desenvolve com o Claude Code no Windows. Documentação e interface em português do Brasil.

## 3. Fluxos principais

1. **Importar (receita → grafo).** Colar receita escrita (ou texto do CrochetPARADE) → conferir transcrição e contagens → ver gráfico e 3D.
2. **Gerar (forma → grafo).** Geradores paramétricos (perfil de revolução, cilindros, cones, peças achatadas) e, mais tarde, malha livre → grafo → receita.
3. **Trabalhar sobre o grafo.** Pintar regiões de fio, editar pontos, seguir o tutorial; todas as vistas consultam o mesmo grafo.

## 4. Princípios de produto

1. **A contagem manda.** O grafo é a fonte da verdade; nenhuma saída esconde divergência de contagem.
2. **O grafo é o núcleo; a malha 3D é derivada.** Posições 3D são calculadas por layout a partir do grafo e servem para visualizar, pintar e selecionar. Receita é topologia; forma depende de fio, tensão e enchimento.
3. **Determinismo.** Mesma entrada, mesma saída. Sem IA nem servidor.
4. **Local e privado.** Tudo roda no navegador.
5. **Receita com cara de receita.** Repetições e totais, não listas de milhares de pontos.
6. **Adaptações visíveis.** Tudo o que o programa interpretar ou mudar aparece marcado.
7. **Neutro de técnica.** Crochê e tricô são atributos do ponto, para que tricô entre sem refazer o núcleo.

## 5. Escopo por marco (ver `12-roadmap.md`)

- P1 — importar receita, verificar contagem, gráfico circular com símbolos, exportar texto CP.
- P2 — visualização 3D ponto a ponto com seleção ligada ao gráfico e à receita.
- P3 — pintura de regiões de fio, trocas na receita, consumo por cor. **Fim de P3 = primeira versão utilizável.**
- P4 — tutorial passo a passo.
- P5 — modelagem por peças além da revolução; malha livre (STL → grafo) por último.
- P6 — tricô e conversão tricô↔crochê, **somente se** a Fase 0 provar viabilidade.

## 6. Fora do escopo

| Item                                                 | Situação                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Importar gráfico a partir de imagem (foto, PNG, PDF) | Fora: exigiria IA ou visão computacional (D-13). Só arquivos estruturados |
| Geração por IA a partir de foto ou texto             | Sem previsão                                                              |
| Roupas, mantas e crochê plano em geral               | Sem previsão                                                              |
| Versão móvel dedicada                                | Sem previsão                                                              |
| Simulação física completa do enchimento              | Só depois de P5, se a conferência com peças reais pedir                   |

## 7. Critérios de sucesso

1. Para esfera, cone, cilindro e ovo, a receita gerada bate com os valores do plano de testes.
2. Receita → grafo → receita devolve as mesmas contagens por volta.
3. Uma pessoa experiente crocheta a partir do gráfico padrão; uma iniciante, a partir do gráfico com ajudas.
4. O usuário cria, do zero ou por importação, um amigurumi simples de duas cores e imprime a receita em menos de 30 minutos.
