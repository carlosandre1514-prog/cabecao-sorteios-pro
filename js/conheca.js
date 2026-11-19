// =====================================================================
// conheca.js — página de apresentação (conheca.html), sem o 3D (fica em conheca-3d.js)
//   - preços e limites do plano lidos do Firebase (configuracoes/monetizacao, leitura pública);
//     sem internet ou sem resposta, ficam os valores escritos no HTML
//   - topo com linha ao rolar, blocos que aparecem ao rolar
//   - cliques nos botões vão para o painel de métricas (painel.js)
// =====================================================================
(function () {
    const BANCO = 'https://studio-7737408264-35a36-default-rtdb.firebaseio.com';
    const reais = v => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

    // preços e limites (o admin muda pelo painel do app; aqui só lê)
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    if (ctrl) setTimeout(() => ctrl.abort(), 6000);
    fetch(BANCO + '/configuracoes/monetizacao.json', ctrl ? { signal: ctrl.signal } : {})
        .then(r => (r.ok ? r.json() : null))
        .then(m => {
            if (!m || typeof m !== 'object') return;
            const precos = { mensal: m.preco_mensal, anual: m.preco_anual };
            document.querySelectorAll('[data-preco]').forEach(el => {
                const v = Number(precos[el.dataset.preco]);
                if (isFinite(v) && v > 0) el.textContent = reais(v);
            });
            document.querySelectorAll('[data-cfg]').forEach(el => {
                const v = Number(m[el.dataset.cfg]);
                if (isFinite(v) && v > 0) el.textContent = String(Math.round(v));
            });
            // teste grátis desligado: some a etiqueta
            if (Number(m.dias_teste) === 0) document.querySelectorAll('.etiqueta').forEach(el => el.remove());
        })
        .catch(() => { /* fica o texto padrão */ });

    // topo ganha linha quando rola
    const topo = document.getElementById('topo');
    const marcar = () => topo && topo.classList.toggle('rolou', window.scrollY > 8);
    window.addEventListener('scroll', marcar, { passive: true });
    marcar();

    // blocos aparecem ao entrar na tela
    const alvos = document.querySelectorAll('.passo, .recurso, .plano, .faq details, .resumo-destaque, .secao-cab, .final');
    if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const io = new IntersectionObserver(es => es.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('visivel'); io.unobserve(e.target); }
        }), { rootMargin: '0px 0px -8% 0px' });
        alvos.forEach(el => { el.classList.add('revelar'); io.observe(el); });
    }

    // métricas: quais botões levam gente para o app
    document.addEventListener('click', e => {
        const a = e.target.closest && e.target.closest('[data-cta]');
        if (a && window.Painel) { Painel.ev('landing_cta', { onde: a.dataset.cta }); Painel.enviar(); }
        const s = e.target.closest && e.target.closest('summary');
        if (s && window.Painel) Painel.ev('landing_duvida', { pergunta: s.textContent.trim().slice(0, 80) });
    });
})();
