# 07 — Notação, leitura de receitas e validação

## 1. Dialetos

A forma canônica interna usa códigos em inglês (padrão US). Os dialetos só existem na leitura e na escrita.

| Canônico         | pt-BR                         | en-US                     | en-UK                  |
| ---------------- | ----------------------------- | ------------------------- | ---------------------- |
| `CH`             | corrente (corr)               | chain (ch)                | chain (ch)             |
| `SL`             | ponto baixíssimo (pbx)        | slip stitch (sl st)       | slip stitch (ss)       |
| `SC`             | ponto baixo (pb)              | single crochet (sc)       | double crochet (dc)    |
| `HDC`            | meio ponto alto (mpa)         | half double crochet (hdc) | half treble (htr)      |
| `DC`             | ponto alto (pa)               | double crochet (dc)       | treble (tr)            |
| `TR`             | ponto alto duplo (pad)        | treble (tr)               | double treble (dtr)    |
| aumento          | aumento (aum)                 | increase (inc)            | increase (inc), DCinc2 |
| diminuição       | diminuição (dim)              | decrease (dec), sc2tog    | decrease (dec), dc2tog |
| k juntos         | pb{k}jun                      | sc{k}tog                  | dc{k}tog               |
| anel mágico      | anel mágico (am)              | magic ring (MR)           | magic ring, magic loop |
| volta / carreira | volta (V), carreira (C, carr) | round (Rnd, R), row       | round, row             |
| pular            | pular                         | skip (sk)                 | miss, skip             |

**Armadilha US × UK.** As siglas `dc` e `tr` significam pontos diferentes nos dois dialetos. O analisador nunca adivinha: o dialeto vem da escolha do usuário ou de uma detecção com confirmação.

Heurística de detecção, sempre confirmada pelo usuário:

1. Se aparecer `sc`, o dialeto é US.
2. Se aparecer `htr`, `dtr`, `miss` ou a forma `DC2tog` sem nenhum `sc`, o dialeto provável é UK.
3. Se aparecer `pb`, `pbx`, `aum`, `dim` ou `corr`, é pt-BR.
4. Se a legenda da própria receita definir as abreviações, ela prevalece.

## 2. Gramática aceita na leitura

A leitura é tolerante: aceita as variações comuns e relata o que não entendeu, em vez de falhar.

```
receita     := linha+
linha       := rotulo? separador? instrucoes total? 
rotulo      := ("V" | "Volta" | "R" | "Rnd" | "Round" | "C" | "Carr" | "Row") numero ( ("-" | "–" | "a" | "to") numero )?
separador   := ":" | "." | ")" 
instrucoes  := item ( ("," | ";" | "e" | "and" | "then") item )*
item        := repeticao | ponto | pular | alvo
repeticao   := grupo vezes | "*" instrucoes "*" "rep" numero "x"?
grupo       := "(" instrucoes ")" | "[" instrucoes "]"
vezes       := ("x" | "×" | "*") numero | numero ("x" | "vezes" | "times")
ponto       := numero? termo ("em cada um dos próximos" numero)? modificador?
termo       := abreviação ou nome do dialeto ativo
pular       := ("pular" | "skip" | "sk" | "miss") numero termo?
alvo        := ponto ("na" | "no" | "in") ("corrente" | "anel" | "ring" | "ch") 
total       := ("(" | "[" | "-" | "–" | "=") numero ("pts" | "sts" | termo)? (")" | "]")?
```

Formas que devem ser reconhecidas, com o mesmo resultado:

| Texto                                                           | Interpretação                                    |
| --------------------------------------------------------------- | ------------------------------------------------ |
| `V3: (1 pb, 1 aum) x6 (18)`                                     | 6 repetições de pb e aumento; total declarado 18 |
| `Rnd 3: [sc, inc] 6 times - 18 sts`                             | idem                                             |
| `R3. *sc, inc* rep 6x [18]`                                     | idem                                             |
| `Round 3: inc) [DCinc2, 1DC in next dc] six times - 18sts` (UK) | idem, com números por extenso                    |
| `V5–9: 1 pb em cada ponto (30)`                                 | 5 voltas de 30 pb; `repeatRows = 5`              |
| `6 pb no anel mágico`                                           | início em anel com 6 pb                          |
| `1 corr (não conta)`                                            | corrente com `counted: false`                    |

Regras de tolerância:

1. Números por extenso de um a vinte são aceitos em português e inglês.
2. "em cada ponto", "around", "in each st" produzem tantos pontos quantos topos contados houver na linha anterior.
3. "até o fim", "to end" preenche com o ponto indicado até consumir a linha anterior.
4. Texto entre parênteses que não seja total nem repetição vira `note`.
5. Tudo o que sobrar sem interpretação gera um aviso `UNPARSED_TEXT` com o trecho.

