# 08 — Motor direto: geometria → receita

Pacote `engine-forward`. Entrada: geometria, amostra e opções. Saída: `Pattern` válido e lista de avisos. O motor é determinístico e não depende de DOM.

## 1. Peça de revolução (marco M3)

### 1.1 Entrada

```ts
interface ForwardInput {
  geometry: RevolveGeometry;
  gauge: Gauge; // w = largura do ponto, h = altura da volta (mm)
  options: ForwardOptions;
  paint: PaintRegion[];
}

interface ForwardOptions {
  startCount?: number; // força o total da volta 1 (ex.: 6); se ausente, é calculado
  startMin: number; // padrão 4
  startMax: number; // padrão 12
  closeAt: number; // padrão 6: encerra quando o total chega a esse valor ou menos
  maxIncreasePerStitch: 2 | 3; // padrão 2
  stagger: "none" | "alternate"; // padrão 'alternate'
  friendlyMultiple: number; // padrão 0 (desligado); 6 no modo iniciante
  friendlyTolerance: number; // em pontos; padrão 1.0
  rowPhase: number; // 0 a 1; deslocamento da primeira volta ao longo do perfil; padrão 1
}
```

### 1.2 Carreiras

1. Calcular o comprimento de arco acumulado `S` do perfil, do início ao fim.
2. Colocar a volta `i` em `s_i = (i − 1 + rowPhase)·h`, para todo `i ≥ 1` com `s_i ≤ S`. Com `rowPhase = 1`, a volta 1 fica a uma altura de volta do polo.
3. Obter o raio `r_i` por interpolação linear do perfil em `s_i`.

O parâmetro é o comprimento de arco, e não a altura `z`. Em trechos quase horizontais do perfil (topo da cabeça) a altura quase não muda, mas as voltas continuam se sucedendo.

### 1.3 Contagem por volta

```
ideal_i = 2π · r_i / w
n_1 = startCount, se informado; senão limitar(arredondar(ideal_1), startMin, startMax)
n_i = limitar(arredondar(ideal_i), teto(n_{i−1} / 2), maxIncreasePerStitch · n_{i−1})     para i ≥ 2
```

- `arredondar(x) = piso(x + 0,5)`. Não usar o arredondamento bancário padrão de algumas linguagens.
- A contagem é sempre calculada a partir do valor ideal absoluto, nunca acumulando diferenças. Isso impede que erros de arredondamento se somem.
- Quando o limite é acionado, registrar aviso `CLAMPED_ROW` com o desvio em pontos e em milímetros de circunferência.

**Fechamento.** Se `endClosed` for verdadeiro, encerrar na primeira volta, depois do máximo, em que `n_i ≤ closeAt`. Essa volta é a última; os pontos restantes são fechados com agulha de tapeçaria. Se o fim for aberto, usar todas as voltas até `S`.

**Contagens amigáveis.** Se `friendlyMultiple = k > 0`, substituir `n_i` pelo múltiplo de `k` mais próximo sempre que a diferença para o valor ideal for de no máximo `friendlyTolerance` pontos e a viabilidade continuar valendo. Efeito: receitas com repetições limpas, como `(2 pb, 1 aum) x6`, ao custo de pequeno desvio de forma. O aviso `FRIENDLY_SNAP` informa o desvio.

### 1.4 Distribuição de aumentos e diminuições

Seja `p = n_{i−1}` (pais), `c = n_i` (filhos) e `d = c − p`.

- `d = 0`: `p` pontos baixos.
- `d > 0` (aumentos): escolher `d` pais que recebem dois pontos.
- `d < 0` (diminuições): escolher `|d|` filhos que fecham dois pais cada.

Seja `m` o número de posições em que se distribui (`p` para aumentos, `c` para diminuições) e `q = |d|`.

