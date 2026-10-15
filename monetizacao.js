// =====================================================================
// MONETIZAÇÃO - Cabeção Sorteios Pro
// Modelo: Freemium (grátis com limites) + Plano Pro + Patrocinador + Pix
//
// Tudo é controlado remotamente pelo Firebase (sem precisar gerar novo APK):
//
//  configuracoes/monetizacao  (você edita no Console do Firebase)
//     ativo: true/false                -> liga/desliga toda a monetização
//     preco_texto: "R$ 9,90/mês"
//     link_checkout: "https://..."     -> link de pagamento (Mercado Pago, Kiwify, etc.)
//     chave_pix: "sua-chave-pix"
//     nome_pix: "Seu Nome"
//     whatsapp_suporte: "5511999999999" -> só números, com DDI+DDD
//     limite_jogadores_gratis: 25
//     limite_historico_gratis: 3
//     patrocinador: { ativo: true, texto: "...", link: "https://...", imagem: "https://..." }
//
//  planos/{uid}  (somente VOCÊ cria/edita, pelo Console ou Cloud Function)
//     ativo: true
//     ate: 1798761600000               -> timestamp em ms (opcional; sem "ate" = vitalício)
// =====================================================================
(function () {
    const CONFIG_PADRAO = {
        ativo: true,
        preco_texto: 'R$ 9,90/mês',
        link_checkout: '',
        chave_pix: '',
        nome_pix: '',
        whatsapp_suporte: '',
        limite_jogadores_gratis: 25,
        limite_historico_gratis: 3,
        patrocinador: { ativo: false, texto: '', link: '', imagem: '' }
    };

    let config = JSON.parse(JSON.stringify(CONFIG_PADRAO));
    let plano = { ativo: false, ate: null };
    let usuario = null;

    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function urlSegura(u) {
        return /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
    }

    function isPro() {
        if (!config.ativo) return true; // monetização desligada = tudo liberado
        if (!plano.ativo) return false;
        return !plano.ate || Number(plano.ate) > Date.now();
    }

    function dataPro() {
        return plano.ate ? new Date(Number(plano.ate)).toLocaleDateString('pt-BR') : null;
    }

    // ---------- Limites ----------
    function limiteJogadores() {
        return isPro() ? Infinity : Number(config.limite_jogadores_gratis) || 25;
    }
    function limiteHistorico() {
        return isPro() ? Infinity : Number(config.limite_historico_gratis) || 3;
    }

    // ---------- Modal do plano Pro ----------
    function criarModal() {
        if (document.getElementById('modal-pro')) return;
        const m = document.createElement('div');
        m.id = 'modal-pro';
        m.className = 'modal hidden';
        m.style.zIndex = '100000';
        m.innerHTML = `
            <div class="modal-content card pro-modal">
                <button class="pro-close" id="pro-fechar" aria-label="Fechar">✕</button>
                <div class="pro-badge-topo">⭐ PRO</div>
                <h2 id="pro-titulo" style="justify-content:center;">Cabeção Sorteios Pro</h2>
                <p id="pro-motivo" class="subtext" style="text-align:center;"></p>
                <ul class="pro-beneficios">
                    <li>👥 Jogadores <strong>ilimitados</strong></li>
                    <li>📜 Histórico <strong>completo</strong> de campeonatos</li>
                    <li>🚫 Sem banners de patrocinador</li>
                    <li>🏅 Selo Pro no seu perfil</li>
                    <li>🚀 Acesso antecipado às novidades</li>
                </ul>
                <div class="pro-preco" id="pro-preco"></div>
                <div id="pro-acoes" class="form-group-col"></div>
            </div>`;
        document.body.appendChild(m);
        m.querySelector('#pro-fechar').addEventListener('click', fecharModal);
        m.addEventListener('click', e => { if (e.target === m) fecharModal(); });
    }

    function fecharModal() {
        const m = document.getElementById('modal-pro');
        if (m) m.classList.add('hidden');
    }

    function copiar(texto, btn) {
        const ok = () => {
            const original = btn.textContent;
            btn.textContent = '✅ Copiado!';
            setTimeout(() => (btn.textContent = original), 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texto).then(ok).catch(() => fallbackCopiar(texto, ok));
        } else {
            fallbackCopiar(texto, ok);
        }
    }
    function fallbackCopiar(texto, cb) {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); cb(); } catch (e) { /* ignora */ }
        document.body.removeChild(ta);
    }

    function abrirModal(motivo) {
        criarModal();
        const m = document.getElementById('modal-pro');
        const acoes = m.querySelector('#pro-acoes');
        m.querySelector('#pro-motivo').textContent = motivo || 'Libere todos os recursos e apoie o desenvolvimento do app!';
        m.querySelector('#pro-preco').textContent = isPro() ? '' : (config.preco_texto || '');
        acoes.innerHTML = '';

        if (isPro()) {
            const ate = dataPro();
            acoes.innerHTML = `<p class="subtext" style="text-align:center;font-size:.95rem;">✅ Você já é <strong>Pro</strong>${ate ? ' até <strong>' + ate + '</strong>' : ''}. Obrigado por apoiar!</p>`;
        } else {
            const link = urlSegura(config.link_checkout);
            if (link) {
                const b = document.createElement('button');
                b.className = 'btn btn-primary';
                b.textContent = '💳 Assinar o Plano Pro';
                b.onclick = () => window.open(link, '_blank');
                acoes.appendChild(b);
            }

            if (config.chave_pix) {
                const box = document.createElement('div');
                box.className = 'pro-pix';
                box.innerHTML = `<small>Ou pague via <strong>Pix</strong>${config.nome_pix ? ' para ' + esc(config.nome_pix) : ''}:</small><code>${esc(config.chave_pix)}</code>`;
                const bp = document.createElement('button');
                bp.className = 'btn btn-success';
                bp.textContent = '📋 Copiar chave Pix';
                bp.onclick = () => copiar(config.chave_pix, bp);
                box.appendChild(bp);
                acoes.appendChild(box);
            }

            const zap = String(config.whatsapp_suporte || '').replace(/\D/g, '');
            if (zap) {
                const bz = document.createElement('button');
                bz.className = 'btn btn-secondary';
                bz.textContent = '✅ Já paguei – enviar comprovante';
                bz.onclick = () => {
                    const email = usuario && usuario.email ? usuario.email : '(sem e-mail)';
                    const uid = usuario ? usuario.uid : '';
                    const msg = `Olá! Já fiz o pagamento do Plano Pro do Cabeção Sorteios.\nE-mail: ${email}\nID: ${uid}`;
                    window.open('https://wa.me/' + zap + '?text=' + encodeURIComponent(msg), '_blank');
                };
                acoes.appendChild(bz);
            }

            if (!link && !config.chave_pix) {
                acoes.innerHTML = '<p class="subtext" style="text-align:center;">🚧 Plano Pro em breve! Fique de olho nas novidades.</p>';
            }
        }
        m.classList.remove('hidden');
    }

    // ---------- Painel no menu lateral ----------
    function atualizarDrawer() {
        const links = document.querySelector('#side-drawer .drawer-links');
        if (!links) return;
        let sec = document.getElementById('drawer-plano');
        if (!config.ativo) { if (sec) sec.remove(); return; }
        if (!sec) {
            sec = document.createElement('div');
            sec.id = 'drawer-plano';
            sec.className = 'drawer-section';
            links.insertBefore(sec, links.firstChild);
        }
        const pro = isPro();
        const ate = dataPro();
        sec.innerHTML = `
            <h4>⭐ Meu Plano</h4>
            <div class="plano-status ${pro ? 'plano-pro' : 'plano-gratis'}">
                ${pro ? '⭐ PRO' + (ate ? ' até ' + ate : '') : '🆓 Plano Grátis'}
            </div>
            ${pro ? '' : `<p class="about-text" style="margin:8px 0;">Até ${limiteJogadores()} jogadores e ${limiteHistorico()} campeonatos no histórico.</p>`}
            <button class="btn btn-primary" id="btn-drawer-pro" style="margin-top:6px;">${pro ? '⭐ Detalhes do Pro' : '🚀 Seja Pro'}</button>
            ${(!pro && config.chave_pix) ? '<button class="btn btn-secondary" id="btn-drawer-apoio" style="margin-top:8px;">☕ Apoiar com Pix</button>' : ''}
        `;
        sec.querySelector('#btn-drawer-pro').onclick = () => { abrirModal(); };
        const ap = sec.querySelector('#btn-drawer-apoio');
        if (ap) ap.onclick = () => abrirModal('Gostou do app? Ajude a mantê-lo no ar com qualquer valor via Pix. 💚');
    }

    // ---------- Banner de patrocinador (some para quem é Pro) ----------
    function atualizarPatrocinador() {
        const alvo = document.getElementById('banner-patrocinador');
        if (!alvo) return;
        const p = config.patrocinador || {};
        if (!config.ativo || isPro() || !p.ativo || (!p.texto && !p.imagem)) {
            alvo.classList.add('hidden');
            alvo.innerHTML = '';
            return;
        }
        const link = urlSegura(p.link);
        const img = urlSegura(p.imagem);
        alvo.innerHTML = `
            <small class="patro-label">Patrocinador</small>
            ${img ? `<img src="${esc(img)}" alt="Patrocinador" class="patro-img">` : ''}
            ${p.texto ? `<span class="patro-texto">${esc(p.texto)}</span>` : ''}
        `;
        alvo.onclick = link ? () => window.open(link, '_blank') : null;
        alvo.style.cursor = link ? 'pointer' : 'default';
        alvo.classList.remove('hidden');
    }

    function atualizarTudo() {
        atualizarDrawer();
        atualizarPatrocinador();
        document.body.classList.toggle('is-pro', isPro() && config.ativo);
        if (typeof window.aoMudarPlano === 'function') window.aoMudarPlano();
    }

    // ---------- Carregamento via Firebase ----------
    function carregarConfig() {
        const { ref, get } = window.firebaseFns;
        return get(ref(window.firebaseDb, 'configuracoes/monetizacao')).then(s => {
            if (s.exists()) {
                const c = s.val() || {};
                config = Object.assign({}, CONFIG_PADRAO, c, {
                    patrocinador: Object.assign({}, CONFIG_PADRAO.patrocinador, c.patrocinador || {})
                });
            }
        }).catch(e => console.log('Monetização: usando configuração padrão.', e));
    }

    function carregarPlano(uid) {
        const { ref, get } = window.firebaseFns;
        return get(ref(window.firebaseDb, 'planos/' + uid)).then(s => {
            plano = s.exists() ? (s.val() || { ativo: false }) : { ativo: false, ate: null };
        }).catch(() => { plano = { ativo: false, ate: null }; });
    }

    function iniciar() {
        const espera = setInterval(() => {
            if (!(window.firebaseAuth && window.firebaseFns && window.firebaseDb)) return;
            clearInterval(espera);
            window.firebaseFns.onAuthStateChanged(window.firebaseAuth, async user => {
                usuario = user || null;
                await carregarConfig();
                if (user) await carregarPlano(user.uid); else plano = { ativo: false, ate: null };
                atualizarTudo();
            });
        }, 300);
        atualizarTudo();
    }

    window.Monetizacao = {
        isPro,
        limiteJogadores,
        limiteHistorico,
        abrirModal,
        // Retorna true se pode cadastrar +qtdNova jogadores; se não, abre o modal Pro.
        checarLimiteJogadores(qtdAtual, qtdNova) {
            const lim = limiteJogadores();
            if (qtdAtual + qtdNova <= lim) return true;
            abrirModal(`O plano grátis permite até ${lim} jogadores. Seja Pro para cadastrar quantos quiser!`);
            return false;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
