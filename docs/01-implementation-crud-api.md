# Spec-Driven Development: API Serverless de Catálogo (Hono + Cloudflare D1)

Este documento serve como **Plano de Implementação** e **Fonte da Verdade** para a construção do repositório Back-end (API) da Plenus Planejados. Esta API substituirá o arquivo estático genérico (`products.json`) garantindo um catálogo vivo, dinâmico e gerenciável via painel.


## 🏛️ Arquitetura Desacoplada (Microsserviços)

A arquitetura geral do projeto será distribuída em repositórios independentes:
1. **Front-end Site (Neste repositório):** Consumidor Público (Apenas leitura/GET). Não requer autenticação para listagem do catálogo.
2. **Back-end API (Novo repositório):** Motor de Banco de Dados Edge (Hono + D1). Contém as regras de negócio e validações.
3. **Front-end Admin (Novo repositório):** Painel Gráfico de Gerenciamento. Consumirá a API (POST/PUT/DELETE) enviando um Header de Segurança (`x-api-key`).

---

## 🛠️ Stack Tecnológica (API)
- **Engine:** Cloudflare Workers (Edge Computing V8)
- **Banco de Dados:** Cloudflare D1 (SQLite Serverless)
- **Framework Web:** Hono.js (Focado em Edge, ultra-rápido)
- **Linguagem:** TypeScript
- **Ferramental:** Wrangler CLI

---

## 🗺️ Roteiro de Implementação Técnico

> **Aviso:** Execute os comandos abaixo no **seu novo repositório**, em uma pasta limpa (ex: `plenus-api-backend`), e não dentro da pasta do site atual.

### Passo 1: Setup do Projeto Hono

Para inicializar a estrutura base da sua API utilizando o template nativo do Hono para Cloudflare Workers, execute o comando abaixo no seu terminal:

```bash
npm create hono@latest plenus-api
```
*No menu interativo, selecione:*
1. **template:** `cloudflare-workers`
2. **package manager:** `npm` (ou o de sua preferência)

Entre na pasta criada:
```bash
cd plenus-api
```

---

### Passo 2: Modelagem do Banco de Dados (D1)

Precisamos espelhar a tipagem que já existe no front-end hoje (`categoria`, `slug`, `relevancia`) para que o site não quebre ao ligar na API.

#### 2.1 - Criação do Banco no Cloudflare
Na sua máquina (logado no Cloudflare via `npx wrangler login`), rode:
```bash
npx wrangler d1 create plenus-catalog-db
```
*O console retornará um `database_id` e as configurações. Copie o bloco gerado e cole no final do seu arquivo `wrangler.toml`:*

```toml
# wrangler.toml
name = "plenus-api"
compatibility_date = "2024-03-20"

[[d1_databases]]
binding = "DB"
database_name = "plenus-catalog-db"
database_id = "COLE-SEU-ID-AQUI"
```

#### 2.2 - Arquivo de Schema SQL
Na raiz do projeto da API, crie um arquivo chamado `schema.sql`:

