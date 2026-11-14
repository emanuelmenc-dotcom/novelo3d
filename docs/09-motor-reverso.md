# 09 — Motor reverso: receita → geometria

Pacote `engine-reverse`. Entrada: `Pattern` validado e amostra. Saída: posições 3D dos pontos, malha de superfície e, sob pedido, geometria paramétrica editável.

O motor trabalha em três níveis de fidelidade. Cada nível é um marco e serve de ponto de partida para o seguinte.

| Nível        | Marco                         | O que reconstrói                                           | Custo       |
| ------------ | ----------------------------- | ---------------------------------------------------------- | ----------- |
| 1. Analítico | M5                            | Perfil de revolução a partir das contagens por volta       | Instantâneo |
| 2. Físico    | M8                            | Forma com assimetrias, peças planas e efeito do enchimento | Segundos    |
| 3. Editável  | M5 (perfil) e M8 (assimetria) | Geometria paramétrica para o modelador                     | Instantâneo |

## 1. Nível analítico

Vale para trechos em voltas (espiral ou voltas fechadas) de ponto baixo e pontos da mesma altura.

### 1.1 Perfil

Para a volta `i` com `n_i` pontos contados:

```
r_i = n_i · w / (2π)
Δr  = r_i − r_{i−1}                    (com r_0 = 0 se a peça começa em anel mágico)
Δz  = raiz(máx(h_i² − Δr², 0))
z_i = z_{i−1} + Δz
```

- `h_i` é a altura da volta: `h` vezes a altura relativa do ponto predominante na volta.
- Cada segmento do perfil mede `h_i`, salvo quando `|Δr| > h_i`.
- O resultado é a **polilinha canônica** descrita em `06-modelo-de-dados.md`.

### 1.2 Excesso e falta de tecido

Quando `|Δr| > h_i`, a volta tem mais (ou menos) circunferência do que uma superfície de revolução lisa comporta.

- `Δr > h_i`: excesso; o tecido ondula (babado). Registrar `RUFFLE` na volta e desenhar o trecho plano (`Δz = 0`).
- `Δr < −h_i`: a volta puxa as anteriores para dentro. Registrar `PUCKER`.

Nos dois casos o nível analítico é só aproximação; o nível físico resolve.

### 1.3 Posição de cada ponto

```
θ(i, k) = 2π · (k + 0,5) / n_i + θ_início(i)
pos     = (r_i · cos θ, r_i · sin θ, z_i)
```

- `θ_início(i)` acompanha a espiral: o primeiro ponto da volta `i` fica sobre o pai em que foi trabalhado.
- Pontos não contados (correntes, pontos baixíssimos) recebem posição interpolada entre vizinhos.

### 1.4 Exemplo conferido

Bola clássica: 6, 12, 18, 24, 30, 36, seis voltas de 36, depois 30, 24, 18, 12, 6. Com `w = 5 mm` e `h = 4,7746 mm`:

| Trecho         | Raio (mm)      | Altura z (mm)                |
| -------------- | -------------- | ---------------------------- |
| Voltas 1 a 6   | 4,775 → 28,648 | 0 (disco plano)              |
| Voltas 7 a 12  | 28,648         | 4,775 → 28,648 (parede reta) |
| Voltas 13 a 17 | 23,873 → 4,775 | 28,648 (disco plano)         |

A reconstrução sem estiramento da bola clássica é um cilindro baixo de 57,3 mm de diâmetro e 28,6 mm de altura. A bola fica redonda na prática porque o enchimento estica o tecido. O programa mostra o resultado analítico como "forma de repouso" e oferece o nível físico para a "forma cheia".

## 2. Nível físico

### 2.1 Modelo

Cada nó do grafo de pontos é uma partícula. Restrições:

| Restrição    | Entre                                   | Comprimento de repouso                 |
| ------------ | --------------------------------------- | -------------------------------------- |
| Carreira     | Pontos consecutivos no caminho do fio   | `w` vezes a largura relativa do ponto  |
| Coluna       | Ponto e cada pai                        | `h` vezes a altura relativa do ponto   |
| Cisalhamento | Ponto e vizinhos do pai                 | Diagonal correspondente; rigidez baixa |
| Enchimento   | Todas as partículas de uma peça fechada | Pressão para fora ao longo da normal   |
| Colisão      | Partículas próximas não vizinhas        | Distância mínima de `0,8·w`            |

Método recomendado: dinâmica baseada em posição com complacência (XPBD), que é estável com passo fixo e simples de implementar em TypeScript. Alternativa: adaptar o layout por caminhos mínimos do CrochetPARADE (ver `02-referencias-tecnicas.md`).

### 2.2 Procedimento