- **Divisão exata** (`m` múltiplo de `q`, bloco `b = m / q`): o ponto especial fica no fim de cada bloco, nas posições `b − 1, 2b − 1, ...`. Resultado: `((b − 1) pb, 1 aum) x q`.
  - Com `stagger = 'alternate'`, nas voltas pares adiantar os pontos especiais em `f = piso(b / 2)` posições. Resultado: `(b − 1 − f) pb, 1 aum, ((b − 1) pb, 1 aum) x (q − 1), f pb`. Para `b = 3`: `1 pb, 1 aum, (2 pb, 1 aum) x (q − 1), 1 pb`. Evita que os aumentos se alinhem e formem arestas visíveis.
- **Divisão inexata:** posições `piso((k + φ) · m / q)` para `k = 0 ... q − 1`, com `φ = 0,5`; com `stagger = 'alternate'`, usar `φ = 0,25` nas voltas ímpares e `0,75` nas pares.

Exemplo conferido: de 12 para 17 pontos (`q = 5`, `m = 12`, `φ = 0,5`) os aumentos caem nos pais 1, 3, 6, 8 e 10, e a volta fica `1 pb, 1 aum, 1 pb, 1 aum, 2 pb, 1 aum, 1 pb, 1 aum, 1 pb, 1 aum, 1 pb`, com 17 pontos.

### 1.5 Cores

1. Cada ponto da volta `i` tem centro em `(s_i, θ_k)`, com `θ_k = 2π · (k + 0,5) / n_i` mais o deslocamento da espiral.
2. O fio do ponto é o da última `PaintRegion` que contém o centro; sem região, o fio primário.
3. Trocas de fio viram `yarnId` nas operações. O impressor escreve a troca no ponto em que ocorre.
4. Regiões estreitas demais (menos de 1 ponto de largura) geram aviso `PAINT_TOO_THIN`.

### 1.6 Montagem da receita

1. Volta 1: `start: 'magicRing'`, `n_1` pontos baixos no anel (ou corrente inicial, se a peça começa aberta).
2. Demais voltas: sequência de `stitch`, `group` e `together` na ordem da distribuição.
3. Voltas consecutivas idênticas recebem `repeatRows`.
4. Preencher `declaredCount` com o total calculado.
5. Rodar `core.validate()`; o resultado deve ser limpo. Falha aqui é erro de programação.

### 1.7 Valores de referência

Calculados em código em 2026-11-10 com as regras acima (`startMin = 4`, `closeAt = 6`, `maxIncreasePerStitch = 2`, sem contagens amigáveis). São os testes de aceitação do marco M3.

| Caso | Geometria                                               | w (mm) | h (mm) | Contagens por volta                                                  | Total |
| ---- | ------------------------------------------------------- | ------ | ------ | -------------------------------------------------------------------- | ----- |
| F1   | Esfera, raio `36·w/(2π)` = 28,648 mm                    | 5      | 4,7746 | 6, 12, 17, 22, 27, 30, 33, 35, 36, 36, 35, 33, 30, 26, 22, 16, 11, 6 | 433   |
| F2   | Esfera, raio 30 mm                                      | 5      | 5      | 6, 12, 18, 23, 28, 32, 35, 37, 38, 38, 36, 34, 31, 27, 23, 17, 11, 6 | 452   |
| F3   | Cone aberto, semiângulo 30°, geratriz 60 mm             | 5      | 5      | 4, 6, 9, 13, 16, 19, 22, 25, 28, 31, 35, 38                          | 246   |
| F4   | Copo: disco de raio 20 mm e parede de 40 mm, aberto     | 5      | 4,7746 | 6, 12, 18, 24, 25, 25, 25, 25, 25, 25, 25, 25                        | 260   |
| F5   | Ovo: elipsoide de revolução, raio 20 mm, semieixo 30 mm | 5      | 5      | 6, 12, 16, 19, 22, 24, 25, 25, 25, 24, 22, 19, 15, 11, 6             | 271   |

Observações:

