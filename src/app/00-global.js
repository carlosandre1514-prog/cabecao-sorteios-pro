// =====================================================================
// app.js — TELAS e ESTADO do app (login, jogadores, sorteio, campeonato, histórico)
//
// Onde procurar cada erro:
//   cálculo de sorteio / tabela / pontos  -> js/logica.js  (tem testes)
//   bloquear app / versão mínima          -> js/remoto.js
//   plano Pro, limites, patrocinador      -> js/monetizacao.js
//   login (formulário)                    -> js/auth.js
//   salvar/carregar no Firebase, telas    -> ESTE arquivo
// =====================================================================

// --- VARIÁVEIS GLOBAIS ---
let modoJogoAtual = 'todos-contra-todos'; // 'todos-contra-todos' ou 'racha-livre'

// Variáveis do modo racha livre
let filaTimes = [];
let timeEmCampoA = null;
let timeEmCampoB = null;
let partidasRachaHistorico = [];
let placarRacha = { a: 0, b: 0 }; // placar da partida em andamento (modo racha)
let tipoDesempateRacha = null;

// --- FUNÇÕES DE CONTROLE DO MENU LATERAL (DRAWER) ---
function toggleDrawer() {
    const drawer = document.getElementById('side-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (drawer && overlay) {
        drawer.classList.toggle('open');
        overlay.classList.toggle('hidden');
    }
}

// Aviso rápido no topo (não trava a tela). tipo: 'ok' | 'erro'
function toast(mensagem, tipo = 'ok') {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast' + (tipo === 'erro' ? ' erro' : '');
    el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    el.textContent = window.UI ? UI.semEmoji(mensagem) : mensagem;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('saindo'); setTimeout(() => el.remove(), 320); }, 2800);
}

// versão dos Termos de uso e da Política de Privacidade: mudou o texto de forma importante?
// troque aqui e todo mundo aceita de novo no próximo acesso
const VERSAO_TERMOS = '2026-11-19';
window.VERSAO_TERMOS = VERSAO_TERMOS;

function esconderSplash() {
    const sp = document.getElementById('splash');
    if (!sp || sp.classList.contains('saindo')) return;
    // a bola 3D da abertura termina o quique antes de sair (no máximo 1,6 s a mais)
    const bola = window.__abertura3d;
    if (bola && !sp.__esperou) {
        sp.__esperou = true;
        Promise.race([bola, new Promise(r => setTimeout(r, 1600))]).then(esconderSplash, esconderSplash);
        return;
    }
    sp.classList.add('saindo');
    setTimeout(() => { const el = document.getElementById('splash-3d'); if (el && el.__parar3d) el.__parar3d(); sp.remove(); }, 350);
}
function mostrarCarregando(on, texto) {
    const el = document.getElementById('carregando-dados');
    if (!el) return;
    if (texto) document.getElementById('carregando-texto').textContent = texto;
    el.classList.toggle('hidden', !on);
}

async function fazerLogout() {
    try {
        if (window.firebaseAuth && window.firebaseFns) {
            await window.firebaseFns.signOut(window.firebaseAuth);
            const d = document.getElementById('side-drawer');
            if (d && d.classList.contains('open')) toggleDrawer();
        } else {
            console.warn("Módulo de autenticação do Firebase não encontrado.");
        }
    } catch (error) {
        console.error("Erro ao fazer logout:", error);
        await mostrarAlerta("Erro ao sair da conta. Tente novamente.", "❌ ERRO");
    }
}

