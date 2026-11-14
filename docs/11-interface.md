# 11 — Interface

## 1. Estrutura geral

```
┌───────────────────────────────────────────────────────────────────────┐
│ Barra superior: projeto · desfazer/refazer · amostra · exportar       │
├──────────┬──────────────────────────────────────────┬─────────────────┤
│ Peças    │ Área principal                           │ Propriedades    │
│          │ (3D, ou 3D + editor de perfil)           │ da seleção      │
│ + Nova   │                                          │                 │
│ Cabeça   │                                          │                 │
│ Corpo    │                                          │                 │
│ Braço ×2 │                                          │                 │
├──────────┴──────────────────────────────────────────┴─────────────────┤
│ Abas de saída: Receita · Gráfico · Verificação · Tutorial · Avisos    │
└───────────────────────────────────────────────────────────────────────┘
```

Modos da área principal, escolhidos por botões no topo: **Modelar**, **Pintar**, **Pontos**, **Montar** (M9).

## 2. Modo Modelar

- **Editor de perfil** ao lado do 3D: meia silhueta da peça com eixo vertical; manipuladores arrastáveis; clique na curva cria manipulador; tecla Delete remove.
- **Régua de voltas** sobre o perfil: marcas a cada volta, com a contagem ao lado. O usuário vê onde cada volta cai antes de gerar.
- **Medidas** em centímetros: altura e diâmetro máximo, atualizados ao arrastar.
- **Alternância** "forma de repouso" e "forma cheia" (M8).
- Arrastar um manipulador de uma peça vinda de receita pede confirmação: "Esta peça segue a receita importada. Converter em peça editável?".

## 3. Modo Pintar

- Paleta de fios à direita; fio ativo destacado.
- Ferramentas: **faixa** (arrastar ao longo da peça), **pincel** (pinta pontos sob o cursor, com tamanho ajustável), **balde** (preenche uma volta inteira), **borracha** (volta ao fio primário).
- O 3D mostra a malha de pontos colorida. A aba Receita destaca as linhas com troca de fio.

## 4. Modo Pontos

- Mostra cada ponto como instância 3D; aumentos e diminuições com realce.
- Clique em um ponto: seleciona, mostra volta e posição, destaca o símbolo no gráfico e a linha na receita.
- Painel de opções do motor: total inicial, escalonamento, contagens amigáveis, limite de aumento.
- Botão **Congelar receita** para editar pontos à mão (inserir ou remover aumento ou diminuição em uma volta, com validação imediata).

## 5. Importar receita

Assistente em três passos, espelhando o fluxo usado na sessão de origem:

1. **Transcrição.** Colar o texto; escolher ou confirmar o dialeto; a receita aparece como lista numerada de voltas, com o texto original ao lado da interpretação. Trechos não entendidos ficam marcados.
2. **Verificação.** Tabela com volta, instrução, contagem esperada, contagem encontrada e status. Cada divergência traz uma proposta com botões "Aplicar" e "Manter como está".
3. **Resultado.** 3D reconstruído, gráfico e lista de adaptações. Botão "Converter em peça editável".

O usuário não avança do passo 1 para o 2 sem confirmar a transcrição, porque erro de leitura é a principal fonte de erro.

## 6. Abas de saída

| Aba         | Conteúdo                                                                       |
| ----------- | ------------------------------------------------------------------------------ |
| Receita     | Texto da peça selecionada ou do projeto; seletor de dialeto; copiar e exportar |
| Gráfico     | Páginas do gráfico; alternar padrão e iniciante; exportar SVG e PDF            |
| Verificação | Tabela de contagem da peça                                                     |
| Tutorial    | Reprodutor de passos (M7)                                                      |
| Avisos      | Lista de avisos dos motores, clicáveis, que levam à volta afetada              |

## 7. Tutorial

