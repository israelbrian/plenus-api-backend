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
- `GET /produtos/:id` - Retorna os detalhes de um produto específico (com formatação nativa de booleanos e arrays).
- `GET /categorias` - Retorna as categorias ativas no sistema, ou seja, aquelas que estão cadastradas no banco de dados.
- `GET /categorias/:slug` - Retorna a categoria completa e, como anexo, todos os produtos atrelados a ela.

### 2. Rotas Privadas (Mutação - POST)
Destinadas ao consumo futuro pelo **Painel Admin** (ainda não implementado). São rigorosamente blindadas por um `authMiddleware` que exige o cabeçalho `x-api-key`.

- `POST /upload` - Faz o upload de imagens (`multipart/form-data`) para o bucket Cloudflare R2 e retorna a URL pública gerada.
  - **Regra de Negócio (Pastas Visuais):** O R2 utiliza arquitetura *Object Storage*, onde pastas não existem fisicamente, sendo apenas prefixos no nome do arquivo. Para organizar as fotos no painel da Cloudflare, esta rota espera um parâmetro de texto chamado `pasta` (além do arquivo `image`). Na interface do Painel Admin (para o cliente), isso será invisível: o Front-end (Next.js) capturará automaticamente o valor do campo "Categoria" que o usuário selecionou e o enviará como parâmetro "pasta" para a API por baixo dos panos. Se o valor não for enviado, o arquivo cairá no prefixo `geral/`.
  - **Contrato de API (Consumo via Front-end):**
    Para interagir com esta rota, a aplicação cliente (ex: Next.js) deve submeter a requisição utilizando o formato genérico `multipart/form-data`. O envio do arquivo físico sob a chave exata `image` é estritamente obrigatório.
    
    **Abstração da Interface (UI):** A organização das pastas é totalmente abstraída para o usuário final. Na tela de cadastro, o usuário interage apenas com um campo padrão de upload (`<input type="file" />`) e um menu de seleção de categorias (`<select>`). O código Front-end deve interceptar esses elementos de UI e injetar dinamicamente o valor selecionado da categoria dentro da chave `pasta` do formulário, organizando o arquivo no R2 de forma transparente.
    
    ```javascript
    // Exemplo de integração Front-end (Next.js)
    const formData = new FormData();
    
    // 1. Arquivo físico interceptado diretamente do input file
    formData.append('image', arquivoFotoSelecionada); 
    
    // 2. Slug da categoria interceptado do select de UI
    formData.append('pasta', categoriaSelecionadaSlug); 

    // 3. Submissão para a API Serverless
    const response = await fetch('https://api.plenus.com/upload', {
      method: 'POST',
      headers: { 'x-api-key': 'senha-do-painel' },
      body: formData // O navegador define o Content-Type: multipart/form-data automaticamente
    });
    
    const dados = await response.json();
    console.log(dados.url); // URL pública gerada que deverá compor o payload JSON do POST /produtos
    ```
- `POST /produtos` - Criação de novos móveis. Valida a Chave Estrangeira com Categorias já existentes e requer que a URL da imagem (devolvida previamente pela rota de upload) seja enviada no JSON do body.
- `POST /categorias` - Criação de novas categorias para suporte do catálogo.

### 3. Rotas Privadas (Atualização - PATCH)
- `PATCH /produtos/:id` - Atualização parcial de um produto específico.
  - **Objetivos no Negócio:** Essencial para o fluxo do Painel Admin. Permite que o cliente altere apenas um aspecto do móvel (como corrigir um erro de digitação na descrição ou substituir uma foto antiga por um novo link gerado no R2) de forma rápida, sem a necessidade de re-enviar todo o formulário com dados que não foram modificados.
  - **Funcionamento Técnico (Query Dinâmica):** A rota foi construída para ser inteligente. O Hono analisa o JSON do `body` e injeta na cláusula `UPDATE` do banco D1 **somente** as propriedades que o front-end enviou. Se apenas `"imagemPrincipal"` for enviada, apenas esta coluna será sobrescrita. Campos do tipo Array (como `"imagens": ["url1", "url2"]`) são processados e convertidos em String (`JSON.stringify()`) de forma automática antes de serem salvos, alinhando-se com a limitação arquitetural do SQLite.
- `PATCH /categorias/:slug` - Atualização de uma categoria específica. (Em desenvolvimento)

### 4. Rotas Privadas (Exclusão - DELETE)
- `DELETE /produtos/:id` - Exclusão de um produto específico. (Em desenvolvimento)
- `DELETE /categorias/:slug` - Exclusão de uma categoria específica. (Em desenvolvimento)

