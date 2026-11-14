# 17 — Atualização dos gráficos (versão 3)

Data: 2026-11-13 (anexo recebido; guardado em 2026-11-14 como `17`, com as decisões D-17 a D-21 do anexo renumeradas para D-60 a D-64 porque os números originais já estavam em uso). Mudanças no formato do gráfico aprovadas pelo usuário depois do pacote de contexto de 2026-11-11. Só afetam o pacote `charts` (marco M2) e a parte de notação usada pela tabela. Este documento **complementa e, onde conflita, substitui** `10-saidas-receita-grafico-tutorial.md`.

> **Guardado em 2026-11-14.** O anexo original trazia exemplos tirados de uma receita comercial (a do sapo e a do vestido). Eles foram **trocados por linhas escritas para o projeto** (com outras contagens) ou removidos, porque o repositório é público e não pode conter receita de terceiros. Os números dos casos G9 a G16 continuam, mas G13 e G14 usam linhas próprias. A cópia original, com os exemplos, fica só no computador do usuário. As abreviações da tabela (seção 4.3) são as de pt-BR; outros dialetos ainda não têm tabela própria.

## 0. Tarefa para o Claude Code

1. Ler este documento inteiro.
2. Copiar `referencia/graficos-python/v3.py` e o `chart.py` atualizado para a pasta do projeto, substituindo o `chart.py` anterior.
3. (Item do anexo original sobre uma pasta privada: não se aplica ao repositório.)
4. Atualizar `docs/10-saidas-receita-grafico-tutorial.md` conforme a seção 7 deste documento.
5. Acrescentar ao `docs/13-plano-de-testes.md` os casos da seção 8.
6. Registrar as decisões da seção 9 em `docs/14-decisoes-e-riscos.md`.
7. Não escrever código de produto agora se o marco M2 ainda não começou. Só documentação e referência.

## 1. Resumo das mudanças

| #   | Mudança                                                                      | Substitui                            |
| --- | ---------------------------------------------------------------------------- | ------------------------------------ |
| 1   | Faixa translúcida atrás de cada sequência de 5 ou mais pb seguidos           | Nada (novo)                          |
| 2   | Etiqueta "Nx" (ex.: `17x`) junto ao **primeiro** ponto da sequência          | Nada (novo)                          |
| 3   | Tabela "Receita volta a volta" com símbolo + abreviação, uma linha por volta | A legenda de símbolos de cada página |
| 4   | Faixa de marcas de uma linha (o que não é ponto)                             | Parte da legenda                     |
| 5   | Carreira de início (corrente de base) vira a primeira linha da tabela        | Tabela "Carreira de início"          |
| 6   | Página de continuação quando a tabela não cabe                               | Nada (novo)                          |

O resto do formato (símbolos, cores, anéis tracejados, ligação híbrida, marcas de início e fim, cartão de fio, adaptações em magenta) não mudou.

## 2. Faixa de pb seguidos

- **Quando:** sequência de pontos baixos consecutivos (`typ == "pb"`) de comprimento **≥ 5** dentro de uma mesma volta. Aumentos, diminuições, correntes e pbx interrompem a sequência. Não atravessa o fim da volta.
- **Desenho:** traço grosso com pontas arredondadas, **por trás** dos símbolos (desenhar antes deles).
  - cor = cor da volta; `stroke-opacity 0.17`; largura 5,0 mm; `stroke-linecap: round`;
  - gráfico circular: arco no raio da volta, de `a_primeiro − 1,2/r` a `a_último + 1,2/r`;
  - gráfico linear ou retangular: segmentos retos ligando os centros dos pontos; quando a sequência dobra uma esquina (coluna → ponta → coluna), um segmento por trecho.
- **Constante:** `MINRUN = 5` em `v3.py`.

## 3. Etiqueta "Nx"

- **Texto:** número de pontos da sequência seguido de "x": `17x`.
- **Posição:** junto ao **primeiro** ponto da sequência no sentido do trabalho.
- **Desenho:** retângulo arredondado branco, contorno 0,25 mm na cor da volta, altura 2,4 mm, largura `1,45·len(texto) + 1,4` mm; texto 2,1 mm, negrito, na cor da volta.
- **Escolha do lado (gráfico circular):** testar os deslocamentos radiais `+3,1, −3,1, +2,6, −2,6` mm a partir do raio da volta; ficar com o que tem maior distância ao símbolo mais próximo de **todas** as voltas da página e às etiquetas já colocadas. Por isso as etiquetas são posicionadas **depois** de desenhar todas as voltas (fila `PENDING` em `v3.py`).
- **Gráficos lineares:** posição fixa ao lado do primeiro ponto, no vão entre colunas ou carreiras.