> **G2 (2026-11-14, D-66):** o tutorial é o modo de leitura em tela cheia (linha "Modo de leitura" da tabela de interface 2, seção 12). A janela Tutorial deixou de existir; layouts salvos que a tinham abrem sem ela.

- Ocupa a área principal quando ativo.
- Barra inferior: anterior, tocar ou pausar, próximo, velocidade, seletor de volta.
- Faixa de texto grande com a instrução do passo.
- Miniatura do gráfico com o símbolo atual destacado.

## 8. Mensagens e linguagem

- Texto curto, sem jargão de programação. "A volta 7 tem 1 ponto a mais do que a receita diz", e não "COUNT_MISMATCH".
- Termos de crochê conforme o dialeto escolhido para a interface.
- Todo aviso diz o que aconteceu, onde, e o que o usuário pode fazer.

## 9. Atalhos

| Tecla                    | Ação                          |
| ------------------------ | ----------------------------- |
| Ctrl+Z, Ctrl+Y           | Desfazer, refazer             |
| 1, 2, 3                  | Modos Modelar, Pintar, Pontos |
| Espaço                   | Tocar ou pausar o tutorial    |
| Setas esquerda e direita | Passo anterior e próximo      |
| F                        | Enquadrar a peça selecionada  |

## 10. Visual

- Interface sóbria, clara, com um tema escuro opcional.
- Cores de fio só nas peças; a interface em tons neutros para não competir com o modelo.
- Tamanho mínimo de alvo de clique: 32 px.
- Antes de desenhar a interface em M4, propor ao usuário um esboço da tela principal e aguardar aprovação.

## 11. Janela Render (R3b) — PAUSADA (D-57)

A janela não aparece na interface enquanto o interruptor `render` estiver desligado (`packages/commands/src/features.ts`). A descrição abaixo vale para quando voltar.

Aba "Render" (junto de Materiais, por padrão). Botões Play/Continuar, Pausar, Parar e Salvar PNG; barra de progresso e estado ("renderizando", "pausado", "concluído", "parado", "obsoleto", "erro"); a imagem aparece na própria janela e vai sendo refinada. Ajustes: resolução (720p a 4K ou largura × altura até 4096, confirmados ao sair do campo ou com Enter), qualidade (rápida/fina), amostras de suavização, sombras, luz (direção, altura, intensidade, ambiente), fundo (cor, degradê, transparente) e câmera (copiar a do 3D, seguir o 3D ou enquadramento automático). O trabalho continua mesmo se o usuário trocar de aba. Se a receita mudar durante o render, a rodada fica "obsoleta".

## 12. Interface 2 (D-65, 2026-11-13): ribbon, janelas independentes e 3D grande

Substitui o cabeçalho com botões e o layout clássico como padrão. As seções 1 a 11 descrevem a primeira interface; onde conflitam, vale esta.

