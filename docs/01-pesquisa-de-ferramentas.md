# 01 — Pesquisa de ferramentas existentes

Data da pesquisa: 2026-11-10. Tudo o que está marcado como **verificado** foi conferido nesta data, por clone do repositório ou leitura da página oficial. O que não pôde ser conferido está marcado como **não verificado**.

## 1. Veredito

**Nenhuma ferramenta, aberta ou fechada, atende à demanda completa.** A demanda é: modelar o amigurumi em 3D, designar regiões de cor/fio, converter a geometria em malha de pontos por um motor parametrizável, gerar tutorial 3D e gráfico 2D no formato definido nesta sessão, e fazer o caminho inverso (receita → 3D editável).

O que existe de mais próximo, aberto e gratuito, é o **CrochetPARADE** com o seu **Remesher** (GPL-3.0-or-later). Juntos cobrem os dois sentidos da conversão, mas não a modelagem 3D, a pintura de regiões nem o formato de saída para iniciantes. Por isso o caminho recomendado é construir o programa novo (nome provisório **Novelo3D**), reaproveitando ideias e, onde a licença permite, código desses projetos.

## 2. Critérios de avaliação

| Código | Critério                                                             |
| ------ | -------------------------------------------------------------------- |
| C1     | Modelagem 3D integrada (primitivas, perfil, escultura)               |
| C2     | Regiões de cor/fio designadas sobre o modelo 3D                      |
| C3     | Motor 3D → pontos → receita, com parâmetros (amostra, tipo de ponto) |
| C4     | Receita → modelo 3D                                                  |
| C5     | Modelo 3D reconstruído é editável e volta a gerar receita            |
| C6     | Gráfico de símbolos (padrão Craft Yarn Council)                      |
| C7     | Tutorial 3D passo a passo                                            |
| C8     | Código aberto e gratuito                                             |

## 3. Matriz de cobertura

Legenda: ● atende · ◐ atende em parte · ○ não atende · ? sem informação na fonte.

| Ferramenta                   | C1  | C2  | C3  | C4  | C5  | C6  | C7  | C8  |
| ---------------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| CrochetPARADE + Remesher     | ◐   | ◐   | ◐   | ●   | ◐   | ◐   | ◐   | ●   |
| CrochetBuilder               | ○   | ◐   | ○   | ●   | ○   | ○   | ○   | ●   |
| AmiGo (implementação Python) | ○   | ○   | ◐   | ○   | ○   | ○   | ○   | ◐   |
| Knytstudio                   | ◐   | ●   | ◐   | ◐   | ○   | ?   | ○   | ○   |
| Crochet 3D                   | ○   | ●   | ○   | ●   | ○   | ○   | ○   | ○   |
| Amigurumake                  | ○   | ?   | ○   | ●   | ○   | ●   | ○   | ○   |
| PattGen                      | ○   | ?   | ◐   | ◐   | ○   | ?   | ◐   | ○   |
| crochetpatterngen.com        | ◐   | ◐   | ◐   | ○   | ○   | ?   | ○   | ○   |
| Knitty (pesquisa, 2008)      | ●   | ●   | ◐   | ○   | ○   | ○   | ●   | ○   |

Notas da matriz:

- **CrochetPARADE + Remesher.** C1: só editor de perfil axissimétrico e gerador de esfera; forma livre vem de STL feito em outro programa. C2: a linguagem tem diretiva `COLOR:`, mas não há pintura sobre o 3D. C3: Remesher em alfa, só voltas contínuas. C5: exporta a superfície como STL e reprocessa no Remesher, sem edição integrada. C6: exportação SVG descrita como "work in progress". C7: anima a criação dos pontos, sem roteiro guiado.
- **AmiGo.** C3: o próprio README avisa que malhas com ramificações (membros, orelhas) ainda não funcionam. C8: código público, mas com licença não comercial (CC BY-NC-SA 4.0), que não é licença de código aberto pela definição da OSI.
- **Knitty.** É o antecedente conceitual mais próximo da sua ideia, mas é um protótipo acadêmico de 2008 em Java, voltado a tricô, sem distribuição pública.

## 4. Ferramentas de código aberto

### 4.1 CrochetPARADE (verificado por clone)

