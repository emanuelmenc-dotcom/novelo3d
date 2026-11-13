# 06 — Modelo de dados

Os tipos abaixo são a especificação. Nomes de tipos e campos ficam em inglês; comentários e mensagens em português. Unidades internas: milímetros e radianos.

## 1. Projeto

```ts
interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string; // ISO 8601
  updatedAt: string;
  gauge: Gauge; // amostra padrão do projeto
  yarns: Yarn[]; // paleta de fios
  parts: Part[];
  assembly: AssemblyStep[]; // vazio até o marco M9
  notes: string;
}

interface Gauge {
  stitchesPer10cm: number; // pontos baixos em 10 cm, medidos em voltas
  roundsPer10cm: number; // voltas em 10 cm
  hookMm?: number;
  yarnWeight?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; // categoria do Craft Yarn Council
}
// largura do ponto  w = 100 / stitchesPer10cm   (mm)
// altura da volta   h = 100 / roundsPer10cm     (mm)

interface Yarn {
  id: string; // "A", "B", ...
  role: "primary" | "secondary" | "accent";
  name: string; // "verde musgo"
  colorHex: string; // "#5d6b3a"
  notes?: string; // marca, composição
}
```

## 2. Peça

```ts
interface Part {
  id: string;
  name: string; // "Cabeça e corpo"
  quantity: number; // "fazer 2"
  mirrored: boolean; // segunda cópia espelhada
  source: "geometry" | "pattern";
  gaugeOverride?: Gauge;
  geometry?: Geometry; // obrigatório se source = 'geometry'
  pattern?: Pattern; // obrigatório se source = 'pattern'; senão é cache derivado
  paint: PaintRegion[];
  transform: Transform; // só para montagem e visualização
  finishing: { stuffing: "none" | "light" | "firm"; closing: "gather" | "open" | "seam" };
  adaptations: Adaptation[]; // diferenças em relação a uma receita importada
}

interface Transform {
  position: [number, number, number];
  rotation: [number, number, number];
}
```

`transform` nunca altera contagens. Mudar o tamanho de uma peça é editar o perfil ou a amostra.

## 3. Geometria paramétrica

```ts
type Geometry = RevolveGeometry | FlatGeometry | MeshGeometry;

interface RevolveGeometry {
  kind: "revolve";
  profile: ProfilePoint[]; // polilinha canônica, do início ao fim do trabalho
  handles?: ProfileHandle[]; // curva suave usada só para edição
  startClosed: boolean; // começa em anel mágico (raio → 0)
  endClosed: boolean; // termina fechando (raio → 0)
  section?: SectionField; // desvio não axissimétrico (marco M8)
}

interface ProfilePoint {
  r: number;
  z: number;
} // mm; r ≥ 0
interface ProfileHandle {
  r: number;
  z: number;
  smooth: boolean;
}

// desvio radial relativo em função do comprimento de arco s e do ângulo θ
interface SectionField {
  sSamples: number[];
  thetaSamples: number[];
  scale: number[][];
}

interface FlatGeometry {
  kind: "flat" /* marco M8 */;
}
interface MeshGeometry {
  kind: "mesh" /* marco M10 */;
}
```

**Polilinha canônica.** Quando a peça vem de uma receita, `profile` tem um ponto por volta e cada segmento mede exatamente `h`. É isso que garante que o ciclo receita → 3D → receita devolve as mesmas contagens. `handles` é uma camada de edição: quando o usuário move um manipulador, o perfil é reamostrado e a peça passa a ser `source: 'geometry'`.

## 4. Receita

```ts
interface Pattern {
  dialect: "pt-BR" | "en-US" | "en-UK"; // dialeto de origem, só informativo
  rows: Row[];
}

interface Row {
  id: string;
  label: string; // "1", "13", "C1", "acab."
  kind: "round" | "joinedRound" | "row" | "foundation";
  start?: "magicRing" | "chain" | "pickup"; // só na primeira linha de um trecho
  ops: Op[];
  repeatRows?: number; // "voltas 15–16": esta linha vale por 2
  declaredCount?: number; // total escrito na receita, se houver
  yarnId?: string; // fio da linha, se uniforme
  note?: string;
  sourceText?: string; // texto original, para a tabela de verificação
}

type Op =
  | { kind: "stitch"; code: StitchCode; count: number; mods?: Mod[]; yarnId?: string; counted?: boolean }
  | { kind: "group"; ops: Op[] } // vários pontos no mesmo ponto de base
  | { kind: "together"; code: StitchCode; over: number; invisible?: boolean } // fechar juntos
  | { kind: "repeat"; times: number; ops: Op[] }
  | { kind: "skip"; count: number }
  | { kind: "into"; target: "chain" | "slipStitch" | "ring"; ops: Op[] } // alvo explícito
  | { kind: "join" } // ponto baixíssimo que fecha a volta
  | { kind: "toe"; chains: number } // dedo: corrente, volta em pb, pbx na base
  | { kind: "marker"; text: string };

type StitchCode = "CH" | "SL" | "SC" | "HDC" | "DC" | "TR";
type Mod = "BLO" | "FLO";
```

