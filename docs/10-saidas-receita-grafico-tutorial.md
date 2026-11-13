# 10 — Saídas: receita, gráfico e tutorial

## 1. Receita escrita

- Uma seção por peça, com: nome, quantidade ("fazer 2"), fios, amostra, linhas da receita, notas e acabamento.
- Formato das linhas em `07-notacao-e-validacao.md`.
- Dialeto de saída escolhido pelo usuário; padrão pt-BR.
- Cabeçalho do documento: lista de materiais (fios com cor, agulha, enchimento, marcador), medidas finais estimadas e legenda das abreviações usadas.
- Exportação: texto simples, Markdown e PDF.

## 2. Gráfico de símbolos

O formato abaixo foi definido e aprovado pelo usuário na sessão de origem, em sucessivas revisões. A implementação de referência em Python está em `referencia/graficos-python/chart.py`. O pacote `charts` deve reproduzi-lo em TypeScript; mudanças de formato precisam de aprovação do usuário.

### 2.1 Página

| Item                     | Valor                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Tamanho                  | A4 retrato, `viewBox="0 0 210 297"` em milímetros                                            |
| Margens                  | 12 mm                                                                                        |
| Fonte                    | DejaVu Sans, com reserva Arial e sans-serif; no produto, embutir uma fonte livre com acentos |
| Título                   | 5,0 mm, negrito, em (12, 13)                                                                 |
| Subtítulo                | 3,0 mm, cinza `#555555`, em (12, 18,5): fio, quantidade e intervalo de voltas                |
| Rodapé                   | 2,2 mm, cinza `#777777`, alinhado à direita em y = 293,5: crédito da receita de origem       |
| Altura mínima de símbolo | 4 mm, exceto o ponto baixíssimo                                                              |

### 2.2 Cores

| Uso                                               | Cor                                      |
| ------------------------------------------------- | ---------------------------------------- |
| Traço padrão                                      | `#1a1a1a`                                |
| Voltas alternadas (iniciante)                     | `#1b4f8a` (azul) e `#b4521a` (laranja)   |
| Referência (volta anterior, pontos de outra peça) | `#9a9a9a`                                |
| Linhas de ligação e anéis tracejados              | `#8c8c8c`                                |
| Adaptações em relação ao original                 | `#c2185b` (magenta)                      |
| Início e sentido do trabalho                      | `#1e8449` (verde)                        |
| Fim                                               | `#d32f2f` (vermelho), contorno `#6d1111` |

A informação nunca depende só da cor: início é triângulo, fim é quadrado, adaptação tem asterisco.

### 2.3 Símbolos

Seguem o padrão do Craft Yarn Council; traço de 0,45 mm.

| Ponto                    | Desenho                                                                                           | Tamanho                             |
| ------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Ponto baixo              | "X"                                                                                               | 4,2 mm de altura, 3,4 mm de largura |
| Corrente                 | Elipse                                                                                            | Semieixos 2,3 e 0,75 mm             |
| Ponto baixíssimo         | Ponto cheio                                                                                       | Raio 0,95 mm                        |
| Meio ponto alto          | "T"                                                                                               | 6 mm de altura                      |
| Aumento                  | "V": duas pernas que saem do mesmo ponto de base, com um traço em cada perna                      | —                                   |
| Diminuição               | "Λ": duas pernas que partem dos dois pontos de base e se unem no topo, com um traço em cada perna | —                                   |
| k pontos fechados juntos | Como a diminuição, com k pernas                                                                   | Símbolo próprio para k = 4          |
| Anel mágico              | Círculo de raio 3,3 mm com pequena cauda e o texto "am"                                           | Símbolo próprio                     |
| Dedo                     | Correntes para fora, pontos baixos voltando pela corrente, ponto baixíssimo na base               | —                                   |
| Ponto não trabalhado     | Círculo tracejado magenta                                                                         | Raio 2,6 mm                         |

A legenda de cada página mostra só os símbolos usados nela, com nome e abreviação em português.

### 2.4 Gráfico circular (peças em voltas)

