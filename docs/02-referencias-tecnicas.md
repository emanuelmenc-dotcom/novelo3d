# 02 — Referências técnicas

Cada entrada diz o que foi lido e o que o projeto deve aproveitar. "Lido" significa que o texto (ou um resumo fiel da página) foi consultado em 2026-11-10. "Não lido" significa que só o título e o endereço foram confirmados.

## 1. Crochê: 3D → receita

### AmiGo (base do motor direto de forma livre)

- Edelstein, Peleg, Itzhaky, Ben-Chen. _AmiGo: Computational Design of Amigurumi Crochet Patterns_. ACM SCF 2022. DOI [10.1145/3559400.3562005](https://doi.org/10.1145/3559400.3562005). [arXiv 2211.01178](https://arxiv.org/abs/2211.01178). **Lido.**
- Entrada: malha fechada, vértice-semente, largura do ponto `w`. Saída: receita só com ponto baixo, aumento e diminuição, em peça única sem costura.
- Etapas do método:
  1. **Função de carreira `f`:** distância geodésica até a semente. As isolinhas de `f` são as carreiras.
  2. **Função de coluna `g`:** a malha é cortada por uma geodésica da semente ao ponto mais distante; `g` é resolvida com gradiente ortogonal ao de `f`.
  3. **Amostragem:** grade regular de passo `w` no plano `(f, g)`, levada de volta à superfície. Cada amostra é um ponto de crochê.
  4. **Acoplamento:** carreiras consecutivas são ligadas por um casamento monótono de custo mínimo (Dynamic Time Warping). Um ponto ligado a dois da carreira anterior é diminuição; dois pontos ligados ao mesmo anterior formam aumento.
  5. **Receita:** um transdutor percorre o grafo e emite `sc`, `inc`, `dec`; repetições são dobradas em três níveis (carreiras, sequências, pontos), produzindo linhas como `rows 2-3: (sc, inc, 2sc)*3`.
- Tratamentos especiais:
  - regiões côncavas tipo "cratera" (curvatura gaussiana positiva e média negativa) não são realizáveis com enchimento; o artigo as suaviza antes;
  - curvatura gaussiana negativa exige densidade de amostragem adaptada;
  - ramificações são separadas por isolinhas de `f` nos pontos de sela; cada segmento é meia-esfera ou cilindro, e os segmentos são feitos em ordem topológica, emendando no último ponto do anterior.
- Limites declarados: só superfícies fechadas, segmentos finos são difíceis, simetria não é imposta, uma única semente, sem cores nem outros pontos.
- Implementação original: Matlab e C++. Tempo relatado: de 0,2 a 6,9 minutos para 365 a 3.670 pontos.

### Versão didática

- Ben-Chen, Edelstein. _Amigurumi Crochet Patterns from Geodesic Distances_. Bridges 2024. [Página](https://archive.bridgesmathart.org/2024/bridges2024-369.html). **Lido (resumo).** Usa curvatura média em linhas de vinco para escolher o tipo de ponto.

### Remesher do CrochetPARADE (alternativa pronta para forma livre)

- Código: <https://codeberg.org/crochetparade/CrochetPARADE_Remesher>. **Lido (README, TODO e anúncio).**
- Abordagem diferente da do AmiGo: fronteira que avança sobre a superfície com busca local, guardas e retrocesso. Documentação de arquitetura em arquivos `.dot` no repositório.

### Outros

- Çapunaman et al. _Computing Stitches and Crocheting Geometry_. 2017. [Registro](https://avesis.itu.edu.tr/yayin/86e7676f-4ecc-457c-90a8-7d987ecfef3c/computing-stitches-and-crocheting-geometry). **Não lido.** Citado pelo AmiGo como trabalho anterior.
- Guo, Lin, Narayanan, McCann. _Representing Crochet with Stitch Meshes_. 2020. DOI [10.1145/3388770.3407448](https://doi.org/10.1145/3388770.3407448), [registro no arquivo do SIGGRAPH](https://history.siggraph.org/?p=82596). **Não lido** (a página do laboratório bloqueia leitura automática). Em 2026, Aren E. Davey ampliou a biblioteca de pontos e criou um conversor de texto para a representação ([nota do STUDIO for Creative Inquiry](https://studioforcreativeinquiry.org/?p=19712)); sem código publicado na página.

## 2. Crochê: receita → 3D

### Greer e Mould (base do motor reverso geral)

- Greer, Mould. _Modeling Crochet Patterns with a Force-directed Graph Layout_. Expressive 2025, Eurographics Association. DOI [10.2312/exw.20251057](https://diglib.eg.org/handle/10.2312/exw20251057). Licença CC BY 4.0. **Lido (registro e resumo).**
- Receita escrita → grafo → layout por forças → modelo 3D, com foco em amigurumi.

### Motor de layout do CrochetPARADE

- Documento `docs/node_layout_documentation_v2.md` do repositório. **Lido (início).**
- Modelo: grafo ponderado em que cada aresta tem comprimento-alvo do tamanho do ponto. A métrica é completada com caminhos mínimos entre nós não vizinhos; uma relaxação de todos os pares com recozimento encontra a forma; uma etapa final de molas amortecidas reduz a deformação local.
- Consequência prática: o programa não sabe qual lado é o de dentro; a forma pode sair do avesso e depende da semente aleatória.

### Seitz et al.

- Seitz, Rein, Lincke, Hirschfeld. _Digital Crochet: Toward a Visual Language for Pattern Description_. Onward! 2022. DOI [10.1145/3563835.3567657](https://doi.org/10.1145/3563835.3567657). **Lido (resumo).** Linguagem visual baseada em grafo, que elimina ambiguidades das notações comuns.
- Relatório técnico do HPI nº 137, _Language and tool support for 3D crochet patterns_ ([PDF](https://hpi.de/oldsite/fileadmin/user_upload/hpi/dokumente/publikationen/technische_berichte/tbhpi137.pdf)). **Não lido.**

## 3. Interface e experiência

### Knitty

- Igarashi, Igarashi, Suzuki. _Knitty: 3D Modeling of Knitted Animals with a Production Assistant Interface_. Eurographics 2008, Short Papers. [PDF](https://www-ui.is.s.u-tokyo.ac.jp/~takeo/papers/yuki_eg08_knitty.pdf). **Lido.**
- O usuário desenha a silhueta; o sistema cria o corpo 3D; membros entram com um traço.
- A ferramenta de pintura colore o modelo e atualiza os pontos da receita.
- O assistente de produção marca a carreira atual, mostra como fazer cada ponto e estima tempo e fio.
- Limites: só ponto normal, aumento e diminuição; partes quase axissimétricas; simulação física simples.

### Plushie

- Mori, Igarashi. _Plushie: An Interactive Design System for Plush Toys_. SIGGRAPH 2007. [PDF](https://www-ui.is.s.u-tokyo.ac.jp/~takeo/papers/mori_siggraph2007_plushie.pdf). **Não lido.** Pelúcia costurada, não crochê; relevante pela simulação de enchimento.

## 4. Tricô e trabalhos vizinhos

- Narayanan et al. _Automatic Machine Knitting of 3D Meshes_ (AutoKnit). Reimplementação pública em <https://github.com/textiles-lab/autoknit>, declarada de domínio público no README. **Lido (README).**
- Yuksel et al. _Stitch Meshes_, 2012 ([página](https://www.cemyuksel.com/research/stitchmeshes/)). **Não lido.**
- _A Graph Model and a Layout Algorithm for Knitting Patterns_, [arXiv 2406.13800](https://arxiv.org/abs/2406.13800). **Não lido.**
- _CT2Yarn: Yarn-Level Reconstruction of Crochet from Computed Tomography_, [arXiv 2609.06950](https://arxiv.org/abs/2609.06950). **Não lido.**

## 5. Inteligência artificial e receitas

- Li, Huang, Hua, Chawla. _CrochetBench: Can Vision-Language Models Move from Describing to Doing in Crochet Domain?_ [arXiv 2511.09483](https://arxiv.org/abs/2511.09483), ACL 2026. **Lido (resumo).** O desempenho cai muito quando a avaliação exige receita executável. Lição: toda receita vinda de IA precisa passar pelo validador de contagem.
- Smeyers. _Analysis and Visualization of AI-generated Amigurumi Crochet Patterns_. Tese de bacharelado, LIACS, 2025. [PDF](https://theses.liacs.nl/pdf/2024-2025-SmeyersCCatherine.pdf). **Lido (resumo).** A visualização 3D por scripts gerados por IA foi considerada pouco confiável.

## 6. Padrões do ofício

- Craft Yarn Council, [símbolos de gráfico de crochê](https://craftyarncouncil.com/standards/crochet-chart-symbols). **Lido nesta sessão.** Cobre corrente, ponto baixíssimo, ponto baixo, meio ponto alto, ponto alto, 2 e 3 pontos baixos fechados juntos. Não tem símbolo para anel mágico nem para 4 pontos fechados juntos.
- Craft Yarn Council, [sistema de pesos de fio](https://craftyarncouncil.com/standards/yarn-weight-system). **Lido.** Faixas de amostra em ponto baixo por 4 polegadas (10,16 cm):

| Categoria | Nome        | Pontos baixos em 4 pol. | Agulha (mm) |
| --------- | ----------- | ----------------------- | ----------- |
| 1         | Super Fine  | 21–32                   | 2,25–3,5    |
| 2         | Fine        | 16–20                   | 3,5–4,5     |
| 3         | Light       | 12–17                   | 4,5–5,5     |
| 4         | Medium      | 11–14                   | 5,5–6,5     |
| 5         | Bulky       | 8–11                    | 6,5–9       |
| 6         | Super Bulky | 7–9                     | 9–15        |

A página avisa que são apenas diretrizes. Amigurumi costuma usar agulha menor que a recomendada, para o enchimento não aparecer, então a amostra real é mais apertada. Por isso o programa deve pedir a amostra medida pelo usuário e usar a tabela só como estimativa inicial.

## 7. Fatos geométricos usados pelos motores

Estes resultados são dedução própria, conferida por cálculo em código (ver `13-plano-de-testes.md`).

- **Disco plano.** Com largura de ponto `w` e altura de carreira `h`, um disco plano cresce `2π·h/w` pontos por volta. As regras do ofício (6 aumentos por volta em ponto baixo, 8 em meio ponto alto, 12 em ponto alto) correspondem a `h/w` de 0,955, 1,273 e 1,910.
- **Carreira de uma peça de revolução.** Na carreira `i`, a contagem ideal é `n_i = 2π·r(s_i)/w`, com `s_i = i·h` medido ao longo do perfil (comprimento de arco), e não na altura. Para superfícies de revolução, o comprimento de arco a partir do polo é a distância geodésica do AmiGo.
- **Esfera ideal não é a bola clássica.** A bola clássica (6, 12, 18, 24, 30, 36, seis voltas de 36, e de volta a 6) reconstruída sem estiramento é um cilindro baixo de tampa plana. A esfera ideal de mesmo diâmetro tem aumentos irregulares (6, 12, 17, 22, 27, 30, 33, 35, 36, ...). Na prática o enchimento arredonda a bola clássica; o programa deve oferecer as duas opções.
