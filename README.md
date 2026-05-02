# Plenus API Backend (Serverless Edge)

Este repositório contém a infraestrutura de **Back-end as a Service (BaaS)** do ecossistema Plenus Planejados. Construída 100% sobre a Edge Network da Cloudflare, esta API fornece um CRUD veloz, seguro e distribuído globalmente para o gerenciamento dinâmico do catálogo de produtos.

---

## 🛠️ Stack Tecnológica

- **Ambiente de Execução:** Cloudflare Workers (V8 Isolates / Edge Computing)
- **Banco de Dados:** Cloudflare D1 (SQLite Serverless)
- **Framework Web:** Hono.js (Web Standards)
- **Linguagem:** TypeScript
- **Infraestrutura como Código:** Wrangler CLI

---

## ⚙️ Arquitetura e Roteamento

A API está dividida em quatro escopos principais de acesso, gerenciados pelo Hono.js:

### 1. Rotas Públicas (Leitura - GET)
Destinadas ao consumo direto pelo site (Front-end) da Plenus. Não requerem autenticação e estão abertas via CORS.
- `GET /produtos` - Retorna a lista completa de produtos ordenada por relevância.
- `GET /produtos/:id` - Retorna os detalhes de um produto específico. (Em desenvolvimento)
- `GET /categorias` - Retorna as categorias ativas no sistema.
- `GET /categorias/:slug` - Retorna os detalhes de uma categoria específica. (Em desenvolvimento)

### 2. Rotas Privadas (Mutação - POST)
Destinadas ao consumo futuro pelo **Painel Admin**. São rigorosamente blindadas por um `authMiddleware` que exige o cabeçalho `x-api-key`.
- `POST /produtos` - Criação de novos móveis (Valida a Chave Estrangeira com Categorias já existentes).
- `POST /categorias` - Criação de novas categorias para suporte do catálogo.

### 3. Rotas Privadas (Atualização - PATCH)
- `PATCH /produtos/:id` - Atualização de um produto específico. (Em desenvolvimento)
- `PATCH /categorias/:slug` - Atualização de uma categoria específica. (Em desenvolvimento)

### 4. Rotas Privadas (Exclusão - DELETE)
- `DELETE /produtos/:id` - Exclusão de um produto específico. (Em desenvolvimento)
- `DELETE /categorias/:slug` - Exclusão de uma categoria específica. (Em desenvolvimento)

---

## 🔒 Segurança (Secrets e Variáveis)

Este projeto **não** armazena chaves sensíveis no código (segurança "zero-trust").
As senhas e chaves são injetadas em tempo de execução através do objeto `c.env.API_KEY`.

### No ambiente Local (Dev)
A chave local é lida a partir do arquivo `.dev.vars` (Ignorado pelo Git):
```env
API_KEY="sua-senha-de-teste"
```

### No ambiente de Produção (Cloudflare)
A chave de produção fica armazenada no cofre blindado da Cloudflare. Para atualizar ou configurar a chave real, utiliza-se o terminal:
```bash
npx wrangler secret put API_KEY
```

---

## 💻 Manual do Desenvolvedor (Rodando Localmente)

Siga os comandos abaixo para inicializar a API na sua máquina:

**1. Instalar as Dependências:**
```bash
npm install
```

**2. Criar as Tabelas no Banco Local:**
```bash
npx wrangler d1 execute plenus-catalog-db --local --file=./database/schema.sql
```

**3. Popular o Banco com os Dados Legados (Seed):**
```bash
npx wrangler d1 execute plenus-catalog-db --local --file=./database/seed.sql
```

**4. Iniciar o Servidor de Desenvolvimento:**
```bash
npm run dev
```
A API ficará disponível em: `http://localhost:8787`

---

## 🔄 Fluxo de Trabalho Contínuo (Local vs Nuvem)

Durante o desenvolvimento diário, é muito comum que os bancos de dados Local e Remoto (Produção) fiquem dessincronizados. Por exemplo: se você cadastrar produtos pelo Postman apontando para o seu `localhost:8787`, essas mudanças não vão para a nuvem automaticamente. E se o cliente cadastrar produtos no site oficial, eles não aparecerão na sua máquina.

### Cenário Ideal de Desenvolvimento
1. **Puxe a Produção para a sua Máquina (Sincronização)**
   Sempre que for criar uma nova feature, garanta que seu banco local tem os dados reais e mais atualizados.
   ```bash
   # 1. Faz o download do banco de produção (cria o arquivo dump)
   npx wrangler d1 export plenus-catalog-db --remote --output=database/dumps/producao.sql
   
   # 2. Exclua a pasta oculta .wrangler da raiz do projeto para limpar o lixo local
   
   # 3. Injete o banco baixado no seu ambiente local limpo
   npx wrangler d1 execute plenus-catalog-db --local --file=./database/dumps/producao.sql
   ```

