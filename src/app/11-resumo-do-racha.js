    // ---------- RESUMO DO RACHA (imagem + texto) ----------
    async function enviarResumoImagem(h, btn) {
        if (!window.ImagemTimes) return;
        if (btn) btn.disabled = true;
        try {
            const r = await ImagemTimes.compartilharResumo(Logica.resumoCampeonato(h), { titulo: tituloRacha(), escudo: visualRacha.escudo, cor: Logica.corRacha(visualRacha.cor) });
            if (r === 'baixado') toast('Imagem salva! Agora é só mandar no grupo.');
            if (r !== 'cancelado' && window.Metricas) Metricas.evento('resumo_imagem');
        } catch (e) {
            console.error('Resumo do racha:', e);
            await mostrarAlerta('Não consegui gerar a imagem. Use "Copiar resumo".', '❌ ERRO');
        } finally {
            if (btn) btn.disabled = false;
        }
    }
    async function copiarResumoTexto(h) {
        const texto = Logica.textoResumo(Logica.resumoCampeonato(h), tituloRacha());
        if (window.Metricas) Metricas.evento('resumo_texto');
        if (await copiarTexto(texto)) toast('Resumo copiado! Agora é só colar no WhatsApp.');
        else fallbackCopiarTexto(texto);
    }

    async function compartilharImagemTimes() {
        if (!sorteioAtual || sorteioAtual.length === 0) {
            await mostrarAlerta('Nenhum sorteio realizado ainda!', '⚠️ AVISO');
            return;
        }
        const btn = document.getElementById('btn-imagem-times');
        if (btn) btn.disabled = true;
        try {
            const titulo = tituloRacha();
            const dia = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
            const r = await ImagemTimes.compartilhar(sorteioAtual, { titulo, subtitulo: dia.charAt(0).toUpperCase() + dia.slice(1), escudo: visualRacha.escudo, cor: Logica.corRacha(visualRacha.cor) });
            if (r === 'baixado') toast('Imagem salva! Agora é só mandar no grupo.');
            if (r !== 'cancelado' && window.Metricas) Metricas.evento('imagem_times');
        } catch (e) {
            console.error('Imagem dos times:', e);
            await mostrarAlerta('Não consegui gerar a imagem. Use "Copiar Lista de Times".', '❌ ERRO');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function copiarListaTimes() {
        if (window.Metricas) Metricas.evento('lista_copiada');
        if (!sorteioAtual || sorteioAtual.length === 0) {
            await mostrarAlerta('Nenhum sorteio realizado ainda!', '⚠️ AVISO');
            return;
        }

        let textoFormatado = `*RESULTADO DO SORTEIO*\n\n`;

        sorteioAtual.forEach((t, i) => {
            const media = (t.jogadores.length > 0 ? (t.somaEstrelas / t.jogadores.length) : 0).toFixed(1).replace('.', ',');
            textoFormatado += `*${t.nome.toUpperCase()}* (Média: ⭐ ${media})\n`;
            t.jogadores.forEach((j, index) => {
                const tagGoleiro = j.isGoleiro ? '🧤 ' : '';
                const estFmt = Number(j.estrelas || 3.0).toFixed(1).replace('.', ',');
                textoFormatado += `${index + 1}. ${tagGoleiro}${j.nome} (⭐ ${estFmt})\n`;
            });

            if (i < sorteioAtual.length - 1) {
                textoFormatado += `\n`;
            }
        });

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textoFormatado).then(async () => {
                toast('Lista copiada! Agora é só colar no WhatsApp.');
            }).catch(err => {
                fallbackCopiarTexto(textoFormatado);
            });
        } else {
            fallbackCopiarTexto(textoFormatado);
        }
    }

    async function fallbackCopiarTexto(texto) {
        const textArea = document.createElement('textarea');
        textArea.value = texto;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            document.execCommand('copy');
            toast('Lista copiada! Agora é só colar no WhatsApp.');
        } catch (err) {
            await mostrarAlerta('❌ Erro ao copiar automaticamente. Tente novamente.', 'ERRO');
        }

        document.body.removeChild(textArea);
    }

