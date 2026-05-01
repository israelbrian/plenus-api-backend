import { Hono } from 'hono';
import { cors } from 'hono/cors';

export interface Env {
  DB: D1Database;
  API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'x-api-key'],
}));

const authMiddleware = async (c: any, next: any) => {
  const apiKeyHeader = c.req.header('x-api-key');
  if (!apiKeyHeader || apiKeyHeader !== c.env.API_KEY) {
    return c.json({ error: 'Não autorizado. Chave da API inválida.' }, 401);
  }
  await next();
};

app.get('/produtos', async (c) => {
  try {
    const { results } = await c.env.DB.prepare("SELECT * FROM produtos ORDER BY relevancia DESC").all();
    
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

app.get('/categorias', async (c) => {
  try {
    const { results } = await c.env.DB.prepare("SELECT * FROM categorias").all();
    return c.json(results);
  } catch (e) {
    return c.json({ error: 'Erro ao buscar categorias' }, 500);
  }
});

app.post('/produtos', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { nome, categoria, categoriaSlug, imagemPrincipal, imagens, descricao, destaque, relevancia } = body;
    
    const result = await c.env.DB.prepare(`
      INSERT INTO produtos (nome, categoria, categoriaSlug, imagemPrincipal, imagens, descricao, destaque, relevancia)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).bind(
      nome, categoria, categoriaSlug, imagemPrincipal, 
      JSON.stringify(imagens || []), descricao, 
      destaque ? 1 : 0, relevancia || 1
    ).first();

    return c.json({ message: 'Produto criado!', product: result }, 201);
  } catch (e) {
    console.error(e);
    return c.json({ error: 'Erro ao criar produto' }, 500);
  }
});

export default app;