1. **Inicialização.** Usar as posições do nível analítico. Isso define o lado de fora e evita o problema de a forma sair do avesso, que ocorre quando se parte de posições aleatórias.
2. **Relaxação sem pressão**, até a deformação média das restrições de carreira e coluna ficar abaixo de 2%.
3. **Enchimento.** Aumentar a pressão gradualmente conforme `finishing.stuffing` (`none`, `light`, `firm`), mantendo a complacência das restrições para permitir estiramento limitado.
4. **Critério de parada.** Deslocamento máximo por iteração menor que `0,01·w`, ou limite de iterações.
5. **Saída.** Posições finais, deformação por restrição e lista de pontos muito esticados ou muito frouxos (mais de 15% fora do repouso), para destaque na interface.

Os valores numéricos acima são pontos de partida a calibrar com peças reais. A calibração é uma tarefa do marco M8: crochetar três formas de referência, medir e ajustar.

### 2.3 Casos que o nível físico destrava

- Aumentos concentrados de um lado (focinho, barriga, saliências).
- Peças planas em carreiras de ida e volta e peças feitas em torno de uma corrente de base.
- Voltas com correntes que pulam pontos (aberturas).
- Peças trabalhadas sobre a borda de outra peça (`start: 'pickup'`).

## 3. Malha de superfície

A partir das posições dos pontos:

1. Para cada ponto com pai, formar a face entre o ponto, seu antecessor na carreira e os pais de ambos. Pontos normais geram quadriláteros; aumentos e diminuições geram triângulos.
2. Fechar o início em anel com um leque de triângulos em torno do polo; fazer o mesmo no fechamento.
3. Triangular e suavizar só para exibição (uma passada de subdivisão); a malha de pontos original é preservada para seleção e pintura.
4. Atribuir a cor do fio de cada ponto às faces correspondentes.

## 4. Conversão em peça editável

Ação explícita do usuário. Transforma uma peça `source: 'pattern'` em `source: 'geometry'`.

### 4.1 Peça axissimétrica (M5)

1. `profile` recebe a polilinha canônica do nível analítico.
2. `handles` recebe uma simplificação do perfil (algoritmo de Douglas-Peucker com tolerância de `0,25·w`), para que o usuário tenha poucos pontos de controle.
3. `startClosed` e `endClosed` vêm do início e do fim da receita.
4. A receita original é guardada como referência para comparação.

Enquanto o usuário não mover nenhum manipulador, o motor direto reproduz as contagens originais (propriedade 4 de `08-motor-direto.md`).

### 4.2 Peça com assimetria (M8)

1. Ajustar o eixo: reta que melhor passa pelos centroides das voltas nas posições do nível físico.
2. Para cada volta, medir o raio em função do ângulo e dividir pelo raio médio.
3. Gravar o resultado amostrado em `section`.
4. Marcar na interface as voltas em que a seção se afasta do círculo em mais de 10%.

### 4.3 Edição que preserva a receita

Meta do marco M8, não obrigatória antes: quando o usuário edita só um trecho do perfil, regenerar apenas as voltas cujo raio mudou mais que `0,5·w/(2π)` (meio ponto de circunferência) e manter as demais como estavam na receita original.

## 5. Tutorial: do grafo aos passos

Pacote `tutorial`, consumido pela interface.

```ts
interface TutorialStep {
  index: number;
  nodeIds: number[]; // pontos feitos neste passo (2 para um aumento)
  parentIds: number[]; // onde a agulha entra
  rowLabel: string;
  positionInRow: number; // "ponto 13 de 33"
  rowTotal: number;
  instruction: string; // "aumento: 2 pontos baixos no mesmo ponto"
  yarnId: string;
  alerts: ("yarnChange" | "rowStart" | "rowEnd" | "placeMarker" | "stuffNow" | "adaptation")[];
}
```

- Um passo por operação, e não por nó: um aumento é um passo com dois nós.
- `stuffNow` é emitido quando faltam poucas voltas para o fechamento.
- A lista é determinada só pelo grafo e pelo dialeto; a interface cuida de câmera e animação.
- **Implementado (P4, D-59):** os alertas são `rowStart`, `rowEnd` e `yarnChange`; `stuffNow`, `placeMarker` e `adaptation` ficam para depois. O `rowLabel` nomeia a volta única (7, 8, ... para "7–12"). `rowTotal` conta todos os passos da volta (inclui pular e fechar) e por isso pode passar da contagem da tabela de verificação. Marcadores de texto da receita não são passos. O fio de cada passo vem do grafo já pintado (`applyPaint`).

## 6. Propriedades que os testes devem garantir

1. Para receitas em voltas de ponto baixo sem `RUFFLE` nem `PUCKER`: `direto(reverso(P))` tem as mesmas contagens de `P`.
2. Todo segmento do perfil canônico mede `h` com erro menor que `10⁻⁶ mm`.
3. A relaxação partindo do nível analítico de uma esfera ideal (caso F1) converge com deformação média abaixo de 2% e sem inversão.
4. O número de passos do tutorial é igual ao número de operações expandidas da receita.
