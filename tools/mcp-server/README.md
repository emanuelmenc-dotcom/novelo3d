# Servidor MCP do Novelo3D

Permite que o Claude opere o projeto por scripts, no mesmo desenho do MCP do FreeCAD: servidor MCP por stdio + ponte local para o aplicativo.

## Ferramentas (reais hoje)

| Ferramenta           | O que faz                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `novelo_status`      | Versão do Node, raiz do projeto, estado da ponte e do aplicativo                            |
| `novelo_run_script`  | Roda um script Node ESM em processo separado (tempo limite, stdout/stderr capturados)       |
| `novelo_bridge_call` | Envia um comando ao aplicativo conectado; falha com mensagem clara se não houver aplicativo |

O `apps/studio` (`npm run dev` na raiz) conecta sozinho à ponte e executa os comandos de `packages/commands`. Para testar contra outra porta: `?bridge=<porta>` na URL.

## Ponte (HTTP, 127.0.0.1:47821, variável `NOVELO_BRIDGE_PORT`)

| Rota                  | Corpo                                | Resposta                                |
| --------------------- | ------------------------------------ | --------------------------------------- |
| `POST /register`      | `{client, version}`                  | `{ok, session}`                         |
| `GET /poll?session=S` | ,                                    | `{id, method, params}` ou 204 após 25 s |
| `POST /result`        | `{session, id, ok, result?, error?}` | `{ok}`                                  |
| `GET /health`         | ,                                    | `{ok, connected}`                       |

O aplicativo registra, fica em `poll` e responde cada comando com `result`.

## Uso

```
npm install
npm test     # fala MCP por stdio e simula o aplicativo
```

Registro: `.mcp.json` na pasta `Crochet` (comando `node`, sem wrapper). Reinicie a sessão do Claude e aprove o servidor para as ferramentas aparecerem.

## Origem permitida (D-58)

A ponte recusa (403) pedidos de navegador cuja `Origin` não seja `http://localhost:5173` ou `http://127.0.0.1:5173`. Para outra origem, defina `NOVELO_ALLOWED_ORIGINS="https://a,https://b"`. Clientes sem `Origin` (scripts e testes em Node) continuam passando.
