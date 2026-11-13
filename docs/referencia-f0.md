# Fase 0 — Relatório de verificação (2026-11-11)

Fontes: leitura de repositórios e documentação oficiais, uso do app do Knotly no navegador (sem login, só leitura). O que não foi confirmado está marcado **não verificado**. Nenhum código de produto foi escrito.

## Resumo e go/no-go

| #   | Item                         | Resultado                                                                                                                                                                                         | Decisão                                                          |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Ida e volta no CrochetPARADE | **Executado em 2026-11-11** (esfera de circunferência 20, 12 voltas, via gerador do próprio CP). O export "nós e arestas" (`crochet.dot`) traz **identidade + posição 3D por ponto** e as arestas | **Go** para uso como conferência cruzada                         |
| 2   | Esquema dos exports do CP    | Esquemas observados em export real (seção abaixo). GLTF não identifica pontos; `.dot` sim                                                                                                         | **Go** para `.dot`; **no-go** para GLTF como fonte de identidade |
| 3   | Remesher                     | Esquema obtido do código-fonte; sem WASM pré-compilado nem releases; v0.1.0                                                                                                                       | **Go** só para P5 (STL → grafo), com build próprio               |
| 4   | Crochet Charts               | 126 símbolos mapeados em `crochet.xml`; SVGs sem atribuição por arquivo; sem código de gráfico circular visto                                                                                     | **Go** para símbolos, com atribuição em `NOTICE.md`              |
| 5   | Knotly                       | Requisitos visuais registrados (abaixo)                                                                                                                                                           | **Go**                                                           |
| 6   | Motor de posições            | Algoritmo do CP documentado e reimplementável em TS                                                                                                                                               | Proposta para D-17 (abaixo)                                      |
| 7   | Portão do tricô              | Grafo neutro é viável com campos extras; conversão ponto a ponto não                                                                                                                              | Proposta para D-19 (abaixo)                                      |

## Item 1 e 2 — CrochetPARADE: exports e layout

Fontes: `capabilities.md`, `Manual.md`, `docs/node_layout_documentation_v2.html` (versões de fev/2026; podem estar defasadas em relação ao código).

- **GLTF:** "modelo 3D renderizado do fio/pontos", compatível com Blender. Estrutura de nós, malha por ponto ou por superfície e metadados por ponto: não documentados.
- **SVG:** três arquivos (símbolos, vista de IDs, sobreposição), projeção 2D da câmera atual. Identifica pontos por tipo, número da volta e posição na volta. Sem coordenadas 3D. Símbolos padrão ainda "em progresso".
- **Nós e arestas:** coordenadas dos nós "se já calculadas" e comprimentos-alvo das arestas. Formato não documentado; o Manual usa nomes de nó como `3,27B` (indício de volta,ponto).
- **Debug info:** "representação tipo JSON do grafo/layout". Sem esquema.
- **STL:** só a superfície detectada, não o modelo todo.
- **Texto de receita salvo:** tem cabeçalho de versão e marcas `¶`; texto exato do cabeçalho não documentado.
- **JSON do perfil axissimétrico:** esquema não documentado.
- **Observado em export real (esfera, circunferência 20, receita de 13 linhas; versão do site de 2026-11-11):**
  - **`crochet.dot` (13 KB, "nós e arestas"):** texto. Linha 1 = `3` (dimensões). Depois um nó por linha: `"volta,ponto|índice" {x,y,z}` (ex.: `"2,3|3" {3.04886,2.46386,-0.662099}`; a volta 0 é o anel inicial). Depois arestas `"a" -- "b" peso`; todos os pesos foram `1`. Resultado: 152 nós, 321 arestas. **É o único export que liga identidade de ponto à posição 3D.** Os nós parecem incluir pontos de base além dos pontos de volta; a semântica exata de cada tipo de aresta não foi verificada.
  - **`scene.gltf` (1,3 MB):** glTF 2.0 gerado por `THREE.GLTFExporter`; **321 nós, 321 malhas, 321 materiais**, 1 buffer embutido (uri); cada nó só tem `matrix` + `mesh`, **sem `name` nem `extras`**. 321 = nº de arestas do `.dot`, então a malha é um segmento por aresta, **sem identidade de ponto**. Serve só para conferir geometria visual.
  - **`debug.txt` (670 KB):** **texto, não JSON**, em seções `=======título=======`: texto original, definições, índice, repetições, estrutura analisada, códigos de ponto, rótulos multi-ponto e duas exportações dot (`simple=false` e `simple=true`). Útil como depuração do analisador do CP, não como formato de intercâmbio.
  - Os arquivos completos estão em `referencia/cp-export-esfera20/`, baixados por script (Edge headless via playwright-core). Repetir o export deu tamanhos idênticos (13.441 / 1.326.025 / 669.975 bytes): o export é determinístico para a mesma receita.
