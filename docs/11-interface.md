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

> **P4 (2026-11-13):** o tutorial é a janela "Tutorial", na área de baixo à direita do layout clássico (junto do 3D, que precisa estar à vista para mostrar o destaque). Quem tem layout salvo antigo a encontra no menu Layout, em painéis ocultos, ou escolhendo um preset. Atalhos: setas esquerda e direita (fora de campos de texto). A barra de tocar, pausar e velocidade e a miniatura do gráfico não foram feitas.

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