---

## 🔗 Integração com o Front-end (Next.js)

O Front-end atual do site Plenus Planejados foi estruturado de forma inteligente, utilizando um banco de dados "mock" local (`products.json`) e uma arquitetura baseada em "Dumb Components" (componentes agnósticos que apenas recebem dados). Por conta desse desacoplamento impecável, a substituição do arquivo estático pela nossa API real Hono + D1 será "melzinho na chupeta/Easy peasy".

> [!NOTE]
> **Documentação de UI/UX do Painel Administrativo**
> Toda a arquitetura visual, abstrações de formulário (Dirty Fields), matemática de Drag & Drop para o Carrossel e regras de Upload Invisível para a construção do **Painel Admin** estão extensamente documentadas no arquivo dedicado: [`docs/02-admin-panel-ui-architecture.md`](./docs/02-admin-panel-ui-architecture.md).


**Resumo e Validação da Integração:**
- **Zero Refatoração Visual:** Arquivos como `<ProductGrid />` (renderização de cards) e `<SearchBar />` não exigem absolutamente nenhuma alteração. Eles continuarão operando independentes.
- **Transição de Arrays:** A API Hono foi estrategicamente programada para converter as galerias de imagens via `JSON.parse()` e o campo destaque para `Boolean` antes de devolver a resposta HTTP. O Typescript do Front-end vai engolir a resposta sem reclamar de tipagens.
- **Filtros Instantâneos (`useMemo`):** O `ProductsPageClient.tsx` atual possui toda a lógica pesada de filtro de busca e organização de categoria rodando na memória RAM do navegador. Basta fornecer os dados da API `GET /produtos` e deixar o front-end orquestrar o resto de forma otimizada.
- **O que deverá ser alterado no Next.js:** O desenvolvedor Front-end precisará alterar unicamente o arquivo de serviços (`src/lib/products.ts`) ou injetar chamadas `fetch` dentro dos `useEffect` dos componentes Clients.

*Exemplo Prático da Migração:*
```tsx
// ANTES (Usando JSON Mockado)
useEffect(() => {
  setProducts(getAllProducts());
}, []);

// DEPOIS (Lendo da Cloudflare D1 Serverless)
useEffect(() => {
  fetch('https://api.plenus.workers.dev/produtos')
    .then(res => res.json())
    .then(data => setProducts(data));
}, []);
```

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

## 💻 Como rodar o projeto localmente

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

## ☁️ Armazenamento de Imagens (Cloudflare R2)

Para a gestão de arquivos estáticos dinâmicos (uploads de fotos dos produtos feitos pelo painel administrativo), utilizamos o **Cloudflare R2**, que é a solução de Object Storage (similar ao AWS S3).

### Propósito e Regras de Negócio
- **Desacoplamento:** Nenhuma foto do produto deve ser enviada para dentro do repositório estático do front-end (`public/`), nem armazenada como blob no banco de dados. 
- **O Fluxo:** O R2 hospeda o arquivo pesado e gera uma URL pública rápida e servida em CDN. O banco SQLite (D1) salva apenas essa String (URL).
- **Abstração de Pastas:** No Object Storage, *pastas físicas não existem*. Elas são uma ilusão de interface baseada em prefixos textuais. Para salvar na pasta `cozinhas`, o arquivo é nomeado como `cozinhas/nomedafoto.jpg`. O front-end é responsável por abstrair isso, capturando o select da categoria e enviando-o via `FormData` na chave `pasta` ao fazer a requisição de upload.

### Limites e Custos (Plano Gratuito)
A Cloudflare possui uma camada gratuita extremamente generosa, focada em não penalizar o desenvolvedor:
- **Armazenamento:** 10 GB gratuitos por mês.
- **Leitura de Objetos (Views na Imagem):** 10 milhões de requisições por mês.
- **Mutação (Uploads):** 1 milhão de requisições por mês.
- *Particularidade:* Para ativar o R2 na conta, a Cloudflare exige o cadastro de um Cartão de Crédito por motivos de controle e anti-fraude. Se o armazenamento ultrapassar os 10 GB, a cobrança é de apenas US$ 0,015 (menos de 10 centavos de real) por Gigabyte extra.

### 📋 Checklist de Migração (Para a Conta do Cliente Final)
Quando você for migrar a aplicação para a conta definitiva da Plenus, siga estes passos exatos:

