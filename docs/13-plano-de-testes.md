# 13 — Plano de testes

Os valores numéricos deste documento foram calculados em código em 2026-11-10, com as regras de `08-motor-direto.md` e `09-motor-reverso.md`. São contrato: se um teste falhar, corrige-se o código. Se um valor parecer errado, parar e avisar o usuário.

## 1. Tipos de teste

| Tipo                  | Ferramenta                              | Onde                             |
| --------------------- | --------------------------------------- | -------------------------------- |
| Unidade               | Vitest                                  | `packages/*/test/`               |
| Propriedade           | fast-check                              | junto aos de unidade             |
| Valores de referência | Vitest com arquivos em `test/fixtures/` | motores e notação                |
| Captura de tela e PDF | Playwright                              | `e2e/` e `packages/charts/test/` |
| Navegador             | Playwright                              | `e2e/`                           |
| Desempenho            | Vitest `bench`                          | motores                          |

Todas as receitas de teste são escritas para o projeto. Não usar receitas publicadas por terceiros.

## 2. Receitas de referência

### P-BOLA: bola clássica

```
V1: 6 pb no anel mágico (6)
V2: 6 aum (12)
V3: (1 pb, 1 aum) x6 (18)
V4: (2 pb, 1 aum) x6 (24)
V5: (3 pb, 1 aum) x6 (30)
V6: (4 pb, 1 aum) x6 (36)
V7–12: 1 pb em cada ponto (36)
V13: (4 pb, 1 dim) x6 (30)
V14: (3 pb, 1 dim) x6 (24)
V15: (2 pb, 1 dim) x6 (18)
V16: (1 pb, 1 dim) x6 (12)
V17: 6 dim (6)
```

17 voltas, 432 pontos contados.

### P-TUBO

```
V1: 6 pb no anel mágico (6)
V2: 6 aum (12)
V3–12: 1 pb em cada ponto (12)
```

### P-BABADO

```
V1: 6 pb no anel mágico (6)
V2: 6 aum (12)
V3: 12 aum (24)
V4: 1 pb em cada ponto (24)
```

## 3. Validação e grafo (V)

| Caso | Entrada                                                                            | Resultado esperado                                                                                                                            |
| ---- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| V1   | P-BOLA                                                                             | Válida; contagens 6, 12, 18, 24, 30, 36 (×7), 30, 24, 18, 12, 6; total 432                                                                    |
| V2   | `(2 pb, 1 aum) x6` sobre 18 topos                                                  | Consome 18, produz 24                                                                                                                         |
| V3   | V1 e V2 de P-BOLA                                                                  | 19 nós: 1 de anel (não contado), 6 e 12. Cada nó da V2 tem 1 pai; cada nó da V1 é pai de exatamente 2 nós                                     |
| V4   | Linha A sobre 12 topos: `4 pb, 1 corr (não conta), 8 pb`; linha B: `12 pb`         | A produz 12 topos contados e 1 não contado. B consome os 12 contados e é válida. Variante B′: `4 pb, 1 pbx na corrente, 8 pb` também é válida |
| V5   | V3 de P-BOLA com total declarado 19                                                | `COUNT_MISMATCH`; status "Total declarado errado"; encontrado 18                                                                              |
| V6   | `(2 pb, 1 aum) x7` sobre 18 topos                                                  | `CONSUME_OVER`                                                                                                                                |
| V7   | `17 pb` sobre 18 topos                                                             | `CONSUME_UNDER`; status "Sobra 1 ponto"                                                                                                       |
| V8   | Volta fechada: `1 corr (não conta), 24 pb, pbx na corrente inicial` sobre 24 topos | Válida; total 24; a operação de fechamento não consome nem produz                                                                             |

## 4. Notação (N)

