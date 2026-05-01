DROP TABLE IF EXISTS produtos;
DROP TABLE IF EXISTS categorias;

-- Tabela de Categorias
CREATE TABLE categorias (
    slug TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    icone TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Produtos
CREATE TABLE produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    categoria TEXT NOT NULL,
    categoriaSlug TEXT NOT NULL,
    imagemPrincipal TEXT NOT NULL,
    imagens TEXT, -- Armazenado como String JSON (Ex: '["url1", "url2"]')
    descricao TEXT,
    destaque INTEGER DEFAULT 0, -- 0 para False, 1 para True
    relevancia INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoriaSlug) REFERENCES categorias(slug)
);