## 4. Tabela "Receita volta a volta"

Substitui a legenda: cada linha associa o símbolo à abreviação, na ordem em que os pontos são feitos.

### 4.1 Layout

| Item             | Valor                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Título           | "Receita volta a volta", 3,4 mm negrito; subtítulo cinza "símbolo + abreviação, na ordem em que os pontos são feitos" (omitido se a largura < 120 mm) |
| Largura          | 186 mm (página inteira) ou 94 mm (coluna)                                                                                                             |
| Cabeçalho        | Faixa `#eeeeee` de 5 mm: "Volta", "Sequência de pontos", "Total"                                                                                      |
| Coluna Volta     | Etiqueta igual à do diagrama (mesma cor da volta); contorno magenta e asterisco se a volta tem adaptação                                              |
| Coluna Sequência | Começa em x0 + 17 mm; quebra de linha automática antes de x0 + W − 20 mm                                                                              |
| Coluna Total     | `(n)` na cor da volta, centrado em x0 + W − 9 mm                                                                                                      |
| Altura da linha  | 5,6 mm; cada linha extra de quebra soma 4,7 mm                                                                                                        |
| Separador        | Linha `#d6d6d6`, 0,2 mm                                                                                                                               |

### 4.2 Formato de cada item

`<n>x [símbolo] <abrev>;` — por exemplo `2x [X] pb; 3x [V] aum; 4x [X] pb`.

- `n` em negrito 2,7 mm; símbolo em escala de tabela (cerca de 3,6 a 4 mm), na cor da volta; abreviação 2,7 mm normal; ponto e vírgula entre itens, nenhum depois do último.
- Aumento conta como 1 item (o par de pb no mesmo ponto).
- Itens iguais consecutivos são somados (codificação por sequência).
- Anel mágico: prefixo `[○] am:` na primeira volta.
- Instrução curta da volta (ex.: "arrematar") em itálico cinza 2,4 mm depois do último item.

### 4.3 Abreviações e símbolos da tabela

| Chave interna | Abreviação    | Símbolo                                                                                |
| ------------- | ------------- | -------------------------------------------------------------------------------------- |
| `pb`          | pb            | X                                                                                      |
| `aum`         | aum           | V com traço em cada perna                                                              |
| `dim`         | dim           | Λ com traço em cada perna                                                              |
| `d4`          | pb4jun        | Λ com 4 pernas                                                                         |
| `ch`          | corr          | elipse                                                                                 |
| `ch0`         | corr*         | elipse (corrente que **não conta**; explicar `corr*` nas notas)                        |
| `pbx`         | pbx           | ponto cheio                                                                            |
| `pbxj`        | pbx           | ponto cheio (pbx **sem ponto de base**, que fecha a volta; nunca se soma a outros pbx) |
| `mpa`         | mpa           | T                                                                                      |
| `unw`         | não trab.     | círculo tracejado magenta                                                              |
| `am`          | am            | círculo                                                                                |
| marcador      | `\| <texto>:` | — (texto livre quando a volta se divide)                                               |

### 4.4 Agrupamento de repetições

1. Separar o **início** (itens `am` e `ch0` com contagem 1) e o **fim** (itens `pbxj`).
2. No meio, procurar o menor período `p ∈ {1, 2, 3, 4}` que, repetido `k ≥ 2` vezes, cobre o meio inteiro.
3. Se achar, escrever `início (bloco) ×k; fim`. Exemplo do projeto: volta `1 corr (não conta), (2 pb, pular 1, 1 corr) x9, pbx, pbx` dá `1x corr*; (2x pb; 1x corr) ×9; 2x pbx`.
4. Se não, escrever a sequência por extenso, com quebra de linha.

### 4.5 Linhas especiais

- **Voltas só de pb** (anel tracejado no diagrama): linha com etiqueta cinza, um traço tracejado antes da sequência e `Nx pb`. Em peças de voltas fechadas: `1x corr*; Nx pb; 1x pbx`. Texto complementar do anel vai em itálico.
- **Corrente de base / carreira de início:** primeira linha, etiqueta cinza-escuro (`#555555`).
- **Total da volta:** número de pontos contados. Totais compostos (ex.: "6 pb + 3 pbx") continuam nas notas.

