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

app.patch('/produtos/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    
    // Constrói a query de atualização dinamicamente baseada no que o front-end enviou
    const updates = [];
    const values = [];
    
    if (body.nome !== undefined) { updates.push('nome = ?'); values.push(body.nome); }
    if (body.categoria !== undefined) { updates.push('categoria = ?'); values.push(body.categoria); }
    if (body.categoriaSlug !== undefined) { updates.push('categoriaSlug = ?'); values.push(body.categoriaSlug); }
    if (body.imagemPrincipal !== undefined) { updates.push('imagemPrincipal = ?'); values.push(body.imagemPrincipal); }
    if (body.imagens !== undefined) { updates.push('imagens = ?'); values.push(JSON.stringify(body.imagens)); }
    if (body.descricao !== undefined) { updates.push('descricao = ?'); values.push(body.descricao); }
    if (body.destaque !== undefined) { updates.push('destaque = ?'); values.push(body.destaque ? 1 : 0); }
    if (body.relevancia !== undefined) { updates.push('relevancia = ?'); values.push(body.relevancia); }
    
    if (updates.length === 0) {
      return c.json({ error: 'Nenhum campo enviado para atualização.' }, 400);
    }
    
    values.push(id); // O ID é sempre o último parâmetro (para a cláusula WHERE)
    
    const query = `UPDATE produtos SET ${updates.join(', ')} WHERE id = ? RETURNING *`;
    
    const result = await c.env.DB.prepare(query).bind(...values).first();
    
    if (!result) {
      return c.json({ error: 'Produto não encontrado.' }, 404);
    }

    return c.json({ message: 'Produto atualizado com sucesso!', product: result }, 200);
  } catch (e) {
    console.error(e);
    return c.json({ error: 'Erro ao atualizar produto.' }, 500);
  }
});

export default app;