- **O que é:** plataforma web que roda localmente no navegador. A receita é escrita em uma linguagem formal própria; o programa monta o grafo de pontos, calcula a forma 3D e mostra o resultado.
- **Autor e endereços:** Svetlin Tassev. Site: <https://www.crochetparade.org/>. Código: <https://codeberg.org/crochetparade/CrochetPARADE> (o GitHub é só espelho do README).
- **Licença:** GPL-3.0-or-later (cabeçalhos dos arquivos-fonte). O manual é CC BY-NC-SA; a gramática é declarada de domínio público.
- **Tecnologia:** JavaScript legível (analisador com cerca de 6,6 mil linhas, visualizador com cerca de 4,3 mil), three.js, SVG.js, e C++ compilado para WebAssembly (layout do grafo e detecção de superfície). Último commit: 2026-03-13.
- **Capacidades conferidas no arquivo `capabilities.md` do repositório:**
  - pontos embutidos e pontos definidos pelo usuário; rótulos e pontos de fixação explícitos;
  - peças separadas e costura entre peças; ferramenta de transformação para montar;
  - visualização 2D e 3D, cores, espessura do fio, informação do ponto ao passar o mouse;
  - animação da criação dos pontos;
  - detecção de pontos apertados ou frouxos demais;
  - gerador de esfera e gerador de forma axissimétrica com editor de curva de perfil;
  - exportação de gráfico SVG com símbolos padrão, diagrama de conexões, GLTF e STL;
  - tradutor de receita em inglês para a linguagem própria (adicionado em 2026-03).
- **Limites para a sua demanda:** não modela em 3D, não pinta regiões no modelo, exige aprender uma linguagem de programação de receitas, e o gráfico exportado não segue o formato para iniciantes definido nesta sessão.

### 4.2 CrochetPARADE Remesher (verificado por clone)

- **O que é:** converte um modelo 3D (STL fechado) em instruções na linguagem do CrochetPARADE.
- **Endereços:** <https://crochetparade.org/remesher/> e <https://codeberg.org/crochetparade/CrochetPARADE_Remesher>.
- **Licença:** GPL-3.0-or-later (SPDX no `Cargo.toml` e no README).
- **Tecnologia:** Rust (cerca de 21,9 mil linhas), com CLI, aplicativo desktop (Tauri) e versão web em WebAssembly. Último commit: 2026-02-15.
- **Método (anúncio no fórum, 2026-02-14):** uma fronteira de tecido cresce sobre a superfície, volta a volta, a partir de um anel mágico ou de uma corrente inicial. A cada passo o programa testa operações candidatas (ponto, aumento, diminuição, em várias alturas de ponto), verifica guardas geométricas e topológicas e confirma a melhor. Pode usar vários fios e emitir arestas de costura onde regiões se encontram.
- **Limites declarados:** só trabalho em voltas (sem viradas); malhas abertas funcionam parcialmente; passo de ponto muito pequeno pode esgotar a memória do WebAssembly. Cores não são mencionadas.

### 4.3 CrochetBuilder (verificado por clone)

- **O que é:** aplicativo web em que se escreve a receita linha a linha e o modelo 3D aparece em tamanho real, com validação de contagem.
- **Endereços:** <https://github.com/Gerray/CrochetBuilder>, demonstração em <https://gerray.github.io/CrochetBuilder/>.
- **Licença:** AGPL-3.0 (arquivo `LICENSE`); o pacote do motor declara `AGPL-3.0-only`.
- **Tecnologia:** TypeScript, React 18, three.js, Vite, Vitest. Motor com cerca de 24,7 mil linhas. Projeto ativo: último commit em 2026-11-02.
- **Método:** receita → grafo de pontos → relaxação massa-mola → malha e medidas em milímetros. O README cita o CrochetPARADE e o artigo de Greer e Mould (2025) como base.
- **Limites para a sua demanda:** só o sentido receita → 3D; interface em alemão; sem modelagem, sem gráfico de símbolos.

### 4.4 AmiGo, implementação em Python (verificado por clone)

- **O que é:** implementação do artigo _AmiGo: Computational Design of Amigurumi Crochet Patterns_ (SCF 2022). Converte malha triangular em receita legível.
- **Endereço:** <https://github.com/karinsifri/AmiGo>. Último commit: 2026-07-12.
- **Licença:** CC BY-NC-SA 4.0. **Incompatível com GPL**; o código não pode ser copiado para o Novelo3D. O algoritmo publicado no artigo pode ser reimplementado.
- **Limites:** linha de comando com janelas de visualização; sem ramificações; sem cores; sem interface de modelagem.

### 4.5 Outros projetos abertos, de escopo menor (verificados por clone)