## 5. Faixa de marcas

Uma linha logo abaixo da tabela, com o que não é ponto. Quebra para uma segunda linha se passar de x ≈ 175 mm.

| Chave  | Desenho                            | Texto                                              |
| ------ | ---------------------------------- | -------------------------------------------------- |
| `ini`  | triângulo verde                    | primeiro ponto                                     |
| `fim`  | quadrado vermelho                  | último ponto                                       |
| `lig`  | traço cinza fino                   | ligação ao ponto de baixo                          |
| `liso` | traço tracejado                    | volta só de pb (só se a página tem anel tracejado) |
| `run`  | faixa translúcida + etiqueta `15x` | pb seguidos                                        |
| `ref`  | X cinza                            | ponto de outra volta (referência) (só se usado)    |
| `unw`  | círculo tracejado magenta          | ponto não trabalhado (só se usado)                 |

Notas da página ganham a linha padrão: "Etiqueta = número e início da volta; (n) = total. Faixa clara = pb seguidos (5 ou mais); o número fica no 1º ponto." Notas que repetem a tabela devem ser removidas.

## 6. Ordem e paginação

Ordem vertical na página: diagrama → tabela → faixa de marcas → Notas → Adaptação em relação ao original (magenta).

Regra de paginação:

```
y0   = base do diagrama + 14 mm
need = altura(tabela) + 10 + altura(notas) + 6 + altura(adaptação) + 6
se y0 + need ≤ 287 mm: tudo na mesma página
senão: página 1 = diagrama + faixa de marcas + notas + adaptação
       página 2 = mesmo título com " (receita)" + tabela
```

Antes de criar a página de continuação, tentar compactar o diagrama (passo entre voltas até 5,9 mm, raio inicial menor, centro mais alto) desde que a altura mínima de símbolo e a ausência de sobreposição se mantenham.

## 7. Mudanças a fazer em `10-saidas-receita-grafico-tutorial.md`

| Seção                | Mudança                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.3 Símbolos         | Trocar "A legenda de cada página mostra só os símbolos usados nela" por "Cada página tem a tabela Receita volta a volta (seção 4 de `17-…`), que associa símbolo e abreviação; não há legenda separada" |
| 2.4 Gráfico circular | Acrescentar: faixa de pb seguidos e etiqueta "Nx" (seções 2 e 3 deste documento)                                                                                                                        |
| 2.6 Marcas           | Acrescentar a faixa de marcas de uma linha (seção 5)                                                                                                                                                    |
| 2.10 Outros gráficos | Linear e retangular: faixas retas; tabela de 94 mm na coluna quando houver                                                                                                                              |
| 2.11 Notas da página | Nova ordem: tabela, faixa de marcas, Notas, Adaptação; remover a tabela "Carreira de início"                                                                                                            |
| Novo item            | Regra de paginação da seção 6                                                                                                                                                                           |

## 8. Casos de teste novos (`13-plano-de-testes.md`)

Usar as receitas de teste do projeto (P-BOLA, P-TUBO), nunca receita de terceiros.

| Caso | Entrada                                                                                                               | Esperado                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| G9   | P-BOLA, volta 13: `(4 pb, 1 dim) x6`                                                                                  | Nenhuma faixa (sequências de 4 pb)                                       |
| G10  | P-BOLA, voltas 7–12 (36 pb) desenhadas como anel                                                                      | Uma faixa e etiqueta `36x` junto ao 1º ponto                             |
| G11  | Volta `2 pb, 1 aum, 6 pb, 1 aum, 2 pb`                                                                                | Uma faixa só sobre os 6 pb; etiqueta `6x`                                |
| G12  | Tabela de P-BOLA, volta 3                                                                                             | `(1x aum; 1x pb) ×6` com total `(18)`                                    |
| G13  | Volta fechada `1 corr (não conta), (2 pb, pular 1, 1 corr) x9, pbx, pbx` (linha escrita para o projeto)               | `1x corr*; (2x pb; 1x corr) ×9; 2x pbx`                                  |
| G14  | Volta fechada com `2 corr (não conta), 4 pb, 3 pbx, 4 pb, 3 pbx` e o pbx de fechamento (linha escrita para o projeto) | `2x corr*; (4x pb; 3x pbx) ×2; 1x pbx` (o pbx de fechamento não se soma) |
| G15  | Página com 18 voltas desenhadas e tabela longa                                                                        | Tabela em página de continuação com título "(receita)"                   |
| G16  | Duas sequências em voltas vizinhas com o 1º ponto no mesmo ângulo                                                     | Etiquetas não se sobrepõem                                               |