| Caso | Entrada                                            | Resultado esperado                                                                                       |
| ---- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| N1   | `pb pbx corr mpa pa pad aum dim am` em pt-BR       | Códigos `SC SL CH HDC DC TR`, aumento, diminuição, anel                                                  |
| N2   | `sc sl st ch hdc dc tr inc dec MR` em US           | Idem                                                                                                     |
| N3   | `dc htr tr dtr` em UK                              | `SC HDC DC TR`                                                                                           |
| N4   | `Rnd 2: 12 dc` sem dialeto definido                | `AMBIGUOUS_DIALECT`                                                                                      |
| N5   | `V3: (1 pb, 1 aum) x6 (18)`                        | Repetição de 6; total declarado 18                                                                       |
| N6   | `Rnd 3: [sc, inc] 6 times - 18 sts`                | Mesma forma canônica de N5                                                                               |
| N7   | `R3. *sc, inc* rep 6x [18]`                        | Mesma forma canônica de N5                                                                               |
| N8   | `V7–12: 1 pb em cada ponto (36)`                   | Uma linha com `repeatRows = 6` e 36 `SC`                                                                 |
| N9   | `[DCinc2, 1DC in next dc] six times - 18sts` em UK | Mesmos itens e total de N5 (18), na ordem escrita: aumento, ponto baixo (decisão do usuário, 2026-11-11) |
| N10  | Forma canônica de N5                               | Texto `V3: (1 pb, 1 aum) x6 (18)`                                                                        |
| N11  | Seis linhas iguais de 36 `SC`                      | Texto `V7–12: 1 pb em cada ponto (36)`                                                                   |
| N12  | P-BOLA escrita em UK, lida e escrita em pt-BR      | Texto idêntico ao de P-BOLA                                                                              |

## 5. Motor direto (F)

Casos F1 a F5 na tabela da seção 1.7 de `08-motor-direto.md`. Além deles:

| Caso | Verificação                                                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F6a  | F1 com `friendlyMultiple = 6` e `friendlyTolerance = 1,0`: contagens 6, 12, 18, 22, 27, 30, 33, 35, 36, 36, 35, 33, 30, 26, 22, 16, 11, 6 (total 434); aviso `FRIENDLY_SNAP` só na volta 3 (17 → 18)          |
| F6b  | F1 com `friendlyMultiple = 6` e `friendlyTolerance = 2,0`: contagens 6, 12, 18, 24, 27, 30, 33, 36, 36, 36, 36, 33, 30, 26, 22, 18, 12, 6 (total 441); avisos `FRIENDLY_SNAP` nas voltas 3, 4, 8, 11, 16 e 17 |
| F7   | De 12 para 17 pontos sem escalonamento: `1 pb, 1 aum, 1 pb, 1 aum, 2 pb, 1 aum, 1 pb, 1 aum, 1 pb, 1 aum, 1 pb`                                                                                               |
| F8   | De 18 para 24 pontos com escalonamento: em volta ímpar `(2 pb, 1 aum) x6`; em volta par `1 pb, 1 aum, (2 pb, 1 aum) x5, 1 pb`                                                                                 |
| F9   | Escalar perfil e amostra por 2 mantém as contagens de F1 a F5                                                                                                                                                 |

## 6. Motor reverso (R)

Com `w = 5 mm` e `h = 4,7746 mm`, salvo indicação.

| Caso | Entrada                                                                    | Resultado esperado                                                                                                                                                                               |
| ---- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1   | P-BOLA                                                                     | Raios 4,775; 9,549; 14,324; 19,099; 23,873; 28,648 com z = 0; seis voltas de raio 28,648 com z de 4,775 a 28,648; depois raios 23,873 a 4,775 com z = 28,648. Altura 28,65 mm, diâmetro 57,30 mm |
| R2   | P-BOLA                                                                     | `direto(reverso(P))` devolve as 17 contagens originais                                                                                                                                           |
| R3   | P-TUBO                                                                     | Raios 4,775 e 9,549 com z = 0; dez voltas de raio 9,549 com z de 4,775 a 47,746                                                                                                                  |
| R4   | P-BABADO                                                                   | Aviso `RUFFLE` na volta 3; raio 19,099 com z = 0 nessa volta                                                                                                                                     |
| R5   | Contagens de F3 (4, 6, 9, 13, 16, 19, 22, 25, 28, 31, 35, 38), `w = h = 5` | Perfil cônico; semiângulo médio entre a volta 2 e a 12 de 30,7°, com tolerância de 1°                                                                                                            |

## 7. Gráficos (G)

