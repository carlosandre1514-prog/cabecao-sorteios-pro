const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Servir os arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// 🛒 ROTAS DA FRENTE DE CAIXA (PDV)
// -------------------------------------------------------------

// 🔍 Buscar produto único pelo Código de Barras
app.get('/api/produtos/:codigo', (req, res) => {
    const { codigo } = req.params;
    const produto = db.get('produtos').find({ codigo_barras: codigo }).value();

    if (!produto) {
        return res.status(404).json({ erro: "Produto não encontrado!" });
    }
    res.json(produto);
});

// 💳 Registrar Venda
app.post('/api/vendas', (req, res) => {
    const { itens, total, forma_pagamento } = req.body;

    if (!itens || itens.length === 0) {
        return res.status(400).json({ erro: "Carrinho vazio!" });
    }

    const novaVenda = {
        id: Date.now(),
        data: new Date().toISOString(),
        total,
        forma_pagamento,
        itens
    };
    db.get('vendas').push(novaVenda).write();

    itens.forEach(item => {
        const prod = db.get('produtos').find({ id: item.id }).value();
        if (prod) {
            db.get('produtos')
              .find({ id: item.id })
              .assign({ estoque: prod.estoque - item.quantidade })
              .write();
        }
    });

    res.json({ mensagem: "Venda finalizada com sucesso!", vendaId: novaVenda.id });
});

// -------------------------------------------------------------
// 🏢 ROTAS DA RETAGUARDA (CADASTRO E GESTÃO)
// -------------------------------------------------------------

// 📋 Listar Todos os Produtos
app.get('/api/admin/produtos', (req, res) => {
    const produtos = db.get('produtos').value();
    res.json(produtos);
});

// ➕ Cadastrar / Atualizar Produto
app.post('/api/admin/produtos', (req, res) => {
    const { id, codigo_barras, nome, preco, estoque } = req.body;

    if (!codigo_barras || !nome || preco === undefined) {
        return res.status(400).json({ erro: "Campos obrigatórios ausentes!" });
    }

    if (id) {
        // Atualizar existente
        db.get('produtos')
          .find({ id: Number(id) })
          .assign({
              codigo_barras,
              nome,
              preco: parseFloat(preco),
              estoque: parseFloat(estoque || 0)
          })
          .write();
        res.json({ mensagem: "Produto atualizado com sucesso!" });
    } else {
        // Criar novo produto
        const jaExiste = db.get('produtos').find({ codigo_barras }).value();
        if (jaExiste) {
            return res.status(400).json({ erro: "Já existe um produto com este código de barras!" });
        }

        const novoProduto = {
            id: Date.now(),
            codigo_barras,
            nome,
            preco: parseFloat(preco),
            estoque: parseFloat(estoque || 0)
        };

        db.get('produtos').push(novoProduto).write();
        res.json({ mensagem: "Produto cadastrado com sucesso!" });
    }
});

// 🗑️ Excluir Produto
app.delete('/api/admin/produtos/:id', (req, res) => {
    const { id } = req.params;
    db.get('produtos').remove({ id: Number(id) }).write();
    res.json({ mensagem: "Produto removido com sucesso!" });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor PDV & Retaguarda rodando em http://localhost:${PORT}`);
});