1. **Conta e Pagamento:** Crie a conta da Cloudflare e adicione o cartão de crédito da empresa (obrigatório para liberar o R2).
2. **Criação do Bucket:**
   - No painel da Cloudflare, navegue para **R2 Object Storage**.
   - Clique em **Create Bucket** e nomeie-o (ex: `plenus-products-images`). Sem espaços ou maiúsculas.
3. **Liberação Pública (Crítico):**
   - Entre no Bucket recém-criado, vá na aba **Settings**.
   - Procure por **Public Access** e clique para liberar o subdomínio `.r2.dev` (ou configure um domínio customizado caso tenham um).
   - **Copie a URL pública gerada** (Ex: `https://pub-abcd123.r2.dev`).
4. **Atualização do Código Local:**
   - No arquivo `wrangler.toml`, na seção `[[r2_buckets]]`, altere o `bucket_name` para o nome que você usou no Passo 2.
   - Na seção `[vars]`, cole a URL do Passo 3 na variável `PUBLIC_R2_URL`.
5. **Deploy Final:**
   - Rode o comando `npm run deploy` para atualizar os workers com a nova infraestrutura. A partir daí, os uploads irão para a conta do cliente.

---

## 📘 Banco de Dados Relacional (Cloudflare D1)

Para o armazenamento relacional de dados (textos, relacionamentos e regras do catálogo), utilizamos o **Cloudflare D1**, um banco SQL serverless construído sobre o SQLite.

### Propósito e Regras de Negócio
- **Arquitetura Serverless:** O D1 roda nas bordas da internet (Edge). Diferente de bancos tradicionais (como MySQL/Postgres), ele não sofre com problemas de gargalos de conexão ("connection pools"). Ele responde de forma distribuída e ultra-rápida.
- **Abstração de Tipos (Limitação do SQLite):** O SQLite não suporta nativamente tipos `Boolean` e `Array`. Por isso:
  - **Booleanos** (ex: `destaque`) são mapeados para `INTEGER` (1 para True, 0 para False).
  - **Arrays** (ex: galeria de múltiplas `imagens`) são convertidos para String (`JSON.stringify`) no banco e re-convertidos para Array (`JSON.parse`) via código (Hono) antes de chegar ao Front-end.
- **Dicionário de Tabelas:**
  - **`produtos`**: Tabela principal. Armazena os detalhes dos móveis. Salva apenas a URL pública (String) das imagens oriundas do R2.
  - **`categorias`**: Tabela de taxonomia e restrição. Funciona como *Foreign Key* (Chave Estrangeira). A regra de negócio proíbe o cadastro de um produto apontando para um `categoriaSlug` que não exista previamente aqui.

### Limites e Custos (Plano Gratuito)
A generosidade da Cloudflare no D1 é perfeita para sistemas PME (Pequenas e Médias Empresas):
- **Armazenamento:** 5 GB gratuitos de dados em texto. (Para um catálogo de produtos onde salvamos apenas strings, cabem literalmente milhões de móveis).
- **Leitura (Selects):** 5 milhões de linhas lidas *por dia*.
- **Escrita (Insert/Update/Delete):** 100 mil linhas escritas *por dia*.
- *Custos Extras:* Se ultrapassar o limite diário ou de espaço, o preço é baixíssimo. O banco nunca sai do ar ou é bloqueado bruscamente.

### 📋 Checklist de Migração (Para a Conta do Cliente Final)
Quando você criar a conta da Cloudflare definitiva para o cliente, você começará sem nenhum banco de dados lá. Siga estes passos exatos no terminal para migrar a base:

1. **Criação do Banco na Nuvem:**
   - Estando logado via terminal (`npx wrangler login`) na nova conta, rode:
   ```bash
   npx wrangler d1 create plenus-catalog-db
   ```
2. **Atualização do Código Local (`wrangler.toml`):**
   - O comando acima te devolverá no terminal um novo ID (`database_id`).
   - Abra o seu `wrangler.toml`, vá na seção `[[d1_databases]]` e substitua o `database_id` antigo pelo novo ID gerado.
3. **Construção das Tabelas na Produção (Crítico):**
   - O banco novo está completamente vazio. Envie o seu schema de tabelas para a nuvem:
   ```bash
   npx wrangler d1 execute plenus-catalog-db --remote --file=./database/schema.sql
   ```
4. **Deploy Final:**
   - Rode o `npm run deploy` para atualizar sua API. Agora ela está conectada ao D1 de produção da conta nova!

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