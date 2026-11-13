# Notas de pesquisa (rascunho de trabalho, 2026-11-10)

## Verificado por clone do repositório (git clone em 2026-11-10)

- crochetparade/CrochetPARADE (GitHub é só espelho com README; código em https://codeberg.org/crochetparade/CrochetPARADE)
  - Autor: Svetlin Tassev. Site: https://www.crochetparade.org/
  - Licença declarada no README: GPLv3 (site e componentes computacionais). Manual: CC BY-NC-SA. Gramática: domínio público.
  - Direção: receita (gramática própria) → modelo 3D; exporta gráfico com símbolos padrão, SVG de conexões, arquivos 3D p/ Blender; anima a criação; destaca pontos frouxos/apertados.
  - Roda local no navegador; usa SVG.js e three.js. Modelos com dezenas de milhares de pontos levam minutos.
  - Último commit do espelho GitHub: 2025-02-23.
- Gerray/CrochetBuilder — AGPL-3.0 (arquivo LICENSE). TypeScript, monorepo (apps/, packages/), tem CLAUDE.md.
  - Direção: receita linha a linha → grafo de pontos → relaxação massa-mola → malha + medidas (mm). Validação de contagem. Exporta PDF/JSON. UI em alemão. Último commit 2026-11-02.
  - Segue CrochetPARADE e o artigo "Modeling Crochet Patterns with a Force-directed Graph Layout" (Eurographics).
  - Demo: https://gerray.github.io/CrochetBuilder/
- RichardGarza/crochet-pattern-generator — SEM licença ("No license has been chosen yet"). TypeScript/Vite. Local web app: imagens e modelos 3D → receita (2D colorwork; 3D amigurumi por peças). Status: "frame, not its features yet"; pausado no Sprint 3 (commit 2026-10-01). 
- kgshear/crogen — sem licença. Python + Tkinter + Blender. Construtor de receita por botões com modelo 3D ao vivo. Último commit 2024-04-15.
- fullwoodenshovel/crochet-generator — sem licença. Rust (three-d, stl_io, wasm-bindgen). Projeto escolar (EPQ): "generates a crochet pattern from a 3D STL file". Último commit 2026-11-01.

## Lido em página web (WebFetch)

- AmiGo (Edelstein, Peleg, Itzhak, Ben-Chen; arXiv 2211.01178; ACM SCF 2022, doi 10.1145/3559400.3562005)
  - Entrada: malha fechada M, vértice-semente s, largura do ponto w. Saída: instruções só com sc, inc(x), dec(x), "join-as-you-go" (sem costura).
  - Pipeline: f = distância geodésica à semente (isolinhas = carreiras); corte da malha por geodésica s→máximo; g com gradiente ortogonal a f (min ∫|<J∇f,∇g> − 1|²); amostragem em grade (f/w, g/w); arestas de carreira; acoplamento entre carreiras por Dynamic Time Warping (minimiza soma de distâncias); transdutor gera sc/inc/dec; dobra de laços (Lee et al. 1994) → "rows 2-3: (sc, inc, 2sc)*3".
  - Curvatura: "crateras" (K>0, H<0) não realizáveis → Conformal Mean Curvature Flow local; K<0 → amostragem adaptada h(x)=tanh(−x/α)/2+1, α=10.
  - Ramificações: segmentação por isolinhas de f nos pontos de sela; grafo dirigido de segmentos; ordem topológica; cada segmento é meia-esfera ou cilindro.
  - Implementação: "Matlab and C++"; Heat Geodesics (Crane 2017), geodesic paths (Sharp & Crane 2020), ShapeUp, cMCF. Tempos: 0,2 a 6,9 min; 365 a 3670 pontos.
  - Limitações: só superfícies fechadas; segmentos finos; sem simetria; uma semente; sem cores/texturas/outros pontos (trabalho futuro).
  - Disponibilidade de código: NÃO confirmada no texto (verificar).
- Amigurumake (amigurumake-studio.com): receita em texto comum → prévia 3D, gráfico de símbolos, PDF; 14 idiomas; "free to start"; fechado ("All rights reserved"); não monta boneco inteiro ainda.
- Crochet 3D (crochet3d.com; iOS/Android; George Papashvili, Batumi): escreve receita → 3D ao vivo; cor por ponto/carreira/forma; exporta texto/PDF; sem gráfico; fechado.
- PattGen (pattgen.com): importa GLB → carreiras de crochê; prévia 3D; foto/texto via IA com créditos; estúdio 3D e conversão GLB local gratuitos; sem indicação de código aberto.
- Amigurumi Designer (amigurumi-designer.vercel.app): redimensionador de receita + "3D Designer"; sem licença/GitHub visível.
- gitnux "Best Amigurumi Design Software" (estudo cofinanciado por fornecedores): Left in Knots Pixel Generator, Ribblr, Knit Companion, Stitch Fiddle, StitchingLab, ArtPatt, Amigurumio, CrochetPop, Bobble — nenhum com modelagem 3D nativa.

## A verificar
- Código do AmiGo (GitHub?), Tassev Eurographics paper, Guo et al. 2020, expansão 2026 (CMU), Igarashi Knitty, Nakjan 2018, Çapunaman 2017, Seitz 2021/2022, CrochetBench, CroMat.
- crochetpatterngen.com + pypi crochetpatterngen-engine; knytstudio; amigurum.io; ArtPatt; Crochet Charts (StitchWorks, GPL?); Stitch Fiddle; judy2k/crochet-cad; bilgesucakir/stitch-grapher.

## Verificado por clone (lote 2, 2026-11-10)

- karinsifri/AmiGo — implementação em Python do artigo AmiGo. LICENÇA: CC BY-NC-SA 4.0 (arquivo LICENSE + README) → INCOMPATÍVEL com GPL (cláusula NC). ~2,2 mil linhas. Deps: trimesh, potpourri3d, numpy, gpytoolbox, fastdtw, scipy, pyvista. Aviso no README: "Branching meshes are not supported yet". CLI + visualizadores; sem GUI de modelagem, sem cores. Último commit 2026-07-12.
- CrochetPARADE (Codeberg, commit 2026-03-13 "add English->CP translator"): LICENSE GPLv3; cabeçalhos "version 3 ... or (at your option) any later version" (GPL-3.0-or-later). JS legível (parse64.js 6,6 mil linhas; mesh64.js 4,3 mil) + C++ → WASM via Emscripten (graph.cpp layout; periphery.cpp 5,9 mil linhas). Tradutor inglês→CP em Python/pyodide (22 mil linhas) + deterministic_translator.js. Codeberg: 20 estrelas, 9 forks.
  - capabilities.md (2026-02-16): linguagem própria; pontos embutidos e definidos pelo usuário; rótulos/pontos de fixação; objetos separados + costura; 2D/3D; hover; destaque; cores e espessura do fio; animação da criação dos pontos; detecção de pontos apertados/frouxos; Object Transform (montagem); conversor de Crochet Lathe; gerador de esfera; gerador de forma axissimétrica com editor de perfil (JSON); exporta gráfico SVG com símbolos padrão (em progresso) + diagrama de conexões; GLTF; STL da superfície detectada; pipeline de redimensionamento CP → STL → Remesher.
  - Motor de layout (docs/node_layout_documentation_v2.md): grafo ponderado; completa a métrica com caminhos mínimos; relaxação all-pairs com recozimento; etapa final de molas amortecidas ("viscous relaxation").
- CrochetPARADE_Remesher (Codeberg, Rust, ~21,9 mil linhas, commit 2026-02-15): GPL-3.0-or-later (SPDX em Cargo.toml e README). STL fechado → instruções na linguagem CrochetPARADE; só voltas (sem viradas); semente = anel mágico ou corrente inicial; fronteira que cresce sobre a superfície; operações candidatas (ponto, aumento, diminuição; alturas ss/sc/hdc/dc); guardas geométricas/topológicas; backtracking; múltiplos fios; arestas de costura ("zips"). CLI + app desktop Tauri + bundle web WASM. TODO: viradas, malhas abertas, retomar de receita parcial. Cores: não mencionadas.
- Gerray/CrochetBuilder: packages/engine "license": "AGPL-3.0-only" (~24,7 mil linhas TS); app: React 18.3, three 0.186, Vite 8.3, Vitest 4.1, TypeScript 5.8.
- judy2k/crochet-cad — GPLv3 (COPYING.txt). Python CLI: esferas, cones, toros. Último commit 2018.
- bilgesucakir/stitch-grapher — MIT. Java/Spring Boot. Texto → grafo de conectividade; layout 2D/3D circular. 2026-09.
- sean-reid/crochet-pattern-generator — SEM arquivo de licença. Perfil desenhado → superfície de revolução → contagem por carreira (B-spline; limita a dobrar/metade por carreira; distribui aum/dim). Demo: https://sean-reid.github.io/crochet-pattern-generator/ . Commit 2025-12-31.
- StitchworksSoftware/CrochetCharts — GPLv3 (README: "licensed under GPLv3"; arte CC BY-SA 4.0). Editor desktop de gráficos (C++/Qt). Último commit 2017-01.
- dengyu123456/crochet-engine + PyPI crochetpatterngen-engine 0.1.1 (2026-07-24) — MIT. Só foto → gráfico 2D (graph, c2c, tapestry, mosaic, filet) + servidor MCP. NÃO faz amigurumi 3D.
- textiles-lab/autoknit — "This code is placed in the public domain" (README). Tricô à máquina a partir de malhas 3D. Commit 2026-11-02.
- GeometryCollective/geometry-processing-js — MIT. Último commit 2020.
- catsmey/ai_amigurumi_crochet_thesis — sem licença (tese LIACS 2025, LLM imagem → receita).

## Lido em página web (lote 2)

- Greer & Mould, "Modeling Crochet Patterns with a Force-directed Graph Layout", Expressive/WICED 2025 (Eurographics Association), DOI 10.2312/exw.20251057, CC BY 4.0. Receita escrita → grafo → layout por forças → modelo 3D; foco em amigurumi.
- Ben-Chen & Edelstein, "Amigurumi Crochet Patterns from Geodesic Distances", Bridges 2024 (archive.bridgesmathart.org/2024/bridges2024-369.html).
- Igarashi, Igarashi & Suzuki, "Knitty: 3D Modeling of Knitted Animals with a Production Assistant Interface", Eurographics 2008 Short Papers. Esboço de silhueta → 3D; partes com um traço; ferramenta de pintura que atualiza os pontos; simulação física simples; assistente de produção (marca a carreira atual, mostra como fazer o ponto); só normal/aumento/diminuição; Java; sem release público.
- Seitz, Rein, Lincke & Hirschfeld, "Digital Crochet: Toward a Visual Language for Pattern Description", Onward! 2022, DOI 10.1145/3563835.3567657. Linguagem visual baseada em grafo; editor 2D + visualização 3D (protótipo). Também relatório técnico HPI 137 "Language and tool support for 3D crochet patterns" (2021).
- CrochetBench (Li, Huang, Hua, Chawla; arXiv 2511.09483; ACL 2026): usa a DSL CrochetPARADE como representação executável; modelos caem muito quando avaliados por correção executável. Código: github.com/Peiyu-Georgia-Li/crochetBench.
- Smeyers 2025 (tese LIACS): DALL-E 3 + GPT-4o/o1 geram receitas de amigurumi; visualização 3D por scripts Blender "unreliable".
- CMU Textiles Lab: Guo, Lin, Narayanan, McCann, "Representing Crochet with Stitch Meshes" (SCF 2020; doi 10.1145/3388770.3407448). Expansão 2026 por Aren E. Davey (mais pontos; "Stitch-Connection Mesh"; conversor texto → Augmented Stitch Meshes); sem código linkado.
- Knytstudio (knytstudio.com): animais predefinidos + sliders; peças por tamanho (bola, ovo, tubo, cone, disco); pintura por carreira/pontos; montagem; receita + PDF + prévia 3D; 1º PDF grátis, depois pago/Pro; fechado.
- crochetpatterngen.com: bases + 8 formas, arrastar pontos do perfil, altura 8–30 cm; receita + montagem + materiais; prévia 3D; grátis; site fechado (só o motor 2D é MIT).
- Amigurumio (amigurum.io): biblioteca de partes prontas (cabeças, orelhas, corpos...) → PDF por e-mail; grátis + premium; sem 3D.
- Apps móveis de IA (só nomes em lojas, não verificados): Patternize, LoopKnit AI, Amigurumi AI: Crochet Art, Crochet AI, Yarn AI.

## Versões npm conferidas em 2026-11-10 (npm view)
three 0.187.0 MIT · three-mesh-bvh 0.9.18 MIT · three-bvh-csg 0.0.18 MIT · manifold-3d 3.5.4 Apache-2.0 · react/react-dom 19.3.1 MIT · vite 8.3.7 MIT · vitest 5.1.0 MIT · typescript 7.0.2 Apache-2.0 · zustand 5.1.0 MIT · @react-three/fiber 9.8.2 MIT · @react-three/drei 10.7.9 MIT · jspdf 4.2.1 MIT · svg2pdf.js 2.9.0 MIT · pdf-lib 1.17.1 MIT (2022) · chevrotain 13.2.0 Apache-2.0 · ohm-js 17.5.0 MIT · peggy 5.1.1 MIT · comlink 4.4.2 Apache-2.0 · zod 4.6.7 MIT · @playwright/test 1.65.0 Apache-2.0 · @biomejs/biome 2.6.6 MIT OR Apache-2.0 · eslint 10.14.0 MIT · i18next 27.1.1 MIT · immer 11.2.10 MIT · idb 8.0.4 ISC · fflate 0.8.3 MIT · meshoptimizer 1.3.0 MIT
