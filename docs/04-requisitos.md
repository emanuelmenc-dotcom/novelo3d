# 04 — Requisitos

Prioridade: **E** essencial para a primeira versão utilizável (até M6) · **I** importante (M7 a M9) · **D** desejável (M10 em diante).

## 1. Requisitos funcionais

### Modelagem

| ID    | Requisito                                                                          | Prio. | Marco |
| ----- | ---------------------------------------------------------------------------------- | ----- | ----- |
| RF-01 | Criar peça de revolução a partir de modelos iniciais (bola, ovo, cone, tubo, gota) | E     | M4    |
| RF-02 | Editar a curva de perfil por manipuladores, com pré-visualização 3D imediata       | E     | M4    |
| RF-03 | Definir início fechado (anel mágico) ou aberto, e fim fechado ou aberto            | E     | M4    |
| RF-04 | Informar quantidade da peça e espelhamento                                         | E     | M4    |
| RF-05 | Deformar a seção (achatar, criar saliência de um lado)                             | I     | M8    |
| RF-06 | Criar peças planas em carreiras e em torno de corrente de base                     | I     | M8    |
| RF-07 | Posicionar, girar e espelhar peças para montar o boneco                            | I     | M9    |
| RF-08 | Importar malha STL, OBJ ou GLB como peça livre                                     | D     | M10   |
| RF-09 | Esculpir com ferramentas simples (puxar, alisar, inflar)                           | D     | M10   |

### Fios e regiões

| ID    | Requisito                                                                    | Prio. | Marco |
| ----- | ---------------------------------------------------------------------------- | ----- | ----- |
| RF-10 | Manter paleta de fios com papel (primário, secundário, destaque), nome e cor | E     | M6    |
| RF-11 | Pintar faixa de voltas                                                       | E     | M6    |
| RF-12 | Pintar pontos individuais ou área com pincel sobre o 3D                      | E     | M6    |
| RF-13 | Refletir a pintura na receita (trocas de fio), no gráfico e no tutorial      | E     | M6    |
| RF-14 | Estimar consumo de fio por cor                                               | I     | M6    |

### Motor de pontos

| ID    | Requisito                                                                                                        | Prio. | Marco |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ----- | ----- |
| RF-20 | Converter peça de revolução em receita com ponto baixo, aumento e diminuição                                     | E     | M3    |
| RF-21 | Parâmetros: amostra, total inicial, escalonamento dos aumentos, contagens amigáveis, limite de aumento por ponto | E     | M3    |
| RF-22 | Avisar quando a forma não é realizável como modelada                                                             | E     | M3    |
| RF-23 | Permitir "congelar" a receita para ajuste manual de pontos                                                       | I     | M5    |
| RF-24 | Converter peça com seção não circular, concentrando aumentos onde o contorno cresce                              | I     | M8    |
| RF-25 | Suportar outros pontos (meio ponto alto, ponto alto, só alça de trás)                                            | I     | M8    |
| RF-26 | Converter malha livre, com segmentação de ramificações                                                           | D     | M10   |

### Receita importada

| ID    | Requisito                                                                  | Prio. | Marco  |
| ----- | -------------------------------------------------------------------------- | ----- | ------ |
| RF-30 | Colar receita em pt-BR, US ou UK e obter a forma canônica                  | E     | M1, M5 |
| RF-31 | Mostrar tabela de verificação por volta com contagem esperada e encontrada | E     | M1, M5 |
| RF-32 | Propor correções, aplicar só com confirmação e registrar como adaptação    | E     | M5     |
| RF-33 | Reconstruir o 3D de peças em voltas                                        | E     | M5     |
| RF-34 | Converter a peça reconstruída em geometria editável                        | E     | M5     |
| RF-35 | Reconstruir peças com assimetria, peças planas e peças com aberturas       | I     | M8     |
| RF-36 | Importar e exportar o subconjunto da linguagem do CrochetPARADE            | I     | M5     |

### Saídas

| ID    | Requisito                                                                                                       | Prio. | Marco  |
| ----- | --------------------------------------------------------------------------------------------------------------- | ----- | ------ |
| RF-40 | Receita escrita por peça, com materiais, amostra e medidas estimadas                                            | E     | M4     |
| RF-41 | Escolher o dialeto da receita de saída                                                                          | E     | M4     |
| RF-42 | Gráfico de símbolos por peça, versões padrão e iniciante, no formato de `10-saidas-receita-grafico-tutorial.md` | E     | M2     |
| RF-43 | Exportar SVG e PDF A4, por peça e documento completo                                                            | E     | M2, M4 |
| RF-44 | Página de pontos com símbolo, nome, abreviação e passo a passo                                                  | I     | M7     |
| RF-45 | Tutorial 3D passo a passo com ligação cruzada entre 3D, gráfico e texto                                         | I     | M7     |
| RF-46 | Guia de montagem com pontos de costura                                                                          | I     | M9     |

### Projeto

| ID    | Requisito                                          | Prio. | Marco |
| ----- | -------------------------------------------------- | ----- | ----- |
| RF-50 | Salvar automaticamente no navegador                | E     | M4    |
| RF-51 | Exportar e importar arquivo de projeto             | E     | M4    |
| RF-52 | Desfazer e refazer                                 | E     | M4    |
| RF-53 | Guardar o ponto em que o usuário parou no tutorial | I     | M7    |

## 2. Requisitos não funcionais

| ID     | Requisito                                             | Medida                                                                    |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| RNF-01 | Funcionar sem servidor e sem rede depois de carregado | Nenhuma chamada de rede em uso normal                                     |
| RNF-02 | Determinismo                                          | Saídas idênticas para a mesma entrada                                     |
| RNF-03 | Desempenho do motor direto                            | Peça de 3.000 pontos em menos de 100 ms                                   |
| RNF-04 | Desempenho do 3D                                      | 20.000 pontos a 60 quadros por segundo                                    |
| RNF-05 | Resposta da interface                                 | Receita e gráfico atualizados em menos de 300 ms após editar o perfil     |
| RNF-06 | Navegadores                                           | Versões atuais de Chrome, Edge e Firefox no Windows                       |
| RNF-07 | Idioma                                                | Interface em pt-BR; estrutura pronta para outros idiomas                  |
| RNF-08 | Impressão                                             | Páginas A4; símbolos com no mínimo 4 mm; legível em preto e branco        |
| RNF-09 | Acessibilidade                                        | Nenhuma informação só por cor; navegação por teclado nas ações principais |
| RNF-10 | Qualidade                                             | `npm run check` limpo; cobertura dos motores acima de 90% das linhas      |
| RNF-11 | Licença                                               | GPL-3.0-or-later; dependências compatíveis                                |
| RNF-12 | Privacidade                                           | Nenhum dado do usuário sai da máquina                                     |

## 3. Regras de negócio

| ID    | Regra                                                                       |
| ----- | --------------------------------------------------------------------------- |
| RN-01 | Toda receita passa pela validação de contagem antes de gerar qualquer saída |
| RN-02 | Divergências de contagem nunca são corrigidas em silêncio                   |
| RN-03 | Toda diferença em relação a uma receita importada é marcada como adaptação  |
| RN-04 | Siglas `dc` e `tr` nunca são interpretadas sem dialeto confirmado           |
| RN-05 | A transformação de montagem não altera contagens                            |
| RN-06 | Cada peça tem uma única fonte da verdade: geometria ou receita              |
