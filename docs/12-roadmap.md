# 12 — Roadmap

> Revisado em 2026-11-11. Substitui o roteiro M0–M11 do handoff. Um marco por vez; cada um termina com algo que o usuário abre e avalia. Não iniciar um marco antes de o anterior ser aprovado.

## Estado em 2026-11-15: P0 a P5 entregues; próxima etapa P6

Feitos: P0 a P5 (P5 em 2026-11-14: forma → receita, peça composta, seção não circular, STL → peças com onde costurar; D-71 a D-76), marco G (interface 2, aprovado), exe para Windows (D-70). A galinha (receita comprada, privada) roda em toda revisão com `npm run galinha`: o modelo por formas reproduz bico, crista e asas volta a volta e o corpo com as mesmas 33 voltas e 1,3% de diferença no total (só a distribuição do pescoço). Pausados (D-57): série R (render realista), criador de pontos (etapa E). Abertas: perguntas guardadas 1 a 25 (abaixo). **Próxima pelo roteiro: P6 (tricô), cujo portão da F0 pedia só que P3 estivesse pronto** (D-19: grafo neutro com campos reservados; conversão só por geometria compartilhada, nunca ponto a ponto).

## Visão geral

| Marco | Entrega                                                                                | Depende de |
| ----- | -------------------------------------------------------------------------------------- | ---------- |
| F0    | Fase 0: verificação e decisões (sem código de produto)                                 | —          |
| P0    | Fundação: repositório, ferramentas, esqueleto mínimo (equivale ao antigo M0, reduzido) | F0         |
| P1    | Fatia fina: receita → verificação → gráfico circular → texto CP                        | P0         |
| P2    | Visualização 3D ponto a ponto, ligada ao gráfico e à receita                           | P1         |
| P3    | Pintura de regiões de fio                                                              | P2         |
| P4    | Tutorial passo a passo                                                                 | P2         |
| P5    | Modelagem por peças além da revolução; depois malha livre                              | P3         |
| P6    | Tricô e conversão tricô↔crochê (condicionado ao portão da F0)                          | P3         |

Primeira versão utilizável: fim de P3. Rever este roteiro com o usuário ao fim de cada marco.

---

## F0 — Fase 0: verificação

Somente leitura e uso das ferramentas; nenhum código de produto. Cada item termina em go/no-go registrado em `14-decisoes-e-riscos.md`.

1. **Ida e volta no CrochetPARADE:** escrever à mão uma esfera em CP, abrir em crochetparade.org, exportar GLTF, SVG e dump de debug. Go: o export traz identidade de ponto (linha/índice) e posição.
2. **Esquema dos exports:** ler `Manual.md` e `capabilities.md` §4; anotar campos úteis para conferência cruzada.
3. **Remesher:** esquema do `pattern.json`; existe WASM pré-compilado; a receita CP está dentro do JSON?
4. **Crochet Charts:** mapear nome → SVG → abreviação (`crochet.xml`, `stitchlibrary`); conferir atribuição nos SVGs; confirmar CC BY-SA 4.0 → GPL-3.0-or-later e registrar em `03`.
5. **Knotly:** o usuário envia 3–5 capturas ou descreve o que mais valoriza (cor do fio, ponto individual, sombreamento, vistas direito/avesso); registrar requisitos visuais.
6. **Motor de posições (D-17):** embutir o layout GPL do CrochetPARADE (`graph.cpp`/WASM) ou motor próprio (analítico + relaxação simples).
7. **Portão do tricô (D-19):** (a) o grafo suporta direção de laçada? (b) conversão tricô↔crochê só faz sentido regenerando de geometria compartilhada? (c) há notação aberta de tricô? Parecer curto: adiar ou seguir.

Critério de aceite: relatório em `docs/referencia-f0.md` e decisões D-17 a D-19 fechadas.

## P0 — Fundação (reduzida)

Repositório git, `LICENSE`, `NOTICE.md`, `.gitignore` (inclui `referencia/sessao-sapo/`); workspaces npm; TypeScript estrito; Biome; Vitest; Playwright; pacotes `core`, `notation`, `charts`, `interop` e `apps/studio` com teste trivial; tela inicial com cena three.js. Sem comlink nem workers. Aceite: `npm run check` e `npm run e2e` passam no Windows; teste de dependência entre pacotes.

## P1 — Fatia fina

1. `core`: tipos, grafo de pontos neutro de técnica, `buildGraph`, `validate`.
2. `notation`: dicionários pt-BR/US/UK, analisador tolerante, impressor com dobra de repetições; tradutor de/para texto CrochetPARADE.
3. `charts`: gráfico circular em SVG com símbolos do Crochet Charts (atribuição CC BY-SA) e ajuda para iniciantes.
4. Tela única: colar receita → tabela de verificação → gráfico → exportar texto CP.

Aceite: casos V1–V8 e N1–N12 de `13-plano-de-testes.md`; gráfico da esfera aprovado visualmente; nenhuma sobreposição de símbolos nos casos G1–G6; PDF A4 com acentos corretos.

## P2 — Visualização 3D

Layout de posições por ponto (motor decidido em D-17), desenho por instâncias, seleção de ponto ligada a símbolo e linha da receita, conferência opcional contra GLTF do CP. Referência de qualidade: Knotly.

Aceite: 20.000 pontos a 60 quadros por segundo em máquina comum; clicar no ponto destaca símbolo e linha; ida e volta receita → grafo → receita mantém as contagens.

