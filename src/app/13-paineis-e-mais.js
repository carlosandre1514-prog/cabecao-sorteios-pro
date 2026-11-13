    // ---------- MODAL SIMPLES, TELAS EXTRAS E MENU ----------
    // Painel de baixo montado na hora (formulários curtos). Fecha pelo fundo, pelo X ou com m.remove().
    // O primeiro <h2> do html vira o título do painel.
    function abrirModalHtml(html) {
        const m = document.createElement('div');
        m.className = 'sheet sheet-dinamico';
        m.setAttribute('role', 'dialog');
        m.setAttribute('aria-modal', 'true');
        const corpo = String(html).replace(/^\s*<h2([^>]*)>([\s\S]*?)<\/h2>/, (x, attrs, titulo) =>
            `<div class="sheet-cab"><h2${attrs}>${window.UI ? UI.semEmoji(titulo) : titulo}</h2><button type="button" class="icon-btn" data-fechar-dinamico aria-label="Fechar">${window.UI ? UI.icone('x') : '✕'}</button></div>`);
        m.innerHTML = '<div class="sheet-fundo" data-fechar-dinamico></div><div class="sheet-painel"><div class="sheet-alca"></div>' + corpo + '</div>';
        m.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-fechar-dinamico]')) m.remove(); });
        document.body.appendChild(m);
        return m;
    }
    function fecharDrawer() {
        const d = document.getElementById('side-drawer');
        if (d && d.classList.contains('open')) toggleDrawer();
    }
    // Telas que não têm botão no menu de baixo (detalhe do histórico, caixa do suporte)
    function irParaTelaExtra(id, titulo) { irParaAba(id, false, titulo); }

    // ---------- TELA "JOGO": atalhos, abas e painéis ----------
    (function ligarTelaJogo() {
        const $ = id => document.getElementById(id);
        $('btn-ir-sorteio')?.addEventListener('click', () => irParaAba('tab-sorteio'));
        $('abrir-ao-vivo')?.addEventListener('click', () => { atualizarCardAoVivo(); if (window.UI) UI.abrirSheet('sheet-ao-vivo'); });
        $('btn-tempo-partida')?.addEventListener('click', () => { if (window.UI) UI.abrirSheet('sheet-tempo'); });
        $('btn-jogo-opcoes')?.addEventListener('click', () => { renderizarSeletorModoDisputa(); if (window.UI) UI.abrirSheet('sheet-jogo-opcoes'); });
        $('seg-jogo')?.addEventListener('click', (e) => {
            const b = e.target.closest('[data-aba-jogo]');
            if (!b) return;
            $('seg-jogo').querySelectorAll('[data-aba-jogo]').forEach(x => x.classList.toggle('on', x === b));
            document.querySelectorAll('[data-painel-jogo]').forEach(p => p.classList.toggle('hidden', p.dataset.painelJogo !== b.dataset.abaJogo));
        });
    })();

    // ---------- TELA "MAIS" ----------
    function atualizarTelaMais() {
        const $ = id => document.getElementById(id);
        if ($('mais-racha-ativo')) $('mais-racha-ativo').textContent = (visualRacha && visualRacha.nome) || nomeRachaAtivo();
        if ($('mais-email')) $('mais-email').textContent = emailUsuario || '';
        if ($('mais-versao')) $('mais-versao').textContent = typeof VERSAO_ATUAL_APP !== 'undefined' ? VERSAO_ATUAL_APP : '';
        const st = window.Monetizacao ? window.Monetizacao.status() : null;
        if ($('mais-plano')) $('mais-plano').textContent = !st ? '' : st.origem === 'plano' ? 'Pro' + (st.ate ? ' até ' + new Date(st.ate).toLocaleDateString('pt-BR') : '')
            : st.origem === 'teste' ? `Teste grátis · ${st.diasTeste} dia${st.diasTeste > 1 ? 's' : ''}` : 'Plano grátis';
    }
    (function ligarNavegacao() {
        const $ = id => document.getElementById(id);
        $('btn-menu')?.addEventListener('click', () => toggleDrawer());
        $('btn-fechar-menu')?.addEventListener('click', () => toggleDrawer());
        $('drawer-overlay')?.addEventListener('click', () => toggleDrawer());
        $('btn-voltar')?.addEventListener('click', () => {
            const alvo = $(abaAtual);
            const pai = alvo && alvo.dataset ? alvo.dataset.pai : '';
            if (history.state && history.state.aba && history.length > 1) history.back();
            else irParaAba(pai || 'tab-mais');
        });
        $('tab-mais')?.addEventListener('click', (e) => {
            const ir = e.target.closest('[data-ir]');
            if (ir) { irParaAba(ir.dataset.ir); if (ir.dataset.ir === 'tab-caixa') carregarCaixa(); if (ir.dataset.ir === 'tab-metricas') carregarMetricas(); if (ir.dataset.ir === 'tab-admin') abrirPainelAdmin(); return; }
            const b = e.target.closest('[data-mais]');
            if (!b) return;
            const a = b.dataset.mais;
            if (a === 'personalizar') abrirPersonalizar();
            if (a === 'rachas') toggleDrawer();
            if (a === 'plano' && window.Monetizacao) window.Monetizacao.abrirModal();
            if (a === 'suporte') abrirSuporte();
            if (a === 'sair') mostrarConfirmacao('Você vai precisar entrar de novo para ver seus rachas.', 'Sair da conta?', { ok: 'Sair', perigo: true }).then(ok => { if (ok) fazerLogout(); });
        });
    })();

