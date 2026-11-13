# Material de referência

Esta pasta não é código do produto. Guarda o que foi produzido na sessão que deu origem ao projeto, para orientar a implementação.

## notas-de-pesquisa.md

Notas brutas da pesquisa de 2026-11-10: o que foi conferido por clone de repositório, o que foi lido em página web e as versões npm consultadas. Os documentos `docs/01` a `docs/03` são a versão organizada.

## graficos-python/

`chart.py` é a biblioteca em Python que gerou os gráficos aprovados pelo usuário. É a referência de comportamento para o pacote `charts` (marco M2).

| Função | O que faz |
|---|---|
| `build(prev, tokens)` | Expande os pontos de uma volta e liga cada ponto ao ponto de base, respeitando topos não contados |
| `layout(items, r, label_w, first, rot)` | Distribui os símbolos em um anel: atração para o ponto de base, separação mínima, pares de aumento juntos, espaço do rótulo |
| `draw_ring(...)` | Desenha os símbolos de uma volta, com pernas ligadas à base e linhas de ligação; aceita direção para dentro |
| `sym_pb`, `sym_ch`, `sym_pbx`, `sym_mpa`, `sym_inc`, `sym_tog`, `sym_am`, `draw_toe` | Símbolos |
| `draw_label`, `pill` | Rótulo da volta e total |
| `plain_ring`, `plain_end` | Anel tracejado de voltas lisas e marca de fim sobre ele |
| `start_mark`, `end_mark`, `ring_mark` | Triângulo de início e quadrado de fim |
| `yarn_card`, `header`, `legend`, `table`, `notes` | Elementos da página |
| `export(name, pages)` | Grava SVG, converte em PNG e PDF com `rsvg-convert` e junta as páginas com `pypdf` |

Observações para quem for portar:

- O arquivo cresceu por revisões sucessivas; há parâmetros sem uso (`beginner` em `draw_label`) e constantes ajustadas à mão. Porte o comportamento, não a estrutura.
- O rodapé de `header` cita a receita trabalhada na sessão; no produto, o crédito vem do projeto.
- Dependências externas: `rsvg-convert` e `pypdf`. No produto, o PDF sai pelo navegador.
- Unidades: milímetros, em página A4 de 210 × 297.

## sessao-sapo/

Scripts e imagens dos gráficos de uma receita comercial de sapo de crochê, feitos para uso pessoal do usuário.

- **Não publicar.** A pasta está no `.gitignore`.
- **Não usar em testes** nem copiar trechos da receita para o repositório.
- Serve para ver como cada tipo de página foi montado:
  - `parte_a.py`: gráfico circular em duas páginas, a segunda de fora para dentro;
  - `partes.py`: função `rings_page` (página circular genérica), `limb` (peça em torno de corrente de base), `parte_h` (gráfico retangular de carreiras) e marcas numeradas (`marks_i`);
  - `pontos_v2.py`: página de pontos com fotos passo a passo;
  - imagens `.png`: resultado aprovado de seis páginas.

## Fotos da página de pontos

Não estão incluídas. Baixar de novo do Wikimedia Commons quando for implementar, mantendo crédito e licença (CC BY-SA 4.0):

| Ponto | Arquivos | Autor |
|---|---|---|
| Corrente | `Crochet Chain Stitch (Step 1).jpg`, `(Step 2).jpg` | Stilfehler |
| Ponto baixíssimo | `Crochet Slip Stitch (Step 1).jpg` a `(Step 3).jpg` | Stilfehler |
| Ponto baixo | `Crochet Single Stitch (Step 1).jpg` a `(Step 4).jpg` | Stilfehler |
| Meio ponto alto | `Crochet Half Double Stitch (Step 1).jpg` a `(Step 5).jpg` | Stilfehler |
| Anel mágico | `Szydełkowe magiczne kółko.jpg`, `Półsłupki w magicznym kółku.jpg` | Valki77 |

Endereço de cada arquivo: `https://commons.wikimedia.org/wiki/File:<nome do arquivo>`.