## P3 — Pintura de fios

Paleta, pintura por faixa de voltas e por pontos (guardada no grafo), trocas de fio na receita, cores e cartões de fio no gráfico, consumo por cor.

Aceite: pintar 3 voltas gera as trocas nas linhas certas; a pintura sobrevive à mudança de amostra. **Fim de P3: primeira versão utilizável.**

## P4 — Tutorial

Roteiro ordenado de passos ligado ao 3D (ponto atual destacado, avisos de troca de cor). Aceite: número de passos igual ao da receita expandida.

**Feito em 2026-11-13 (D-59).** Pacote `packages/tutorial` (`tutorialScript`), comandos `tutorial.get|next|prev|goto|script|reset`, janela "Tutorial" (anterior, próximo, ir à volta, setas do teclado, "Mostrar ponto"), destaque no 3D (ponto atual laranja, bases azuis, feito colorido, por fazer esmaecido), posição guardada por peça e no projeto. P-BOLA dá 402 passos (T1). Ficou de fora, por decisão: tocar/pausar e velocidade, câmera que segue o ponto, miniatura do gráfico, e os avisos `stuffNow`, `placeMarker` e `adaptation`.

## P5 — Modelagem além da revolução

Geradores de grafo: perfil de revolução, cilindros e cones compostos, peças achatadas, montagem de peças; depois malha livre STL → grafo (AmiGo reimplementado a partir do artigo, ou Remesher) com protótipo das duas rotas e escolha com o usuário.

Aceite: peça composta de três partes gera receita válida; modelo orgânico sem ramificações gera receita válida.

### P5 — proposta de etapas (2026-11-14, **aguardando aprovação do usuário**)

O motor direto (`docs/08`) ainda não existe no código: nenhum pacote gera receita a partir de forma. Por isso o P5 começa por ele.

| Etapa                                                               | Entrega                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Aceite                                                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| P5a (feita em 2026-11-14, D-71)                                     | Pacote puro `packages/engine-forward` (só depende de `core`): perfil de revolução (polilinha e primitivas esfera, cone, cilindro, elipsoide, copo), voltas por comprimento de arco, contagem com limites, distribuição de aumentos e diminuições com escalonamento, contagens amigáveis, avisos da seção 4 de `docs/08`; o resultado sai como receita em texto (impressor de `notation`) e passa em `core.validate()`. Comando `forward.revolve`, chamável pelo MCP | Casos F1 a F9 de `docs/13` com os valores exatos; propriedades da seção 5 de `docs/08` (fast-check); mesma entrada, mesmo texto byte a byte |
| P5b (feita em 2026-11-14, D-72)                                     | Peça composta: perfil por trechos encadeados (calota, cilindro, cone, cintura) e janela "Nova peça por forma" no ribbon Montagem: editor de perfil 2D com pontos arrastáveis, contagens e prévia 3D ao vivo. A peça gerada vira peça normal (receita editável, pintura, tutorial) e entra na linha do tempo como uma feature com parâmetros editáveis                                                                                                               | Peça de três trechos gera receita válida; editar o perfil pela linha do tempo regenera a receita; e2e com captura                           |
| P5c (feita em 2026-11-14, D-73)                                     | Seção não circular (peças achatadas, saliências): laço da volta por escala no ângulo e acoplamento por programação dinâmica (`docs/08` seção 2)                                                                                                                                                                                                                                                                                                                     | Seção circular reproduz a distribuição da P5a (regressão); peça achatada gera receita válida com aumentos concentrados nos lados            |
| P5d (feita em 2026-11-14: rota A com divisão em peças, D-74 a D-76) | Malha livre (STL → receita): protótipo das duas rotas (geodésica do artigo do AmiGo e Remesher) e escolha com o usuário                                                                                                                                                                                                                                                                                                                                             | Modelo orgânico sem ramificações gera receita válida                                                                                        |

Decisões a confirmar antes de começar:

- **Altura da volta (`h`).** Recomendo uma configuração ao lado da largura do ponto (`yarns.stitchWidthMm`), com padrão igual à largura (5 mm, como nos casos F2, F3 e F5).
- **Contagens amigáveis.** Recomendo ligadas no modo iniciante (múltiplo de 6, tolerância de 1 ponto: caso F6a) e desligadas no padrão.
- **Unidade das posições (pergunta 25).** A P5b mostra medidas em mm no editor de perfil; recomendo passar as posições da tela para mm no mesmo trabalho.

## P6 — Tricô

Só inicia se o portão da F0 aprovar. Entrega: notação e gráfico de tricô e conversão por geometria compartilhada. Critérios definidos após o parecer.

## Regra transversal: operável por MCP (D-21, 2026-11-11)

Todo marco só é aceito se suas novas funções forem exercitadas por `novelo_run_script` (motores puros) ou `novelo_bridge_call` (aplicativo), sem cliques manuais. P0 inclui o lado do aplicativo da ponte e a camada de comandos. O servidor MCP já existe (`tools/mcp-server`), sem funções de produto.

## Estado (2026-11-11)

F0 fechada. P0 concluído: `npm run check` (14 testes) e `npm run e2e` passam no Windows; o e2e aciona comandos do app via MCP. Aguardando aprovação do P1.

## P1 concluído (2026-11-11)