| Parte              | Como é                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Barra de título    | Nome, busca de comandos (Ctrl+K), ícone da ponte MCP (verde conectada), ícone de alerta de gravação (só aparece se falhar), menu Janelas. O texto completo dos avisos fica na dica e para leitores de tela.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Ribbon             | Abas por tarefa, na ordem do trabalho: Arquivo, Receita, Selecionar, Pintar, Montagem, Tutorial, Vista, Histórico. Dentro de cada aba os botões vão do mais usado (esquerda) ao menos usado. Recolhível (seta à direita); clicar numa aba reabre. É também o registro de ferramentas: a busca de comandos lê as mesmas abas.                                                                                                                                                                                                                                                                                              |
| Coluna da esquerda | Receita, Verificação de contagem, Gráfico circular e Texto CrochetPARADE em abas; embaixo as janelas de pontos, fios, montagem e materiais em abas (elas serão trocadas pela árvore e pelo editor de propriedades, ver `12-roadmap.md`).                                                                                                                                                                                                                                                                                                                                                                                  |
| 3D                 | Ocupa o resto da tela (preset "Edição"). Barra de opções fina em cima (ferramenta ativa, seleção); cubo embaixo à esquerda (padrão) com um botão ao lado que abre o menu de vista: Ajustar, vistas padrão, grafo, só linhas e tela cheia.                                                                                                                                                                                                                                                                                                                                                                                 |
| Janelas            | O menu Janelas liga e desliga cada janela sozinha. Trocar de layout predefinido só muda as posições: o que você desligou continua desligado. Ligar de novo põe a janela perto das suas vizinhas do layout aplicado. O estado fica no projeto do navegador (`off` e `base` em `novelo3d.workspace`).                                                                                                                                                                                                                                                                                                                       |
| Migração           | Na primeira abertura depois da mudança (`novelo3d.ui` sem versão 2) o layout salvo vira o preset "Edição" e o cubo vai para o canto inferior esquerdo; layouts nomeados continuam. Depois disso valem as escolhas do usuário.                                                                                                                                                                                                                                                                                                                                                                                             |
| Já no ribbon       | Arquivo (salvar, abrir, configurações, lista de materiais), Receita (imprimir, copiar e baixar o texto CP), Selecionar (ferramenta, forma, operação, só visíveis, limpar, inverter, tudo), Pintar (pincel, balde, conta-gotas, borracha, apagar edições), Montagem (nova peça, instância, cópia, espelhada nos planos X, Y e Z), Tutorial (Modo de leitura), Vista, Histórico (desfazer, refazer).                                                                                                                                                                                                                        |
| Ainda nas janelas  | Campos, tabelas **e botões de ação**: aplicar à seleção, filtros, listras, suavizar, gradiente, pintar voltas, lados da costura, criar costura, fechar montagem. A barra de opções só mostra a ferramenta ativa e a seleção; os valores da ferramenta (tensão, raio, fio) ainda se editam na janela Pontos. Tudo isso passa para o ribbon, a árvore e o editor de propriedades na etapa G4 (`12-roadmap.md`).                                                                                                                                                                                                             |
| Modo de leitura    | Ribbon Tutorial › Modo de leitura ou F9. Esconde ribbon, janelas e barra de opções; fica o 3D (peça já feita na cor do fio, o passo em destaque, o resto esmaecido) e uma faixa embaixo: a cadeia (`6 pb`), a volta inteira com blocos dobrados, avisos (início e fim de volta, troca de fio, contagem que não fecha), botões Voltar e Próximo grandes, ir à volta, ver ponto, revisão e sair. Teclas e a ordem delas na faixa: Espaço ou →, ← ou Backspace, ↑, ↓, Pg Up, Pg Dn, F, R, 1 a 6 e 0, Esc. Depois de cada marco: slide de revisão e slide de estado atual. Sair devolve a mesma tela (o layout não é mexido). |
| Teclas             | Ctrl+K busca comandos; Ctrl+Z e Ctrl+Y desfazem e refazem; F ajusta; 1 a 6 e 0 trocam a vista; F9 entra no modo de leitura (as teclas dele estão acima).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 13. G4: inventário das janelas que saem (2026-11-14)

Nada some e todo `data-testid` e todo nome acessível continua existindo; o que muda é onde o controle mora. Janelas novas: **Árvore** (`tree`) e **Propriedades** (`props`), na coluna da esquerda do preset "Edição". Janelas que saem: Pontos, Fios, Montagem e Materiais (Materiais vira só a janela flutuante que já existe, aberta pelo ribbon Arquivo).

`tree.get` devolve `{ selected, active, root: { id: "root", kind: "assembly", name, children: [...] } }`. Cada filho é `{ id, kind: "part" | "instance" | "mirror" | "seam", name, active, visible, source? }`; costuras trazem `parts` (as duas peças) e `ok`. Montagens aninhadas (G5) entram dentro de `children` com `kind: "assembly"`, sem mudar este formato. Escondida (`visible: false`) não desenha nem recebe clique, mas continua nos materiais e nas costuras.