- **Layout (`graph.cpp`), conforme a documentação:** entrada = grafo ponderado com comprimentos-alvo, âncoras opcionais e parâmetros (iterações, semente, separação, repulsão etc.); passos = caminhos mínimos entre todos os pares, relaxação por gradiente com recozimento, reescala e etapa final de molas amortecidas; saída = posição por nó (2D ou 3D). Assinatura de `_performLayout` e formato de retorno: não verificados.

## Item 3 — Remesher

- **Licença:** GPL-3.0-or-later. **Maturidade:** v0.1.0, 5 commits (fev/2026), 0 tags, sem releases; WASM pré-compilado não confirmado (exige `cargo build` e `scripts/build_web_bundle.sh`).
- **`pattern.json`** (campos do struct `Pattern` em `src/pattern.rs`; chaves reais após serde não verificadas): `l`, `traversals`, `patch_vertices`, `patch_faces`, `frontier_zip_edges` (costuras), `face_yarn` (fio por face), `face_loop_id`, `loops`, `stitch_targets` e `crochetparade` (texto da receita em CP).
- **WASM (C-ABI):** `cr_alloc`, `cr_free`, `cr_prepare(stl)`, `cr_run(mesh_id, config, interativo)`, `cr_load_outputs`, `cr_load_default_config`. Cada chamada devolve 1/0 e o resultado em JSON num buffer global (`cr_last_ptr/len`). `patch.bin` sai como lista de inteiros em JSON, não bytes crus (não verificado em execução). Possível problema de capacidade em `cr_free`: não verificado.
- **Conclusão:** viável para P5, mas imaturo e sem binário pronto; manter fora do caminho crítico.

## Item 4 — Crochet Charts

- **Mapeamento:** `crochet.xml` lista `<name>`, `<icon>` (caminho do SVG), `<description>`, `<category>` e `<ws>` (abreviação) por ponto. 126 entradas: 109 em "Default" e 17 (Tunisian e outros) sem categoria nem abreviação. O SVG vem de `<icon>`, não do nome (ex.: "sc2tog v" usa `st26.svg`).
- **SVGs:** saída do Inkscape 0.48.1; `<metadata>` só com formato e tipo; **sem autor nem licença por arquivo** (conferidos `sc`, `dc`, `ch`; os demais presumivelmente iguais, não verificado). Atribuição existe só no cabeçalho do `crochet.xml` (Brian C. Milco / Stitch Works Software) e no README (arte CC BY-SA 4.0).
- **Contagem em `stitches/`:** ~87 SVGs (não verificado).
- **Gráfico circular:** nenhum arquivo com `round`, `circle` ou `polar` visto na listagem; conteúdo de `src/` não lido. Layout circular continua próprio.
- **Licença:** CC BY-SA 4.0 para a arte e GPLv3 para o código. **Confirmado na página oficial da Creative Commons (lida em 2026-11-11):** o GPLv3 é licença compatível com BY-SA 4.0 desde 8/out/2015, e a compatibilidade é "one-way": contribuições a adaptações de material BY-SA 4.0 podem ser licenciadas em GPLv3, mas não o contrário. A página remete a "considerações para adaptadores" na wiki da CC, **não lida**. Prática: manter os SVGs com a licença BY-SA 4.0 e a atribuição em `NOTICE.md`; não sou advogado, revisar antes de publicar. Atenção: o **Manual** do CrochetPARADE é CC BY-NC-SA, **não copiar** texto dele. Exige crédito, indicação da licença e aviso de adaptação em `NOTICE.md`.