Entregue: `core` (tipos, simulação, validação V1–V8, grafo), `notation` (dicionários pt-BR/US/UK, analisador tolerante, impressor com dobra, casos N1–N12), `interop` (texto CrochetPARADE nos dois sentidos, conferido contra o export real da F0), `charts` (gráfico circular A4, 2 páginas na P-BOLA, 0 sobreposições), tela única e PDF A4 por impressão do navegador.

Desvios do roteiro: símbolos desenhados em código, não os SVGs do Crochet Charts (nenhum download nem pendência de licença; D-18 fica para quando faltar símbolo); gráfico sem linhas de ligação, cartão de fio, adaptações, página de pontos nem tipos retangulares; casos G1–G6 não reproduzidos um a um, só a P-BOLA (G1/G2/G6 equivalentes).

## P2 concluído (2026-11-11)

Entregue: `packages/layout` (início analítico por revolução + descida estocástica do stress; modo denso até 1.200 nós, modo de pivôs acima), comando `graph.layout`, aba 3D no studio (malha instanciada, cor de fio por ponto, clique no ponto ↔ volta na tabela, grafo de ligações opcional, ajuste de câmera).

Verificado: distâncias entre pares do nosso layout × layout do CrochetPARADE (export da F0) com correlação ≥ 0,9; bola com aresta média 1 (reescala como no CP); 20.053 nós em 1,9 s (Node) e 2,9 s na página; tubo de 834 voltas reto (desvio de 2 pontos); 433 nós da bola e 17 contagens iguais às da receita; `graph.layout` por MCP.

**Não verificado:** 60 quadros/s em GPU real. No navegador sem GPU (renderização por software) mediu-se ~127 quadros/s com 20.000 pontos, o que indica folga, mas não substitui um teste na máquina do usuário. A conferência contra o GLTF do CP não foi feita (o GLTF não identifica pontos; o `.dot` serviu de referência). Formato dos pontos é uma elipsoide simples; o relevo "casquinha" do Knotly (item 5 da F0) fica para refinar com as capturas.

### P2: navegação 3D estilo FreeCAD (2026-11-11, pedido do usuário)

Cubo de vistas clicável no canto (26 regiões: faces, arestas e cantos; rótulos em português), botões e atalhos das vistas padrão com as teclas do FreeCAD (1 frente, 2 topo, 3 direita, 4 trás, 5 base, 6 esquerda, 0 isométrica, F ajusta à peça), animação curta entre vistas, giro com o botão esquerdo, deslocamento com o do meio ou direito, zoom na roda. Eixo Z para cima. O código do FreeCAD (C++/Coin3D) não é reaproveitável numa página web: reproduzimos o comportamento em three.js (`viewcube.ts`, `view3d.ts`). Verificado em navegador (`e2e/p2.spec.ts`); a sensação de uso com mouse real fica por sua conta.

### Cubo de vistas chanfrado e menu de configurações (2026-11-11, pedido do usuário)

- Cubo chanfrado por padrão, fixo no canto inferior direito: faces, arestas e cantos são 26 peças próprias, com realce ao passar o mouse. Também existe o cubo simples.
- Menu **Configurações** (botão no cabeçalho, Esc fecha), aba **Interface**: posição (4 cantos), cubo chanfrado ou simples, tamanho (64 a 240 px; padrão 112). Valores gravados no navegador e restaurados ao abrir.
- As configurações são comandos (`settings.get`, `settings.set`, `settings.reset`, D-21): o Claude lê e altera os mesmos valores pelo MCP. Novas abas entram em `SettingsDialog.tsx` e `packages/commands/src/settings.ts`.

### Interface modular (2026-11-11, pedido do usuário)

Cada seção virou um **painel** (`recipe`, `verify`, `chart`, `view3d`, `cp`) dentro de **janelas** organizadas numa árvore de divisões:

- **Tamanho editável:** divisores arrastáveis (mouse) ou com as setas do teclado; mínimo de 6% por janela.
- **Encolher em barra:** botão "–" da janela; a barra fica na borda (vertical ou horizontal) e restaura com um clique. O espaço liberado vai às vizinhas.
- **Abas como num navegador:** vários painéis por janela; arraste uma aba para o centro de outra janela (vira aba) ou para uma borda (divide a janela e cria uma nova). "×" oculta o painel; o menu **Layout** o traz de volta.
- **Presets:** Clássico (o layout anterior), Foco no 3D, Gráfico em destaque, Empilhado e Tudo em abas. São só dados em `packages/commands/src/presets.ts`: ajustar ou criar um preset é editar essa lista.
- **Layouts do usuário:** menu **Layout > Salvar layout atual**; renomear e excluir em **Configurações > Layout**; tudo gravado no navegador e restaurado ao abrir.
- **MCP (D-21):** `workspace.get / applyPreset / saveCustom / renameCustom / deleteCustom / movePanel / collapse / setActive / resize / setSizes / hidePanel / showPanel / reset`.
- Código: modelo puro em `packages/commands/src/workspace.ts` (+ store e presets), interface em `apps/studio/src/Workspace.tsx`, `LayoutMenu.tsx` e `SettingsDialog.tsx`.

Também corrigido: a ponte MCP agora recusa na hora os comandos em andamento quando o app reconecta (antes ficavam presos até o tempo limite), e o app mantém uma única conexão com a ponte (o React em desenvolvimento registrava duas vezes).