| Projeto                                                                                | Licença                  | O que faz                                                                  | Estado            |
| -------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------- | ----------------- |
| [crochet-cad](https://github.com/judy2k/crochet-cad)                                   | GPLv3                    | CLI em Python que gera receita de esfera, cone e toro                      | Parado desde 2018 |
| [stitch-grapher](https://github.com/bilgesucakir/stitch-grapher)                       | MIT                      | Java/Spring Boot: texto → grafo de conectividade, layout 2D e 3D circular  | Ativo (2026-09)   |
| [Crochet Charts](https://github.com/StitchworksSoftware/CrochetCharts)                 | GPLv3; arte CC BY-SA 4.0 | Editor desktop de gráficos de símbolos (C++/Qt)                            | Parado desde 2017 |
| [crochet-engine](https://github.com/dengyu123456/crochet-engine)                       | MIT                      | Foto → gráfico 2D (tapeçaria, C2C, filé); motor do crochetpatterngen.com   | Ativo (2026-07)   |
| [geometry-processing-js](https://github.com/GeometryCollective/geometry-processing-js) | MIT                      | Processamento de geometria em JavaScript (geodésicas pelo método do calor) | Parado desde 2020 |
| [AutoKnit](https://github.com/textiles-lab/autoknit)                                   | Domínio público (README) | Tricô à máquina a partir de malhas 3D (C++)                                | Ativo (2026-11)   |

### 4.6 Repositórios públicos sem licença (não reutilizáveis)

Código público sem licença continua com todos os direitos reservados. Servem só como referência de ideias.

| Projeto                                                                                               | O que faz                                                          | Observação                                                                                                                  |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [crochet-pattern-generator (RichardGarza)](https://github.com/RichardGarza/crochet-pattern-generator) | App web local: imagens e modelos 3D → receita                      | Conceito parecido com o seu; README diz que só a estrutura existe e que "nenhuma licença foi escolhida"; pausado em 2026-10 |
| [crochet-generator (fullwoodenshovel)](https://github.com/fullwoodenshovel/crochet-generator)         | Rust: STL → receita                                                | Projeto escolar; ativo em 2026-11                                                                                           |
| [crogen](https://github.com/kgshear/crogen)                                                           | Python, Tkinter e Blender: monta receita por botões com 3D ao vivo | Parado desde 2024                                                                                                           |
| [crochet-pattern-generator (sean-reid)](https://github.com/sean-reid/crochet-pattern-generator)       | Perfil desenhado → superfície de revolução → contagem por carreira | Demonstração em <https://sean-reid.github.io/crochet-pattern-generator/>                                                    |

## 5. Ferramentas fechadas com 3D

Descrições tiradas das páginas oficiais em 2026-11-10. Preços mudam; conferir antes de decidir qualquer compra.

| Ferramenta                                                                          | Sentido               | O que faz                                                                                                                                                           | Preço declarado                                     |
| ----------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [Knytstudio](https://www.knytstudio.com/amigurumi-pattern-generator)                | Paramétrico → receita | Parte de animais predefinidos e ajusta por controles; peças por tamanho (bola, ovo, tubo, cone, disco); pintura por carreira ou pontos; montagem; PDF com prévia 3D | Projetar é grátis; primeiro PDF grátis, depois pago |
| [Crochet 3D](https://crochet3d.com/)                                                | Receita → 3D          | Escreve-se a receita e o 3D acompanha; cor por ponto, carreira ou forma; web, iOS e Android                                                                         | Conta gratuita; planos não detalhados na página     |
| [Amigurumake](https://amigurumake-studio.com/)                                      | Receita → 3D          | Lê abreviações comuns, gera prévia 3D, gráfico de símbolos e PDF; verificador de contagem                                                                           | "Free to start"                                     |
| [PattGen](https://pattgen.com/)                                                     | 3D → receita          | Importa modelo GLB e gera voltas; foto e texto por IA com créditos                                                                                                  | Estúdio 3D e conversão GLB gratuitos                |
| [crochetpatterngen.com](https://crochetpatterngen.com/amigurumi-pattern-generator/) | Paramétrico → receita | Bases prontas, 8 formas, perfil arrastável, prévia 3D, passos de montagem                                                                                           | Gratuito                                            |
| [Amigurumi Designer](https://amigurumi-designer.vercel.app/)                        | Receita ↔ escala      | Redimensionador matemático de receitas e um "3D Designer"                                                                                                           | Não informado                                       |
| [Amigurumio](https://amigurum.io/)                                                  | Catálogo → receita    | Combina partes prontas (cabeça, corpo, orelhas) e envia PDF                                                                                                         | Grátis com opção paga                               |

## 6. Editores de gráfico e plataformas de receita

Lista de um comparativo de terceiros ([Gitnux](https://gitnux.org/best/amigurumi-design-software/)), que declara ter sido cofinanciado por fornecedores avaliados; usar só como inventário. Nenhum dos nove tem modelagem ou prévia 3D nativa: Left in Knots Pixel Generator, Ribblr, Knit Companion, Stitch Fiddle, StitchingLab, ArtPatt, Amigurumio, CrochetPop e Bobble.

Aplicativos móveis de IA que prometem gerar receitas a partir de fotos aparecem nas lojas (Patternize, LoopKnit AI, Amigurumi AI). **Não verificados.** A literatura recente indica que modelos de linguagem ainda erram muito em receitas executáveis: o benchmark CrochetBench (ACL 2026) relata queda acentuada de desempenho quando a avaliação passa de semelhança de texto para correção executável.

## 7. Pesquisa acadêmica sem produto disponível

| Trabalho                                                     | Contribuição útil ao projeto                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Igarashi, Igarashi e Suzuki, _Knitty_ (Eurographics 2008)    | Modelagem por esboço, pintura que atualiza os pontos, simulação simples do enchimento e assistente de produção passo a passo   |
| Edelstein et al., _AmiGo_ (SCF 2022)                         | Carreiras como isolinhas da distância geodésica; acoplamento entre carreiras; dobra de repetições; segmentação em ramificações |
| Ben-Chen e Edelstein (Bridges 2024)                          | Versão didática do método geodésico, com vincos                                                                                |
| Guo et al., _Representing Crochet with Stitch Meshes_ (2020) | Representação de crochê como malha de ladrilhos de ponto                                                                       |
| Seitz et al., _Digital Crochet_ (Onward! 2022)               | Linguagem visual baseada em grafo; editor 2D com visão 3D                                                                      |
| Greer e Mould (Expressive 2025)                              | Receita → grafo → layout por forças → modelo 3D                                                                                |
| Li et al., _CrochetBench_ (ACL 2026)                         | Usa a linguagem do CrochetPARADE como representação executável                                                                 |

Detalhes e links no documento `02-referencias-tecnicas.md`.

## 7.1 Atualização de 2026-11-11

- **Knotly** (<https://www.knotly.com/>): "Online 3D Crochet Simulator & Pattern Designer"; só crochê; beta gratuito, PWA; simulação física, inspeção ponto a ponto, vistas direito/avesso e símbolos; notação US e XVA. Fechado; sem export, API ou código confirmados. Referência de experiência 3D preferida pelo usuário. Páginas internas não renderizaram: a Fase 0 registra os requisitos visuais por capturas.
- **CrochetPARADE:** sem API, plugins ou importação por URL; JS solto sem build + WASM; mantenedor único; último commit 2026-03-13. Integração só por texto de receita e arquivos exportados.
- **Remesher:** v0.1.0, 5 commits (fev/2026); CLI e WASM (`cr_prepare`, `cr_run`, `cr_load_outputs`); saída `pattern.json` + glTF; sem cor.
- **Crochet Charts:** arquivado em 2025-03-27; sem gráfico circular verificado; símbolos em SVG recoloríveis.
- Não verificados: conteúdo do PDF do Knitty, esquemas de export do CrochetPARADE e do Remesher.

## 8. Lacunas que o Novelo3D preenche

1. Modelagem 3D por peças dentro da mesma ferramenta que gera a receita.
2. Pintura de regiões de fio sobre o modelo, com reflexo na receita e no gráfico.
3. Gráfico de símbolos por peça no formato validado nesta sessão, em português.
4. Tutorial 3D guiado, ligado ao gráfico e ao texto.
5. Receita importada que vira geometria editável, e não só visualização.
6. Receita em português do Brasil, com conversão entre termos BR, US e UK.

## 8.1 Calculadoras e geradores de amigurumi (2026-11-13)

Busca por "amigurumi crochet calculator tools". Veredito do advisor Opus: **nada achado melhora a geometria 3D do ponto**; pouco vale aproveitar.

- **Calculadoras web** (knitcalcs, everycalculators, usecalcpro, yarn calculators): código fechado, conta trivial (circunferência = diâmetro × tensão; voltas de aumento e diminuição de 6 em 6; metragem por área × fator), algumas páginas com título trocado (pouco confiáveis). Não aproveitar. O fator ×1,3 para amigurumi e o método da amostra servem só como limites de sanidade: a medição da usuária vale mais.
- **GitHub:** crochet-cad (judy2k, GPL-3.0, parado desde 2018, só formas simples); Amigurumi-Generator (kaisalepajoe, MIT, inacabado); crochet-modeler (Memnoc) não existe (404). AmiGo continua previsto para P5.
- **Knotly** (fechado; a documentação em github.com/charonchan1991/knotly-docs **não tem licença**): descreve uma linguagem de receita com notação "XVA" (X = pb, V = aumento, A = diminuição, T = mpa, F = pa, E = pad, `MR[N]` como R0, intervalos `R7-R15: 42X`, repetições `6 (3X, V)`) e os modos de render Sketch, Chart e Realistic. Usar só a convenção de notação, com parser e testes próprios; não copiar texto, tabelas nem imagens. A simulação deles é por física da forma de cada peça (peças costuradas viram uma montagem), não se sabe como o modo Realistic desenha o fio.
- **Ideias só registradas (não iniciar):** dialeto XVA no `notation`; modo "gráfico" no 3D (símbolos desenhados sobre a peça); tabela "consome → produz" como oráculo de teste da máquina de estados do criador (docs/16).
- **Artigos não lidos:** bridges2024-369 (PDF binário, sem extrator de texto na máquina) e a página da Eurographics (403). Se algum descrever o fio ponto a ponto, será a referência de um caminho futuro; não reabre a etapa H.
- **Já existe no projeto:** dialetos pt-BR, US e UK no `notation`; consumo de fio por ponto (`core`); escala da interface (não é tensão).

## 8.2 Bibliotecas de pontos indicadas pelo usuário (2026-11-13)

Veredito do advisor Opus: nenhuma ajuda na geometria 3D e nenhuma pode ser copiada para o repositório; servem de lista de conferência.

- **Planilha "Crochet"** (Google Sheets, aba "Stitches", cerca de 229 linhas; as abas Yarn, Reference e Techniques não foram lidas): descreve **padrões de textura** de várias carreiras (Alpine, Bavarian, Basketweave...) com colunas de tecido (fechado/aberto), textura (3D/plana), tags de padrão, carreira ou volta, trabalho em cores, reversível, consumo de fio, caimento, complexidade, velocidade, espessura, múltiplo de pontos e repetição de carreira. Não traz alças nem instruções, e muitos campos estão vazios. Sem dono nem licença visíveis: direitos reservados por padrão, então não copiar a compilação. Uso futuro possível: uma "biblioteca de texturas" (recurso, não correção de modelo), só com permissão do autor, de preferência sob licença CC.
- **DulceBella Designs** (dulcebelladesigns.com/crochet-stitch-library): 38 pontos em 9 categorias (as listagens de pontos aparecem em nome, miniatura e dificuldade; as páginas individuais não foram lidas). © 2026, sem termos de reuso: não copiar texto, fotos nem instruções. Útil só para conferir a cobertura do criador.
- Dados de equivalência de fio e agulha: usar fontes públicas padronizadas (CYC), não estas planilhas.

## 9. Fontes

- [CrochetPARADE (site)](https://www.crochetparade.org/) · [código](https://codeberg.org/crochetparade/CrochetPARADE) · [Remesher (código)](https://codeberg.org/crochetparade/CrochetPARADE_Remesher) · [anúncio do Remesher](https://crochetparade.org/crochetforum/showthread.php?tid=59)
- [CrochetBuilder](https://github.com/Gerray/CrochetBuilder) · [AmiGo em Python](https://github.com/karinsifri/AmiGo) · [artigo AmiGo](https://arxiv.org/abs/2211.01178)
- [Knitty (PDF)](https://www-ui.is.s.u-tokyo.ac.jp/~takeo/papers/yuki_eg08_knitty.pdf) · [Greer e Mould 2025](https://diglib.eg.org/handle/10.2312/exw20251057) · [CrochetBench](https://arxiv.org/abs/2511.09483)
- [Knytstudio](https://www.knytstudio.com/amigurumi-pattern-generator) · [Crochet 3D](https://crochet3d.com/) · [Amigurumake](https://amigurumake-studio.com/crochet-pattern-to-3d-model) · [PattGen](https://pattgen.com/) · [crochetpatterngen.com](https://crochetpatterngen.com/amigurumi-pattern-generator/) · [Amigurumi Designer](https://amigurumi-designer.vercel.app/) · [Amigurumio](https://amigurum.io/)
- [Comparativo Gitnux](https://gitnux.org/best/amigurumi-design-software/) · [pacote crochetpatterngen-engine](https://pypi.org/project/crochetpatterngen-engine/)