```sql
DROP TABLE IF EXISTS produtos;

CREATE TABLE produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    categoria TEXT NOT NULL,
    categoria_slug TEXT NOT NULL,
    foto_principal TEXT NOT NULL,
    imagens TEXT, -- Array salvo em JSON stringificado ("['url1', 'url2']")
    descricao TEXT,
    destaque BOOLEAN DEFAULT FALSE,
    relevancia INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 2.3 - Semeando o Banco Localmente e Remotamente
Para criar a tabela no seu banco **Local** (para testes na máquina):
```bash
npx wrangler d1 execute plenus-catalog-db --local --file=./schema.sql
```
Para criar a tabela no seu banco **Remoto** (Produção/Cloudflare):
```bash
npx wrangler d1 execute plenus-catalog-db --remote --file=./schema.sql
```

---

### Passo 3: Desenvolvimento do CRUD (Hono.js)

Todo o cérebro da API residirá no arquivo `src/index.ts`. O Hono lida com o banco D1 injetando-o via Environment Bindings.

#### 3.1 - Construção do `src/index.ts`
Substitua o conteúdo de `src/index.ts` pelo código abaixo:

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Tipagem das Variáveis de Ambiente da Cloudflare
export interface Env {
  DB: D1Database;
  API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

// 1. CORS Middleware (Libera requisições do seu Front-end Site e do futuro Painel Admin)
app.use('/*', cors({
  origin: '*', // Em produção, altere para ['https://plenusplanejados.com.br', 'https://admin.plenusplanejados.com.br']
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'x-api-key'],
}));

// 2. Auth Middleware (Protege as rotas de Mutação - POST, PUT, DELETE)
const authMiddleware = async (c: any, next: any) => {
  const apiKeyHeader = c.req.header('x-api-key');
  if (!apiKeyHeader || apiKeyHeader !== c.env.API_KEY) {
    return c.json({ error: 'Não autorizado. Chave da API inválida.' }, 401);
  }
  await next();
};

// ==========================================
// ROTAS PÚBLICAS (Leitura)
// ==========================================

// Listar todos os produtos
app.get('/produtos', async (c) => {
  try {
    const { results } = await c.env.DB.prepare("SELECT * FROM produtos ORDER BY relevancia DESC").all();
    
    // Convertendo campos booleanos e JSONs que o SQLite armazena como texto/número
    const formattedResults = results.map(product => ({
      ...product,
      destaque: product.destaque === 1,
      imagens: product.imagens ? JSON.parse(product.imagens as string) : []
    }));

    return c.json(formattedResults);
  } catch (e) {
    return c.json({ error: 'Erro ao buscar produtos' }, 500);
  }
});

// Buscar produto por ID
app.get('/produtos/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const product = await c.env.DB.prepare("SELECT * FROM produtos WHERE id = ?").bind(id).first();
    if (!product) return c.json({ error: 'Produto não encontrado' }, 404);
    
    return c.json({
      ...product,
      destaque: product.destaque === 1,
      imagens: product.imagens ? JSON.parse(product.imagens as string) : []
    });
  } catch (e) {
    return c.json({ error: 'Erro ao buscar produto' }, 500);
  }
});

// ==========================================
// ROTAS PROTEGIDAS (Escrita/Edição)
// ==========================================

// Inserir Produto
app.post('/produtos', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { nome, categoria, categoria_slug, foto_principal, imagens, descricao, destaque, relevancia } = body;
    
    const result = await c.env.DB.prepare(`
      INSERT INTO produtos (nome, categoria, categoria_slug, foto_principal, imagens, descricao, destaque, relevancia)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).bind(
      nome, categoria, categoria_slug, foto_principal, 
      JSON.stringify(imagens || []), descricao, 
      destaque ? 1 : 0, relevancia || 1
    ).first();

    return c.json({ message: 'Produto criado!', product: result }, 201);
  } catch (e) {
    return c.json({ error: 'Erro ao criar produto' }, 500);
  }
});

// Atualizar Produto
app.put('/produtos/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    
    // Dinâmica de Update simples (Pode ser refinada com Query Builders parciais)
    const result = await c.env.DB.prepare(`
      UPDATE produtos 
      SET nome = ?, categoria = ?, categoria_slug = ?, foto_principal = ?, imagens = ?, descricao = ?, destaque = ?, relevancia = ?
      WHERE id = ? RETURNING *
    `).bind(
      body.nome, body.categoria, body.categoria_slug, body.foto_principal, 
      JSON.stringify(body.imagens || []), body.descricao, 
      body.destaque ? 1 : 0, body.relevancia || 1, id
    ).first();

    if (!result) return c.json({ error: 'Produto não encontrado' }, 404);
    return c.json({ message: 'Produto atualizado!', product: result });
  } catch (e) {
    return c.json({ error: 'Erro ao atualizar produto' }, 500);
  }
});

// Deletar Produto
app.delete('/produtos/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  try {
    const result = await c.env.DB.prepare("DELETE FROM produtos WHERE id = ?").bind(id).run();
    if (!result.success) return c.json({ error: 'Falha ao deletar' }, 500);
    return c.json({ message: 'Produto deletado com sucesso!' });
  } catch (e) {
    return c.json({ error: 'Erro interno' }, 500);
  }
});

export default app;
```

---

### Passo 4: Segurança e Ambiente Local

#### 4.1 - Cofre de Senhas (.dev.vars)
Para testar na sua máquina se as rotas de POST/PUT/DELETE estão protegidas, crie um arquivo chamado `.dev.vars` na raiz da API:

```env
API_KEY="super-senha-local-123"
```

#### 4.2 - Adicionando no Cloudflare (Produção)
Para a produção, você deve cadastrar a senha real criptografada no Cloudflare:
```bash
npx wrangler secret put API_KEY
```
*(Ele pedirá para você digitar a senha real do projeto no terminal)*

#### 4.3 - Validando o `.gitignore`
Certifique-se de que o seu `.gitignore` da API contenha as seguintes linhas para evitar vazamentos de banco e senhas para o GitHub:

```text
# Cloudflare/Wrangler
.wrangler/
.dev.vars

# Dependências
node_modules/
dist/
```

#### 4.4 - Testando a API Localmente
Rode o servidor da API conectado ao Banco D1 Local (`.wrangler/state/v3/d1`):

```bash
npm run dev
```

Agora você pode abrir o Insomnia/Postman e enviar requisições:
- `GET http://localhost:8787/produtos` (Aberto)
- `POST http://localhost:8787/produtos` (Necessita header `x-api-key: super-senha-local-123`)