Atalhos de leitura e escrita, resolvidos pelo pacote `notation`:

| Atalho                              | Forma canônica             |
| ----------------------------------- | -------------------------- |
| aumento (`aum`, `inc`)              | `group` com 2 `SC`         |
| aumento triplo                      | `group` com 3 `SC`         |
| diminuição (`dim`, `dec`, `sc2tog`) | `together` de `SC` sobre 2 |
| 3 e 4 pontos fechados juntos        | `together` sobre 3 ou 4    |

## 5. Tabela de pontos

Cada operação consome topos da linha anterior e produz topos para a próxima.

| Operação                        | Consome | Produz | Conta no total                    |
| ------------------------------- | ------- | ------ | --------------------------------- |
| `SC`, `HDC`, `DC`, `TR`         | 1       | 1      | Sim                               |
| `group` de k pontos             | 1       | k      | Sim                               |
| `together` sobre k              | k       | 1      | Sim                               |
| `CH`                            | 0       | 1      | Depende de `counted`              |
| `SL`                            | 1       | 1      | Depende de `counted`; padrão: não |
| `skip` n                        | n       | 0      | —                                 |
| `join`                          | 0       | 0      | —                                 |
| `toe`                           | 0       | 0      | Não (anotado à parte)             |
| pontos dentro de `into: 'ring'` | 0       | 1 cada | Sim                               |

Altura relativa para o 3D e o gráfico (múltiplos da altura do ponto baixo; valores iniciais derivados das regras de disco plano, a calibrar com amostras): `SL` 0,3; `SC` 1; `HDC` 1,33; `DC` 2; `TR` 3. Os valores de `SL` e `TR` são estimativas sem fonte.

## 6. Regra dos topos não contados

Receitas tratam certas correntes e pontos baixíssimos como "não contam como ponto". O modelo guarda isso no topo produzido, com `counted: false`.

1. Uma operação comum consome o próximo topo **contado**. Topos não contados no caminho são pulados em silêncio.
2. Para trabalhar em um topo não contado, a receita usa `into` com alvo explícito ("pbx na corrente").
3. O total de uma linha é o número de topos contados que ela produz.

Essa regra reproduz frases como "1 corr (não conta como ponto)" e "ignorando a corrente", e foi a que fechou todas as voltas da receita trabalhada na sessão de origem.

## 7. Grafo de pontos

Derivado de `Pattern` por `core.buildGraph()`. Nunca é editado diretamente.

```ts
interface StitchGraph {
  nodes: StitchNode[]; // na ordem em que o fio passa
  rows: { rowId: string; first: number; last: number }[];
}

interface StitchNode {
  id: number; // índice em nodes
  rowIndex: number;
  indexInRow: number;
  code: StitchCode | "RING";
  counted: boolean;
  parents: number[]; // pontos de base em que foi trabalhado (0, 1 ou vários)
  groupWith?: number; // irmão do mesmo aumento
  yarnId: string;
  mods: Mod[];
  pos?: [number, number, number]; // preenchido pelo motor reverso
}
```

Relações:

- **Aresta de carreira:** de `nodes[i]` para `nodes[i+1]` (caminho do fio).
- **Aresta de coluna:** de cada nó para cada um de seus `parents`.
- Aumento: dois nós com o mesmo pai. Diminuição: um nó com dois ou mais pais.

## 8. Pintura

```ts
type PaintRegion =
  | { kind: "band"; yarnId: string; fromS: number; toS: number } // faixa ao longo do perfil
  | { kind: "patch"; yarnId: string; polygon: [number, number][] } // polígono em (s, θ)
  | { kind: "stitches"; yarnId: string; nodeIds: number[] }; // pontos explícitos
```

- Peças com `source: 'geometry'` usam `band` e `patch`, em coordenadas da superfície. Na geração, cada ponto recebe o fio da região que contém o seu centro. Assim a pintura sobrevive a mudanças de amostra.
- Peças com `source: 'pattern'` usam `stitches`.
- Regiões posteriores na lista têm prioridade.

## 9. Adaptações

```ts
interface Adaptation {
  rowId?: string;
  nodeIds?: number[];
  kind: "countFix" | "interpretation" | "yarnChange" | "unworked";
  original: string; // o que a receita dizia
  applied: string; // o que foi desenhado
  reason: string;
}
```

Toda adaptação aparece em magenta no gráfico e no texto, com asterisco e nota.

## 10. Arquivo de projeto

- Extensão `.novelo.json`, UTF-8, validado com zod na leitura.
- `schemaVersion` inteiro; cada mudança incompatível ganha uma função de migração em `interop`.
- Caches derivados (grafo, posições) não são gravados.
- Limite de tamanho alvo: 2 MB por projeto.
