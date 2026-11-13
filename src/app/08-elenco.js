    // --- 3. ABA JOGADORES & IMPORTAÇÃO EM LOTE ---
    const btnImportarLote = document.getElementById('btn-importar-lote');
    if (btnImportarLote) {
        btnImportarLote.addEventListener('click', async () => {
            const inputLote = document.getElementById('lista-lote');
            if (!inputLote) return;
            const textoLote = inputLote.value;
            if (!textoLote.trim()) {
                toast('Cole a lista de nomes primeiro.', 'erro');
                if (inputLote.focus) inputLote.focus();
                return;
            }

            const { nomes, ignoradas } = Logica.filtrarLinhasLote(textoLote);
            let adicionados = 0;

            const limiteLote = window.Monetizacao ? window.Monetizacao.limiteJogadores() : Infinity;
            let passouDoLimite = false;

            nomes.forEach(nome => {
                if (jogadores.length >= limiteLote) { passouDoLimite = true; return; }
                jogadores.push({
                    id: Logica.idUnico(),
                    nome: nome,
                    isGoleiro: false,
                    estrelas: 3.0,
                    presente: true
                });
                adicionados++;
            });

            salvarJogadores();
            renderizarElenco();
            inputLote.value = '';
            const extra = ignoradas.length ? ` · ${ignoradas.length} linha${ignoradas.length > 1 ? 's' : ''} ignorada${ignoradas.length > 1 ? 's' : ''}` : '';
            toast(`${adicionados} jogador${adicionados === 1 ? '' : 'es'} adicionado${adicionados === 1 ? '' : 's'}${extra}`);
            if (adicionados && window.UI) UI.fecharSheet('sheet-novo-jogador');
            if (passouDoLimite && window.Monetizacao) {
                window.Monetizacao.abrirModal(`Alguns nomes ficaram de fora: o plano grátis permite até ${limiteLote} jogadores. Seja Pro para cadastrar quantos quiser!`);
            }
        });
    }

    const btnAddJogador = document.getElementById('btn-add-jogador');
    if (btnAddJogador) {
        btnAddJogador.addEventListener('click', async () => {
            const nomeInput = document.getElementById('novo-nome');
            if (!nomeInput) return;
            const nome = nomeInput.value.trim();
            const tipoEl = document.querySelector('input[name="tipo-jogador"]:checked');
            const tipo = tipoEl ? tipoEl.value : 'linha';

            if (!nome) {
                toast('Digite o nome do jogador.', 'erro');
                if (nomeInput.focus) nomeInput.focus();
                return;
            }

            if (window.Monetizacao && !window.Monetizacao.checarLimiteJogadores(jogadores.length, 1)) return;

            jogadores.push({
                id: Logica.idUnico(),
                nome: nome,
                isGoleiro: tipo === 'goleiro',
                estrelas: nivelCadastroTemp,
                presente: true
            });

            salvarJogadores();
            nomeInput.value = '';
            nivelCadastroTemp = 3.0;
            atualizarDisplayCad();
            renderizarElenco();
            // o painel continua aberto para cadastrar o próximo
            toast(`${nome} adicionado`);
            if (nomeInput.focus) nomeInput.focus();
        });
    }

    // --- ELENCO: busca, posição e nível; toque no jogador para editar ---
    let buscaElenco = '';
    let posicaoElenco = 'todos';   // todos | linha | goleiro
    function renderizarElenco() {
        const container = document.getElementById('lista-jogadores-cadastrados');
        if (!container) return;

        container.onclick = (e) => {
            const btn = e.target.closest('[data-acao]');
            if (!btn) return;
            if (btn.dataset.acao === 'editar') window.abrirEdicao(btn.dataset.id);
            if (btn.dataset.acao === 'novo') abrirNovoJogador('um');
            if (btn.dataset.acao === 'limpar-filtros') limparFiltrosElenco();
        };

        const ic = (n, c) => (window.UI ? UI.icone(n, c) : '');
        const resumo = document.getElementById('elenco-resumo');
        const goleiros = jogadores.filter(j => j.isGoleiro).length;
        if (resumo) resumo.textContent = !jogadores.length ? 'Nenhum jogador'
            : `${jogadores.length} jogador${jogadores.length > 1 ? 'es' : ''}${goleiros ? ` · ${goleiros} goleiro${goleiros > 1 ? 's' : ''}` : ''}`;

        if (jogadores.length === 0) {
            container.innerHTML = `<div class="vazio">${ic('users')}
                <h3>Seu elenco está vazio</h3>
                <p>Cadastre quem joga no racha. Dá para colar a lista do grupo de uma vez.</p>
                <button type="button" class="btn btn-primary" data-acao="novo">Adicionar jogadores</button></div>`;
            return;
        }

        const termo = Logica.normalizarNome(buscaElenco);
        let visiveis = listaFiltrada('elenco', jogadores)
            .filter(j => posicaoElenco === 'todos' || (posicaoElenco === 'goleiro' ? j.isGoleiro : !j.isGoleiro))
            .filter(j => !termo || Logica.normalizarNome(j.nome).includes(termo));
        visiveis = visiveis.slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

        const fNivel = filtrosEstrelas.elenco || {};
        const nivelAtivo = String(fNivel.min || '').trim() !== '' || String(fNivel.max || '').trim() !== '';
        const chipNivel = document.getElementById('chip-nivel');
        if (chipNivel) chipNivel.classList.toggle('ativo-filtro', nivelAtivo);
        if (resumo && (termo || posicaoElenco !== 'todos' || nivelAtivo)) resumo.textContent = `${visiveis.length} de ${jogadores.length} jogadores`;

        if (visiveis.length === 0) {
            container.innerHTML = `<div class="vazio">${ic('search')}
                <h3>Ninguém encontrado</h3>
                <p>Nenhum jogador com esses filtros.</p>
                <button type="button" class="btn btn-secondary" data-acao="limpar-filtros">Limpar filtros</button></div>`;
            return;
        }

        container.innerHTML = '<div class="lista">' + visiveis.map(j => {
            const nivel = Number(j.estrelas || 3.0).toFixed(1).replace('.', ',');
            return `<button type="button" class="lista-item" data-acao="editar" data-id="${escapeHtml(String(j.id))}">
                ${avatarHtml(j.nome)}
                <span class="li-txt"><span class="li-titulo">${escapeHtml(j.nome)}</span>
                    <span class="li-sub">${j.isGoleiro ? ic('glove', 'i-sm') + 'Goleiro' : 'Linha'}</span></span>
                <span class="li-fim"><span class="nivel">${ic('star', 'i-cheio')}${nivel}</span>${ic('chevron', 'i-sm')}</span>
            </button>`;
        }).join('') + '</div>';
    }
    function limparFiltrosElenco() {
        buscaElenco = ''; posicaoElenco = 'todos';
        const busca = document.getElementById('busca-elenco'); if (busca) busca.value = '';
        document.querySelectorAll('#chips-elenco [data-pos]').forEach(c => c.classList.toggle('on', c.dataset.pos === 'todos'));
        const box = document.getElementById('filtro-elenco');
        if (box && box.querySelectorAll) box.querySelectorAll('input[data-f]').forEach(el => { el.value = ''; });
        const f = filtrosEstrelas.elenco; if (f) { f.min = ''; f.max = ''; }
        renderizarElenco();
    }
    function abrirNovoJogador(modo) {
        if (!window.UI) return;
        mudarModoNovo(modo || 'um');
        UI.abrirSheet('sheet-novo-jogador');
        const alvo = document.getElementById(modo === 'lista' ? 'lista-lote' : 'novo-nome');
        if (alvo && alvo.focus) setTimeout(() => alvo.focus(), 260);
    }
    function mudarModoNovo(modo) {
        document.querySelectorAll('#seg-novo-modo [data-modo]').forEach(b => b.classList.toggle('on', b.dataset.modo === modo));
        const um = document.getElementById('novo-modo-um'), lista = document.getElementById('novo-modo-lista');
        if (um) um.classList.toggle('hidden', modo !== 'um');
        if (lista) lista.classList.toggle('hidden', modo !== 'lista');
    }
    (function ligarTelaElenco() {
        const $ = id => document.getElementById(id);
        const busca = $('busca-elenco');
        if (busca) busca.addEventListener('input', () => { buscaElenco = busca.value; renderizarElenco(); });
        const chips = $('chips-elenco');
        if (chips) chips.addEventListener('click', (e) => {
            const c = e.target.closest('.chip');
            if (!c) return;
            if (c.id === 'chip-nivel') { if (window.UI) UI.abrirSheet('sheet-filtro-elenco'); return; }
            posicaoElenco = c.dataset.pos || 'todos';
            chips.querySelectorAll('[data-pos]').forEach(x => x.classList.toggle('on', x === c));
            renderizarElenco();
        });
        $('btn-novo-jogador')?.addEventListener('click', () => abrirNovoJogador('um'));
        $('btn-elenco-opcoes')?.addEventListener('click', () => { if (window.UI) UI.abrirSheet('sheet-elenco-opcoes'); });
        $('btn-elenco-colar')?.addEventListener('click', () => { if (window.UI) UI.fecharSheet('sheet-elenco-opcoes'); abrirNovoJogador('lista'); });
        $('seg-novo-modo')?.addEventListener('click', (e) => { const b = e.target.closest('[data-modo]'); if (b) mudarModoNovo(b.dataset.modo); });
        $('novo-nome')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('btn-add-jogador')?.click(); } });
        $('btn-excluir-jogador')?.addEventListener('click', async () => {
            const id = $('edit-id') ? $('edit-id').value : '';
            if (await window.excluirJogador(id) && window.UI) UI.fecharSheet('modal-edicao');
        });
    })();

    window.excluirJogador = async function(id) {
        const j = jogadores.find(x => x.id == id);
        const confirmou = await mostrarConfirmacao(`${j ? j.nome : 'O jogador'} sai do elenco. O histórico dos campeonatos continua.`, 'Excluir jogador?', { ok: 'Excluir', perigo: true });
        if (confirmou) {
            jogadores = jogadores.filter(x => x.id != id);
            salvarJogadores();
            renderizarElenco();
            toast(`${j ? j.nome : 'Jogador'} excluído`);
        }
        return confirmou;
    };

    const btnApagarTodos = document.getElementById('btn-apagar-todos');
    if (btnApagarTodos) {
        btnApagarTodos.addEventListener('click', async () => {
            if (jogadores.length === 0) {
                toast('O elenco já está vazio.');
                return;
            }
            const confirmou = await mostrarConfirmacao(
                `Os ${jogadores.length} jogadores do elenco serão apagados. Não dá para desfazer.`,
                'Apagar todos os jogadores?', { ok: 'Apagar todos', perigo: true }
            );
            if (!confirmou) return;
            if (window.UI) UI.fecharSheet('sheet-elenco-opcoes');
            jogadores = [];
            salvarJogadores();
            renderizarElenco();
            toast('Elenco apagado');
        });
    }

    window.abrirEdicao = function(id) {
        const j = jogadores.find(item => item.id == id);
        if (!j) return;

        const editId = document.getElementById('edit-id');
        const editNome = document.getElementById('edit-nome');
        const editGoleiro = document.getElementById('edit-goleiro');
        const editLinha = document.getElementById('edit-linha');
        const modal = document.getElementById('modal-edicao');

        if (editId) editId.value = j.id;
        if (editNome) editNome.value = j.nome;
        
        nivelEdicaoTemp = Number(j.estrelas || 3.0);
        atualizarDisplayEdit();

        if (j.isGoleiro) {
            if (editGoleiro) editGoleiro.checked = true;
        } else {
            if (editLinha) editLinha.checked = true;
        }

        if (window.UI) UI.abrirSheet('modal-edicao'); else if (modal) modal.classList.remove('hidden');
    };

    const btnFecharModal = document.getElementById('btn-fechar-modal');
    if (btnFecharModal) {
        btnFecharModal.addEventListener('click', () => {
            const modal = document.getElementById('modal-edicao');
            if (modal) modal.classList.add('hidden');
            if (window.UI) UI.fecharSheet('modal-edicao');
        });
    }

    const btnSalvarEdicao = document.getElementById('btn-salvar-edicao');
    if (btnSalvarEdicao) {
        btnSalvarEdicao.addEventListener('click', () => {
            const id = document.getElementById('edit-id').value;
            const j = jogadores.find(item => item.id == id);

            if (j) {
                const editNome = document.getElementById('edit-nome');
                const editGoleiro = document.getElementById('edit-goleiro');

                j.nome = (editNome && editNome.value.trim()) ? editNome.value.trim() : j.nome;
                j.estrelas = nivelEdicaoTemp;
                j.isGoleiro = editGoleiro ? editGoleiro.checked : false;

                salvarJogadores();
                renderizarElenco();
                
                const modal = document.getElementById('modal-edicao');
                if (modal) modal.classList.add('hidden');
                if (window.UI) UI.fecharSheet('modal-edicao');
                toast('Alterações salvas');
            }
        });
    }

