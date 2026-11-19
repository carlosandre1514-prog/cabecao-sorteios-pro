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
//     preco_mensal: 9.9 / preco_trimestral: 24.9 / preco_anual: 59.9   -> preços dos planos (o anual em destaque)
//     dias_teste: 7                            -> teste grátis (0 desliga); 1 por conta, em testes/{uid}
//     checkout_api: "https://.../checkout"  -> checkout automático Asaas (Pix e cartão, checkout/worker.js no Cloudflare)
//                                                 ou o antigo do Mercado Pago (functions/); sem ele usa os links:
//     link_checkout_mensal / link_checkout_trimestral / link_checkout_anual (ou link_checkout)
//
//  planos/{uid}  (somente VOCÊ ou a função do Mercado Pago cria/edita)
//     ativo: true
//     ate: 1798761600000               -> timestamp em ms (opcional; sem "ate" = vitalício)
// =====================================================================
(function () {
    const CONFIG_PADRAO = {
        ativo: true,
        preco_texto: '',
        preco_mensal: 9.9,
        preco_trimestral: 24.9,
        preco_anual: 59.9,
        dias_teste: 7,
        checkout_api: '',
        link_checkout: '',
        link_checkout_mensal: '',
        link_checkout_anual: '',
        link_checkout_trimestral: '',
        chave_pix: '',
        nome_pix: '',
        whatsapp_suporte: '',
        limite_jogadores_gratis: 25,
        limite_historico_gratis: 3,
        patrocinador: { ativo: false, texto: '', link: '', imagem: '' }
    };

    let config = JSON.parse(JSON.stringify(CONFIG_PADRAO));
    let plano = { ativo: false, ate: null };
    let teste = null;              // testes/<uid> = { inicio } (horário do servidor)
    let usuario = null;
    let planoEscolhido = 'anual';
    let eraAssinante = null;       // para avisar "Pro liberado!" quando o pagamento cair (mesmo durante o teste)
    let pararEscutas = [];
    // lido já ao carregar o arquivo: o app.js limpa o endereço (?pro=...) quando abre
    const retornoPagamento = (() => { try { return new URLSearchParams(location.search).get('pro'); } catch (e) { return null; } })();

    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }
    function urlSegura(u) {
        return /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
    }
    function guardar(chave, v) { try { localStorage.setItem(chave, JSON.stringify(v)); } catch (e) { /* ignora */ } }
    function lembrar(chave) { try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch (e) { return null; } }
    const avisar = (msg, tipo) => { if (typeof window.toast === 'function') window.toast(msg, tipo); };

    function status() { return Logica.statusPlano(plano, teste, Date.now(), config.dias_teste); }
    function isPro() {
        if (!config.ativo) return true; // monetização desligada = tudo liberado
        return status().pro;
    }
    function dataPro() {
        const st = status();
        return st.ate ? new Date(st.ate).toLocaleDateString('pt-BR') : null;
    }
    const podeTestar = () => config.ativo && Number(config.dias_teste) > 0 && !!usuario && !status().testeUsado && !isPro();

    // ---------- Limites ----------
    function limiteJogadores() {
        return isPro() ? Infinity : Number(config.limite_jogadores_gratis) || 25;
    }
    function limiteHistorico() {
        return isPro() ? Infinity : Number(config.limite_historico_gratis) || 3;
    }

    // ---------- Teste grátis ----------
    async function iniciarTeste() {
        if (!podeTestar()) return;
        const { ref, set } = window.firebaseFns;
        try {
            await set(ref(window.firebaseDb, 'testes/' + usuario.uid), { inicio: { '.sv': 'timestamp' } });
            teste = { inicio: Date.now() };       // o "escutar" corrige com o horário do servidor
            guardar('cabecao_teste_' + usuario.uid, teste);
            if (window.Metricas) Metricas.evento('teste_iniciado');
            fecharModal();
            atualizarTudo();
            avisar(`🎁 Pronto! Você tem ${config.dias_teste} dias de Pro grátis. Aproveite tudo!`);
        } catch (e) {
            const cod = String((e && (e.code || e.message)) || 'erro');
            avisar(/permission/i.test(cod) ? 'Não deu para ativar o teste (regras do Firebase: "testes").' : 'Sem conexão. Tente de novo.', 'erro');
        }
    }

    // ---------- Assinar ----------
    // Primeira compra no checkout Asaas: o banco exige nome e CPF de quem paga para emitir a cobrança.
    // Vão só para o pagamento (não ficam salvos no app). Devolve { nome, cpf } ou null se cancelar.
    function pedirDadosPagador(erro) {
        return new Promise((resolver) => {
            const m = document.createElement('div');
            m.className = 'modal pagador-modal';
            m.style.zIndex = '100001';
            m.innerHTML = `<form class="dialogo pagador" novalidate>
                <h2>Dados para o pagamento</h2>
                <p>O banco pede o nome e o CPF de quem paga para emitir a cobrança (Pix ou cartão). É só desta vez.</p>
                <div class="campo"><label for="pg-nome">Nome completo</label><input type="text" id="pg-nome" autocomplete="name" maxlength="80" required></div>
                <div class="campo"><label for="pg-cpf">CPF</label><input type="text" id="pg-cpf" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="000.000.000-00" required></div>
                <p class="pagador-erro ${erro ? '' : 'hidden'}" role="alert">${esc(erro || '')}</p>
                <p class="dica">Usados só pelo Asaas, que processa o pagamento. Não ficam salvos no app.</p>
                <div class="dialogo-botoes"><button type="button" class="btn btn-secondary" data-pg="cancelar">Cancelar</button><button type="submit" class="btn btn-primary">Continuar</button></div>
            </form>`;
            document.body.appendChild(m);
            const cpf = m.querySelector('#pg-cpf'), nome = m.querySelector('#pg-nome');
            cpf.addEventListener('input', () => {   // 000.000.000-00 enquanto digita
                const d = cpf.value.replace(/\D/g, '').slice(0, 11);
                cpf.value = d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
            });
            const fechar = (v) => { m.remove(); resolver(v); };
            m.querySelector('[data-pg="cancelar"]').addEventListener('click', () => fechar(null));
            m.querySelector('form').addEventListener('submit', (e) => {
                e.preventDefault();
                const n = nome.value.trim(), c = cpf.value.replace(/\D/g, '');
                const aviso = m.querySelector('.pagador-erro');
                if (n.split(/\s+/).length < 2) { aviso.textContent = 'Escreva o nome e o sobrenome.'; aviso.classList.remove('hidden'); nome.focus(); return; }
                if (c.length !== 11) { aviso.textContent = 'O CPF tem 11 números.'; aviso.classList.remove('hidden'); cpf.focus(); return; }
                fechar({ nome: n, cpf: c });
            });
            setTimeout(() => nome.focus(), 50);
        });
    }

    async function assinar(qual, botao) {
        if (window.Metricas) Metricas.evento('pro_assinar_' + qual);
        if (window.Metricas) Metricas.evento('pro_assinar');
        const api = urlSegura(config.checkout_api);
        if (api && usuario) {
            // checkout automático: o robô cria a cobrança (Pix ou cartão) e, quando o pagamento entra,
            // libera o Pro sozinho (o app está "escutando" planos/<uid>)
            if (botao) { botao.disabled = true; botao.setAttribute('aria-busy', 'true'); }
            try {
                const token = await window.firebaseAuth.currentUser.getIdToken();
                const volta = location.href.split('#')[0].split('?')[0];
                let extra = {};
                for (let tentativa = 0; tentativa < 3; tentativa++) {
                    const r = await fetch(api, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                        body: JSON.stringify({ plano: qual, voltar: volta, ...extra })
                    });
                    const j = await r.json().catch(() => ({}));
                    if (j.precisaCpf) {   // primeira compra: pede nome e CPF e tenta de novo
                        const dados = await pedirDadosPagador(j.erro);
                        if (!dados) return;
                        extra = dados;
                        continue;
                    }
                    if (!r.ok || !urlSegura(j.url)) throw new Error(j.erro || ('HTTP ' + r.status));
                    if (window.Painel) { Painel.ev('checkout_aberto', { plano: qual }); Painel.enviar(); }
                    location.href = j.url;
                    return;
                }
            } catch (e) {
                console.error('Checkout:', e);
                avisar('Não consegui abrir o pagamento. Tente de novo em instantes.', 'erro');
            } finally {
                if (botao) { botao.disabled = false; botao.removeAttribute('aria-busy'); }
            }
            return;
        }
        const link = urlSegura(config['link_checkout_' + qual]) || urlSegura(config.link_checkout);
        if (link) window.open(link, '_blank');
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
                <button class="pro-close icon-btn" id="pro-fechar" aria-label="Fechar"><svg class="i"><use href="#i-x"/></svg></button>
                <div class="pro-badge-topo">PRO</div>
                <h2 id="pro-titulo" style="justify-content:center;">Cabeção Sorteios Pro</h2>
                <p id="pro-motivo" class="subtext" style="text-align:center;"></p>
                <ul class="pro-beneficios">
                    <li><svg class="i i-sm"><use href="#i-qr"/></svg><span><strong>Pix copia e cola</strong> e QR Code na lista de presença</span></li>
                    <li><svg class="i i-sm"><use href="#i-wallet"/></svg><span><strong>Caixa do racha</strong>: mensalistas, quem deve e cobrança</span></li>
                    <li><svg class="i i-sm"><use href="#i-palette"/></svg><span><strong>Escudo e cor</strong> do racha no app, na lista e nas imagens</span></li>
                    <li><svg class="i i-sm"><use href="#i-users"/></svg><span>Jogadores <strong>ilimitados</strong> e histórico <strong>completo</strong></span></li>
                    <li><svg class="i i-sm"><use href="#i-check"/></svg><span>Sem anúncios de patrocinador</span></li>
                </ul>
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
            btn.textContent = 'Copiado';
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

    function htmlPlanos() {
        const mensal = Number(config.preco_mensal) || 0, anual = Number(config.preco_anual) || 0, tri = Number(config.preco_trimestral) || 0;
        const eco = Logica.economiaAnual(mensal, anual), ecoTri = Logica.economiaPlano(mensal, tri, 3);
        const qtd = [anual, tri, mensal].filter(v => v > 0).length;
        const cartao = (qual, titulo, preco, sub, selo) => `
            <button type="button" class="plano-opcao ${planoEscolhido === qual ? 'on' : ''}" data-plano="${qual}">
                ${selo ? `<span class="plano-selo">${selo}</span>` : ''}
                <span class="plano-nome">${titulo}</span>
                <strong class="plano-preco">${preco}</strong>
                <small>${sub}</small>
            </button>`;
        return `<div class="planos ${qtd === 3 ? 'planos-3' : ''}">
            ${anual ? cartao('anual', 'Anual', Logica.reais(anual), `${Logica.reais(anual / 12)}/mês · 1 pagamento`, eco ? `ECONOMIZE ${eco}%` : 'MAIS ESCOLHIDO') : ''}
            ${tri ? cartao('trimestral', 'Trimestral', Logica.reais(tri), `${Logica.reais(tri / 3)}/mês · a cada 3 meses`, ecoTri ? `${ecoTri}% OFF` : '') : ''}
            ${mensal ? cartao('mensal', 'Mensal', Logica.reais(mensal), 'por mês', '') : ''}
        </div>`;
    }

    function abrirModal(motivo) {
        criarModal();
        if (window.Metricas) Metricas.evento(isPro() ? 'pro_detalhes' : 'pro_aberto');
        const m = document.getElementById('modal-pro');
        const acoes = m.querySelector('#pro-acoes');
        m.querySelector('#pro-motivo').textContent = motivo || 'Libere todos os recursos e organize o racha sem dor de cabeça.';
        const st = status();
        const temCompra = !!(urlSegura(config.checkout_api) || urlSegura(config.link_checkout) || urlSegura(config.link_checkout_mensal) || urlSegura(config.link_checkout_trimestral) || urlSegura(config.link_checkout_anual));
        if (!(Number(config['preco_' + planoEscolhido]) > 0)) planoEscolhido = ['anual', 'trimestral', 'mensal'].find(p => Number(config['preco_' + p]) > 0) || 'mensal';
        let h = '';

        if (config.ativo && st.origem === 'plano') {
            const ate = dataPro();
            h = `<p class="pro-ok">Você é <strong>Pro</strong>${ate ? ' até <strong>' + ate + '</strong>' : ''}. Obrigado por apoiar!</p>`;
        } else {
            if (st.origem === 'teste') {
                h += `<p class="pro-teste-ativo">Teste grátis: falta${st.diasTeste > 1 ? 'm' : ''} <strong>${st.diasTeste} dia${st.diasTeste > 1 ? 's' : ''}</strong>. Assine para não perder nada.</p>`;
            } else if (podeTestar()) {
                h += `<button class="btn btn-primary btn-teste" data-acao-pro="teste">Testar ${config.dias_teste} dias grátis</button>
                    <p class="pro-sem-cartao">Sem cartão e sem compromisso. Depois você decide.</p>
                    <div class="pro-ou">ou assine agora</div>`;
            }
            if (temCompra) {
                h += htmlPlanos();
                h += `<button class="btn ${podeTestar() ? 'btn-secondary' : 'btn-primary'}" data-acao-pro="assinar">Assinar plano ${planoEscolhido}</button>
                    <p class="pro-sem-cartao">${urlSegura(config.checkout_api) ? 'Pix ou cartão de crédito, em página segura. O Pro libera sozinho quando o pagamento entra. Pagamento único por período, sem renovação automática. Desistiu em até 7 dias? Devolvemos tudo.' : 'Pix ou cartão. Depois do pagamento o Pro é liberado. Sem renovação automática; desistiu em até 7 dias, devolvemos tudo.'}</p>`;
            }
            if (config.chave_pix && !urlSegura(config.checkout_api)) {
                h += `<details class="pro-pix-det"><summary>Prefere Pix direto?</summary><div class="pro-pix">
                    <small>Pix${config.nome_pix ? ' para ' + esc(config.nome_pix) : ''}:</small><code>${esc(config.chave_pix)}</code>
                    <button class="btn btn-success" data-acao-pro="pix">Copiar chave Pix</button>
                    ${String(config.whatsapp_suporte || '').replace(/\D/g, '') ? '<button class="btn btn-secondary" data-acao-pro="comprovante">Já paguei, enviar comprovante</button>' : ''}
                </div></details>`;
            }
            if (!temCompra && !config.chave_pix && !podeTestar() && st.origem !== 'teste') {
                h = '<p class="subtext" style="text-align:center;">O plano Pro chega em breve.</p>';
            }
        }
        acoes.innerHTML = h;
        acoes.onclick = (e) => {
            const pl = e.target.closest('[data-plano]');
            if (pl) {
                planoEscolhido = pl.dataset.plano;
                acoes.querySelectorAll('[data-plano]').forEach(b => b.classList.toggle('on', b === pl));
                const ba = acoes.querySelector('[data-acao-pro="assinar"]');
                if (ba) ba.textContent = 'Assinar plano ' + planoEscolhido;
                return;
            }
            const b = e.target.closest('[data-acao-pro]');
            if (!b) return;
            const acao = b.dataset.acaoPro;
            if (acao === 'teste') iniciarTeste();
            if (acao === 'assinar') assinar(planoEscolhido, b);
            if (acao === 'pix') { if (window.Metricas) Metricas.evento('pro_pix_copiado'); copiar(config.chave_pix, b); }
            if (acao === 'comprovante') {
                if (window.Metricas) Metricas.evento('pro_comprovante');
                const zap = String(config.whatsapp_suporte || '').replace(/\D/g, '');
                const email = usuario && usuario.email ? usuario.email : '(sem e-mail)';
                const msg = `Olá! Já fiz o pagamento do Plano Pro (${planoEscolhido}) do Cabeção Sorteios.\nE-mail: ${email}\nID: ${usuario ? usuario.uid : ''}`;
                window.open('https://wa.me/' + zap + '?text=' + encodeURIComponent(msg), '_blank');
            }
        };
        m.classList.remove('hidden');
    }

    // Para os recursos Pro: true se pode usar; senão abre o Pro (com o teste grátis em destaque)
    function exigirPro(motivo) {
        if (isPro()) return true;
        abrirModal(motivo);
        return false;
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
        const st = status();
        const ate = dataPro();
        const rotulo = st.origem === 'plano' ? 'Pro' + (ate ? ' até ' + ate : '')
            : st.origem === 'teste' ? `Teste grátis · ${st.diasTeste} dia${st.diasTeste > 1 ? 's' : ''}` : 'Plano grátis';
        sec.innerHTML = `
            <h4>Meu plano</h4>
            <div class="plano-status ${st.pro ? 'plano-pro' : 'plano-gratis'}">${rotulo}</div>
            ${st.pro ? '' : `<p class="about-text" style="margin:8px 0;">Até ${limiteJogadores()} jogadores e ${limiteHistorico()} campeonatos no histórico.</p>`}
            <button class="btn btn-primary" id="btn-drawer-pro" style="margin-top:6px;">${st.origem === 'plano' ? 'Detalhes do plano' : podeTestar() ? `Testar o Pro por ${config.dias_teste} dias` : 'Conhecer o Pro'}</button>
        `;
        sec.querySelector('#btn-drawer-pro').onclick = () => { abrirModal(); };
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
        const pro = isPro();
        document.body.classList.toggle('is-pro', pro && config.ativo);
        // o pagamento caiu enquanto o app estava aberto
        const assinante = status().origem === 'plano';
        if (eraAssinante === false && assinante && config.ativo) avisar('⭐ Pagamento aprovado! Seu Pro está liberado. Obrigado!');
        if (usuario) eraAssinante = assinante;
        if (typeof window.aoMudarPlano === 'function') window.aoMudarPlano();
    }

    // ---------- Carregamento via Firebase ----------
    function carregarConfig() {
        const { ref, get } = window.firebaseFns;
        return get(ref(window.firebaseDb, 'configuracoes/monetizacao')).then(s => {
            if (s.exists()) {
                const c = s.val() || {};
                guardar('cabecao_monetizacao', c);
                config = Object.assign({}, CONFIG_PADRAO, c, {
                    patrocinador: Object.assign({}, CONFIG_PADRAO.patrocinador, c.patrocinador || {})
                });
            }
        }).catch(e => {
            // sem internet: usa a última configuração que veio do Firebase
            const c = lembrar('cabecao_monetizacao');
            if (c) config = Object.assign({}, CONFIG_PADRAO, c, {
                patrocinador: Object.assign({}, CONFIG_PADRAO.patrocinador, c.patrocinador || {})
            });
            console.log('Monetização: sem conexão, usando configuração salva/padrão.', e);
        });
    }

    // plano e teste ficam "escutados": quando o pagamento entra, o Pro aparece na hora
    function escutarPlano(uid) {
        pararEscutas.forEach(f => { try { f(); } catch (e) { /* ignora */ } });
        pararEscutas = [];
        plano = lembrar('cabecao_plano_' + uid) || { ativo: false, ate: null };   // sem internet: vale o último lido
        teste = lembrar('cabecao_teste_' + uid);
        const { ref, onValue } = window.firebaseFns;
        if (typeof onValue !== 'function') return;
        const escuta = (caminho, aplicar) => {
            const parar = onValue(ref(window.firebaseDb, caminho), s => {
                if (!usuario || usuario.uid !== uid) return;
                aplicar(s.exists() ? s.val() : null);
                atualizarTudo();
            }, () => { /* sem permissão ou sem internet: fica o que estava salvo */ });
            if (typeof parar === 'function') pararEscutas.push(parar);
        };
        escuta('planos/' + uid, v => { plano = v || { ativo: false, ate: null }; guardar('cabecao_plano_' + uid, plano); });
        escuta('testes/' + uid, v => { teste = v; guardar('cabecao_teste_' + uid, teste); });
    }

    // volta da página de pagamento: index.html?pro=ok|pendente|erro
    function verificarRetornoPagamento() {
        const r = retornoPagamento;
        if (!r) return;
        try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ignora */ }
        setTimeout(() => {
            if (r === 'ok') avisar('✅ Pagamento recebido! O Pro libera sozinho em instantes.');
            else if (r === 'pendente') avisar('⏳ Pagamento em análise. Quando aprovar, o Pro libera sozinho.');
            else avisar('O pagamento não foi concluído. Você pode tentar de novo pelo menu → Meu Plano.', 'erro');
        }, 1200);
    }

    function iniciar() {
        atualizarTudo();
        verificarRetornoPagamento();
        aoFirebasePronto(() => {
            window.firebaseFns.onAuthStateChanged(window.firebaseAuth, async user => {
                usuario = user || null;
                eraAssinante = null;
                await carregarConfig();
                if (user) escutarPlano(user.uid);
                else { pararEscutas.forEach(f => { try { f(); } catch (e) { /* ignora */ } }); pararEscutas = []; plano = { ativo: false, ate: null }; teste = null; }
                atualizarTudo();
            });
        });
        // o teste grátis acaba sozinho: confere de hora em hora
        setInterval(() => { if (usuario) atualizarTudo(); }, 3600 * 1000);
    }

    window.Monetizacao = {
        isPro,
        exigirPro,
        status,
        iniciarTeste,
        limiteJogadores,
        limiteHistorico,
        abrirModal,
        // Retorna true se pode cadastrar +qtdNova jogadores; se não, abre o modal Pro.
        checarLimiteJogadores(qtdAtual, qtdNova) {
            const lim = limiteJogadores();
            if (qtdAtual + qtdNova <= lim) return true;
            if (window.Metricas) Metricas.evento('limite_jogadores');
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