- `h = 4,7746 mm` é `6/(2π)·w`, a razão em que um disco plano cresce exatamente 6 pontos por volta.
- Em F1 e F2 a última volta ideal seria 5; o limite de metade a eleva para 6.
- Em F3 a primeira volta ideal seria 3; `startMin` a eleva para 4.
- Em F5 o perfil é amostrado numericamente (20.000 segmentos) para obter o comprimento de arco, que é 79,327 mm.

## 2. Seção não circular (marco M8)

Quando a peça tem `section`, a volta deixa de ser um círculo.

1. **Laço da volta.** Amostrar o contorno em `s_i` com o raio `r_i · scale(s_i, θ)` e calcular seu comprimento `L_i`.
2. **Contagem.** `n_i = arredondar(L_i / w)`, com os mesmos limites.
3. **Posições.** Distribuir os `n_i` pontos em espaçamento igual de comprimento de arco ao longo do laço, a partir da costura.
4. **Acoplamento.** Ligar a volta `i` à volta `i − 1` por casamento monótono de custo mínimo:
   - custo de um par = distância entre o ponto e o candidato a pai;
   - movimentos permitidos: avançar os dois (ponto normal), avançar só o filho (aumento) ou avançar só o pai (diminuição);
   - cada pai recebe no máximo `maxIncreasePerStitch` filhos e cada filho fecha no máximo 2 pais;
   - resolver por programação dinâmica com banda, fixando o primeiro par na costura.
5. O resultado do acoplamento define onde ficam aumentos e diminuições. Eles se concentram onde o contorno cresce, como nas saliências dos olhos de um sapo.

Para seção circular, o acoplamento deve reproduzir a distribuição uniforme da seção 1.4. Esse é um teste de regressão.

## 3. Malha livre (marco M10)

Duas rotas; a escolha fica para a abertura do marco, com protótipo de cada uma.

### Rota A: método geodésico (reimplementação do AmiGo)

1. Reparar e normalizar a malha; exigir superfície fechada.
2. Calcular a distância geodésica à semente. Para a primeira versão, usar Dijkstra sobre a malha refinada até arestas menores que `w/3`; avaliar depois o método do calor.
3. Extrair isolinhas a cada `h`; cada componente conexa é um laço de volta.
4. Segmentar onde o número de laços muda (pontos de sela): cada segmento é uma peça.
5. Para cada segmento, aplicar a seção 2 (posições e acoplamento).
6. Ordenar os segmentos e gerar as emendas.

Não copiar código da implementação em Python, que tem licença não comercial. Trabalhar a partir do artigo.

### Rota B: Remesher do CrochetPARADE

1. Compilar o Remesher para WebAssembly (o repositório já tem esse alvo).
2. Enviar o STL e os parâmetros; receber as instruções na linguagem do CrochetPARADE.
3. Importar pelo pacote `interop`.

Vantagem: lida com formas complexas e emite costuras. Custo: dependência em Rust, saída menos regular e sem controle de simetria.

## 4. Limites físicos a avisar

| Situação                                                       | Aviso                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Raio cresce mais que `h` por volta (mais que dobra a contagem) | `CLAMPED_ROW`: a forma real ficará menor que o modelo nesse trecho |
| Concavidade em tigela (reentrância)                            | `NOT_STUFFABLE`: o enchimento empurra a parede para fora           |
| Trecho mais fino que 4 pontos de circunferência                | `TOO_THIN`: difícil de crochetar; sugerir corrente ou arame        |
| Peça com menos de 3 voltas                                     | `TOO_SHORT`                                                        |

## 5. Propriedades que os testes devem garantir

1. Todo `Pattern` gerado passa na validação sem avisos de contagem.
2. `teto(n_{i−1}/2) ≤ n_i ≤ maxIncreasePerStitch · n_{i−1}` em toda volta.
3. Escalar o perfil e a amostra pelo mesmo fator não muda as contagens.
4. Para perfis gerados pelo motor reverso (polilinha canônica), o motor direto devolve as contagens originais.
5. A mesma entrada produz saída idêntica byte a byte.