1. **Uma volta por anel.** Só voltas com aumento, diminuição ou outro evento são desenhadas com símbolos.
2. **Voltas lisas** (só ponto baixo) viram um anel fino tracejado na posição correta da sequência, com etiqueta cinza do tipo `15–16 · 23 pb`. Não há tabela de voltas lisas.
3. **Passo entre anéis:** 5,6 a 7,2 mm conforme a densidade; anel tracejado ocupa 2,5 a 3,0 mm.
4. **Sentido de leitura:** anti-horário, com seta verde "sentido do trabalho".
5. **Direção radial:** de dentro para fora quando a peça cresce; **de fora para dentro** quando a peça fecha (corpo que diminui). Nesse caso a volta anterior aparece em cinza por fora, como referência, e uma nota explica a direção.
6. **Peça longa** é dividida em páginas; a página seguinte começa com a última volta da anterior em cinza.
7. **Rótulo da volta:** etiqueta arredondada com o número, colocada no início da volta. Na versão para iniciantes ela tem a cor da volta e é precedida pelo total da volta entre parênteses, por exemplo `(23) 13`.
8. **Totais compostos** (por exemplo "6 pb + 3 dedos") vão para as notas, não para o rótulo.

### 2.5 Ligação entre pontos (método híbrido aprovado)

1. Cada símbolo é atraído para a posição angular do ponto de base. A atração é parcial (fator 0,12 na implementação de referência) para não gerar sobreposição.
2. As pernas do aumento saem do ponto de base e as da diminuição pousam nos pontos de base quando eles estão a até 3,8 mm (7,0 mm para 4 pontos juntos).
3. Quando um ponto precisou ficar a mais de 3,0 mm da posição do seu ponto de base, desenha-se uma linha cinza fina (0,3 mm) ligando os dois.
4. Os dois pontos de um aumento andam juntos no layout.
5. Nenhum símbolo pode sobrepor outro; a largura reservada por símbolo é 4,7 mm (ponto baixo e aumento), 5,2 mm (diminuição), 8,6 mm (4 juntos), 5,4 mm (corrente) e 3,2 mm (ponto baixíssimo).

### 2.6 Marcas de navegação

| Marca             | Significado                | Posição                                                                                                      |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Triângulo verde   | Primeiro ponto do diagrama | Ao lado do primeiro ponto, do lado da volta anterior, apontando para ele                                     |
| Quadrado vermelho | Último ponto do diagrama   | Ao lado do último ponto, do lado da volta seguinte; sobre o anel tracejado se a peça termina em voltas lisas |
| Marcas numeradas  | Peça com mais de um início | `▲1/■1`, `▲2/■2`, explicadas em nota                                                                         |
| Seta verde curva  | Sentido do trabalho        | Fora do último anel                                                                                          |

Em peça dividida em páginas, cada página tem seu triângulo e seu quadrado, e a nota "continua na página seguinte".

### 2.7 Ajudas da versão para iniciantes

- Cores alternadas entre voltas consecutivas.
- Rótulo colorido no início de cada volta.
- Total de pontos ao fim de cada volta.
- Seta de sentido e marcas de início e fim.

A versão padrão usa traço preto, mantém números de volta, legenda e marcas de início e fim.

### 2.8 Cartão de fio

- Canto superior direito, logo abaixo do título, 47 × 7,4 mm, sem deslocar o gráfico.
- Conteúdo: amostra circular da cor, "Fio A · cor primária" e "recomendada: verde musgo".
- Um cartão por fio usado na peça, alinhados à direita.

### 2.9 Adaptações em relação à receita de origem

- Asterisco e contorno magenta no rótulo da volta afetada.
- Elementos alterados desenhados em magenta (por exemplo, a corrente acrescentada).
- Bloco "Adaptação em relação ao original" em magenta no rodapé da página, dizendo o que o original dizia, o que foi desenhado e por quê.

### 2.10 Outros tipos de gráfico

| Peça                                    | Gráfico                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| Carreiras de ida e volta                | Retangular; setas verdes indicam o sentido de cada carreira; corrente de virada desenhada |
| Voltas em torno de uma corrente de base | Corrente na vertical, pontos dos dois lados, pontas arredondadas                          |
| Peça trabalhada sobre outra             | Pontos da peça de base em cinza, com legenda de onde vêm                                  |