| Janela    | Controle (testid ou nome acessível)                                                                              | Destino                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Pontos    | "Tensão padrão do projeto"                                                                                       | Propriedades, nó raiz                                       |
| Pontos    | "Raio do pincel", "Saltos da vizinhança"                                                                         | barra de opções, editáveis com a ferramenta ativa           |
| Pontos    | "Fio da pintura"                                                                                                 | barra de opções (ferramenta Pintar fio) e janela da paleta  |
| Pontos    | "Valor da tensão"                                                                                                | barra de opções (ferramenta Tensão)                         |
| Pontos    | `apply-selection`                                                                                                | ribbon Pintar › Aplicar à seleção                           |
| Pontos    | "Listras", `apply-stripes`                                                                                       | ribbon Pintar › Listras                                     |
| Pontos    | suavizar, gradiente ("Gradiente de", "Gradiente até")                                                            | ribbon Pintar › Ferramentas                                 |
| Pontos    | filtros ("Filtro de fio", "Filtro de ponto", "Filtro volta de/até", "Filtro tensão de/até"), `apply-filter`      | Propriedades, seção "Selecionar por filtro" (nó raiz)       |
| Pontos    | `sel-count`, `path-hint`, `points-error`, `points-info`, `points-panel`                                          | Propriedades (seção Pontos) e barra de opções               |
| Fios      | paleta (escolher, cor, nome, "Remover fio X", adicionar), "Paleta de fios"                                       | janela da paleta, aberta pelo ribbon Pintar                 |
| Fios      | "Pintar de volta", "Pintar até a volta", Pintar voltas, "Pinturas", limpar                                       | janela da paleta                                            |
| Fios      | `usage-table`, "Largura do ponto em mm", `recipe-yarns`, copiar receita com trocas                               | janela da paleta, abas Consumo e Receita                    |
| Fios      | editor de fio (`yarn-editor-*`, `yarn-preview-*`, `thickness-info-*`)                                            | janela da paleta                                            |
| Montagem  | lista "Peças"                                                                                                    | árvore                                                      |
| Montagem  | `part-props` (nome, posição, rotação, peça fixa, plano do espelho, troca de fios, desligar da original, remover) | Propriedades, nó de peça                                    |
| Montagem  | "Costuras" (lista)                                                                                               | árvore, nós de costura                                      |
| Montagem  | Nova costura (`seam-side-a/b`, "Inverter", "Tipo de costura", proporção, `seam-check`, `seam-create`)            | ribbon Montagem › Costura e Propriedades (nó raiz)          |
| Montagem  | Fechar montagem (`assembly-close`, `assembly-undo-close`, `assembly-close-result`, peça fixa, virar sozinho)     | ribbon Montagem › Fechar e Propriedades (nó raiz)           |
| Montagem  | `assembly-panel`, `assembly-error`                                                                               | Propriedades (nó raiz)                                      |
| Materiais | `materials-panel`, tabelas, "Trocar pelo fio", costuras                                                          | só a janela flutuante (ribbon Arquivo › Lista de materiais) |

Ordem de execução: comandos (`tree.get`, `tree.select`, `parts.setVisible`, `parts.isolate`, `parts.showAll`; feitos), janelas Árvore e Propriedades com migração do layout salvo, depois mover uma janela por vez (Materiais, Fios, Montagem, Pontos), com e2e verde e commit em cada uma. Clique direito: um menu só, na árvore (no 3D o botão direito já desloca a câmera; pergunta guardada 11 em `docs/12`).

**Como ficou (2026-11-14).** Árvore: lista de peças (com esconder e isolar), costuras e a linha "Projeto"; menu de contexto por clique direito ou Shift+F10. Propriedades: no topo a seção Pontos (a antiga janela, mesmos controles) e abaixo o item escolhido na árvore: peça (nome, posição, rotação, espelho, troca de fios), Projeto (nova costura, fechar montagem) ou costura. Pontos escolhidos e item da árvore aparecem juntos, nessa ordem.