### Escala da interface e janelas estreitas (2026-11-11, pedido do usuário)

Em **Configurações > Interface**:

- **Tamanho da interface** (70% a 150%, padrão **90%**; botões Compacto 80 / Padrão 90 / Confortável 100 / Grande 120): escala texto, botões e caixas juntos (o CSS inteiro passou de px para rem).
- **Tamanho do texto (extra)** (80% a 150%): só o texto, sobre a escala da interface.
- **Largura mínima da janela 3D** (200 a 700 px, padrão 320; altura mínima = 80%).
- **Em janela estreita, juntar os painéis em abas** (ligado por padrão).

Como a janela estreita é tratada:

1. **Mínimos por painel** (receita 220×150, verificação 260×130, gráfico 280×220, 3D configurável, texto CP 220×120, na escala 100%). Os divisores param no mínimo das duas janelas vizinhas.
2. Se a soma dos mínimos não cabe na área, com o modo automático ligado o espaço de trabalho mostra **todos os painéis como abas de uma só janela**, só para exibir: o layout salvo não muda e volta sozinho quando a janela alarga. Com o modo desligado, o espaço de trabalho **rola** em vez de espremer.
3. O **cubo de vistas** encolhe (no máximo 45% do lado menor do 3D) e some se ficaria menor que 48 px.
4. Faixa de abas rola na horizontal; cabeçalho e diálogo se reorganizam em telas estreitas.
5. O app só calcula o 3D quando o painel está de fato à vista (inclusive no modo compacto).

Tudo também por MCP: `settings.set {interface:{scale, textScale, min3d, autoCompact}}` (valores fora da faixa são limitados; tipos errados dão erro).

## P3 concluído (2026-11-11): primeira versão utilizável

Entregue:

- **Fios e pintura no núcleo** (`core/paint.ts`): paleta (1 a 8 fios, o A é o base; padrão A verde musgo, B off white), regiões de pintura por faixa de voltas ou por pontos `(volta, posição)`, regiões mais abaixo vencem, avisos quando a receita muda e a pintura não acha o que pintar (a região é ignorada, nunca apagada).
- **Trocas de fio na receita** (`notation/print-yarns.ts`): "V7–9: trocar para o fio B (off white), 1 pb em cada ponto (36)" e "V10–12: trocar para o fio A…", também no meio da volta ("6 pb, trocar para o fio A, 30 pb"), em pt-BR e em inglês; voltas iguais continuam juntadas.
- **Gráfico**: cartões de fio no alto da página, halos de cor só nos pontos que não são do fio A, anéis lisos separados por fio com ponto de cor na etiqueta.
- **3D**: cada ponto na cor do seu fio, atualizada na hora.
- **Consumo por fio**: pontos, metros e % (estimativa: 4,2 × a largura do ponto por ponto baixo; calibrar com amostra, risco R-01).
- **Painel Fios** (aba junto ao texto CP): paleta editável (cor e nome), pincel, pintar voltas, volta selecionada na tabela e ponto selecionado no 3D, lista de pinturas, consumo e a receita com as trocas. Paleta, pintura, receita e dialeto ficam gravados no navegador.
- **MCP (D-21)**: `yarns.get/set`, `paint.rows/stitches/remove/clear/reset`, `paint.report`; `chart.render` e `graph.layout` usam a pintura do projeto.

Aceite: pintar 3 voltas gera as trocas nas linhas certas (casos C1 e G5 do plano; testes de unidade e e2e). **A pintura sobrevive à mudança de amostra** no sentido de ser topológica: depende só de volta e posição, então nem o layout 3D (mesma posição com ou sem pintura, testado) nem a largura do ponto a movem. Não existe ainda peça por perfil de revolução com amostra editável (P5); a pintura por faixa em milímetros do perfil (C2 do plano) fica para lá.

Fora do P3 (registrado, não feito): trocas de fio no texto do CrochetPARADE (a sintaxe de cor não foi verificada na F0), pintar arrastando no 3D, "cor recomendada" nos cartões.

## P3.5 concluído (2026-11-11): motor de pontos, seleção, ferramentas, tensão, fios e montagem

Pedido do usuário depois do P3. Decisões D-36 a D-39; desenho do motor em `docs/15-motor-de-pontos.md`.

- **Motor de pontos** (`packages/core/src/engine`): `PointStore` (índice denso, uid permanente, colunas, topologia em CSR), `uids.ts` (realinhamento por diferença de sequência), `props.ts` (edições esparsas por uid), `select.ts` (máscaras e formas) e `tools.ts` (pincel, balde, listras, gradiente, suavização). Construir 20.000 pontos leva menos de 1,5 s no teste.
- **Seleção** (`selection.*`): por ponto, volta, coluna, vizinhança (saltos), caminho A→B (pelo fio ou mais curto), filtros (fio, tensão, ponto, voltas, ordem), formas 3D (esfera, elipsoide, caixa, corredor, fatia) e formas na tela (retângulo, elipse, laço); operações substituir, somar, tirar, interseção, inverter. Na tela: Shift soma, Ctrl tira, Alt + arrasto gira a câmera.
- **Ferramentas** (`tool.*`, `points.set`, `history.*`): pincel com raio em saltos, balde, conta-gotas, borracha, listras repetidas (ex.: 2A/1B), gradiente e suavização de tensão, desfazer/refazer (100 passos), tudo sobre a seleção ou um alvo.
- **Tensão**: propriedade por ponto, tensão padrão do projeto, tamanho do ponto no layout (`packages/layout`, `sizes`) e no 3D.
- **Fios** (`yarns.library`, `yarns.preview`): cor por comprimento gasto, material e espessura (tabelas aproximadas de EUA, Reino Unido/Europa e Brasil); consumo por fio com espessura e gramas aproximadas.
- **Montagem** (`parts.*`, `seam.*`, `assembly.layout`): peças original, instância, espelhada e cópia; posição e rotação; troca de fios na instância; costuras entre linhas contínuas com validação de contagem, sentido, proporção e tipo; vista 3D com todas as peças e as linhas de costura.
- **Interface**: painéis "Pontos" e "Montagem" (e o editor de fio dentro de "Fios"); persistência por peça no navegador.

