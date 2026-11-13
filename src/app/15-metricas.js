    // ---------- MÉTRICAS (só admin) ----------
    // nome do evento -> texto da tela (a ordem aqui é a ordem do funil)
    const NOMES_METRICAS = [
        ['abertura', 'Aberturas do app'],
        ['cadastro', 'Novos cadastros'],
        ['sorteio', 'Sorteios feitos'],
        ['imagem_times', 'Imagens dos times enviadas'],
        ['lista_copiada', 'Listas copiadas'],
        ['campeonato_iniciado', 'Campeonatos iniciados'],
        ['campeonato_finalizado', 'Campeonatos finalizados'],
        ['resumo_imagem', 'Resumos do racha enviados (imagem)'],
        ['resumo_texto', 'Resumos do racha copiados (texto)'],
        ['visual_salvo', 'Rachas personalizados'],
        ['presenca_criada', 'Listas de presença criadas'],
        ['presenca_enviada', 'Listas enviadas no grupo'],
        ['presenca_visita', 'Visitas à lista de presença'],
        ['presenca_resposta', 'Respostas na lista (vou/não vou)'],
        ['presenca_convidado_add', 'Convidados adicionados ao elenco'],
        ['presenca_paguei', 'Jogadores que avisaram "já paguei"'],
        ['presenca_pago', 'Pagamentos confirmados pelo organizador'],
        ['presenca_pix_copiado', 'Pix copiados na lista (copia e cola)'],
        ['presenca_removido', 'Tirados da lista pelo organizador'],
        ['presenca_cta', 'Cliques em "Criar meu racha" (lista)'],
        ['ao_vivo_ligado', 'Placares ao vivo ligados'],
        ['ao_vivo_visita', 'Visitas ao placar ao vivo'],
        ['ao_vivo_cta', 'Cliques em "Criar meu racha" (ao vivo)'],
        ['limite_jogadores', 'Bateram no limite de jogadores'],
        ['pro_aberto', 'Abriram a tela do Pro'],
        ['pro_assinar', 'Clicaram em Assinar'],
        ['pro_pix_copiado', 'Copiaram a chave Pix'],
        ['pro_comprovante', 'Enviaram comprovante'],
        ['abriu_offline', 'Abriram sem internet'],
        ['teste_iniciado', 'Começaram o teste grátis'],
        ['pro_assinar_anual', 'Clicaram em assinar (anual)'],
        ['pro_assinar_mensal', 'Clicaram em assinar (mensal)'],
        ['caixa_aberto', 'Abriram o caixa (Pro)'],
        ['caixa_lancamento', 'Lançamentos no caixa'],
        ['caixa_cobranca', 'Cobranças enviadas pelo caixa'],
        ['caixa_diarias_lista', 'Diárias puxadas da lista']
    ];
    async function carregarMetricas() {
        const box = document.getElementById('conteudo-metricas');
        if (!box) return;
        box.innerHTML = '<p class="subtext">Carregando...</p>';
        const f = window.firebaseFns, db = window.firebaseDb;
        const dias = Logica.ultimosDias(7);
        try {
            const ler = caminho => f.get(f.ref(db, caminho)).then(s => (s.exists() ? s.val() : null));
            const [eventos, ativos] = await Promise.all([
                Promise.all(dias.map(d => ler('metricas/' + d))),
                Promise.all(dias.map(d => ler('metricas_ativos/' + d)))
            ]);
            const porDia = {}, ativosPorDia = {};
            dias.forEach((d, i) => { porDia[d] = eventos[i] || {}; ativosPorDia[d] = ativos[i] || {}; });
            const r = Logica.resumirMetricas(porDia, ativosPorDia, dias);
            const conhecidos = new Set(NOMES_METRICAS.map(n => n[0]));
            const linhas = NOMES_METRICAS.concat(Object.keys(r.semana).filter(k => !conhecidos.has(k)).map(k => [k, k]));
            const pct = (a, b) => b ? Math.round((a / b) * 100) + '%' : '–';
            box.innerHTML = `
                <div class="metricas-destaques">
                    <div><strong>${r.ativosHoje}</strong><small>usuários hoje</small></div>
                    <div><strong>${r.ativosSemana}</strong><small>usuários em 7 dias</small></div>
                    <div><strong>${pct(r.semana.pro_assinar || 0, r.semana.pro_aberto || 0)}</strong><small>abriu Pro → assinar</small></div>
                </div>
                <div class="table-responsive"><table class="tabela-classificacao tabela-metricas">
                    <thead><tr><th>Evento</th><th>Hoje</th><th>7 dias</th></tr></thead>
                    <tbody>${linhas.map(([k, nome]) => `<tr><td>${escapeHtml(nome)}</td><td>${r.hoje[k] || 0}</td><td>${r.semana[k] || 0}</td></tr>`).join('')}</tbody>
                </table></div>
                <button type="button" class="btn btn-secondary" id="btn-atualizar-metricas" style="margin-top:12px;">↻ Atualizar</button>`;
            const bt = document.getElementById('btn-atualizar-metricas');
            if (bt) bt.onclick = carregarMetricas;
        } catch (e) {
            box.innerHTML = '<p class="subtext">Não foi possível ler as métricas. Publique as regras de "metricas" (docs/COMO-CONFIGURAR-MONETIZACAO.md).</p>';
        }
    }
    function abrirMetricas() {
        if (!souAdmin) return;
        fecharDrawer();
        irParaTelaExtra('tab-metricas', 'Métricas');
        carregarMetricas();
    }