| Caso    | Conteúdo                                                       | Verificações                                                                               |
| ------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| G1      | Esfera F1, voltas 1 a 9, de dentro para fora, versão iniciante | Sem sobreposição; triângulo no primeiro ponto; quadrado no fim; 9 rótulos                  |
| G2      | Esfera F1, voltas 10 a 18, de fora para dentro                 | Volta 9 em cinza por fora; nota de direção presente                                        |
| G3      | Copo F4                                                        | Anel tracejado com etiqueta `6–12 · 25 pb`; quadrado de fim sobre o anel tracejado         |
| G4      | P-BOLA com a V17 trocada por `5 dim` (sobra 1 ponto)           | Círculo tracejado magenta no ponto não trabalhado; asterisco no rótulo; bloco de adaptação |
| G5      | P-BOLA com fio B nas voltas 7 a 9                              | Dois cartões de fio; legenda correta                                                       |
| G6      | Esfera F1, versão padrão                                       | Traço preto; sem totais por volta; marcas de início e fim presentes                        |
| G7 (M8) | Retângulo de 3 carreiras de 7 pontos                           | Gráfico retangular com setas de sentido                                                    |
| G8 (M8) | Peça em torno de corrente de 16                                | Corrente vertical com pontos dos dois lados                                                |

Verificações comuns a todos: SVG bem formado; `viewBox` A4; nenhum símbolo com altura menor que 4 mm exceto o ponto baixíssimo; legenda contém exatamente os símbolos usados; nenhum texto ultrapassa a margem.

## 8. Tutorial (T) e pintura (C)

| Caso | Verificação                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | P-BOLA gera 402 passos no roteiro antigo (um por ponto baixo, aumento ou diminuição); o modo de leitura (D-66) gera 129: 105 cadeias e 2 slides em cada um dos 12 marcos  |
| T2   | Cada passo de aumento tem 2 nós e 1 pai; cada passo de diminuição tem 1 nó e 2 pais                                                                                       |
| T3   | Alerta `rowStart` no primeiro passo de cada volta                                                                                                                         |
| R1   | Modo de leitura de P-BOLA: 12 marcos, 129 entradas (105 cadeias e 24 slides); volta 3 tem 12 cadeias com `(1 pb, 1 aum) x6` e "repetição i de 6"                          |
| R2   | `#marco texto` depois de uma volta vira marco, sai uma vez só ao imprimir (também com fios) e vai e volta no arquivo do projeto                                           |
| R3   | Teclas do modo de leitura: Espaço, →, ←, Backspace, ↑, ↓, Pg Up, Pg Dn, Home, End, F, R, 1 a 6, 0, Esc; Espaço não aciona o botão com foco; nada edita no modo de leitura |
| R4   | Layout salvo com a antiga janela Tutorial (ativa, sozinha numa folha, desligada, nomeado) abre sem erro                                                                   |
| C1   | Faixa do fio B entre as voltas 7 e 9 de P-BOLA: 108 pontos no fio B e duas trocas de fio                                                                                  |
| C2   | A mesma faixa, definida em milímetros de perfil, continua cobrindo a mesma região depois de mudar a amostra                                                               |

## 9. Propriedades gerais

1. `validate(print(parse(texto)))` aceita toda receita que `validate(parse(texto))` aceita.
2. `parse(print(p))` é igual a `p` para toda receita canônica `p`.
3. O total de nós contados do grafo é igual à soma das contagens das linhas.
4. Todo nó contado, exceto os da primeira linha, tem ao menos um pai.
5. Motor direto: propriedades da seção 5 de `08-motor-direto.md`.
6. Motor reverso: propriedades da seção 6 de `09-motor-reverso.md`.

## 10. Testes de navegador

| Fluxo                                                               | Marco |
| ------------------------------------------------------------------- | ----- |
| Abrir o aplicativo e ver a cena 3D                                  | M0    |
| Criar bola, editar perfil, ver receita mudar                        | M4    |
| Exportar PDF e conferir páginas                                     | M4    |
| Colar P-BOLA, ver tabela de verificação, converter em peça editável | M5    |
| Pintar faixa e ver trocas de fio                                    | M6    |
| Avançar o tutorial até o fim da volta 2                             | M7    |

## 11. Conferência com crochê real

Programa não substitui a peça na mão. Em M3, M5 e M8 o usuário crocheta ao menos uma forma de referência com a receita gerada e mede altura e diâmetro. Diferenças acima de 10% entram como defeito ou como ajuste de calibração.
