    // ---------- PAINEL DO ADMINISTRADOR (só o e-mail de configuracoes/admin_email) ----------
    // Ajusta configuracoes/monetizacao e configuracoes/divulgacao e libera o Pro (planos/<uid>) pelo app,
    // sem precisar do site do Firebase. As regras só deixam o administrador gravar esses caminhos.
    const DIA_MS = 24 * 60 * 60 * 1000;
    async function abrirPainelAdmin() {
        if (!souAdmin) return;
        const $ = id => document.getElementById(id);
        const f = window.firebaseFns, db = window.firebaseDb;
        if ($('adm-meu-uid')) $('adm-meu-uid').textContent = currentUserUid || '';
        try {
            const s = await f.get(f.ref(db, 'configuracoes'));
            const c = (s.exists() ? s.val() : {}) || {};
            const m = c.monetizacao || {}, dv = c.divulgacao || {};
            $('adm-ativo').checked = m.ativo !== false;
            const virgula = v => Number(v).toFixed(2).replace('.', ',');
            $('adm-mensal').value = virgula(m.preco_mensal != null ? m.preco_mensal : 9.9);
            $('adm-anual').value = virgula(m.preco_anual != null ? m.preco_anual : 59.9);
            $('adm-teste').value = m.dias_teste != null ? m.dias_teste : 7;
            $('adm-lim-jog').value = m.limite_jogadores_gratis != null ? m.limite_jogadores_gratis : 25;
            $('adm-lim-hist').value = m.limite_historico_gratis != null ? m.limite_historico_gratis : 3;
            $('adm-pix').value = m.chave_pix || '';
            $('adm-pix-nome').value = m.nome_pix || '';
            $('adm-zap').value = m.whatsapp_suporte || '';
            $('adm-checkout').value = m.link_checkout || '';
            $('adm-url').value = dv.url_publica || basePublica();
            $('adm-link').value = dv.link || '';
        } catch (e) { toast('Não foi possível ler as configurações.', 'erro'); }
    }
    (function ligarPainelAdmin() {
        const $ = id => document.getElementById(id);
        const form = $('form-admin');
        if (!form) return;
        const num = (id, padrao) => { const v = parseFloat(String($(id).value).replace(',', '.')); return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : padrao; };
        const url = id => { const v = String($(id).value || '').trim(); return /^https?:\/\//i.test(v) ? v : ''; };
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!souAdmin) return;
            const f = window.firebaseFns, db = window.firebaseDb;
            const mon = {
                ativo: $('adm-ativo').checked,
                preco_mensal: num('adm-mensal', 9.9), preco_anual: num('adm-anual', 59.9),
                dias_teste: Math.round(num('adm-teste', 7)),
                limite_jogadores_gratis: Math.max(1, Math.round(num('adm-lim-jog', 25))),
                limite_historico_gratis: Math.round(num('adm-lim-hist', 3)),
                chave_pix: String($('adm-pix').value || '').trim(),
                nome_pix: String($('adm-pix-nome').value || '').trim(),
                whatsapp_suporte: (d => d.length === 10 || d.length === 11 ? '55' + d : d)(String($('adm-zap').value || '').replace(/\D/g, '')),   // completa o 55 do Brasil
                link_checkout: url('adm-checkout')
            };
            const div = { url_publica: url('adm-url'), link: url('adm-link') };
            const btn = $('adm-salvar'); btn.disabled = true;
            try {
                // campo a campo: não apaga o que não está na tela (patrocinador, checkout_api...)
                await Promise.all([
                    ...Object.entries(mon).map(([k, v]) => f.set(f.ref(db, 'configuracoes/monetizacao/' + k), v)),
                    ...Object.entries(div).map(([k, v]) => f.set(f.ref(db, 'configuracoes/divulgacao/' + k), v || null))
                ]);
                if (div.url_publica) urlPublicaConfig = div.url_publica;
                toast('Configurações salvas. Valem na próxima vez que o app abrir.');
            } catch (er) {
                const cod = String((er && (er.code || er.message)) || 'erro');
                mostrarAlerta(/permission/i.test(cod) ? 'O Firebase não deixou salvar. Publique as regras novas (database.rules.json) e confira se o seu e-mail em configuracoes/admin_email está em letras minúsculas.' : 'Não foi possível salvar. Confira a internet. (' + cod + ')', 'Configurações');
            } finally { btn.disabled = false; }
        });
        const uidValido = () => { const u = String($('adm-uid').value || '').trim(); return /^[A-Za-z0-9_-]{6,128}$/.test(u) ? u : ''; };
        $('adm-ver')?.addEventListener('click', async () => {
            const uid = uidValido(), alvo = $('adm-plano-atual');
            if (!uid) { toast('Cole o ID do usuário.', 'erro'); return; }
            try {
                const s = await window.firebaseFns.get(window.firebaseFns.ref(window.firebaseDb, 'planos/' + uid));
                const p = s.exists() ? s.val() : null;
                alvo.textContent = !p || !p.ativo ? 'Esse usuário está no plano grátis.'
                    : 'Pro ' + (p.ate ? (p.ate > Date.now() ? 'até ' : 'vencido em ') + new Date(p.ate).toLocaleDateString('pt-BR') : 'sem prazo') + (p.origem ? ' · ' + p.origem : '');
            } catch (e) { alvo.textContent = 'Não foi possível consultar.'; }
        });
        $('adm-liberar')?.addEventListener('click', async () => {
            const uid = uidValido();
            if (!uid) { toast('Cole o ID do usuário.', 'erro'); return; }
            const plano = $('adm-plano').value;
            const f = window.firebaseFns, ref = f.ref(window.firebaseDb, 'planos/' + uid);
            let atual = null;
            try { const s = await f.get(ref); atual = s.exists() ? s.val() : null; } catch (e) { /* segue */ }
            // renovação soma ao que ainda falta, igual ao pagamento automático
            const base = Math.max(Date.now(), atual && atual.ativo && atual.ate ? Number(atual.ate) : 0);
            const dados = { ativo: true, plano, origem: 'manual' };
            if (plano !== 'vitalicio') dados.ate = base + (plano === 'anual' ? 366 : 31) * DIA_MS;
            const ok = await mostrarConfirmacao(`O usuário ${uid.slice(0, 8)}… fica Pro ${dados.ate ? 'até ' + new Date(dados.ate).toLocaleDateString('pt-BR') : 'sem prazo'}.`, 'Liberar o Pro?', { ok: 'Liberar' });
            if (!ok) return;
            try {
                await f.set(ref, dados);
                $('adm-plano-atual').textContent = 'Liberado: Pro ' + (dados.ate ? 'até ' + new Date(dados.ate).toLocaleDateString('pt-BR') : 'sem prazo') + '.';
                toast('Pro liberado. Aparece na hora para a pessoa.');
                // painel de métricas: assinatura confirmada (o valor é o preço do plano salvo aqui no painel)
                if (window.Painel) {
                    const valor = plano === 'mensal' ? num('adm-mensal', 9.9) : num('adm-anual', 59.9);
                    const renovou = !!(atual && atual.ativo && (!atual.ate || Number(atual.ate) > Date.now()));
                    Painel.ev('assinatura', { plano, valor, status: renovou ? 'renovada' : 'ativa', origem: 'manual',
                        expira_em: dados.ate ? new Date(dados.ate).toISOString() : undefined }, { usuario: uid });
                }
            } catch (er) {
                mostrarAlerta('O Firebase não deixou liberar. Publique as regras novas (database.rules.json).', 'Liberar o Pro');
            }
        });
    })();

