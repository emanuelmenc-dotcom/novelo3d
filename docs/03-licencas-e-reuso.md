# 03 — Licenças e reuso de código

Não sou advogado; este documento registra o que as licenças declaram e a leitura usual de compatibilidade. Em caso de publicação comercial ou dúvida, confirmar com um profissional.

## 1. Licença do Novelo3D

**Decisão:** o código próprio do projeto é licenciado sob **GPL-3.0-or-later**.

- O usuário aceitou licença copyleft da família GPL.
- GPL-3.0-or-later permite incorporar código do CrochetPARADE e do Remesher, que usam a mesma licença.
- Todo arquivo-fonte novo leva o cabeçalho SPDX `GPL-3.0-or-later`.
- O texto oficial da licença deve ser copiado de <https://www.gnu.org/licenses/gpl-3.0.txt> para o arquivo `LICENSE` na criação do repositório (marco M0).

## 2. Mapa de reuso

| Projeto                                          | Licença declarada                                       | Pode copiar código?      | Condição                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CrochetPARADE                                    | GPL-3.0-or-later                                        | Sim                      | Manter avisos de autoria e licença; registrar a origem em `NOTICE.md`                                                                                                                                                                                                                             |
| CrochetPARADE Remesher                           | GPL-3.0-or-later                                        | Sim                      | Idem; é Rust, então o uso prático é como módulo WebAssembly                                                                                                                                                                                                                                       |
| CrochetBuilder (motor)                           | AGPL-3.0-only                                           | Só com decisão explícita | Ver seção 3                                                                                                                                                                                                                                                                                       |
| AmiGo em Python                                  | CC BY-NC-SA 4.0                                         | **Não**                  | Cláusula não comercial é incompatível com GPL. Reimplementar a partir do artigo                                                                                                                                                                                                                   |
| Crochet Charts (Stitch Works)                    | GPLv3; arte CC BY-SA 4.0 (repo arquivado em 2025-03-27) | Sim                      | C++/Qt; pouco aproveitável como código. ~130 símbolos SVG em `stitches/` podem ser adaptados com atribuição em `NOTICE.md`, indicação de licença e aviso de adaptação. Compatibilidade CC BY-SA 4.0 → GPL-3.0-or-later a confirmar na Fase 0 (D-18); quais SVGs são arte original, não verificado |
| crochet-cad                                      | GPLv3                                                   | Sim                      | Python; só fórmulas de esfera, cone e toro                                                                                                                                                                                                                                                        |
| stitch-grapher                                   | MIT                                                     | Sim                      | Java; aproveitar ideias                                                                                                                                                                                                                                                                           |
| crochet-engine                                   | MIT                                                     | Sim                      | Só gráficos 2D a partir de foto                                                                                                                                                                                                                                                                   |
| geometry-processing-js                           | MIT                                                     | Sim                      | Parado desde 2020; avaliar antes de depender                                                                                                                                                                                                                                                      |
| AutoKnit                                         | Domínio público (README)                                | Sim                      | Tricô; C++                                                                                                                                                                                                                                                                                        |
| Repositórios sem licença (seção 4.6 da pesquisa) | Nenhuma                                                 | **Não**                  | Todos os direitos reservados                                                                                                                                                                                                                                                                      |
| Manual do CrochetPARADE                          | CC BY-NC-SA                                             | **Não copiar texto**     | Pode-se citar e apontar o link                                                                                                                                                                                                                                                                    |

## 3. Decisão pendente: código AGPL

O motor do CrochetBuilder (TypeScript, receita → grafo → relaxação) é tecnicamente o mais próximo da pilha do Novelo3D, mas está sob **AGPL-3.0-only**.

- A GPLv3 (seção 13) permite combinar código GPLv3 com código AGPLv3 no mesmo programa. O programa combinado passa a obedecer também à AGPL, cuja diferença prática é a cláusula de rede: quem oferecer uma versão modificada como serviço web precisa oferecer o código-fonte aos usuários.
- Para um aplicativo local e de código aberto, essa cláusula não muda o uso do dia a dia. Ela pesa se um dia alguém quiser hospedar uma versão fechada.

**Regra até o usuário decidir:** não copiar código do CrochetBuilder. É permitido estudar a documentação e o comportamento para orientar uma implementação própria. Se o usuário aprovar, a incorporação deve ser feita formalmente: módulo separado, cabeçalhos preservados, entrada em `NOTICE.md` e atualização deste documento.

