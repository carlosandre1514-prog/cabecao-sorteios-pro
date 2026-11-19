// =====================================================================
// logica.js — LÓGICA PURA do app (sem tela, sem Firebase).
// Tudo aqui pode ser testado no Node: `node tests/logica.test.js`
// Se um cálculo de sorteio/tabela/versão estiver errado, o erro está AQUI.
// =====================================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Logica = factory();
})(typeof self !== 'undefined' ? self : this, function () {

    // ---------- Utilitários ----------
    function embaralhar(array, rnd) {
        rnd = rnd || Math.random;
        const c = [...array];
        for (let i = c.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [c[i], c[j]] = [c[j], c[i]];
        }
        return c;
    }

    // ID inteiro (o antigo Date.now()+Math.random() gerava números com casas decimais)
    function idUnico() {
        return Date.now() * 1000 + Math.floor(Math.random() * 1000);
    }

    // O Firebase Realtime Database NÃO aceita  . # $ [ ] /  em chaves.
    // Um jogador chamado "Zé Jr." quebrava o salvamento da artilharia inteira.
    function chaveSegura(nome) {
        return String(nome == null ? '' : nome)
            .replace(/\./g, '\u2024')
            .replace(/#/g, '\uFF03')
            .replace(/\$/g, '\uFF04')
            .replace(/\[/g, '(')
            .replace(/\]/g, ')')
            .replace(/\//g, '-')
            .trim() || '?';
    }

    // O Firebase devolve objetos com chaves 1,2,3 como ARRAY [null, {...}, {...}, {...}].
    // Isso quebrava a tabela e o histórico depois de reabrir o app.
    // Aqui sempre voltamos para um objeto simples, sem nulos.
    function limparMapa(valor) {
        const saida = {};
        if (!valor || typeof valor !== 'object') return saida;
        Object.keys(valor).forEach(k => {
            if (valor[k] !== null && valor[k] !== undefined) saida[k] = valor[k];
        });
        return saida;
    }

    // Time vindo do Firebase pode perder `jogadores` (array vazio é apagado lá).
    function normalizarTime(t) {
        if (!t) return t;
        const jogadores = Array.isArray(t.jogadores) ? t.jogadores.filter(Boolean)
            : Object.values(t.jogadores || {}).filter(Boolean);
        return Object.assign({}, t, { jogadores });
    }

    function compararVersoes(v1, v2) {
        const p1 = String(v1).split('.').map(Number);
        const p2 = String(v2).split('.').map(Number);
        for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
            const a = p1[i] || 0, b = p2[i] || 0;
            if (a > b) return 1;
            if (a < b) return -1;
        }
        return 0;
    }

    // ---------- Importação em lote (lista do WhatsApp) ----------
    // Antes: o filtro era "contém pix|chaves|arena|valor..." e descartava
    // jogadores chamados "Pixote", "Chaves", "Valor"... Agora só vale a PALAVRA inteira.
    const PALAVRAS_LIXO = ['pix', 'pagamento', 'racha', 'chegada', 'complexo', 'arena', 'valor'];
    const RE_LIXO = new RegExp('(^|[^a-zà-ÿ])(' + PALAVRAS_LIXO.join('|') + ')([^a-zà-ÿ]|$)', 'i');

    function linhaEhLixo(nome) {
        return RE_LIXO.test(nome) || /http|@|\(r\$/i.test(nome);
    }

    function filtrarLinhasLote(texto) {
        const nomes = [];
        const ignoradas = [];
        String(texto || '').split('\n').forEach(linha => {
            const nome = linha.replace(/^\s*[0-9]+[\.\-\)\s]*/, '').trim();
            if (!nome) return;
            if (linhaEhLixo(nome)) ignoradas.push(linha.trim());
            else nomes.push(nome);
        });
        return { nomes, ignoradas };
    }

    // ---------- SORTEIO EQUILIBRADO ----------
    // Antes: as estrelas eram ignoradas, "jogadores por time" nunca era lido
    // (fixo em 4) e todo o excesso caía no último time.
    //
    // Agora:
    //  1) 1 goleiro por time (sorteado); goleiros extras viram jogadores de linha
    //  2) se há mais gente que vagas (qtdTimes x porTime), quem fica de RESERVA é sorteado
    //  3) quem joga é distribuído do mais forte ao mais fraco, sempre para o time com
    //     MENOS jogadores e, no empate, com MENOR soma de estrelas.
    // Ninguém fica de fora (não há reservas).
    //  - GOLEIROS: 1 por time, começando pelo Time 1; quem vai para qual time é sorteado.
    //    Se faltar goleiro, os últimos times ficam sem. Goleiro que sobrar joga na linha.
    //  - LINHA: "porTime" jogadores de linha por time (o goleiro vem à parte). Os times são
    //    enchidos em ordem e o ÚLTIMO fica "quebrado" com o que sobrar.
    //    14 de linha, 4 times de 4 -> 4, 4, 4 e 2.   Sobrou gente além dos times -> nasce time extra.
    //  - A distribuição da linha usa as estrelas para deixar os times parecidos.
    function sortearTimes(jogadores, qtdTimes, porTime, rnd) {
        rnd = rnd || Math.random;
        const estrelas = j => Number(j.estrelas) || 3;
        const limitado = porTime > 0;

        function calcularVagas(n) {
            if (!limitado) return Array.from({ length: qtdTimes }, () => Infinity);
            const total = Math.max(qtdTimes, Math.ceil(n / porTime));
            const caps = [];
            let resta = n;
            for (let i = 0; i < total && resta > 0; i++) { caps.push(Math.min(porTime, resta)); resta -= caps[i]; }
            // poucos jogadores: um time só não faz campeonato, então divide em dois
            if (caps.length < 2 && n >= 2) return [Math.ceil(n / 2), Math.floor(n / 2)];
            return caps;
        }

        const goleiros = embaralhar(jogadores.filter(j => j.isGoleiro), rnd);
        let linha = jogadores.filter(j => !j.isGoleiro).concat(goleiros.slice(qtdTimes)); // goleiro extra joga na linha
        let caps = calcularVagas(linha.length);

        let paraTimes = goleiros.slice(0, qtdTimes);
        if (paraTimes.length > caps.length) {            // sem vaga de time para tantos goleiros
            linha = linha.concat(paraTimes.slice(caps.length));
            paraTimes = paraTimes.slice(0, caps.length);
            caps = calcularVagas(linha.length);
        }

        const times = caps.map((_, i) => ({
            id: i + 1, nome: `Time ${i + 1}`, jogadores: [], temGoleiro: false, somaEstrelas: 0
        }));
        paraTimes.forEach((g, i) => times[i].jogadores.push(g));

        const pool = embaralhar(linha, rnd);
        // sort estável: quem tem a mesma estrela mantém a ordem aleatória do embaralhar
        pool.sort((a, b) => estrelas(b) - estrelas(a));

        const soma = t => t.jogadores.reduce((s, j) => s + estrelas(j), 0);
        const qtdLinha = new Array(times.length).fill(0);
        const ocupacao = i => Number.isFinite(caps[i]) ? qtdLinha[i] / caps[i] : qtdLinha[i];
        pool.forEach(j => {
            const candidatos = times.map((t, i) => i).filter(i => qtdLinha[i] < caps[i]);
            const menor = Math.min(...candidatos.map(ocupacao));
            const alvo = candidatos
                .filter(i => ocupacao(i) === menor)
                .sort((x, y) => soma(times[x]) - soma(times[y]))[0];
            times[alvo].jogadores.push(j);
            qtdLinha[alvo]++;
        });

        times.forEach(t => {
            // goleiro sempre no topo da lista do time
            t.jogadores.sort((a, b) => (b.isGoleiro ? 1 : 0) - (a.isGoleiro ? 1 : 0));
            t.somaEstrelas = soma(t);
            t.temGoleiro = t.jogadores.some(j => j.isGoleiro);
        });

        return { times, reservas: [] };
    }

    // ---------- TABELA (todos contra todos) ----------
    // Ordem dos confrontos: o time 1 enfrenta o 2, depois o 3, depois o 4...
    // Com 4 times: 1x2, 3x4 | 1x3, 2x4 | 1x4, 2x3  (cada "|" é uma rodada).
    function gerarPartidas(times) {
        const lista = [...times];
        if (lista.length % 2 !== 0) lista.push(null); // folga
        const n = lista.length;
        const rodadas = [];
        for (let r = 0; r < n - 1; r++) {
            const jogos = [];
            for (let i = 0; i < n / 2; i++) {
                const a = lista[i], b = lista[n - 1 - i];
                if (a && b) jogos.push(a.id < b.id ? [a, b] : [b, a]);
            }
            jogos.sort((x, y) => x[0].id - y[0].id);
            rodadas.push(jogos);
            lista.splice(1, 0, lista.pop());
        }
        // rodadas em ordem crescente do adversário do menor time (1x2 primeiro, depois 1x3...)
        const chave = jogos => jogos[0][0].id * 100000 + jogos[0][1].id;
        rodadas.sort((x, y) => chave(x) - chave(y));
        const partidas = [];
        rodadas.forEach((jogos, r) => jogos.forEach(([a, b]) => {
            partidas.push({
                idPartida: partidas.length + 1, rodada: r + 1,
                timeA: a, timeB: b,
                golsA: 0, golsB: 0, penaltisA: 0, penaltisB: 0, finalizada: false
            });
        }));
        return partidas;
    }

    // Tabela sem fim: quando o turno acaba, gera o próximo (mesmos confrontos, mandos invertidos
    // nos turnos pares). Rodadas e ids continuam a contagem; só para quando o racha for encerrado.
    function proximoTurno(times, partidasExistentes) {
        const existentes = partidasExistentes || [];
        const base = gerarPartidas(times);
        if (!base.length) return [];
        const rodadasPorTurno = Math.max(...base.map(p => p.rodada));
        const ultimaRodada = existentes.reduce((m, p) => Math.max(m, Number(p.rodada) || 0), 0);
        const ultimoId = existentes.reduce((m, p) => Math.max(m, Number(p.idPartida) || 0), 0);
        const turno = Math.floor(ultimaRodada / rodadasPorTurno) + 1;
        const inverter = turno % 2 === 0;
        return base.map((p, i) => Object.assign({}, p, {
            idPartida: ultimoId + i + 1,
            rodada: ultimaRodada + p.rodada,
            turno,
            timeA: inverter ? p.timeB : p.timeA,
            timeB: inverter ? p.timeA : p.timeB
        }));
    }

    function novaClassificacao(times) {
        const c = {};
        times.forEach(t => { c[t.id] = { nome: t.nome, p: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, sg: 0 }; });
        return c;
    }

    // Aplica UM resultado na classificação. Retorna 'A', 'B' ou null (empate).
    // Antes, o código do "todos contra todos" somava os gols do Time B duas vezes.
    function aplicarResultado(cl, idA, idB, gA, gB, penA, penB) {
        penA = penA || 0; penB = penB || 0;
        const a = cl[idA], b = cl[idB];
        a.j++; b.j++;
        a.gp += gA; b.gp += gB;
        a.sg += gA - gB; b.sg += gB - gA;
        let venc = null;
        if (gA > gB || (gA === gB && penA > penB)) venc = 'A';
        else if (gB > gA || (gA === gB && penB > penA)) venc = 'B';
        if (venc === 'A') { a.p += 3; a.v++; b.d++; }
        else if (venc === 'B') { b.p += 3; b.v++; a.d++; }
        else { a.p++; b.p++; a.e++; b.e++; }
        return venc;
    }

    function ordenarClassificacao(lista) {
        // Critérios: 1) pontos  2) MENOS gols sofridos  3) saldo de gols  4) gols pró  5) nome
        const gc = c => (c.gp || 0) - (c.sg || 0);
        return lista.filter(Boolean).sort((x, y) =>
            ((y.p || 0) - (x.p || 0)) || (gc(x) - gc(y)) || ((y.sg || 0) - (x.sg || 0)) ||
            ((y.gp || 0) - (x.gp || 0)) || String(x.nome).localeCompare(String(y.nome)));
    }

    // Retrato PÚBLICO do campeonato para a página ao-vivo.html (só nomes, placares e pontos;
    // nada de e-mail ou dados da conta). `e` é o estado do campeonato do app.
    function montarAoVivo(e, dono, agora, encerrado) {
        const nome = t => (t ? String(t.nome) : '');
        const cl = ordenarClassificacao(Object.values(e.classificacao || {}).filter(Boolean).map(c => ({
            nome: String(c.nome), p: c.p || 0, j: c.j || 0, v: c.v || 0, e: c.e || 0, d: c.d || 0, gp: c.gp || 0, sg: c.sg || 0, gc: (c.gp || 0) - (c.sg || 0)
        })));
        let jogos, proxima = null;
        if (e.modo === 'racha-livre') {
            jogos = (e.partidasRacha || []).map(p => ({ a: nome(p.timeA), b: nome(p.timeB), ga: p.golsA || 0, gb: p.golsB || 0, v: p.vencedor || '' }));
            if (e.timeA && e.timeB) proxima = { a: nome(e.timeA), b: nome(e.timeB), r: 0, ga: (e.placarRacha && e.placarRacha.a) || 0, gb: (e.placarRacha && e.placarRacha.b) || 0 };
        } else {
            const lista = e.partidas || [];
            jogos = lista.filter(p => p.finalizada).map(p => ({
                r: p.rodada || 0, a: nome(p.timeA), b: nome(p.timeB),
                ga: p.golsA || 0, gb: p.golsB || 0, pa: p.penaltisA || 0, pb: p.penaltisB || 0
            }));
            const prox = (lista[e.partidaAtualIndex] && !lista[e.partidaAtualIndex].finalizada)
                ? lista[e.partidaAtualIndex] : lista.find(p => !p.finalizada);
            if (prox) proxima = { a: nome(prox.timeA), b: nome(prox.timeB), r: prox.rodada || 0, ga: prox.golsA || 0, gb: prox.golsB || 0 };
        }
        return {
            dono, atualizadoEm: agora, encerrado: !!encerrado, modo: e.modo || 'todos-contra-todos',
            times: (e.times || []).map(t => ({ nome: String(t.nome), jogadores: (t.jogadores || []).map(j => String(j.nome)) })),
            classificacao: cl, jogos, proxima, fila: (e.fila || []).map(nome), cron: e.cron || null,
            visual: e.visual && (e.visual.nome || e.visual.escudo || e.visual.cor) ? { nome: String(e.visual.nome || ''), cor: String(e.visual.cor || ''), escudo: String(e.visual.escudo || '') } : null,
            artilharia: Object.entries(e.artilharia || {}).sort((x, y) => y[1] - x[1]).map(([n, g]) => ({ nome: n, gols: g }))
        };
    }

    // ---------- Estrelas ----------
    // Aceita "1,7", "1.7", 2 ... e devolve um número de 0.1 a 5 com 1 casa decimal.
    function normalizarEstrelas(v, padrao) {
        if (typeof v === 'string') v = v.trim().replace(',', '.');
        const n = (v === '' || v == null) ? NaN : Number(v);
        if (!isFinite(n)) return padrao == null ? 3 : padrao;
        return Math.round(Math.min(5, Math.max(0.1, n)) * 10) / 10;
    }

    // Filtro por faixa de estrelas. f = { min, max, opMin: '>=' | '>', opMax: '<=' | '<' }.
    // Campo vazio = sem limite. Ex.: maior que 1.5 e menor que 2 -> { min: 1.5, opMin: '>', max: 2, opMax: '<' }
    function filtrarPorEstrelas(lista, f) {
        f = f || {};
        const lim = x => {
            if (x === '' || x == null) return null;
            const n = parseFloat(String(x).replace(',', '.'));
            return isFinite(n) ? n : null;
        };
        const min = lim(f.min), max = lim(f.max);
        return lista.filter(j => {
            const e = Math.round((Number(j.estrelas) || 3) * 100) / 100;
            if (min !== null && !(f.opMin === '>' ? e > min : e >= min)) return false;
            if (max !== null && !(f.opMax === '<' ? e < max : e <= max)) return false;
            return true;
        });
    }

    // ---------- Modo offline: cópia local dos dados do usuário ----------
    // Grava `valor` dentro de `obj` seguindo "a/b/c" (cria os níveis que faltam). null apaga.
    // Devolve o próprio obj (ou um objeto novo, se obj não era objeto).
    function gravarNoCaminho(obj, caminho, valor) {
        const base = (obj && typeof obj === 'object') ? obj : {};
        const partes = String(caminho || '').split('/').filter(Boolean);
        if (!partes.length) return base;
        let atual = base;
        for (let i = 0; i < partes.length - 1; i++) {
            const k = partes[i];
            if (!atual[k] || typeof atual[k] !== 'object') atual[k] = {};
            atual = atual[k];
        }
        const ultima = partes[partes.length - 1];
        if (valor === null || valor === undefined) delete atual[ultima];
        else atual[ultima] = valor;
        return base;
    }
    function lerDoCaminho(obj, caminho) {
        return String(caminho || '').split('/').filter(Boolean)
            .reduce((a, k) => (a && typeof a === 'object' && k in a) ? a[k] : undefined, obj);
    }

    // ---------- Métricas ----------
    // "2026-11-13" no fuso do aparelho (o dia que o dono do app enxerga)
    function diaISO(ts) {
        const d = new Date(ts == null ? Date.now() : ts);
        const p = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
    function ultimosDias(n, ts) {
        const base = new Date(ts == null ? Date.now() : ts);
        const out = [];
        for (let i = 0; i < n; i++) {
            const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i, 12);
            out.push(diaISO(d.getTime()));
        }
        return out;
    }
    // dias: { "2026-11-13": { sorteio: 3, ... } }, ativos: { "2026-11-13": { uid: true } }
    // -> { hoje: {evento: n}, semana: {evento: n}, ativosHoje, ativosSemana }
    function resumirMetricas(dias, ativos, listaDias) {
        dias = dias || {}; ativos = ativos || {};
        const hoje = {}, semana = {};
        listaDias.forEach((d, i) => {
            Object.entries(dias[d] || {}).forEach(([ev, n]) => {
                n = Number(n) || 0;
                semana[ev] = (semana[ev] || 0) + n;
                if (i === 0) hoje[ev] = (hoje[ev] || 0) + n;
            });
        });
        const unicos = new Set();
        listaDias.forEach(d => Object.keys(ativos[d] || {}).forEach(u => unicos.add(u)));
        return { hoje, semana, ativosHoje: Object.keys(ativos[listaDias[0]] || {}).length, ativosSemana: unicos.size };
    }

    // ---------- Resumo do racha (para mandar no grupo depois do fim) ----------
    // h = item do histórico (ou o campeonato que acabou de terminar). Só nomes e números.
    function nomeDaChave(k) {
        return String(k).replace(/\u2024/g, '.').replace(/\uFF03/g, '#').replace(/\uFF04/g, '$');
    }
    function resumoCampeonato(h) {
        h = h || {};
        const lista = v => Object.values(v || {}).filter(Boolean);
        const nome = t => (t && t.nome != null ? String(t.nome) : '?');
        const racha = h.modo === 'racha-livre';
        const classificacao = ordenarClassificacao(lista(h.classificacao).map(c => ({
            nome: String(c.nome), p: c.p || 0, j: c.j || 0, v: c.v || 0, e: c.e || 0, d: c.d || 0, gp: c.gp || 0, sg: c.sg || 0
        })));
        const jogos = lista(h.partidas).map((p, i) => {
            const ga = Number(p.golsA) || 0, gb = Number(p.golsB) || 0;
            let extra = '';
            if (racha) { if (p.vencedor && ga === gb) extra = 'avançou ' + p.vencedor; }
            else if (ga === gb && (p.penaltisA || p.penaltisB)) extra = 'pên. ' + (p.penaltisA || 0) + ' x ' + (p.penaltisB || 0);
            return { rotulo: racha ? 'Jogo ' + (p.idPartida || i + 1) : 'Rodada ' + (p.rodada || i + 1), a: nome(p.timeA), b: nome(p.timeB), ga, gb, extra };
        });
        const artilharia = Object.entries(h.artilharia || {})
            .map(([n, g]) => ({ nome: nomeDaChave(n), gols: Number(g) || 0 }))
            .filter(a => a.gols > 0)
            .sort((x, y) => (y.gols - x.gols) || x.nome.localeCompare(y.nome));
        const totalGols = jogos.reduce((a, j) => a + j.ga + j.gb, 0);
        return {
            data: String(h.data || ''), modo: racha ? 'Racha Livre' : 'Tabela',
            campeao: classificacao[0] ? classificacao[0].nome : null,
            classificacao, jogos, artilharia,
            times: lista(h.times).map(t => ({ nome: nome(t), jogadores: lista(t.jogadores).map(j => String(j.nome)) })),
            totalGols, totalJogos: jogos.length,
            mediaGols: jogos.length ? Math.round((totalGols / jogos.length) * 10) / 10 : 0
        };
    }
    // Texto pronto para colar no WhatsApp (*negrito* do WhatsApp)
    function textoResumo(r, titulo) {
        const L = [];
        L.push('🏁 *' + (titulo || 'RESULTADO DO RACHA').toUpperCase() + '*');
        if (r.data) L.push('📅 ' + r.data + ' · ' + r.modo);
        if (r.campeao) L.push('', '🏆 *Campeão: ' + r.campeao + '*');
        if (r.classificacao.length) {
            L.push('', '📊 *Classificação*');
            r.classificacao.forEach((c, i) => L.push((i + 1) + '. ' + c.nome + ' — ' + c.p + ' pts (' + c.v + 'V ' + c.e + 'E ' + c.d + 'D, SG ' + c.sg + ')'));
        }
        if (r.artilharia.length) {
            L.push('', '⚽ *Artilharia*');
            const med = ['🥇', '🥈', '🥉'];
            r.artilharia.slice(0, 10).forEach((a, i) => L.push((med[i] || (i + 1) + '.') + ' ' + a.nome + ' — ' + a.gols + (a.gols === 1 ? ' gol' : ' gols')));
        }
        if (r.jogos.length) {
            L.push('', '⚔️ *Confrontos*');
            r.jogos.forEach(j => L.push(j.rotulo + ': ' + j.a + ' ' + j.ga + ' x ' + j.gb + ' ' + j.b + (j.extra ? ' (' + j.extra + ')' : '')));
        }
        L.push('', '🔢 ' + r.totalJogos + ' jogos · ' + r.totalGols + ' gols · média ' + String(r.mediaGols).replace('.', ',') + ' por jogo');
        L.push('', '_Feito com Cabeção Sorteios Pro ⚽_');
        return L.join('\n');
    }

    // ---------- Lista de presença por link ----------
    // jogadores: [{id, nome, g (goleiro)}] publicados pelo organizador
    // respostas: { id: { status: 'vou'|'nao', em, nome?, convidado?, goleiro?, removido? } } vindas da página
    // limite: vagas na LINHA (times x jogadores de linha); 0 = sem limite.
    // opcoes.vagasGoleiro: vagas de goleiro (1 por time); 0/ausente = sem limite.
    // opcoes.pagos: { id: true } CONFIRMADOS pelo organizador; opcoes.prazo: ms do prazo de pagamento.
    // opcoes.promovidos: { id: ms } suplentes que o ORGANIZADOR colocou na lista: têm a vaga garantida
    //   (entram antes da ordem de chegada; se a lista estiver cheia, quem confirmou por último vira suplente).
    // respostas[id].paguei (ms): o próprio jogador disse "já paguei" -> fica "a confirmar" até o organizador confirmar.
    // Quem confirmou primeiro fica com a vaga; o resto vira SUPLENTE, em ordem de confirmação.
    // Quando alguém sai (não vai / removido), o primeiro suplente sobe sozinho.
    function resumirPresenca(jogadores, respostas, limite, opcoes) {
        jogadores = Object.values(jogadores || {}).filter(Boolean);
        respostas = respostas || {};
        opcoes = opcoes || {};
        limite = Math.max(0, parseInt(limite, 10) || 0);
        const vagasGol = Math.max(0, parseInt(opcoes.vagasGoleiro, 10) || 0);
        const pagos = opcoes.pagos || {};
        const prazo = Number(opcoes.prazo) || 0;
        const agora = opcoes.agora == null ? Date.now() : Number(opcoes.agora);
        const prazoVencido = !!prazo && agora > prazo;
        const porId = {};
        jogadores.forEach(j => { porId[String(j.id)] = j; });
        const vou = [], naoVao = [], convidados = [];
        Object.keys(respostas).forEach(id => {
            const r = respostas[id];
            if (!r || (r.status !== 'vou' && r.status !== 'nao')) return;
            const j = porId[id];
            if (!j && !r.convidado) return;           // jogador apagado do elenco
            const item = {
                id, nome: j ? String(j.nome) : String(r.nome || '?'),
                goleiro: j ? !!(j.g || j.isGoleiro) : !!r.goleiro,
                convidado: !j, em: Number(r.em) || 0, removido: !!r.removido, declarou: !!r.paguei
            };
            if (item.convidado) convidados.push(item);
            (r.status === 'vou' ? vou : naoVao).push(item);
        });
        const ordem = (a, b) => (a.em - b.em) || a.nome.localeCompare(b.nome);
        vou.sort(ordem); naoVao.sort((a, b) => a.nome.localeCompare(b.nome));
        const promovidos = opcoes.promovidos || {};
        vou.forEach(v => { v.promovido = !!promovidos[v.id]; });
        // quem o organizador subiu pega a vaga primeiro; depois, ordem de chegada
        const prioridade = vou.filter(v => v.promovido).sort((a, b) => (Number(promovidos[a.id]) || 0) - (Number(promovidos[b.id]) || 0))
            .concat(vou.filter(v => !v.promovido));
        const comVaga = new Set();
        let linha = 0, gols = 0;
        prioridade.forEach(v => {
            const cabe = v.goleiro ? (!vagasGol || gols < vagasGol) : (!limite || linha < limite);
            if (cabe) { comVaga.add(v.id); if (v.goleiro) gols++; else linha++; }
        });
        // as listas continuam na ordem de chegada
        const confirmados = vou.filter(v => comVaga.has(v.id));
        const espera = vou.filter(v => !comVaga.has(v.id));
        // pagamento (só de quem está com vaga)
        // quem disse que pagou e espera confirmação NÃO conta como atrasado (o organizador confere antes)
        confirmados.forEach(c => {
            c.pago = !!pagos[c.id];
            c.aConfirmar = !c.pago && c.declarou;
            c.atrasado = !c.pago && !c.declarou && prazoVencido;
        });
        const semResposta = jogadores.filter(j => !respostas[String(j.id)])
            .map(j => ({ id: String(j.id), nome: String(j.nome), goleiro: !!(j.g || j.isGoleiro) }))
            .sort((a, b) => a.nome.localeCompare(b.nome));
        return {
            confirmados, espera, naoVao, semResposta, convidados: convidados.sort(ordem),
            linhaConfirmados: linha, goleirosConfirmados: gols, limite, vagasGoleiro: vagasGol,
            pagos: confirmados.filter(c => c.pago).length,
            pendentes: confirmados.filter(c => !c.pago && !c.declarou).length,
            aConfirmar: confirmados.filter(c => c.aConfirmar),
            atrasados: confirmados.filter(c => c.atrasado), prazoVencido
        };
    }

    // Nome digitado na lista -> jogador. Ignora maiúsculas, acentos e espaços a mais
    // ("ze  pereira" acha "Zé Pereira"). pessoas: [{id, nome}]. Devolve a pessoa ou null.
    function normalizarNome(n) {
        return String(n == null ? '' : n).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function acharPorNome(pessoas, nome) {
        const alvo = normalizarNome(nome);
        if (!alvo) return null;
        return (pessoas || []).find(p => p && normalizarNome(p.nome) === alvo) || null;
    }

    // ---------- Cara do racha (🎨 Personalizar): cores ----------
    // a = cor de destaque (textos/realces), b = cor forte (botões). A chave é o que fica salvo.
    const CORES_RACHA = {
        verde: { nome: 'Verde', a: '#7fe04a', b: '#14b551' },
        azul: { nome: 'Azul', a: '#6cb8ff', b: '#2f6fd6' },
        vermelho: { nome: 'Vermelho', a: '#ff7a7a', b: '#d13b47' },
        laranja: { nome: 'Laranja', a: '#ffb057', b: '#e0702a' },
        amarelo: { nome: 'Amarelo', a: '#f5d547', b: '#c9a227' },
        roxo: { nome: 'Roxo', a: '#be98ff', b: '#7b4fd6' },
        rosa: { nome: 'Rosa', a: '#ff8cc0', b: '#d0457f' },
        ciano: { nome: 'Ciano', a: '#5ce6d3', b: '#1fa395' },
        prata: { nome: 'Preto e branco', a: '#e8eef1', b: '#8b98a0' }
    };
    function corRacha(chave) { return CORES_RACHA[chave] || CORES_RACHA.verde; }
    function hexParaRgb(hex) {
        const h = String(hex || '').replace('#', '');
        const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(', ');
    }

    // ---------- Lista de presença: mensagem pronta para o WhatsApp ----------
    // d = presenca/<codigo>, r = resumirPresenca(...), link = URL da página, fmt = formata o prazo (ms -> texto)
    function textoListaWhatsApp(d, r, link, fmt) {
        d = d || {}; fmt = fmt || (ms => new Date(ms).toLocaleString('pt-BR'));
        const L = [];
        const titulo = String((d.visual && d.visual.nome) || d.titulo || 'Racha').toUpperCase();
        L.push('⚽ *' + titulo + '*');
        if (d.quando) L.push('📅 ' + d.quando);
        if (d.times) L.push('🏟️ ' + d.times + ' times de ' + d.porTime + ' + goleiro (' + d.limite + ' na linha)');
        if (d.pagamento) L.push('💰 ' + d.pagamento);
        if (d.pix && d.pix.chave && !/copia e cola/i.test(d.pagamento || '')) L.push('💠 Pix copia e cola e QR Code no link');
        if (d.prazo) L.push('⏰ Pagar até ' + fmt(d.prazo));
        const pag = c => !d.prazo && !d.pagamento ? '' : c.pago ? ' ✅' : c.aConfirmar ? ' 🕐' : '';
        const linha = r.confirmados.filter(c => !c.goleiro), gols = r.confirmados.filter(c => c.goleiro);
        L.push('', '✅ *LINHA (' + linha.length + (r.limite ? '/' + r.limite : '') + ')*');
        linha.forEach((c, i) => L.push((i + 1) + '. ' + c.nome + pag(c)));
        if (r.limite) for (let i = linha.length; i < r.limite; i++) L.push((i + 1) + '. ');
        if (gols.length || r.vagasGoleiro) {
            L.push('', '🧤 *GOLEIROS (' + gols.length + (r.vagasGoleiro ? '/' + r.vagasGoleiro : '') + ')*');
            gols.forEach((c, i) => L.push((i + 1) + '. ' + c.nome + pag(c)));
            if (r.vagasGoleiro) for (let i = gols.length; i < r.vagasGoleiro; i++) L.push((i + 1) + '. ');
        }
        if (r.espera.length) {
            L.push('', '⏳ *SUPLENTES*');
            r.espera.forEach((c, i) => L.push((i + 1) + '. ' + c.nome + (c.goleiro ? ' 🧤' : '')));
        }
        if (d.prazo || d.pagamento) L.push('', '✅ pago · 🕐 avisou que pagou');
        if (link) L.push('', '👉 *Confirme aqui:* ' + link);
        return L.join('\n');
    }

    // ---------- Pix "copia e cola" (BR Code estático do Banco Central) ----------
    // Gera o texto que o app do banco lê (no QR ou colado). O dinheiro vai direto para a chave do organizador.
    // Formato: campos ID + tamanho (2 dígitos) + valor; termina com CRC16-CCITT (0x1021, início 0xFFFF).
    function crc16Pix(txt) {
        let crc = 0xFFFF;
        for (let i = 0; i < txt.length; i++) {
            crc ^= txt.charCodeAt(i) << 8;
            for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
        }
        return crc.toString(16).toUpperCase().padStart(4, '0');
    }
    // texto sem acento e só com caracteres aceitos pelo padrão
    function textoPix(t, max) {
        return String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Za-z0-9 .,\-\/]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
    }
    // tipo: 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria'. Devolve a chave no formato do Pix ou '' se inválida.
    function normalizarChavePix(tipo, chave) {
        const c = String(chave == null ? '' : chave).trim();
        const dig = c.replace(/\D/g, '');
        if (tipo === 'cpf') return dig.length === 11 ? dig : '';
        if (tipo === 'cnpj') return dig.length === 14 ? dig : '';
        if (tipo === 'telefone') {
            const n = dig.length === 10 || dig.length === 11 ? '55' + dig : (dig.length === 12 || dig.length === 13) && dig.startsWith('55') ? dig : '';
            return n ? '+' + n : '';
        }
        if (tipo === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) && c.length <= 77 ? c.toLowerCase() : '';
        if (tipo === 'aleatoria') return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c) ? c.toLowerCase() : '';
        return '';
    }
    // p = { chave (já normalizada), nome, cidade, valor (reais), txid, mensagem }
    function montarPix(p) {
        const campo = (id, v) => id + String(v.length).padStart(2, '0') + v;
        const chave = String(p.chave || '');
        if (!chave) return '';
        let conta = campo('00', 'br.gov.bcb.pix') + campo('01', chave);
        const msg = textoPix(p.mensagem, 99 - conta.length - 4);
        if (msg) conta += campo('02', msg);
        const valor = Number(p.valor) > 0 ? (Math.round(Number(p.valor) * 100) / 100).toFixed(2) : '';
        const txid = String(p.txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
        let s = campo('00', '01') + campo('26', conta) + campo('52', '0000') + campo('53', '986')
            + (valor ? campo('54', valor) : '') + campo('58', 'BR')
            + campo('59', textoPix(p.nome, 25).toUpperCase() || 'RECEBEDOR')
            + campo('60', textoPix(p.cidade, 15).toUpperCase() || 'BRASIL')
            + campo('62', campo('05', txid)) + '6304';
        return s + crc16Pix(s);
    }

    // ---------- Plano Pro: assinatura e teste grátis ----------
    // plano = planos/<uid> { ativo, ate? }, teste = testes/<uid> { inicio } (horário do servidor)
    // -> { pro, origem: 'plano'|'teste'|null, ate (ms|null), diasTeste (restantes), testeUsado }
    function statusPlano(plano, teste, agora, diasTeste) {
        agora = agora == null ? Date.now() : Number(agora);
        diasTeste = Number(diasTeste) || 0;
        plano = plano || {}; teste = teste || {};
        const planoOk = !!plano.ativo && (!plano.ate || Number(plano.ate) > agora);
        const inicio = Number(teste.inicio) || 0;
        const fimTeste = inicio ? inicio + diasTeste * 864e5 : 0;
        const testeOk = !!inicio && diasTeste > 0 && agora < fimTeste;
        return {
            pro: planoOk || testeOk,
            origem: planoOk ? 'plano' : testeOk ? 'teste' : null,
            ate: planoOk ? (plano.ate ? Number(plano.ate) : null) : testeOk ? fimTeste : null,
            diasTeste: testeOk ? Math.max(1, Math.ceil((fimTeste - agora) / 864e5)) : 0,
            testeUsado: !!inicio
        };
    }
    // R$ 1.234,50 (negativo: −R$ 115,00)
    function reais(v) {
        const n = Number(v) || 0;
        const [int, dec] = Math.abs(n).toFixed(2).split('.');
        return (n < 0 ? '−' : '') + 'R$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
    }
    // quanto o anual economiza em relação a 12 mensalidades (em %)
    // quanto o plano de "meses" sai mais barato que pagar o mensal (em %, arredondado)
    function economiaPlano(mensal, total, meses) {
        mensal = Number(mensal) || 0; total = Number(total) || 0; meses = Number(meses) || 0;
        return mensal > 0 && total > 0 && meses > 0 ? Math.max(0, Math.round((1 - total / (mensal * meses)) * 100)) : 0;
    }
    function economiaAnual(mensal, anual) { return economiaPlano(mensal, anual, 12); }

    // ---------- Controle de caixa do racha ----------
    // caixa = { config: { mensalidade, diaria, vencimento (dia do mês) }, mensalistas: { idJogador: true },
    //           lancamentos: { id: { tipo: 'entrada'|'saida', valor, desc, data (ms), mes ('2026-11'),
    //                                categoria: 'mensalidade'|'diaria'|'quadra'|'material'|'outros', jogadorId?, origem? } } }
    const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    function mesISO(ts) {
        const d = new Date(ts == null ? Date.now() : ts);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }
    function nomeMes(mes) {
        const [a, m] = String(mes).split('-').map(Number);
        return (MESES[(m || 1) - 1] || '') + ' de ' + a;
    }
    function somarMes(mes, n) {
        const [a, m] = String(mes).split('-').map(Number);
        const d = new Date(a, (m - 1) + n, 1);
        return mesISO(d.getTime());
    }
    function resumoCaixa(caixa, jogadores, mes) {
        caixa = caixa || {};
        const cfg = Object.assign({ mensalidade: 0, diaria: 0, vencimento: 10 }, caixa.config || {});
        const lanc = Object.entries(caixa.lancamentos || {}).filter(([, l]) => l && (l.tipo === 'entrada' || l.tipo === 'saida'))
            .map(([id, l]) => Object.assign({ id }, l, { valor: Math.round((Number(l.valor) || 0) * 100) / 100 }));
        const soma = lista => Math.round(lista.reduce((a, l) => a + (l.tipo === 'entrada' ? l.valor : -l.valor), 0) * 100) / 100;
        const doMes = lanc.filter(l => l.mes === mes).sort((a, b) => (b.data || 0) - (a.data || 0));
        const entradasMes = Math.round(doMes.filter(l => l.tipo === 'entrada').reduce((a, l) => a + l.valor, 0) * 100) / 100;
        const saidasMes = Math.round(doMes.filter(l => l.tipo === 'saida').reduce((a, l) => a + l.valor, 0) * 100) / 100;
        const mensal = caixa.mensalistas || {};
        const mensalistas = Object.values(jogadores || {}).filter(j => j && mensal[String(j.id)])
            .map(j => {
                const pg = doMes.find(l => l.categoria === 'mensalidade' && String(l.jogadorId) === String(j.id));
                return { id: String(j.id), nome: String(j.nome), pago: !!pg, lancId: pg ? pg.id : null };
            })
            .sort((a, b) => (a.pago - b.pago) || a.nome.localeCompare(b.nome));
        const devedores = mensalistas.filter(m => !m.pago);
        return {
            config: cfg, saldo: soma(lanc), saldoMes: Math.round((entradasMes - saidasMes) * 100) / 100,
            entradasMes, saidasMes, lancamentos: doMes, mensalistas, devedores,
            pagaram: mensalistas.length - devedores.length,
            previsto: Math.round(mensalistas.length * (Number(cfg.mensalidade) || 0) * 100) / 100,
            aReceber: Math.round(devedores.length * (Number(cfg.mensalidade) || 0) * 100) / 100
        };
    }
    // mensagem para o grupo com quem ainda não pagou a mensalidade
    function textoCobrancaGrupo(r, mes, nomeRacha, pix) {
        const L = ['💰 *MENSALIDADE DE ' + nomeMes(mes).toUpperCase() + '*' + (nomeRacha ? ' — ' + nomeRacha : '')];
        if (r.config.mensalidade) L.push('Valor: ' + reais(r.config.mensalidade) + (r.config.vencimento ? ' · vence dia ' + r.config.vencimento : ''));
        if (!r.devedores.length) { L.push('', '✅ Todo mundo pagou! Valeu, galera 🙌'); return L.join('\n'); }
        L.push('', '⏳ *Ainda não pagaram (' + r.devedores.length + '):*');
        r.devedores.forEach((d, i) => L.push((i + 1) + '. ' + d.nome));
        if (r.pagaram) L.push('', '✅ Já pagaram: ' + r.pagaram);
        if (pix && pix.chave) L.push('', '💠 Pix: ' + pix.chave + (pix.nome ? ' (' + pix.nome + ')' : ''));
        L.push('', 'Pagou? Me avisa aqui 👍');
        return L.join('\n');
    }
    function textoCobrancaIndividual(nome, r, mes, nomeRacha, pix) {
        const primeiro = String(nome || '').trim().split(/\s+/)[0] || '';
        let t = 'Fala ' + primeiro + '! 👋 A mensalidade de ' + nomeMes(mes) + (nomeRacha ? ' do ' + nomeRacha : ' do racha')
            + (r.config.mensalidade ? ' (' + reais(r.config.mensalidade) + ')' : '') + ' ainda tá em aberto.';
        if (pix && pix.chave) t += '\n💠 Pix: ' + pix.chave + (pix.nome ? ' (' + pix.nome + ')' : '');
        return t + '\nValeu! ⚽';
    }

    return {
        embaralhar, idUnico, chaveSegura, limparMapa, normalizarTime, compararVersoes,
        filtrarLinhasLote, sortearTimes, gerarPartidas, novaClassificacao,
        aplicarResultado, ordenarClassificacao, montarAoVivo,
        normalizarEstrelas, filtrarPorEstrelas,
        gravarNoCaminho, lerDoCaminho, diaISO, ultimosDias, resumirMetricas,
        nomeDaChave, resumoCampeonato, textoResumo, proximoTurno, resumirPresenca,
        normalizarNome, acharPorNome, CORES_RACHA, corRacha, hexParaRgb, textoListaWhatsApp,
        crc16Pix, normalizarChavePix, montarPix, statusPlano, reais, economiaAnual, economiaPlano,
        mesISO, nomeMes, somarMes, resumoCaixa, textoCobrancaGrupo, textoCobrancaIndividual
    };
});