### 2.11 Notas da página

Ordem fixa: legenda, tabela "Carreira de início" (só quando há corrente de base), "Notas" e "Adaptação em relação ao original". As notas explicam instruções que o gráfico não mostra sozinho: correntes que não contam, onde pular pontos, quando colocar olhos e enchimento.

### 2.12 Página de pontos

Primeira página do documento para iniciantes.

- Uma linha por ponto usado: símbolo, nome, abreviação, fotos numeradas de cada etapa com legenda curta e, quando não há foto, o passo a passo mais curto possível.
- Fotos de licença livre do Wikimedia Commons (CC BY-SA 4.0), com crédito no rodapé:
  - corrente, ponto baixíssimo, ponto baixo e meio ponto alto: séries "Crochet Chain Stitch (Step 1–2)", "Crochet Slip Stitch (Step 1–3)", "Crochet Single Stitch (Step 1–4)" e "Crochet Half Double Stitch (Step 1–5)", de Stilfehler;
  - anel mágico: "Szydełkowe magiczne kółko" e "Półsłupki w magicznym kółku", de Valki77.
- Aumento, diminuição e pontos fechados juntos não têm série de fotos conferida; usam descrição. O usuário pretende acrescentar fotos próprias em uma versão futura.
- Blocos finais: conversão de termos usada, "Como ler os gráficos" e créditos.

### 2.13 Nomes de arquivo

`<projeto>_<letra>_<peça>_<versão>.svg` e `.pdf`, por exemplo `sapo_A_cabeca-corpo_iniciante.pdf`. Peça em mais de uma página: sufixo `_p1`, `_p2` nos SVG e um PDF único. Documento completo: `<projeto>_completo_<versão>.pdf`.

### 2.14 Conferência visual obrigatória

Depois de gerar, converter cada página em imagem e inspecionar: sobreposição de símbolos, rótulos cortados, texto encostando no rodapé, linhas de ligação longas demais. No projeto, isso vira teste de captura de tela com Playwright, mais uma checagem automática de sobreposição de caixas delimitadoras.

## 3. PDF

- Rota principal: jspdf + svg2pdf.js, com fonte livre embutida que tenha os acentos do português. Conferir a licença da fonte antes de embutir.
- Rota de reserva: folha de estilo de impressão com `@page { size: A4; margin: 0 }` e "Salvar como PDF" do navegador.
- Teste de aceitação: o PDF tem o número esperado de páginas, tamanho A4, e o texto "ç", "ã" e "é" aparece corretamente.

## 4. Tutorial 3D

Usa o roteiro de passos descrito em `09-motor-reverso.md`.

| Elemento        | Comportamento                                                                            |
| --------------- | ---------------------------------------------------------------------------------------- |
| Modelo          | Pontos feitos em cor cheia; pontos por fazer translúcidos ou ocultos                     |
| Passo atual     | Ponto destacado; pontos de base (onde a agulha entra) com contorno                       |
| Texto           | "Volta 5, ponto 13 de 33: aumento, 2 pontos baixos no mesmo ponto"                       |
| Controles       | Anterior, próximo, tocar, pausar, velocidade, ir para a volta                            |
| Câmera          | Segue o ponto atual, com opção de câmera livre                                           |
| Avisos          | Troca de fio, início e fim de volta, colocar marcador, encher agora, adaptação           |
| Ligação cruzada | Clicar em um ponto no 3D destaca o símbolo no gráfico e a linha na receita, e vice-versa |
| Progresso       | Contador de pontos e de voltas; o ponto em que o usuário parou é salvo no projeto        |

Representação do ponto no 3D (D-57): o mesmo desenho do 3D de edição, no estilo CrochetPARADE: fio em segmentos ao longo das ligações do grafo, colorido por ponto, com opção "Só linhas". Pontos feitos em cor cheia e por fazer esmaecidos ou ocultos se obtêm pintando os segmentos por estado. Não depende dos modelos realistas de ponto nem do render, que estão pausados.

## 5. Tabela de verificação

Exportável junto com as demais saídas, no formato de `07-notacao-e-validacao.md`. Em receitas importadas, é a primeira página do relatório.
