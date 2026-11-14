    // --- 1. NAVEGAÇÃO ENTRE TELAS ---
    // Menu inferior + botão "voltar" do Android (volta para a tela anterior em vez de sair do app).
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const tituloTela = document.getElementById('titulo-tela');
    let abaAtual = 'tab-jogadores';
    // O placar digitado não pode sumir quando a tela é redesenhada ao trocar de aba
    const IDS_PLACAR = ['gols-a', 'gols-b', 'racha-gols-a', 'racha-gols-b'];

    // Telas: as 5 do menu de baixo + as que ficam "dentro" de outra (data-pai), que mostram o botão voltar
    function abaRaiz(id) {
        let el = document.getElementById(id), n = 0;
        while (el && el.dataset && el.dataset.pai && n++ < 5) el = document.getElementById(el.dataset.pai);
        return el ? el.id : id;
    }
    // telas só do administrador (e-mail de configuracoes/admin_email)
    const TELAS_ADMIN = ['tab-admin', 'tab-caixa', 'tab-metricas'];
    function irParaAba(id, semHistorico, titulo) {
        if (TELAS_ADMIN.includes(id) && !souAdmin) id = 'tab-mais';
        const alvo = document.getElementById(id);
        if (!alvo) return;
        const btn = document.querySelector(`.tab-btn[data-tab="${abaRaiz(id)}"]`);
        const mudou = id !== abaAtual;

        tabBtns.forEach(b => b.classList.toggle('active', b === btn));
        tabContents.forEach(c => c.classList.toggle('active', c === alvo));
        if (tituloTela) tituloTela.textContent = titulo || (alvo.dataset && alvo.dataset.title) || (btn ? btn.textContent.trim() : '');
        const temPai = !!(alvo.dataset && alvo.dataset.pai);
        const bv = document.getElementById('btn-voltar'), bm = document.getElementById('btn-menu');
        if (bv) bv.classList.toggle('hidden', !temPai);
        if (bm) bm.classList.toggle('hidden', temPai);
        abaAtual = id;
        if (document.body && document.body.dataset) document.body.dataset.aba = id;

        if (id === 'tab-sorteio') renderizarPresenca();
        if (id === 'tab-historico') renderizarHistorico();
        if (id === 'tab-ranking') renderizarRanking();
        if (id === 'tab-mais') atualizarTelaMais();
        if (id === 'tab-financeiro') renderizarCaixa();
        if (id === 'tab-campeonato') {
            const placar = IDS_PLACAR.map(i => [i, document.getElementById(i)]).filter(([, el]) => el).map(([i, el]) => [i, el.value]);
            renderizarCampeonato();
            placar.forEach(([i, v]) => {
                const el = document.getElementById(i);
                if (el && v !== '' && v !== el.value) { el.value = v; el.dispatchEvent(new Event('input')); }
            });
        }

        if (mudou) {
            window.scrollTo({ top: 0, behavior: 'instant' });
            if (!semHistorico) history.pushState({ aba: id }, '', '#' + id);
        }
    }

    tabBtns.forEach(btn => btn.addEventListener('click', () => irParaAba(btn.dataset.tab)));
    window.addEventListener('popstate', (e) => {
        const drawer = document.getElementById('side-drawer');
        if (drawer && drawer.classList.contains('open')) toggleDrawer();
        irParaAba((e.state && e.state.aba) || 'tab-jogadores', true);
    });
    history.replaceState({ aba: 'tab-jogadores' }, '', location.pathname);