2. **Programe e Teste (Localmente)**
   - Rode o servidor local (`npm run dev`).
   - Abra o Postman e faça suas requisições de teste (POST, PATCH, DELETE) apontando para o `http://localhost:8787`.
   - Se quebrar algo, seu banco de produção na nuvem estará 100% seguro!

3. **Subindo Código Novo (Deploy)**
   - Quando você alterar o arquivo `src/index.ts` (criando novas rotas, etc), você envia a lógica atualizada para os servidores da Cloudflare rodando:
   ```bash
   npm run deploy
   ```

4. **E se eu quiser mandar os dados testados no Local para a Produção?**
   **Cuidado (Operação Destrutiva):** O fluxo natural é a Produção ser a fonte da verdade. Porém, se você estiver populando o banco local inicialmente e quiser forçar essa cópia exata para a Nuvem, o D1 Export gera as tabelas do zero. Como a Produção já tem tabelas, você precisa apagar as tabelas da Produção antes de injetar o arquivo:
   
   ```bash
   # 1. Exporta seu banco local com todos os dados
   npx wrangler d1 export plenus-catalog-db --local --output=database/dumps/local.sql
   
   # 2. LIMPEZA DA PRODUÇÃO (Atenção: Apaga tudo na Nuvem)
   npx wrangler d1 execute plenus-catalog-db --remote --command="DROP TABLE IF EXISTS produtos; DROP TABLE IF EXISTS categorias;"
   
   # 3. Injeta a sua cópia local no banco remoto limpo
   npx wrangler d1 execute plenus-catalog-db --remote --file=database/dumps/local.sql
   ```

---

## 🚀 Processo de Deploy (Produção)

A transição do código local para os servidores globais da Cloudflare (Edge) é feita via Wrangler. O deploy empacota o TypeScript, minifica o código e distribui para os Data Centers.

**Aviso Crítico sobre Dados:** O comando `npm run deploy` sobe e atualiza **apenas o código** (as rotas do Hono). Ele **não** altera o banco de dados.
Se você precisar espelhar os dados que testou localmente para a Produção, utilize a técnica de Export Local e Import Remote descrita na seção de Fluxo de Trabalho Acima. 
Jamais rode o comando do `schema.sql` novamente na Produção, pois ele contém `DROP TABLE` e apagará todos os seus produtos reais! Caso precise criar uma nova coluna no futuro, crie um arquivo `.sql` avulso apenas com o `ALTER TABLE` e rode a execução remota dele.

**2. Publicar a API na Cloudflare:**
```bash
npm run deploy
```
*O console retornará a URL oficial de produção (ex: `https://plenus-api-backend.<seu-usuario>.workers.dev`).*

---

## 📘 Dicionário do Banco D1 (SQLite)

- **`produtos`**: Armazena os itens do catálogo. A coluna `imagens` salva múltiplos links como String em formato JSON (ex: `'["link1.jpg", "link2.jpg"]'`), sendo convertida de volta para Array no envio ao front-end.
- **`categorias`**: Tabela de restrição (Foreign Key). É impossível cadastrar um produto em uma categoria cujo `slug` não exista nesta tabela.

## 🔍 Consultas Rápidas no Banco (Via Terminal)

Para debugar e verificar os dados sem precisar usar o Postman ou criar interfaces, você pode enviar *Querys SQL* avulsas diretamente pelo terminal usando o parâmetro `--command`.

**No Banco Local:**
```bash
# Comando base
npx wrangler d1 execute plenus-catalog-db --local --command="<SQL QUERY>"

# Ver todos os produtos em destaque
npx wrangler d1 execute plenus-catalog-db --local --command="SELECT nome, categoria FROM produtos WHERE destaque = 1"

# Contar quantos produtos existem cadastrados
npx wrangler d1 execute plenus-catalog-db --local --command="SELECT COUNT(*) FROM produtos"

```

**No Banco de Produção (Nuvem):**
Basta trocar a flag `--local` por `--remote`.
```bash
npx wrangler d1 execute plenus-catalog-db --remote --command="SELECT * FROM categorias"
```

## 🐛 Debugging
Para ler os logs do servidor em produção (erros 500, logs SQL), utilize:
```bash
npx wrangler tail
```