O analisador é escrito à mão (tokenizador com dicionário por dialeto e descida recursiva). A gramática é pequena e as mensagens de erro precisam ser específicas e em português, o que é mais simples sem gerador de analisadores.

## 3. Validação

Para cada linha, `core.validate()` expande as repetições e simula o trabalho sobre os topos da linha anterior.

Verificações:

| Código               | Condição                                                        | Gravidade                           |
| -------------------- | --------------------------------------------------------------- | ----------------------------------- |
| `CONSUME_UNDER`      | A linha consome menos topos contados do que a anterior produziu | Aviso (sobram pontos sem trabalhar) |
| `CONSUME_OVER`       | A linha tenta consumir mais topos do que existem                | Erro                                |
| `COUNT_MISMATCH`     | Total produzido difere do total declarado                       | Erro                                |
| `FIRST_ROW_NO_START` | Primeira linha sem anel, corrente ou base                       | Erro                                |
| `STEEP_INCREASE`     | Total maior que o dobro da linha anterior                       | Aviso                               |
| `STEEP_DECREASE`     | Total menor que a metade da linha anterior                      | Aviso                               |
| `UNKNOWN_TERM`       | Termo fora do dialeto                                           | Erro                                |
| `AMBIGUOUS_DIALECT`  | `dc` ou `tr` sem dialeto confirmado                             | Erro                                |

### Tabela de verificação

Saída obrigatória de toda importação, no formato usado na sessão de origem:

| Volta | Instrução | Contagem esperada | Contagem encontrada | Status |
| ----- | --------- | ----------------- | ------------------- | ------ |

- **Contagem esperada:** total declarado na receita.
- **Contagem encontrada:** total calculado pela expansão.
- **Status:** "OK", "Total declarado errado", "Sobra n ponto(s)", "Falta n ponto(s)".

Para cada divergência o programa propõe uma correção e explica o raciocínio. Regras de proposta:

1. Se os pontos fecham com a linha seguinte e só o total declarado difere, propor corrigir o total e manter os pontos.
2. Se sobra um ponto no fim de uma linha de acabamento, propor desenhar como escrito e marcar o ponto como não trabalhado.
3. Se uma instrução se contradiz (por exemplo, pede 3 correntes e depois cita 4), propor a leitura que fecha a contagem.
4. Nunca aplicar correção sem confirmação. Toda correção aceita vira uma `Adaptation`.

## 4. Escrita da receita

`notation.print(pattern, dialect, options)` produz o texto.

### Dobra de repetições

A sequência de operações de uma linha é dobrada em três passos:

1. **Agrupar iguais consecutivos:** `pb, pb, pb` → `3 pb`.
2. **Achar o período:** procurar o menor bloco que, repetido k vezes, cobre a linha inteira ou a linha menos um resto no fim. Preferir o maior k.
3. **Juntar linhas iguais:** linhas consecutivas com as mesmas operações viram um intervalo (`V5–9`).

Exemplo: `pb, aum, pb, aum, pb, aum, pb, aum, pb, aum, pb, aum` → `(1 pb, 1 aum) x6`.

Quando não há período exato, escrever a sequência agrupada, sem forçar repetição.

### Formato de linha em pt-BR

```
V3: (1 pb, 1 aum) x6 (18)
V5–9: 1 pb em cada ponto (30)
V10: (3 pb, 1 dim) x6 (24)
```

- Total sempre entre parênteses no fim.
- Troca de fio escrita no ponto em que ocorre: `trocar para o fio B`.
- Adaptações marcadas com asterisco e explicadas em nota ao fim da peça.

## 5. Conversão entre dialetos

A conversão é feita sobre a forma canônica: ler em um dialeto, escrever em outro. Nunca substituir texto diretamente. Teste obrigatório: ler em UK, escrever em pt-BR, ler de novo e comparar a forma canônica.

## 6. Interoperabilidade com o CrochetPARADE

Subconjunto da linguagem do CrochetPARADE que o pacote `interop` lê e escreve:

| CrochetPARADE                 | Canônico               |
| ----------------------------- | ---------------------- |
| `ring` na primeira linha      | início em anel mágico  |
| uma linha por carreira        | `Row`                  |
| `sc`, `hdc`, `dc`, `ch`, `ss` | pontos                 |
| `sc2inc`, `sc3inc`            | `group` de 2 ou 3 `SC` |
| `sc2tog`, `sc3tog`            | `together`             |
| `6*[sc,sc2inc]`               | `repeat`               |
| `sk`                          | `skip`                 |
| `COLOR: nome`                 | troca de fio           |
| `#` comentário                | `note`                 |

Rótulos, pontos de fixação (`@`), definições (`DEF:`) e diretivas `DOT:` ficam fora do subconjunto; na importação geram aviso `UNSUPPORTED_CP_FEATURE`. A sintaxe exata deve ser conferida no manual do CrochetPARADE antes de implementar, porque este resumo foi tirado de exemplos do repositório.
