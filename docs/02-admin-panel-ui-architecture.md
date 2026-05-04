# Arquitetura de Interface e Integração - Painel Administrativo

Este documento define os padrões técnicos e as abstrações de front-end exigidas para a construção do Painel Administrativo. O foco absoluto desta arquitetura é estabelecer um **Padrão Ouro de UX (User Experience)**. Toda a complexidade envolvendo requisições assíncronas, banco de dados (D1) e Object Storage (R2) deve ser mascarada para o usuário final, provendo uma interface orgânica e fluida.

---

## Tecnologias Base do Painel
- **Framework:** Next.js (React)
- **Linguagem:** TypeScript
- **Estilização:** TailwindCSS
- **Autenticação:** API de abstração de login para o cliente
- **Deploy/Hospedagem:** Cloudflare Pages

---

## 1. Navegação e Arquitetura Geral (Página Inicial / Dashboard)

Ao logar no sistema, o usuário é recebido no Dashboard. Esta tela atua como o **Centro de Comando** e deve ter uma navegação clara, orientando o cliente para onde ele precisa ir.

**Elementos Visuais Obrigatórios da Home:**
- Mensagem de boas-vindas: *"Bem-vindo(a) ao Painel Administrativo da Plenus Planejados"*
- **Menu de Acesso Rápido (Botões/Cards de Redirecionamento):**
  - 📦 Visualizar todos os produtos cadastrados -> Redireciona para a tela de Listagem
  - 🏷️ Visualizar todas as categorias cadastradas -> Redireciona para a tela de Categorias
  - 🌟 Visualizar produtos em destaque (Carrossel) -> Redireciona para a tela de Listagem filtrada
  - ➕ Cadastrar novo produto -> Redireciona para o Formulário de Criação
  - ➕ Cadastrar nova categoria -> Redireciona para o Formulário de Criação

*(Nota de UX: Funcionalidades como "Editar, Deletar, Destacar e Reordenar" não devem ser botões soltos na Home. Eles são Ações atreladas diretamente aos móveis na "Tela de Listagem", como explicado no tópico abaixo).*

---

## 2. Listagem e Gestão Rápida (Ações nos Cards)

A tela de "Visualizar todos os produtos" vai consumir a rota `GET /produtos` e desenhar um Card na tela para cada móvel. Em cada Card, o usuário terá as seguintes opções de controle:

### A. Editar Produto
- O clique redireciona o usuário para uma nova tela (`/admin/produtos/editar`), onde o formulário completo daquele móvel específico será montado. (Detalhes no Tópico 4).

### B. Deletar Produto
- **Consome:** `DELETE /produtos/:id` (Rota a ser criada no Back-end)
- **Lógica UX:** Dispara imediatamente o **Double-Check Modal Delete**: *"Você está prestes a excluir [Nome]. Esta ação não pode ser desfeita."*
- **Reatividade:** Após o Back-end confirmar o sucesso (Status 200), o React não recarrega a página. Ele apenas atualiza a memória local (`.filter()`) para sumir com o card da tela em tempo real.

### C. Destacar e Reordenar (Gestão Visual)
- **O Toggle de Destaque:** Em cada card/linha de produto na listagem geral, existirá um interruptor (Toggle) com a etiqueta "Exibir no Carrossel? (Sim/Não)". Ao marcar "Sim", duas coisas acontecem instantaneamente na UI:
  1. A cor de fundo do produto atua como um "selo" (Selo Premium), indicando visualmente que ele é um item em evidência.
  2. O produto é dinamicamente movido para o topo da página, agrupando-se com os outros itens já selecionados.
- **Drag & Drop (Reordenação):** A área de "Produtos em Destaque" funcionará como uma fila exclusiva. Os itens ali presentes poderão ser arrastados (ordenados) livremente pelo usuário. Ao soltar o card na nova posição, o Front-end recalcula o peso do item e dispara chamadas silenciosas para `PATCH /produtos/:id` atualizando a coluna `relevancia`.
- **A Matemática da Relevância:** Para evitar o limite de pequenos números (1 a 5) e suportar um crescimento para 100 ou mais produtos, o Front-end usará uma numeração baseada em uma constante alta. O primeiro produto da lista ganhará a relevância `100`, o segundo `99`, o terceiro `98` e assim por diante (Fórmula: `100 - index da lista`).

*(Nota Arquitetural sobre o Banco de Dados: Como usamos apenas a coluna `relevancia` para ditar a ordem, o móvel que for posicionado em 1º lugar no Carrossel também será o 1º lugar na listagem da categoria dele. Isso NÃO é um conflito, é o comportamento padrão de e-commerces (os queridinhos da loja ficam no topo de tudo). Evitamos criar colunas extras no banco para manter o sistema ágil e KISS).*
---

## 3. Tela de Cadastro de Produtos (POST)

**Orquestração Invisível de Mídias:**
O objetivo é que o cliente arraste fotos do PC e clique em Salvar, sem saber o que é "R2".
- O campo "Categoria" deve ser um `<select>` populado automaticamente pela rota `GET /categorias`. Ao selecionar a categoria pelo Nome, o Front-end já vincula o `categoriaSlug` por debaixo dos panos.
- **Fluxo Master React:** O usuário preenche e clica em "Publicar Produto".
  1. O código exibe um bloqueio de tela (Loading).
  2. Dispara vários `POST /upload` na API para subir fisicamente as imagens no R2.
  3. Aguarda o R2 devolver as URLs geradas em texto.
  4. Junta essas URLs com o restante dos dados do formulário e faz a chamada final para `POST /produtos`.

---

## 4. Tela de Edição Completa (PATCH Inteligente)

**Atualização Limpa (Padrão de Mercado UI/UX):**
Ao entrar na tela de edição, o formulário DEVE ser exibido por completo, pré-preenchido com os dados capturados pelo `GET /produtos/:id`.
- **Rastreamento Invisível (Dirty Fields):** O usuário não precisa marcar "checkboxes" do que vai editar. Apenas altere o que desejar. Ferramentas modernas de React (como o `react-hook-form`) possuem a propriedade `isDirty`. O próprio código rastreia quais inputs foram modificados pelo usuário em comparação com o objeto original do banco.
- Ao clicar em Salvar, o Front-end extrai apenas os campos que sofreram alterações (*dirty fields*) e monta um payload enxuto para disparar no `PATCH /produtos/:id`.
- **Alteração de Fotos:** Caso ele substitua a imagem no `<input type="file" />`:
  1. O fluxo engole a nova foto e bate no `POST /upload`.
  2. O Front-end recebe o link.
  3. No envio final do `PATCH`, a chave `{"imagemPrincipal": "novo_link"}` é incluída no payload de campos alterados.
