import { Hono } from 'hono';
import { cors } from 'hono/cors';

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  PUBLIC_R2_URL: string;
  API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['ContentType', 'x-api-key'],
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

app.post('/categorias', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { slug, nome, icone } = body;
    
    // Inserindo a nova categoria
    const result = await c.env.DB.prepare(`
      INSERT INTO categorias (slug, nome, icone)
      VALUES (?, ?, ?)
      RETURNING *
    `).bind(slug, nome, icone).first();

    return c.json({ message: 'Categoria criada com sucesso!', categoria: result }, 201);
  } catch (e) {
    console.error(e);
    return c.json({ error: 'Erro ao criar categoria. Verifique se o slug já existe.' }, 500);
  }
});

app.post('/upload', authMiddleware, async (c) => {
  try {
    // Extrai o FormData da requisição (multipart/form-data)
    const body = await c.req.parseBody();
    const file = body['image'];

     // NOVIDADE: Pegamos o nome da pasta (se o front não mandar, cai na pasta 'geral')
    // O 'as string' garante pro TypeScript que é um texto
    const pasta = (body['pasta'] as string) || 'geral'; 
    // Valida se o arquivo existe e é do tipo File
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'Nenhuma imagem foi enviada no campo "image".' }, 400);
    }
    // NOVIDADE: Adicionamos a "pasta/" no começo do nome do arquivo
    const fileName = `${pasta}/${file.name.replace(/\s+/g, '-')}`;

    // Transforma o arquivo em um formato que o R2 entende (ArrayBuffer)
    const arrayBuffer = await file.arrayBuffer();

    // Faz o upload para o Bucket R2
    await c.env.BUCKET.put(fileName, arrayBuffer, {
      httpMetadata: { contentType: file.type },
    });

    // Monta a URL pública (usando a base da R2 dev e o nome do arquivo)
    const publicUrl = `${c.env.PUBLIC_R2_URL}/${fileName}`;

    return c.json({ 
      message: 'Upload concluído com sucesso!',
      url: publicUrl,
      fileName: fileName
    }, 201);
  } catch (e) {
    console.error(e);
    return c.json({ error: 'Erro ao fazer upload da imagem.' }, 500);
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