Verificação: `npm run check` (179 testes) e `npm run e2e` (28 testes), mais testes de protocolo do MCP.

Fora do P3.5 (registrado, não feito): prévia imediata da tensão durante o arrasto (o layout é refeito ao soltar), costura simulada fisicamente, tutorial (P4).

### P3.5, 2ª rodada (2026-11-11, pedido do usuário)

- **Costura no 3D** (nível 1): curvas arqueadas na cor do fio de costura (configurável), com o tom clareando ao longo da linha para mostrar o sentido.
- **Fechar montagem** (nível 2, D-40): `assembly.close` e botão em Montagem; mostra a folga por costura e desfaz o fechamento.
- **Configurações › Fios e costura** (D-41): padrão dos fios novos e da costura.
- **Lista de materiais** (D-42): painel "Materiais" e janela flutuante (botão no topo); consumo por peça, edição de qualquer propriedade, troca de fio em todo o projeto, costuras e fio de costura.
- **Fora desta rodada**: simulação física da costura (nível 3), fio de costura por costura (hoje é o padrão global), consumo de costura calibrado (hoje ~3 larguras de ponto por par).

Verificação: `npm run check` (190 testes) e `npm run e2e` (31 testes).

## R — Renderização (planejado em 2026-11-12, aguardando aprovação)

Proposta do usuário: 3D de edição simplificado (fio como tubo) + janela de renderização com botão play + modelo de ponto pré-simulado por variante + "simular todos" só para o que mudou + janela de criação de pontos. Estudo de viabilidade: viável, com as ressalvas abaixo.

| Fase          | Entrega                                                                                                                                                                                          | Esforço     | Risco                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------- |
| R1            | 3D de edição com o fio como tubo contínuo na ordem de trabalho (espessura e cor por fio); seleção e pintura continuam                                                                            | 1–2 sessões | Baixo                                                       |
| R2            | Registro de tipos de ponto (dados) + curva 3D por tipo e variante (tipo, fio, tensão em 9 níveis), em cache; encaixe nas âncoras dos vizinhos                                                    | 2–3         | Médio: continuidade entre pontos, aumento/diminuição, polos |
| R3            | Janela Render: raster rápido (AO, sombras, suavização), luz, câmera, resolução, play progressivo, salvar PNG; "simular todos" refaz só as variantes alteradas + relaxamento leve por espaçamento | 2–3         | Médio                                                       |
| R4            | Modo realista por path tracing na GPU (fibra, felpa por material)                                                                                                                                | 2–3         | Médio: depende da GPU do usuário                            |
| R5            | Janela Criador de pontos: curva do laço, quantos pontos consome/produz, abreviações por dialeto, símbolo; validação de contagem                                                                  | 2–4         | Médio: notação e contagem                                   |
| R6 (opcional) | Simulação física de haste elástica para gerar/validar modelos                                                                                                                                    | semanas     | Alto                                                        |

Ressalvas: o modelo por variante ignora o aperto entre vizinhos (mitigar com pequena variação e relaxamento); a qualidade depende do layout atual; simulação física da peça inteira no navegador fica fora do escopo.

### R — revisão (2026-11-12, proposta do usuário)

- **3D de edição:** modelo de ponto de baixa resolução gerado uma vez por variante (tipo, fio, tensão em níveis; na criação do fio e sob demanda), instanciado com deformação linear (matriz por ponto) para ligar entrada e saída; clipping é aceito. Tubo contínuo vira nível de detalhe para peças muito grandes. Funde R1 e R2.
- **Render, modo padrão:** pontos com os mesmos parâmetros físicos são gerados uma vez e instanciados (deformação por curva, não só linear).
- **Render, modo avançado:** a seleção do usuário é simulada por completo com os vizinhos como contorno fixo (1 salto de transição); limite de pontos por rodada, resultado em cache por uid e contexto. Depende de um motor de relaxamento com colisão (antes R6), agora parte do R3.

### R0 concluído (2026-11-12)

Correções da revisão (D-43 a D-47): uids confirmados e casados por voltas, desfazer global, consumo com tensão/largura, layout a quente, 3D só atualiza cores e desenha sob demanda. `npm run check` 212 testes, `npm run e2e` 32. A revisão do Fable apontou 6 achados; 1 a 5 corrigidos (desfazer não reverte receita, uids ao recarregar com voltas, contador de uids nunca regride, confirmação só de receita válida, refazer limpo entre pilhas). Falta: R1 em diante e os itens 7 e 9 da revisão.

### R1 concluído (2026-11-12)