Verificação comum: nenhuma etiqueta "Nx" sobrepõe símbolo ou outra etiqueta; a tabela não ultrapassa a margem direita; nenhuma linha da tabela tem item sem símbolo.

## 9. Decisões para `14-decisoes-e-riscos.md`

| ID   | Data       | Decisão                                                                                                                    | Quem decidiu                                 |
| ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| D-60 | 2026-11-13 | Faixa translúcida + etiqueta "Nx" no 1º ponto para sequências de 5 ou mais pb                                              | Usuário                                      |
| D-61 | 2026-11-13 | Tabela "Receita volta a volta" (símbolo + abreviação) substitui a legenda de cada página                                   | Usuário                                      |
| D-62 | 2026-11-13 | Repetições agrupadas como `(bloco) ×k` na tabela, separando corr* inicial e pbx de fechamento                              | Recomendação aprovada                        |
| D-63 | 2026-11-13 | Tabela em página de continuação quando não cabe com o diagrama                                                             | Recomendação aprovada                        |
| D-64 | 2026-11-13 | Corrente inicial que não conta só existe em voltas fechadas e carreiras; peças em espiral não começam a volta com corrente | Interpretação confirmada no padrão de origem |

## 10. Arquivos de referência

| Arquivo                               | Conteúdo                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `referencia/graficos-python/v3.py`    | Faixas, etiquetas, tabela, faixa de marcas, agrupamento. Funções: `find_runs`, `band_arc`, `band_line`, `run_bands`, `run_labels`, `place_labels`, `count_tag`, `units`, `rle`, `compress`, `tokens_of`, `tsym`, `recipe_table`, `table_height`, `plain_row`, `mark_strip`, `strip_keys` |
| `referencia/graficos-python/chart.py` | Biblioteca base (sem mudança de comportamento desde 2026-11-11; recopiada para garantir a versão usada)                                                                                                                                                                                  |

Observações para o porte em TypeScript: `v3.py` mede a tabela desenhando em um objeto falso (`Null`) antes de desenhar de verdade; no produto, separar medição e desenho em funções puras. As larguras de texto são estimadas por número de caracteres; no produto, medir com a fonte embutida.

## 11. O que está feito e o que ficou de fora (2026-11-14)

Feito no gráfico circular (`packages/charts`): faixa de pb seguidos e etiqueta "Nx" (seções 2 e 3); tabela "Receita volta a volta" com símbolo e abreviação, repetições `(bloco) ×k`, início (corr*, am) e fim (pbx de fechamento, `join`) separados, cor cinza nas voltas lisas, `pa` e `pad` (seção 4); faixa de marcas com primeiro ponto, último ponto, volta lisa, pb seguidos e ponto de referência (seção 5); ordem diagrama, tabela, marcas e notas, com o diagrama subindo e encolhendo até 85% e a tabela indo para uma página "(receita)" quando não cabe (seção 6). A versão padrão (sem iniciantes) deixou de ter total no diagrama, mas a tabela traz o total nas duas versões; o teste que afirmava o contrário foi trocado.

**Ficou de fora** (a aprovação visual vale só para o que existe):

- marcadores dentro da volta (`| texto:`): a receita não os produz hoje (`#marco` é por linha, para o modo de leitura);
- instrução curta depois da sequência ("arrematar" etc.) e o texto complementar do anel liso;
- carreira de início (corrente de base) como primeira linha própria e a etiqueta cinza-escura dela;
- compactação do diagrama além de subir e encolher (passo entre voltas de 5,9 mm, raio inicial menor);
- marca `lig` (não há linhas de ligação no gráfico), `unw` e as adaptações em magenta;
- gráficos linear e retangular, faixas retas e a tabela de 94 mm em coluna;
- faixa e etiqueta nos anéis lisos tracejados (pergunta 9 de `docs/12`);
- abreviações de outros dialetos (a tabela é pt-BR) e a medida de texto com a fonte real (usa o número de caracteres).