## 4. Dependências npm

Licenças conferidas no registro npm em 2026-11-10. MIT, ISC e Apache-2.0 são compatíveis com GPL-3.0-or-later.

| Pacote             | Versão  | Licença           |
| ------------------ | ------- | ----------------- |
| three              | 0.187.0 | MIT               |
| @types/three       | 0.187.0 | MIT               |
| @react-three/fiber | 9.8.2   | MIT               |
| @react-three/drei  | 10.7.9  | MIT               |
| three-mesh-bvh     | 0.9.18  | MIT               |
| manifold-3d        | 3.5.4   | Apache-2.0        |
| react, react-dom   | 19.3.1  | MIT               |
| vite               | 8.3.7   | MIT               |
| vitest             | 5.1.0   | MIT               |
| typescript         | 7.0.2   | Apache-2.0        |
| zustand            | 5.1.0   | MIT               |
| immer              | 11.2.10 | MIT               |
| zod                | 4.6.7   | MIT               |
| comlink            | 4.4.2   | Apache-2.0        |
| idb                | 8.0.4   | ISC               |
| fflate             | 0.8.3   | MIT               |
| jspdf              | 4.2.1   | MIT               |
| svg2pdf.js         | 2.9.0   | MIT               |
| fast-check         | 4.10.2  | MIT               |
| @playwright/test   | 1.65.0  | Apache-2.0        |
| @biomejs/biome     | 2.6.6   | MIT OR Apache-2.0 |

Regras:

1. Antes de adicionar qualquer dependência, conferir a licença com `npm view <pacote> license` e registrar aqui.
2. Não adicionar dependência com licença não comercial, proprietária ou sem licença.
3. As versões acima são referência da data da pesquisa. Na criação do projeto, usar as versões estáveis do dia e fixá-las no `package-lock.json`.

## 5. Conteúdo de terceiros

- **Receitas.** Receitas de crochê publicadas têm direito autoral. O repositório não deve conter receitas de terceiros. Os casos de teste usam formas geométricas próprias (esfera, cone, cilindro, ovo) e receitas escritas para o projeto.
- **Arquivos da sessão do sapo.** A pasta `referencia/sessao-sapo/` contém os scripts que geraram os gráficos de uma receita comercial, para uso pessoal do usuário. Ela está no `.gitignore` e **não pode ser publicada**.
- **Fotos de pontos.** As fotos passo a passo usadas na página de pontos vêm do Wikimedia Commons sob CC BY-SA 4.0 (autores Stilfehler e Valki77). Exigem crédito ao autor, indicação da licença e aviso de adaptação. Lista de arquivos em `10-saidas-receita-grafico-tutorial.md`.
- **Símbolos.** Os símbolos de gráfico são redesenhados em código a partir do padrão do Craft Yarn Council; não copiar os arquivos de imagem do site.

## Dependências de ferramentas (2026-11-11)

| Pacote                      | Versão | Licença | Uso                               |
| --------------------------- | ------ | ------- | --------------------------------- |
| `@modelcontextprotocol/sdk` | 1.32.2 | MIT     | Servidor MCP (`tools/mcp-server`) |
| `zod`                       | 4.6.7  | MIT     | Esquemas das ferramentas MCP      |

## Dependências do P0 (2026-11-11)

| Pacote                                      | Versão                  | Licença           |
| ------------------------------------------- | ----------------------- | ----------------- |
| typescript                                  | 7.0.2                   | Apache-2.0        |
| vite                                        | 8.3.8                   | MIT               |
| @vitejs/plugin-react                        | 6.3.0                   | MIT               |
| react, react-dom                            | 19.3.1                  | MIT               |
| three, @types/three                         | 0.187.0                 | MIT               |
| vitest                                      | 5.1.0                   | MIT               |
| @biomejs/biome                              | 2.6.6                   | MIT OR Apache-2.0 |
| @playwright/test                            | 1.65.0                  | Apache-2.0        |
| @types/node, @types/react, @types/react-dom | 24.19.2, 19.3.0, 19.3.0 | MIT               |

Desvios do plano: sem `@react-three/fiber`/`drei`, `zustand` e `fast-check` por ora (three.js direto; entram quando houver uso). O `LICENSE` (GPL-3.0) veio de gnu.org.