Modelo de ponto por variante instanciado no 3D de edição (D-48 a D-51): 20 mil pontos em 1,93 M de triângulos e 2 lotes (antes 5,06 M), montagem 57 ms, 127 quadros/s no GL por software; nível tubo; registro de tipos; pacote `stitch3d`. R3b feito (janela Render: raster com sombras, play/pausar/parar, PNG; fica fora por ora AO, instanciar blocos e "simular todos"). R3c e R3d feitos (seleção; forma do ponto base, render completo ponto a ponto pausável com ritmo, reaproveitamento de blocos, AO; a simulação que move posições foi encerrada, D-53). Falta: R4 (path tracing), R4 (path tracing) e a proposta de interface do criador de pontos.

## G — Interface 2 (D-65, aprovado em 2026-11-13)

Plano aprovado pelo usuário, com mockup (`docs/imagens`: ver o relatório da etapa). Cada etapa termina com captura de tela e aprovação.

| Etapa | Entrega                                                                                                                                                                                                                                                                                                                                        | Estado                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1    | Casca: barra de título, ribbon, busca de comandos, menu Janelas independente dos layouts, preset "Edição", cubo embaixo à esquerda com menu de vista, barra de opções, migração única. Os botões de ação das janelas (aplicar à seleção, listras, criar costura...) ainda ficam nelas e saem em G4                                             | feita em 2026-11-13                                                                                                                                                                                                                                                                                                                                            |
| G2    | Modo de leitura do tutorial (substitui a janela Tutorial): só o 3D e a faixa do passo, passo = cadeia de pontos iguais (agrupamento do anexo v3), slides de revisão por marco, teclas bem visíveis (D-66)                                                                                                                                      | feita em 2026-11-14                                                                                                                                                                                                                                                                                                                                            |
| G3    | Gráfico v3: faixa de pb seguidos, etiqueta "Nx", tabela "Receita volta a volta", faixa de marcas, página de continuação (anexo em `docs/17`, D-60 a D-64). Fora desta entrega: marcadores na volta, instrução curta, carreira de início, compactação extra, `lig`/`unw`/adaptações, gráficos linear e retangular (lista em `docs/17` seção 11) | pronta em 2026-11-14, **aprovada visualmente pelo usuário em 2026-11-14** (regra 7)                                                                                                                                                                                                                                                                            |
| G4    | Árvore (peças, montagens e costuras, com ícones próprios), editor de propriedades, clique direito, mostrar/ocultar/isolar; saem as janelas Pontos, Fios, Montagem e Materiais                                                                                                                                                                  | pronta em 2026-11-14: janelas Árvore e Propriedades no lugar de Montagem, Pontos, Fios e Materiais (Materiais só flutuante, Fios na paleta flutuante do ribbon Pintar), migração do layout salvo, visibilidade das peças e menu de clique direito na árvore. Desvios: ver perguntas 12 e 13; ícones próprios na árvore e propriedades de costura ainda simples |
| G5    | Montagens com posição e rotação próprias; "Nova montagem" no clique direito (peças selecionadas entram nela)                                                                                                                                                                                                                                   | pronta em 2026-11-14 (D-67)                                                                                                                                                                                                                                                                                                                                    |
| G6    | Linha do tempo de features só com ícones (⏮ ◀ ▶ ⏭, marcador, suprimir, editar, excluir, reexecução)                                                                                                                                                                                                                                            | pronta em 2026-11-14 (D-68); editores de parâmetros só para receita, pintura por voltas, posição e rotação de peça e valor de ponto                                                                                                                                                                                                                            |
| G7    | Medir (altura, diâmetro, distância; estimativa que depende da largura do ponto) e corte (seção) do 3D                                                                                                                                                                                                                                          | feita em 2026-11-14 (D-69): tamanho em Propriedades, ferramenta Distância, corte X/Y/Z com posição e inverter lado; testes em `medidas.test.ts` e `e2e/medidas.spec.ts`.                                                                                                                                                                                       |

### Fechamento do marco G (2026-11-14, aprovado)

G1 a G7 entregues e testadas; **o usuário aprovou o visual de G3 a G7 em 2026-11-14 e o marco G está fechado.** Teste que cruza as etapas: `e2e/marco-g.spec.ts` (instância, montagem, pintura, desfazer e refazer, esconder, corte, leitura, exportar, importar, recarregar). Lacunas declaradas, por etapa:

- G1 e G4: perguntas 12 e 13; ícones próprios na árvore e propriedades de costura simples.
- G2: perguntas 2 a 4 (marco escrito na receita, várias peças na leitura, troca de fio como aviso).
- G3: `docs/17` seção 11. No gráfico de 30 voltas, a página 7 é só a tabela das voltas 28 a 30 numa página quase vazia (regra D-63), e na página 6 os símbolos e etiquetas ficam muito pequenos; na bola, as etiquetas de volta 7 a 9 encostam nas etiquetas "Nx". Nada foi ajustado (regra 7).
- G5: pergunta 14 (`assembly.close` ignora as transformações da montagem); posição e rotação sem unidade na tela (pergunta 25).
- G6: editores só para receita, pintura por voltas, posição e rotação da peça e valor de ponto; os nomes das features vêm de uma tabela (`PLAIN` em `timeline.ts`) e a faixa não mostra ainda os parâmetros delas.
- G7: sem altura e diâmetro rotulados, sem linha entre os pontos, piso some no corte (perguntas 21 a 23).

