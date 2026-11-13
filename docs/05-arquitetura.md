# 05 — Arquitetura

## 1. Decisões de base

| Tema         | Decisão                                       | Motivo                                                                             |
| ------------ | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| Plataforma   | Aplicativo web estático, executado localmente | Escolha do usuário; funciona no Windows sem instalador                             |
| Linguagem    | TypeScript em modo estrito                    | Tipos protegem as estruturas de pontos; mesma linguagem na interface e nos motores |
| Interface    | React + Vite                                  | Pilha comum e bem suportada pelo Claude Code                                       |
| 3D           | three.js, com @react-three/fiber e drei       | Controles de câmera e manipuladores prontos                                        |
| Estado       | zustand + immer                               | Estado único com histórico de desfazer por patches                                 |
| Persistência | IndexedDB (idb) e arquivo `.novelo.json`      | Sem servidor                                                                       |
| Motores      | TypeScript puro, sem DOM, em Web Workers      | Testáveis no Node; a interface não trava                                           |
| Testes       | Vitest, fast-check e Playwright               | Unidade, propriedades e navegador                                                  |
| Licença      | GPL-3.0-or-later                              | Ver `03-licencas-e-reuso.md`                                                       |

Versões de referência conferidas em 2026-11-10 estão em `03-licencas-e-reuso.md`. Na criação do projeto, usar as versões estáveis do dia; se alguma combinação não funcionar (por exemplo TypeScript 7 com alguma ferramenta), recuar para a versão anterior e registrar em `14-decisoes-e-riscos.md`.

## 1.1 Revisão de 2026-11-11 (prevalece sobre o restante deste documento)

- **Núcleo = grafo de pontos** (nós = pontos; arestas "sai de" e "ao lado de"), neutro de técnica (crochê/tricô é atributo do ponto). A pintura de fio é guardada por ponto, no grafo. A **malha 3D é derivada**: posições vêm de um layout e servem a visualização, pintura e seleção. Todas as vistas (receita, gráfico, 3D, tutorial) consultam o grafo.
- **Geradores de grafo:** receita em texto; perfil de revolução (analítico); peças compostas e achatadas; malha livre STL → grafo (último). Revolução é um gerador, não o limite do escopo.
- **Interoperabilidade opcional** no pacote `interop`: texto de receita do CrochetPARADE, conferência por GLTF/SVG, símbolos SVG do Crochet Charts, Remesher no futuro. Nada no núcleo depende deles.
- **Monorepo reduzido:** sem comlink nem workers no início (entram se a medição em P2 exigir). `tutorial` entra em P4; `engine-reverse` passa a ser o layout de posições (D-17).
- Motor de posições: decidido na Fase 0 (D-17).

## 2. Visão em camadas

```
┌──────────────────────────────────────────────────────────────┐
│ apps/studio  (React + three.js)                              │
│ Modelar · Pintar · Pontos · Receita · Tutorial · Importar    │
└───────────────▲──────────────────────────────▲───────────────┘
                │ estado (zustand)              │ workers (comlink)
┌───────────────┴───────────┐   ┌──────────────┴───────────────┐
│ charts · tutorial         │   │ engine-forward · engine-reverse│
│ (saídas)                  │   │ (motores)                     │
└───────────────▲───────────┘   └──────────────▲───────────────┘
                │                              │
┌───────────────┴──────────────────────────────┴───────────────┐
│ notation (dialetos, analisador, impressor) · interop          │
└───────────────────────────▲──────────────────────────────────┘
                            │
┌───────────────────────────┴──────────────────────────────────┐
│ core (tipos, receita, grafo de pontos, validação, amostra)    │
└──────────────────────────────────────────────────────────────┘
```

Regra de dependência: um pacote só importa de pacotes abaixo dele. `core` não importa nada do projeto.

## 3. Estrutura do repositório

```
novelo3d/
├─ CLAUDE.md
├─ README.md
├─ LICENSE                      # GPL-3.0, texto oficial
├─ NOTICE.md                    # origem de código e conteúdo de terceiros
├─ package.json                 # workspaces npm
├─ tsconfig.base.json
├─ biome.json
├─ vitest.config.ts
├─ docs/                        # estes documentos
├─ referencia/                  # material da sessão de origem (não é código do produto)
├─ packages/
│  ├─ core/                     # tipos e regras de receita
│  ├─ notation/                 # texto ↔ receita, dialetos BR/US/UK
│  ├─ engine-forward/           # geometria → receita
│  ├─ engine-reverse/           # receita → geometria
│  ├─ charts/                   # gráficos SVG e PDF
│  ├─ tutorial/                 # roteiro de passos
│  └─ interop/                  # CrochetPARADE e arquivo de projeto
├─ apps/
│  └─ studio/                   # interface
└─ e2e/                         # testes Playwright
```

Cada pacote tem `src/`, `test/` e um `README.md` de uma página dizendo o que entra e o que sai.

## 4. Responsabilidade de cada pacote

### core

- Tipos: `Project`, `Part`, `Pattern`, `Row`, `Op`, `StitchGraph`, `Gauge`, `Yarn`.
- Tabela de pontos: quantos pontos cada operação consome e produz.
- Expansão de repetições e construção do grafo de pontos.
- Validação de contagem e relatório de verificação.
- Sem dependências externas além de `zod` para validar arquivos.

### notation

- Dicionários de dialeto: português do Brasil, US e UK.
- Analisador tolerante de texto de receita.
- Impressor: receita → texto, com dobra de repetições.
- Conversão entre dialetos.

### engine-forward