## Item 5 — Knotly (referência de experiência; produto fechado)

Observado no app (projeto de exemplo "Chocolate Donut", sem login):

- **Três vistas da mesma peça:**
  - **Realistic:** cada ponto é uma "casquinha" arredondada e sombreada, em fileiras compactas, com relevo visível ao aproximar; interior em tom claro, sombra de contato no chão, grade discreta.
  - **Chart:** símbolos desenhados sobre uma superfície translúcida do próprio 3D (cruzes para ponto baixo, elipses para correntes, setas de início).
  - **Sketch:** o grafo, com setas azuis de direção do trabalho e linhas vermelhas ligando cada ponto ao da volta anterior.
- **Interface:** receita à esquerda com contagem por volta à direita (`R5: 10(2sc, sc2inc)  (40)`), botão "Run", barra de modos embaixo, ferramentas de seleção/mover/girar à direita, câmera por arrastar e rolar.
- **Opções:** tela cheia, sombras, grade, dicas, cores de prévia, marcas de início e fim, "pontos como bolinhas", setas de direção.
- **Seleção:** clique seleciona a peça (contorno laranja, "P1·P2"); duplo clique ou Enter abre "inspeção de pontos". O destaque de ponto individual não foi observado.
- **Exemplos:** granny square, coração, urso, abacaxi, vestido, cogumelo, pétala de íris, estrela-do-mar, lírio: peças planas, ruchês e amigurumi.
- **Requisitos para P2:** (1) ponto como instância 3D com relevo e sombreamento suave; (2) cor por ponto vinda do grafo; (3) vistas Realistic, Chart e Sketch sobre o mesmo grafo, sem perder a seleção; (4) sombra de contato e grade; (5) receita ao lado com contagem por volta; (6) funcionar em tela de celular.
- **Não verificado:** como o ponto individual é desenhado (malha própria ou textura), desempenho, animações, exportação.

## Item 6 — Motor de posições (proposta para D-17)

Reimplementar em TypeScript o layout descrito na documentação do CrochetPARADE (caminhos mínimos + relaxação + molas amortecidas), que é GPL e pode ser portado com atribuição, e reservar o WASM do CP como alternativa se o desempenho em 20.000 pontos não bastar em P2. Motivos: o código-fonte (`graph.cpp`) não foi lido, mas o algoritmo está descrito; manter tudo em TS evita depender de WASM sem API e de mantenedor único; o export do CP serve só de conferência. Revisar quando um export real for testado (item 1).

**Leitura de `graph.cpp` (repo `stassev/CrochetPARADE`, GPL-3.0; 895 linhas, 37 KB; só biblioteca padrão):**