Desempenho medido na receita de 6210 pontos com instância: mover peça cerca de 150 ms; traço de pincel e desfazer cerca de 4,4 s, iguais com a Árvore ou as Propriedades à mostra (medida de tamanho visível).

### Perguntas guardadas (usuário autorizou seguir sem perguntar; responder quando puder)

1. **Caso G12 do anexo v3.** O anexo espera `(1x aum; 1x pb) ×6` na volta 3 da bola, mas a receita do projeto escreve `(1 pb, 1 aum) x6`. Por regra, valor de referência não muda para o teste passar: sigo a ordem da receita (o teste confere o que o código produz e aponta para esta pergunta) até o usuário decidir. **Resposta do usuário (2026-11-15): a tabela segue a ordem da receita; ajustar o caso G12 do anexo.**
2. **Marco escrito na receita.** Assumido: uma linha `#marco texto` marca o fim de marco depois da volta anterior (hoje `#` é comentário). **Resposta do usuário (2026-11-15): confirmado.**
3. **Projeto com várias peças no modo de leitura.** Assumido: só a peça ativa, as outras esmaecidas. **Resposta do usuário (2026-11-15): confirmado.**
4. **Troca de fio.** Assumido: aparece como aviso no passo, não vira marco. **Resposta do usuário (2026-11-15): confirmado.**
5. **Ordem dos botões do ribbon.** Escolhi a ordem de uso pela minha leitura do fluxo de trabalho; o usuário pediu "tente estruturar de forma lógica": ajustar depois de usar. **Resposta do usuário (2026-11-15): ajustar com o uso.**
6. **Caso G14 do anexo v3.** O texto `..., 4 pb, 3 pbx, 4 pb, 3 pbx, pbx na corr` sai do parser como `4 pb, 4 pbx, 1 corr` na segunda metade (o "pbx na corr" não vira o fechamento `JOIN`); o anexo espera `1x pbx` separado. A regra do `v3.py` (período de 1 a 4 corridas) também dobraria `(4 pb; 3 pbx) ×2` se as corridas fossem iguais. Não mudei o valor do anexo; decidir antes de G3. **Resposta do usuário (2026-11-15): 'pbx na corr' no fim da volta vira o pbx de fechamento, separado (corrigir o leitor).**
7. **Marco de leitura: sintaxe e comportamento.** Além de `#marco texto` (pergunta 2): pular e fechar são passos próprios no modo de leitura, e cada repetição de um bloco `(…) ×k` é um passo separado, com "repetição i de k" na faixa (padrão assumido). **Resposta do usuário (2026-11-15): confirmado.**
8. **Marcos por linha da receita.** Toda linha da receita é um marco, então cada volta ganha dois slides depois dela. Assumido: títulos de grupo como "Voltas 7–12 concluídas"; falta decidir se linhas de uma volta só deviam virar marco ou só os `#marco` e os grupos de voltas. **Resposta do usuário (2026-11-15): só as linhas com #marco e os grupos de voltas viram marco.**
9. **Anel tracejado e faixa Nx (G10).** As voltas 7–12 (36 pb) saem como anel tracejado sem símbolos; o anexo espera faixa e `36x` "desenhadas como anel". Fiz faixa e etiqueta só onde há símbolos (pontos pintados quebram o anel liso) e `36x pb` na tabela; decidir se o anel liso também ganha faixa e etiqueta. **Resposta do usuário (2026-11-15): o anel liso também ganha faixa e etiqueta Nx.**
10. **Origem do G13 e do G14 no anexo.** As linhas dos casos G13 e G14 do anexo vêm de uma receita comercial. Troquei por linhas próprias em `docs/17` e nos testes, mas a versão anterior de `packages/tutorial/test/chains.test.ts`, com o texto do anexo, ficou no histórico público do repositório (commits d6a570e e f0a089a); reescrever o histórico é decisão do usuário. **Resposta do usuário (2026-11-15): reescrever o histórico público para apagar as linhas da receita comercial.**
11. **Clique direito no 3D.** O botão direito já desloca a câmera. Assumido: o menu de contexto existe só na árvore (e pelo teclado); decidir se o 3D também ganha um menu de contexto (por exemplo com clique direito sem arrastar). **Resposta do usuário (2026-11-15): menu de contexto no 3D com clique direito sem arrastar.**
12. **Controles de Pontos em Propriedades.** O plano mandava valores de ferramenta para a barra de opções e botões para o ribbon. Movi a antiga janela Pontos inteira, com os mesmos controles e testids, para a seção "Pontos" no topo de Propriedades, para não quebrar o fluxo; separar em barra de opções e ribbon fica para depois, se quiser. **Resposta do usuário (2026-11-15): separar os controles de Pontos em barra de opções e ribbon.**
13. **Projeto da galinha.** O projeto de exemplo da receita comprada (corpo, bico, crista, asas) está só no seu computador, em `referencia/sessao-galinha/galinha.novelo3d.json` (gitignored; gerado por `packages/commands/test/galinha.local.test.ts` com `GALINHA=1`). Os pés estão simplificados e as posições das peças são aproximadas. **Resposta do usuário (2026-11-15): resolvida: galinha modelada e montada, roda em toda revisão (`npm run galinha`).**
14. **Fechar montagem com montagens de posição própria.** `assembly.close` calcula em coordenadas de cada peça e ignora a posição das montagens que a contêm; com montagem fora da origem o resultado fica deslocado. Assumido: fechar vale para peças na raiz; decidir se deve compor as montagens. **Resposta do usuário (2026-11-15): fechar a montagem compondo a posição e a rotação das montagens.**
15. **Mover peças entre montagens.** Hoje se muda a montagem de uma peça pelo menu, pelo seletor "Montagem" das propriedades ou por `parts.set`; arrastar e soltar na árvore ficou de fora. **Resposta do usuário (2026-11-15): arrastar e soltar peças entre montagens na árvore.**
16. **Feature nova com o marcador voltado.** O plano aprovado não diz o que acontece. Assumido: ela entra no marcador e as de depois continuam (como no Fusion 360 ao inserir antes do marcador); a alternativa seria apagar o que vem depois. **Resposta do usuário (2026-11-15): confirmado: a feature nova entra no marcador e as de depois continuam.**
17. **Pincel com "só na seleção".** `tool.brush` e `tool.bucket` com `onlySelection` leem a seleção na hora de reexecutar, não a de quando foram gravados. Raro; decidir se vale gravar a seleção. **Resposta do usuário (2026-11-15): gravar a seleção junto com o pincel e o balde.**
18. **Editores de parâmetros.** Só receita, pintura por voltas, posição e rotação de peça e valor de ponto têm editor na faixa; costura, montagem e materiais ainda não. **Resposta do usuário (2026-11-15): criar os editores que faltam (costura, montagem, materiais).**
19. **Desempenho do desfazer.** Cada desfazer reexecuta tudo a partir da base. Medido na receita de 6 mil pontos com uma instância e 21 features, até o 3D e o gráfico recalcularem (dois quadros): mover a peça faz 4,3 s e desfaz 4,3 s; um traço de tensão faz 4,2 s e desfaz 4,3 s. O desfazer não é mais lento que fazer; o custo é o recálculo da tela, que já existe em qualquer edição (não medi o desfazer antigo). O comando em si leva 34 ms. `ensureEngine` na confirmação de receita custa 7 a 11 ms contra 2 a 10 ms sem ele. Sem pontos de salvamento; se projetos muito longos ficarem lentos, guardar retratos a cada N features. O arquivo guarda no máximo 200 features (as mais antigas viram base) e a seleção vai em faixas: 50 traços de 12 pontos mais uma seleção total na receita de 6 mil pontos ocuparam 141 KB (projeto inteiro 268 KB). Ajustes de valor absoluto seguidos no mesmo alvo (`parts.set`, `assembly.set`, `seam.set`, `edit.setDefaultTension`, `yarns.set`) viram uma feature só. **Resposta do usuário (2026-11-15): informativa.**
20. **Receitas digitadas.** Confirmações seguidas da mesma peça formam uma feature só (a faixa não enche enquanto se digita) e reexecutam em ordem; receita meio digitada que o motor recusa não vira feature. **Resposta do usuário (2026-11-15): informativa.**
21. **Piso do 3D no corte (G7).** O piso (grade) some junto com o corte; manter o piso inteiro ou cortá-lo também? **Resposta do usuário (2026-11-15): o piso fica sempre inteiro; o corte vale só para as peças.**
22. **Linha entre os pontos medidos (G7).** A ferramenta Distância só mostra o valor; falta marcar os dois pontos e a linha entre eles. **Resposta do usuário (2026-11-15): marcar os dois pontos e desenhar a linha entre eles.**
23. **Realce da volta ao medir (G7).** Cada clique de medida também destaca a volta do ponto na receita; desligar esse realce no modo Medir? **Resposta do usuário (2026-11-15): desligar o realce da volta no modo Medir.**
24. **Atualizar o exe (D-70).** O exe é uma foto do código: refazer `npm run exe` e trocar o arquivo do desktop ao fim de cada etapa, ou o usuário prefere avisar quando quiser uma versão nova? **Resposta do usuário (2026-11-15): gerar o exe a cada etapa e deixar no desktop só um atalho para ele.**
25. **Unidade da posição (G5).** Os campos de posição da peça e da montagem não dizem a unidade: o valor é em larguras de ponto (40 alarga o conjunto em 40 larguras, 200 mm a 5 mm), não em milímetros como o resto do projeto. Mostrar a unidade, ou converter para mm? **Resposta do usuário (2026-11-15): converter as posições para mm.**
26. **Rota da malha livre (P5d).** As duas rotas foram prototipadas (D-74 e D-75). Rota A (nossa, geodésica): receita de amigurumi comum (anel de 6, só pb, aum e dim), esfera igual ao F2 com 1 ponto de diferença numa volta, já dentro do app, do MCP e do exe; recusa formas com ramificação ou furo. Rota B (Remesher, Rust/WASM): faz também ramificações e furos com costuras, mas a receita sai em CrochetPARADE avançado (começo em corrente de 3, meio ponto alto, aumentos de 3 e 4, pular ponto, costuras) que o nosso importador não lê; integrar exige ampliar o importador e ligar o WASM (1,4 MB) ao app; projeto v0.1.0. Recomendação: ficar com a A como caminho principal e, para peças com braços e pernas, dividir a malha em peças na própria A (cada parte vira uma peça com costura); a B fica como referência. Qual seguir? **Resposta do usuário (2026-11-14): rota A com divisão (D-76).**