- Geometria paramétrica (perfil de revolução) → carreiras → contagens → distribuição de aumentos e diminuições → `Pattern`.
- Mais tarde: malha livre por isolinhas geodésicas e acoplamento.

### engine-reverse

- `Pattern` → perfil analítico → malha de pontos 3D.
- Mais tarde: relaxação física e ajuste de perfil com assimetria.

### charts

- Porta para TypeScript do formato de gráfico da sessão (ver `10-saidas-receita-grafico-tutorial.md`).
- Entrada: `Pattern` validado e opções. Saída: texto SVG por página e PDF.

### tutorial

- Converte o grafo de pontos em uma lista ordenada de passos com texto, pais do ponto e avisos de troca de cor.
- Não desenha nada; a interface consome o roteiro.

### interop

- Arquivo de projeto `.novelo.json` com versão de esquema e migrações.
- Importação e exportação de um subconjunto da linguagem do CrochetPARADE.

### apps/studio

- Áreas de trabalho, visualização 3D, editores e painéis.
- Chama motores por workers e nunca calcula contagens por conta própria.

## 5. Fluxo de dados

### Sentido direto

```
perfil + amostra + opções
   └─► engine-forward.generate()  ─► Pattern
          └─► core.validate()      ─► relatório (deve passar)
          └─► core.buildGraph()    ─► StitchGraph
                 ├─► engine-reverse.embed()  ─► posições 3D dos pontos (prévia)
                 ├─► notation.print()        ─► receita escrita
                 ├─► charts.render()         ─► SVG / PDF
                 └─► tutorial.script()       ─► passos
```

### Sentido reverso

```
texto da receita
   └─► notation.parse()        ─► Pattern + avisos de leitura
          └─► core.validate()  ─► tabela de verificação (usuário confirma ou corrige)
          └─► core.buildGraph()
                 └─► engine-reverse.reconstruct() ─► perfil + malha
                        └─► "converter em peça editável" ─► geometria paramétrica
```

## 6. Fonte da verdade de cada peça

Uma peça tem exatamente uma fonte da verdade, indicada por `part.source`:

| `source`   | O que o usuário edita | O que é derivado                       |
| ---------- | --------------------- | -------------------------------------- |
| `geometry` | Perfil e parâmetros   | Receita, grafo, gráfico                |
| `pattern`  | Linhas da receita     | Geometria reconstruída, grafo, gráfico |

- Converter de `pattern` para `geometry` é uma ação explícita do usuário ("Converter em peça editável").
- Converter de `geometry` para `pattern` também é explícito ("Congelar receita"), para ajustes manuais de pontos.
- Não existe sincronização automática nos dois sentidos. Isso evita conflitos e mantém o comportamento previsível.

## 7. Workers e desempenho

- Motores rodam em Web Workers, expostos com comlink. A interface envia a entrada serializável e recebe o resultado.
- Toda chamada longa aceita cancelamento.
- Metas iniciais, a medir no marco M7:
  - gerar receita de peça de revolução com 3.000 pontos em menos de 100 ms;
  - desenhar 20.000 pontos em 3D a 60 quadros por segundo, com `InstancedMesh`;
  - gráfico SVG de uma peça em menos de 200 ms.

## 8. Internacionalização

- Textos da interface em um dicionário por idioma; começar com `pt-BR`.
- Termos de crochê vêm de `notation`, e não do dicionário da interface, para que receita e interface possam usar dialetos diferentes.

## 9. Tratamento de erros

- Motores nunca lançam exceção por entrada do usuário; devolvem `Result` com lista de `Issue { code, severity, rowId?, message }`.
- Códigos de erro são estáveis e em inglês (`COUNT_MISMATCH`, `UNKNOWN_TERM`); as mensagens são traduzidas na interface.
- Exceções ficam reservadas para falhas de programação.

## 10. O que reaproveitar de fora

| Necessidade                     | Opção recomendada                                                    | Alternativa                                                                   |
| ------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Layout físico do grafo (M8)     | Implementação própria por dinâmica baseada em posição, em TypeScript | Compilar `graph.cpp` do CrochetPARADE para WebAssembly                        |
| Forma livre (M10)               | Reimplementar o método do AmiGo a partir do artigo                   | Integrar o Remesher como módulo WebAssembly e importar a saída pela `interop` |
| Operações booleanas entre peças | manifold-3d                                                          | Evitar; manter peças separadas                                                |
| Seleção e pintura sobre a malha | three-mesh-bvh                                                       | Raycast nativo do three.js                                                    |
| PDF                             | jspdf + svg2pdf.js com fonte embutida                                | Impressão do navegador com CSS `@page A4`                                     |

## 1.2 Camada de comandos e MCP (2026-11-11, D-21)

Toda função do aplicativo é um **comando** nomeado (`pattern.verify`, `chart.render`, ...), com entrada e saída JSON, numa camada `commands` sem DOM. A interface e a **ponte MCP** chamam os mesmos comandos. O servidor está em `tools/mcp-server` (stdio + ponte HTTP local em 127.0.0.1; protocolo no README da pasta). O aplicativo conecta por long-poll a partir de P0. Scripts headless rodam em Node contra os motores puros.

## Pacote `stitch3d` (R1, 2026-11-12)

`packages/stitch3d` — modelo 3D dos pontos: referencial e matriz por ponto, modelos por variante (tubo de seção quadrada) e tubo contínuo. Puro (sem three nem DOM); depende só de `core`. O `studio` o importa direto (a regra de dependência passou a `studio → commands, stitch3d`; `commands → …, stitch3d` só para as chaves de modelo). Testado em `layers.test.ts`.