- Ponto de entrada `performLayout(const char*)`: entrada e saída são **texto**. A entrada é um blob estilo DOT: linha 1 = dimensão (2 ou 3), nós `"nome" {x,y,z}` (posição opcional, fixa), arestas `"a" -- "b" comprimento`, restrições "jacobianas" `"a" --- "b" --- "c" --- "d"---valor` e linhas de parâmetro (`start`/semente, `iterations`=500, `inflate`=2.0, `learning_rate`=0.1, `separate`=1.5, `viscous_iterations`=10, `viscous_timestep`=0.1, `viscous_damping`=1.0, `repulsion_radius`). A saída é uma linha por nó: `{"name": "...","pos": "x,y,z"},`.
- Algoritmo: Dijkstra de todos contra todos (matriz N×N densa) → limite de distância entre componentes (`separate`) → até 500 iterações de força tipo "stress" com até 11 reinícios (divide a taxa por 3 se divergir) → reescala global → molas amortecidas (kick-drift-kick).
- Portável para TS: sem dependências externas. Pontos difíceis: `rand()/srand()` é da libc (posições iniciais não são idênticas sem o mesmo gerador); matriz densa O(N²) (20.000 pontos = 400 milhões de células, **inviável sem esparsidade ou grafo por componentes**); formatação com 6 algarismos; defeitos do original (`repulsion_radius` lido como inteiro; ramos 2D/3D duplicados; retorno indefinido para outras dimensões).
- **Achado importante:** o formato de entrada é o mesmo do `crochet.dot` exportado (o export é, na prática, entrada+saída do layout). Logo o `.dot` serve de oráculo de teste do nosso porte, **comparando por forma/distâncias, não por coordenadas** (semente e `rand()` diferem).
- **Risco novo:** a escala N² da matriz pede decisão em P2: grafo esparso + relaxação local, ou usar o WASM do CP como alternativa se o desempenho pedir. Não verificado: `graph_standalone*.cpp`, `graph64.js`, flags de compilação, e a cópia `crochetparade/CrochetPARADE` (81 estrelas, outro dono).

## Item 7 — Portão do tricô (proposta para D-19)

Fontes lidas: autoknit (domínio público) e especificação do knitout v0.6. Não foram verificados: artigos de Stitch Meshes, KnitSpeak, KnitScript, Stitch Fiddle, nem qualquer trabalho sobre conversão tricô↔crochê.

- No autoknit, cada ponto tem fio, tipo (Start, End, Tuck, Miss, Knit, Increase, Decrease), direção (horário/anti-horário) e ligações de entrada e saída. **Purl e orientação da laçada estão como TODO.** O knitout é de nível de máquina (agulhas e carros), sem purl nem laçadas retidas explícitas.
- **Grafo neutro de técnica é viável**, reservando campos para técnica, orientação da laçada (frente/costas) e laçadas retidas. É inferência, não validada.
- **Conversão ponto a ponto parece inadequada** (densidade, elasticidade e razão altura/largura diferem); a via plausível é regenerar de geometria compartilhada. Também inferência.
- **Proposta:** manter P6 adiado; reservar os campos no modelo de dados desde P1; só abrir P6 depois de P3.

## Decisões a registrar

- **D-17** (núcleo em grafo; motor de posições): TS próprio portado do algoritmo documentado do CP; WASM como alternativa. _Provisória até o teste do item 1._
- **D-18** (símbolos): usar os SVGs do Crochet Charts com atribuição; confirmar compatibilidade de licença antes de publicar.
- **D-19** (tricô): adiado; campos reservados no grafo; sem conversão ponto a ponto.

## Pendente

1. ~~Item 1 real~~ **feito em 2026-11-11** (ver Item 1 e 2). Falta, se quiser guardar os arquivos completos como oráculo de teste, repetir o export no Chrome comum e salvá-los em `referencia/cp-export-esfera20/` (receita: gerador de esfera do CP, circunferência 20).
2. ~~Ler `graph.cpp`~~ **feito** (ver Item 6). Faltam os arquivos `graph_standalone*.cpp` e `graph64.js`.
3. ~~Compatibilidade CC BY-SA 4.0 → GPLv3~~ **conferida na página da CC**; falta a wiki "considerações para adaptadores" e revisão jurídica antes de publicar.
4. Arquivos do export guardados em `referencia/cp-export-esfera20/` (`crochet.dot`, `scene.gltf`, `debug.txt`; esfera de circunferência 20 do gerador do CP).
