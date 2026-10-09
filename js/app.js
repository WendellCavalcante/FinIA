import {
  toISO, parseISO, addDays, today, diffDays, brl, fmtBR, uid, esc,
  colorOf, COLOR_LABEL, COLOR_EMOJI, pixPayload,
} from './utils.js';
import { parseMessage, parseAmount, CATEGORIES, suggestions } from './parser.js';
import { load, save, reset } from './store.js';

let db = load();
db.settings ||= {};
db.settings.management ||= { clients: [], suppliers: [], payments: [] };
const DEMO_SESSION = 'finia_demo_session';
const ui = { view: 'home', manage: 'settings', scope: 'CNPJ', role: 'gestor', month: new Date(today().getFullYear(), today().getMonth(), 1), sel: toISO(today()) };
let pending = null; // rascunho aguardando valor (diálogo de ajuste)
let qrStream = null;
let qrScanning = false;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const visible = () => db.tx.filter(t => t.scope === ui.scope);
const sum = a => a.reduce((s, t) => s + t.amount, 0);
const todayISO = () => toISO(today());
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2600);
}

function removeTx(id) {
  const tx = db.tx.find(item => item.id === id);
  if (!tx || !window.confirm(`Excluir “${tx.desc}” de ${brl(tx.amount)}? Esta ação não pode ser desfeita.`)) return;
  db.tx = db.tx.filter(item => item.id !== id);
  save(db);
  toast('Lançamento excluído');
  render();
}

function closeMenu() {
  $('#side-menu').classList.remove('open');
  $('#side-menu').setAttribute('aria-hidden', 'true');
  $('#btn-menu').setAttribute('aria-expanded', 'false');
  $('#menu-backdrop').hidden = true;
}

function openMenu() {
  $('#side-menu').classList.add('open');
  $('#side-menu').setAttribute('aria-hidden', 'false');
  $('#btn-menu').setAttribute('aria-expanded', 'true');
  $('#menu-backdrop').hidden = false;
}

/* ---------------- navegação / cabeçalho ---------------- */
function setView(v) {
  if (ui.role === 'operacional' && !['home', 'chat', 'manage'].includes(v)) v = 'home';
  ui.view = v;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $$('.view').forEach(s => (s.hidden = s.id !== 'view-' + v));
  render();
}

function applyRole() {
  $$('#side-menu [data-view], #side-menu [data-manage]').forEach(b => {
    b.hidden = ui.role === 'operacional' && !['home', 'chat'].includes(b.dataset.view) && b.dataset.manage !== 'settings';
  });
  setView('home');
}

$('#login-form').addEventListener('submit', e => {
  e.preventDefault();
  if (!e.currentTarget.reportValidity()) return;
  sessionStorage.setItem(DEMO_SESSION, 'active');
  $('#login-screen').hidden = true;
  $('#app-shell').hidden = false;
  applyTheme(db.settings.theme || 'blue');
  applyRole();
});

$('#btn-logout').addEventListener('click', () => {
  sessionStorage.removeItem(DEMO_SESSION);
  closeMenu();
  $('#app-shell').hidden = true;
  $('#login-screen').hidden = false;
  $('#login-form').reset();
  $('#login-email').focus();
});

if (sessionStorage.getItem(DEMO_SESSION) === 'active') {
  $('#login-screen').hidden = true;
  $('#app-shell').hidden = false;
} else {
  $('#login-screen').hidden = false;
  $('#app-shell').hidden = true;
}

$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); });
$('#btn-menu').addEventListener('click', openMenu);
$('#btn-menu-close').addEventListener('click', closeMenu);
$('#menu-backdrop').addEventListener('click', closeMenu);
$('#btn-ai').addEventListener('click', () => setView('chat'));
$('#side-menu').addEventListener('click', e => {
  const view = e.target.closest('[data-view]');
  const manage = e.target.closest('[data-manage]');
  if (view) { setView(view.dataset.view); closeMenu(); }
  if (manage) { ui.manage = manage.dataset.manage; setView('manage'); closeMenu(); }
});
$('#scope-seg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  ui.scope = b.dataset.scope;
  $$('#scope-seg button').forEach(x => x.classList.toggle('on', x === b));
  render();
});
$('#role').addEventListener('change', e => { ui.role = e.target.value; applyRole(); toast(ui.role === 'gestor' ? 'Perfil Gestor: visão completa' : 'Perfil Operacional: só envio de notas e comprovantes'); });
$('#btn-reset').addEventListener('click', () => { db = reset(); applyTheme('blue'); render(); toast('Dados de demonstração restaurados'); });

function render() {
  renderAlert();
  if (ui.view === 'home') renderHome();
  if (ui.view === 'calendar') renderCalendar();
  if (ui.view === 'dashboard') renderDashboard();
  if (ui.view === 'pix') renderPix();
  if (ui.view === 'manage') renderManagement();
}

function renderHome() {
  const el = $('#view-home');
  const list = visible();
  const open = list.filter(t => t.status !== 'pago');
  const due = open.filter(t => t.date <= todayISO());
  const dueOut = sum(due.filter(t => t.type === 'saida'));
  const dueIn = sum(due.filter(t => t.type === 'entrada'));
  el.innerHTML = `<section class="home-hero card">
      <div><span class="eyebrow">SEU ESPAÇO FINANCEIRO</span><h1>Olá! Vamos deixar seu caixa em ordem?</h1>
        <p>Comece registrando uma entrada ou uma despesa. A FinIA ajuda a organizar os dados antes de salvar.</p>
        <button class="primary home-start" data-go="chat">＋ Registrar uma movimentação</button></div>
      <div class="home-mark" aria-hidden="true"><span class="home-mark-ring"></span><svg viewBox="0 0 48 48"><path d="M8 34h7V22H8zm12 0h7V14h-7zm12 0h7V8h-7z"/><path d="m8 17 10-6 9 2 12-9"/></svg></div>
    </section>
    <section class="home-section"><div class="section-heading"><div><span class="eyebrow">COMECE POR AQUI</span><h2>O que você precisa fazer?</h2></div><span class="home-scope">${ui.scope === 'CNPJ' ? '◈ Empresa' : '◉ Pessoal'}</span></div>
      <div class="home-shortcuts">
        <button class="shortcut-card" data-go="chat"><span class="shortcut-icon blue-icon">＋</span><span><b>Registrar entrada ou despesa</b><small>Digite, fale ou anexe um recibo</small></span><span class="shortcut-arrow">→</span></button>
        <button class="shortcut-card" data-go="calendar"><span class="shortcut-icon teal-icon">✓</span><span><b>Ver o que está em aberto</b><small>${open.length ? `${open.length} lançamento(s) aguardando` : 'Confira seus lançamentos e datas'}</small></span><span class="shortcut-arrow">→</span></button>
        <button class="shortcut-card" data-go="dashboard"><span class="shortcut-icon violet-icon">▥</span><span><b>Acompanhar meu caixa</b><small>${due.length ? `Hoje/atrasado: ${brl(dueOut)} a pagar · ${brl(dueIn)} a receber` : 'Veja saldo e resumo financeiro'}</small></span><span class="shortcut-arrow">→</span></button>
      </div>
    </section>
    <div class="home-tip"><span>✦</span><p><b>Dica da FinIA</b><br>Você pode escrever como fala: “Recebi 250 de uma venda”. Antes de salvar, dá para revisar tudo.</p><button class="dragon-mini" data-go="chat" aria-label="Conversar com a FinIA"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M11 15 7 7l12 5 5-5 5 5 12-5-4 11c3 4 4 8 2 13l-6 4-2 8-7-5-7 5-2-8-7-4c-3-5-2-11 3-16Z"/><path d="m15 22 7 2-5 4m16-6-7 2 5 4M20 34l4-2 4 2"/></svg></button></div>`;
  el.onclick = e => {
    const go = e.target.closest('[data-go]')?.dataset.go;
    if (go) setView(go);
  };
}

const MANAGEMENT_SECTIONS = [
  ['settings', '⚙️ Configurações'], ['clients', '👥 Clientes'], ['suppliers', '🏭 Fornecedores'],
  ['payments', '💳 Pagamentos'], ['subscription', '✦ Assinatura'], ['strategy', '🔀 Estratégia'],
];

const THEMES = [
  ['blue', 'Azul elétrico', 'Preto, azul luminoso e turquesa'],
  ['violet', 'Índigo', 'Preto, índigo e lilás'],
  ['graphite', 'Grafite', 'Preto, azul aço e verde água'],
];

function applyTheme(theme = 'blue') {
  const validTheme = THEMES.some(([key]) => key === theme) ? theme : 'blue';
  document.documentElement.dataset.theme = validTheme;
  db.settings.theme = validTheme;
  save(db);
}

function renderManagement() {
  const el = $('#view-manage');
  const nav = `<div class="manage-nav">${MANAGEMENT_SECTIONS.map(([key, label]) => `<button data-section="${key}" class="${ui.manage === key ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  const section = MANAGEMENT_SECTIONS.find(([key]) => key === ui.manage) || MANAGEMENT_SECTIONS[0];
  let body = '';
  if (ui.manage === 'settings') {
    body = `<div class="card appearance-card"><h3>Personalizar as cores</h3><p class="note">Escolha uma combinação para deixar a FinIA com a sua cara. A mudança é imediata.</p>
      <div class="theme-options">${THEMES.map(([key, title, description]) => `<button class="theme-option ${document.documentElement.dataset.theme === key ? 'selected' : ''}" data-theme-choice="${key}" aria-pressed="${document.documentElement.dataset.theme === key}"><span class="theme-swatch ${key}" aria-hidden="true"><i></i><i></i><i></i></span><span><b>${title}</b><small>${description}</small></span><span class="theme-check">✓</span></button>`).join('')}</div></div>
      <div class="card"><h3>Dados para cobranças PIX</h3><p class="note">Esses dados ficam salvos apenas neste navegador neste protótipo.</p>
      <form id="manage-settings" class="manage-form settings-form">
        <label>Chave PIX<input name="pixKey" required value="${esc(db.settings.pixKey || '')}" placeholder="Sua chave PIX"></label>
        <label>Nome do recebedor<input name="pixName" required value="${esc(db.settings.pixName || '')}" placeholder="Nome da empresa"></label>
        <label>Cidade<input name="pixCity" required value="${esc(db.settings.pixCity || '')}" placeholder="Cidade"></label>
        <button class="primary" type="submit">Salvar configurações</button>
      </form></div>
      <div class="card"><h3>Como usar</h3><p>Registre uma entrada ou saída no chat, confira os dados e confirme. Consulte os resultados no painel.</p>
      <button class="sm" data-go="chat">Abrir chat IA</button></div>`;
  } else if (['clients', 'suppliers', 'payments'].includes(ui.manage)) {
    const collection = db.settings.management[ui.manage] || [];
    const noun = ui.manage === 'clients' ? 'cliente' : ui.manage === 'suppliers' ? 'fornecedor' : 'forma de pagamento';
    body = `<div class="card"><h3>Adicionar ${noun}</h3><p class="note">Organize seus cadastros para encontrar informações com mais facilidade.</p>
      <form id="manage-add" class="manage-form"><input name="label" required maxlength="70" placeholder="Nome de ${noun}">
      ${ui.manage !== 'payments' ? '<input name="detail" maxlength="100" placeholder="Telefone ou observação (opcional)">' : ''}
      <button class="primary" type="submit">Adicionar</button></form>
      <h3>Seus cadastros</h3>${collection.length ? collection.map(item => `<div class="manage-row"><span><b>${esc(item.label)}</b>${item.detail ? `<small class="note"> · ${esc(item.detail)}</small>` : ''}</span><button class="sm danger" data-remove="${esc(item.id)}" aria-label="Excluir ${esc(item.label)}">Excluir</button></div>`).join('') : `<p class="note">Ainda não há ${noun}s cadastrados. Use o campo acima para adicionar o primeiro.</p>`}</div>`;
  } else if (ui.manage === 'subscription') {
    body = `<div class="card"><span class="plan-badge">Plano demonstração</span><h3 style="margin-top:12px">Sua assinatura FinIA</h3>
      <p>Este protótipo não processa pagamentos nem ativa planos. Aqui você poderá acompanhar seu plano, vencimento e forma de pagamento quando a assinatura for integrada.</p>
      <div class="item"><span>Status</span><b>Em avaliação</b></div><div class="item"><span>Próximo passo</span><b>Configurar plano</b></div>
      <p class="note">Nenhuma cobrança será feita a partir desta tela.</p></div>`;
  } else {
    body = `<div class="card"><h3>Fluxo simples para cuidar do caixa</h3><p class="note">Um caminho visual para transformar movimentações em decisões.</p>
      <div class="flow"><div class="flow-step"><b>1 · Registrar</b><small>Entradas, saídas e comprovantes</small></div>
      <div class="flow-step"><b>2 · Organizar</b><small>Categoria, conta e vencimento</small></div>
      <div class="flow-step"><b>3 · Acompanhar</b><small>Saldo, alertas e compromissos</small></div>
      <div class="flow-step"><b>4 · Decidir</b><small>Planejar próximos passos</small></div></div>
      <div class="actions"><button class="primary" data-go="dashboard">Ver meu painel</button><button class="sm" data-go="chat">Fazer um lançamento</button></div></div>`;
  }
  el.innerHTML = `<div class="card"><h2>${section[1]}</h2><p class="note">Configurações e ferramentas da sua conta.</p></div>${nav}${body}`;
  el.onclick = e => {
    const sectionButton = e.target.closest('[data-section]');
    const go = e.target.closest('[data-go]');
    const remove = e.target.closest('[data-remove]');
    const theme = e.target.closest('[data-theme-choice]');
    if (sectionButton) { ui.manage = sectionButton.dataset.section; renderManagement(); }
    if (go) setView(go.dataset.go);
    if (theme) { applyTheme(theme.dataset.themeChoice); renderManagement(); toast('Aparência atualizada'); }
    if (remove) {
      const records = db.settings.management[ui.manage] || [];
      const record = records.find(item => item.id === remove.dataset.remove);
      if (record && window.confirm(`Excluir “${record.label}”?`)) {
        db.settings.management[ui.manage] = records.filter(item => item.id !== record.id);
        save(db); renderManagement(); toast('Cadastro excluído');
      }
    }
  };
  $('#manage-add', el)?.addEventListener('submit', e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const records = db.settings.management[ui.manage] ||= [];
    records.push({ id: uid(), label: String(form.get('label')).trim(), detail: String(form.get('detail') || '').trim() });
    save(db); renderManagement(); toast('Cadastro adicionado');
  });
  $('#manage-settings', el)?.addEventListener('submit', e => {
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    Object.assign(db.settings, fields); save(db); toast('Configurações salvas');
  });
}

function closeQRScanner() {
  qrScanning = false;
  if (qrStream) qrStream.getTracks().forEach(track => track.stop());
  qrStream = null;
  $('#qr-video').srcObject = null;
  $('#qr-modal').hidden = true;
}

function showQRResult(value) {
  qrScanning = false;
  const result = $('#qr-result');
  const status = $('#qr-status');
  const text = String(value || '').trim();
  const internal = {
    chat: 'chat', lancamentos: 'calendar', calendar: 'calendar', painel: 'dashboard', dashboard: 'dashboard', pix: 'pix',
  };
  const route = text.match(/^finia:\/\/(chat|lancamentos|calendar|painel|dashboard|pix)\/?$/i);
  const pathRoute = text.match(/^\/(chat|lancamentos|calendar|painel|dashboard|pix)\/?(?:[?#].*)?$/i);
  const key = (route?.[1] || pathRoute?.[1] || '').toLowerCase();
  if (key && internal[key]) {
    status.textContent = 'Destino reconhecido: área interna da FinIA.';
    result.innerHTML = `<div class="scan-result"><b>FinIA · ${esc(internal[key] === 'calendar' ? 'Lançamentos' : internal[key] === 'dashboard' ? 'Painel financeiro' : internal[key] === 'pix' ? 'Cobranças PIX' : 'Chat IA')}</b><div class="actions"><button class="primary" data-qr-action="${internal[key]}">Abrir esta área</button></div></div>`;
    return;
  }
  if (/^000201/.test(text) || /br\.gov\.bcb\.pix/i.test(text)) {
    status.textContent = 'Destino reconhecido: cobrança ou pagamento PIX.';
    result.innerHTML = `<div class="scan-result"><b>QR Code PIX</b><p class="note">Código PIX detectado. Confira os dados no seu aplicativo bancário antes de pagar.</p><div class="actions"><button class="primary" data-qr-action="pix">Abrir Cobranças PIX</button><button class="sm" data-qr-action="copy">Copiar código</button></div></div>`;
    result.dataset.value = text;
    return;
  }
  try {
    const url = new URL(text);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      status.textContent = 'Confira o domínio antes de continuar.';
      result.innerHTML = `<div class="scan-result"><b>Link externo</b><p>${esc(url.hostname)}</p><small class="note">${esc(url.href)}</small><div class="actions"><button class="primary" data-qr-action="external">Abrir link em nova aba</button></div></div>`;
      result.dataset.value = url.href;
      return;
    }
  } catch { /* QR não contém URL */ }
  status.textContent = 'QR Code lido, mas não reconheci um destino seguro.';
  result.innerHTML = `<div class="scan-result"><b>Conteúdo do QR Code</b><p class="note">Revise o conteúdo antes de compartilhar ou usar.</p><textarea readonly>${esc(text)}</textarea><button class="sm" data-qr-action="copy">Copiar conteúdo</button></div>`;
  result.dataset.value = text;
}

async function openQRScanner() {
  const modal = $('#qr-modal');
  const video = $('#qr-video');
  $('#qr-result').innerHTML = '';
  $('#qr-status').textContent = 'Preparando câmera…';
  modal.hidden = false;
  if (!('BarcodeDetector' in window)) {
    $('#qr-status').textContent = 'A leitura pela câmera não está disponível neste navegador. Use uma versão recente do Chrome ou Edge.';
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    $('#qr-status').textContent = 'A câmera requer uma conexão segura (HTTPS ou localhost).';
    return;
  }
  try {
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    if (modal.hidden) { qrStream.getTracks().forEach(track => track.stop()); qrStream = null; return; }
    video.srcObject = qrStream;
    await video.play();
    qrScanning = true;
    $('#qr-status').textContent = 'Aponte a câmera para o QR Code.';
    while (qrScanning && !modal.hidden) {
      if (video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) showQRResult(codes[0].rawValue);
        } catch { /* continua procurando enquanto a câmera ajusta foco */ }
      }
      if (qrScanning) await new Promise(resolve => setTimeout(resolve, 250));
    }
  } catch (error) {
    $('#qr-status').textContent = error?.name === 'NotAllowedError'
      ? 'Permita o acesso à câmera no navegador para escanear.'
      : 'Não foi possível iniciar a câmera. Verifique as permissões do navegador.';
    if (qrStream) qrStream.getTracks().forEach(track => track.stop());
    qrStream = null;
  }
}

$('#btn-scan').addEventListener('click', openQRScanner);
$('#btn-scan-close').addEventListener('click', closeQRScanner);
$('#qr-modal').addEventListener('click', e => { if (e.target === $('#qr-modal')) closeQRScanner(); });
$('#qr-result').addEventListener('click', e => {
  const action = e.target.closest('[data-qr-action]')?.dataset.qrAction;
  if (!action) return;
  if (action === 'copy') { navigator.clipboard?.writeText($('#qr-result').dataset.value || ''); toast('Conteúdo copiado'); return; }
  if (action === 'external') { window.open($('#qr-result').dataset.value, '_blank', 'noopener,noreferrer'); closeQRScanner(); return; }
  closeQRScanner(); setView(action);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeMenu(); if (!$('#qr-modal').hidden) closeQRScanner(); }
});

function renderAlert() {
  const el = $('#alert');
  if (ui.role !== 'gestor') { el.hidden = true; return; }
  const due = visible().filter(t => t.status !== 'agendado' && t.status !== 'pago' && t.date <= todayISO());
  if (!due.length) { el.hidden = true; return; }
  const out = sum(due.filter(t => t.type === 'saida')), inn = sum(due.filter(t => t.type === 'entrada'));
  el.hidden = false;
  el.innerHTML = `🟡 <b>${due.length}</b> compromisso(s) para hoje/atrasados em ${ui.scope}: a pagar <b>${brl(out)}</b> · a receber <b>${brl(inn)}</b>`;
}

/* ---------------- chat + confirmação interativa ---------------- */
function bubble(who, html) {
  const d = document.createElement('div');
  d.className = 'bubble ' + who;
  d.innerHTML = html;
  const log = $('#chat-log');
  log.appendChild(d); log.scrollTop = log.scrollHeight;
  return d;
}

function welcome() {
  const b = bubble('ai', `Olá! Vamos cuidar do seu caixa juntos. <b>O que você quer registrar?</b> Escolha um exemplo ou escreva com suas palavras.
    <div class="chips">${['🔴 Paguei R$ 120 de energia', '🟢 Recebi R$ 1.500 de uma venda', '📅 Vou pagar R$ 800 de aluguel dia 20', '🛒 Gastei R$ 120 no mercado'].map(s => `<button class="chip" data-ex="${esc(s.replace(/^[^ ]+ /, ''))}">${esc(s)}</button>`).join('')}</div>
    <small class="note">Você sempre confere as informações antes de salvar.</small>`);
  b.addEventListener('click', e => { const c = e.target.closest('[data-ex]'); if (c) submit(c.dataset.ex); });
}

function submit(text) {
  text = text.trim(); if (!text) return;
  bubble('user', esc(text));
  $('#msg').value = '';

  // diálogo de ajuste: resposta curta com valor para um rascunho pendente
  if (pending && !pending.amount && text.split(/\s+/).length <= 4) {
    const v = parseAmount(text.toLowerCase());
    if (v) {
      pending.amount = v;
      bubble('ai', `Anotado: <b>${brl(v)}</b>. Confira o card acima e confirme. ✅`);
      pending.refresh?.();
      return;
    }
  }

  const p = parseMessage(text, ui.scope);
  openDraft(p, !p.type
    ? 'Não ficou claro se foi <b>entrada</b> ou <b>saída</b>. Toque para confirmar:'
    : !p.category
      ? `Entendi “${esc(text)}”, mas <b>para quê</b> foi esse ${p.type === 'saida' ? 'pagamento' : 'recebimento'}? Escolha abaixo:`
      : 'Entendi assim — confere?');
  if (!p.amount) bubble('ai', 'Qual foi o <b>valor</b>? Pode digitar aqui ou preencher no card.');
}

function openDraft(p, intro) {
  const d = {
    id: uid(), type: p.type || 'saida', typeKnown: !!p.type, status: p.status, amount: p.amount,
    date: p.date, category: p.category, party: p.party, desc: p.desc, scope: p.scope, src: p.src,
  };
  pending = d;
  const el = bubble('ai', '<div class="draft"></div>');
  const root = $('.draft', el);

  const draw = () => {
    const cats = d.type === 'entrada' ? CATEGORIES.entrada : CATEGORIES.saida[d.scope];
    const sug = suggestions(d.type, d.scope);
    const col = colorOf({ type: d.type, status: d.status, date: d.date });
    root.innerHTML = `
      <div>${intro}</div>
      <div class="chips" data-k="type">
        <button class="chip ${d.type === 'saida' ? 'on' : ''}" data-v="saida">🔻 Saída</button>
        <button class="chip ${d.type === 'entrada' ? 'on' : ''}" data-v="entrada">🔺 Entrada</button>
      </div>
      <div class="chips" data-k="cat">
        ${sug.map(c => `<button class="chip ${d.category === c ? 'on' : ''}" data-v="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>
      <div class="row">
        <div><label>Categoria</label>
          <select data-f="category"><option value="">— escolher —</option>${cats.map(c => `<option ${d.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div><label>Valor (R$)</label><input data-f="amount" inputmode="decimal" class="${d.amount ? '' : 'need'}" value="${d.amount ?? ''}" placeholder="0,00"></div>
        <div><label>Data</label><input data-f="date" type="date" value="${d.date}"></div>
        <div><label>Situação</label>
          <select data-f="status">
            <option value="pago" ${d.status === 'pago' ? 'selected' : ''}>${d.type === 'entrada' ? 'Recebido' : 'Pago'}</option>
            <option value="pendente" ${d.status === 'pendente' ? 'selected' : ''}>${d.type === 'entrada' ? 'A receber' : 'A pagar'}</option>
            <option value="agendado" ${d.status === 'agendado' ? 'selected' : ''}>Agendado</option>
          </select></div>
        <div><label>Conta</label>
          <select data-f="scope"><option ${d.scope === 'CNPJ' ? 'selected' : ''}>CNPJ</option><option ${d.scope === 'CPF' ? 'selected' : ''}>CPF</option></select></div>
      </div>
      <div class="actions">
        <span class="pill"><span class="dot ${col}"></span>${COLOR_EMOJI[col]} ${COLOR_LABEL[col]}</span>
        <span style="flex:1"></span>
        <button class="sm" data-a="cancel">Cancelar</button>
        <button class="primary" data-a="ok">Salvar lançamento ✅</button>
      </div>`;
  };
  d.refresh = draw;
  draw();

  root.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) {
      const k = chip.parentElement.dataset.k;
      if (k === 'type') { d.type = chip.dataset.v; d.category = null; }
      if (k === 'cat') d.category = chip.dataset.v;
      draw(); return;
    }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'cancel') { pending = null; root.innerHTML = '<i>Lançamento descartado.</i>'; }
    if (a === 'ok') confirm(d, root);
  });
  root.addEventListener('change', e => {
    const f = e.target.dataset.f; if (!f) return;
    let v = e.target.value;
    if (f === 'amount') v = parseAmount(String(v).toLowerCase().replace(/\s/g, '')) || null;
    d[f] = v;
    if (f === 'scope' && !(CATEGORIES.saida[d.scope] || []).includes(d.category) && d.type === 'saida') d.category = null;
    draw();
  });
}

function confirm(d, root) {
  if (!(d.amount > 0)) { toast('Informe o valor para confirmar'); return; }
  const tx = {
    id: uid(), scope: d.scope, type: d.type, status: d.status,
    desc: d.desc || (d.type === 'saida' ? 'Pagamento' : 'Recebimento'),
    amount: +d.amount, date: d.date, category: d.category || 'Outros', party: d.party || '',
  };
  db.tx.push(tx); save(db);
  const col = colorOf(tx);
  root.innerHTML = `✅ Lançado em <b>${tx.scope}</b>: ${esc(tx.desc)} — <b>${brl(tx.amount)}</b> · ${esc(tx.category)} · ${fmtBR(tx.date)}
    <div style="margin-top:6px"><span class="pill"><span class="dot ${col}"></span>${COLOR_LABEL[col]}</span></div>`;
  pending = null;
  render();
}

$('#btn-send').addEventListener('click', () => submit($('#msg').value));
$('#msg').addEventListener('keydown', e => { if (e.key === 'Enter') submit(e.target.value); });

// foto de cupom/boleto (protótipo não faz OCR)
$('#file').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  bubble('user', `<img src="${URL.createObjectURL(f)}" alt="comprovante">`);
  openDraft({ type: 'saida', status: 'pago', amount: null, date: todayISO(), category: null, party: '', desc: 'Comprovante / cupom (foto)', scope: ui.scope },
    '📷 Recebi a imagem. <span class="note">(No protótipo não há OCR; na versão real ela vai para o GPT-4o Vision.)</span> Complete os dados:');
  bubble('ai', 'Qual foi o <b>valor</b> do comprovante?');
  e.target.value = '';
});

// voz (Web Speech API — Chrome/Edge/Safari)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
$('#btn-mic').addEventListener('click', () => {
  if (!SR) { toast('Seu navegador não suporta reconhecimento de voz. Use Chrome/Edge.'); return; }
  const r = new SR(); r.lang = 'pt-BR'; r.interimResults = false;
  const btn = $('#btn-mic'); btn.classList.add('rec');
  r.onresult = ev => submit(ev.results[0][0].transcript);
  r.onerror = () => toast('Não consegui ouvir. Tente de novo.');
  r.onend = () => btn.classList.remove('rec');
  r.start();
});

/* ---------------- calendário ---------------- */
function renderCalendar() {
  const el = $('#view-calendar');
  const y = ui.month.getFullYear(), m = ui.month.getMonth();
  const first = new Date(y, m, 1), startOffset = first.getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const list = visible();
  const byDay = {};
  list.forEach(t => (byDay[t.date] ||= []).push(t));

  let cells = '';
  for (let i = 0; i < startOffset; i++) cells += '<div class="cell out"></div>';
  for (let d = 1; d <= days; d++) {
    const iso = toISO(new Date(y, m, d));
    const items = byDay[iso] || [];
    const counts = {};
    items.forEach(t => { const c = colorOf(t); counts[c] = (counts[c] || 0) + 1; });
    cells += `<button class="cell ${iso === todayISO() ? 'today' : ''} ${iso === ui.sel ? 'sel' : ''}" data-day="${iso}">
      <b>${d}</b><span class="dots">${Object.entries(counts).map(([c, n]) => `<span class="dot ${c}" title="${COLOR_LABEL[c]}: ${n}"></span>`.repeat(Math.min(n, 3))).join('')}</span></button>`;
  }

  const sel = (byDay[ui.sel] || []);
  el.innerHTML = `
    <div class="card">
      <div class="cal-head">
        <button class="sm" data-nav="-1">‹</button>
        <b>${MONTHS[m]} ${y} · ${ui.scope}</b>
        <button class="sm" data-nav="1">›</button>
      </div>
      <div class="legend">${Object.keys(COLOR_LABEL).map(c => `<span><span class="dot ${c}"></span> ${COLOR_LABEL[c]}</span>`).join('')}</div>
      <div class="cal">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => `<div class="dow">${x}</div>`).join('')}${cells}</div>
    </div>
    <div class="card"><h3>${fmtBR(ui.sel)}</h3>
      ${sel.length ? sel.map(itemHTML).join('') : '<span class="note">Nada neste dia.</span>'}
    </div>`;

  el.onclick = e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { ui.month = new Date(y, m + +nav.dataset.nav, 1); renderCalendar(); return; }
    const day = e.target.closest('[data-day]');
    if (day) { ui.sel = day.dataset.day; renderCalendar(); return; }
    const pay = e.target.closest('[data-pay]');
    if (pay) { const t = db.tx.find(x => x.id === pay.dataset.pay); t.status = 'pago'; save(db); toast(t.type === 'entrada' ? '🟢 Marcado como recebido' : '🔴 Marcado como pago'); render(); return; }
    const del = e.target.closest('[data-del]');
    if (del) removeTx(del.dataset.del);
  };
}

function itemHTML(t) {
  const c = colorOf(t);
  return `<div class="item">
    <div class="l"><span class="dot ${c}"></span><div><div>${esc(t.desc)}</div><small>${esc(t.category)}${t.party ? ' · ' + esc(t.party) : ''} · ${COLOR_LABEL[c]}</small></div></div>
    <div style="text-align:right"><b class="${t.type === 'entrada' ? 'pos' : 'neg'}">${t.type === 'entrada' ? '+' : '−'} ${brl(t.amount)}</b><br>
      ${t.status !== 'pago' ? `<button class="sm" data-pay="${t.id}">${t.type === 'entrada' ? 'Recebi' : 'Paguei'}</button>` : ''}
      <button class="sm danger" data-del="${t.id}" title="Excluir lançamento" aria-label="Excluir lançamento ${esc(t.desc)}">🗑 Excluir</button></div></div>`;
}

/* ---------------- painel ---------------- */
function renderDashboard() {
  const el = $('#view-dashboard');
  const list = visible(), t0 = todayISO();
  const paid = list.filter(t => t.status === 'pago');
  const saldo = sum(paid.filter(t => t.type === 'entrada')) - sum(paid.filter(t => t.type === 'saida'));
  const open15 = list.filter(t => t.status !== 'pago' && diffDays(t0, t.date) <= 15);
  const aReceber = sum(open15.filter(t => t.type === 'entrada'));
  const aPagar = sum(open15.filter(t => t.type === 'saida'));
  const proj = saldo + aReceber - aPagar;

  const ym = t0.slice(0, 7);
  const mes = paid.filter(t => t.date.startsWith(ym));
  const receita = sum(mes.filter(t => t.type === 'entrada'));
  const despCat = {};
  mes.filter(t => t.type === 'saida').forEach(t => (despCat[t.category] = (despCat[t.category] || 0) + t.amount));
  const desp = Object.values(despCat).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...Object.values(despCat));
  const prox = list.filter(t => t.status !== 'pago').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);

  el.innerHTML = `
    <div class="grid">
      <div class="card kpi"><small>Saldo atual (${ui.scope})</small><b class="${saldo >= 0 ? 'pos' : 'neg'}">${brl(saldo)}</b></div>
      <div class="card kpi"><small>🟢 A receber (15 dias)</small><b class="pos">${brl(aReceber)}</b></div>
      <div class="card kpi"><small>🟡 A pagar (15 dias)</small><b class="neg">${brl(aPagar)}</b></div>
      <div class="card kpi"><small>Capital de giro projetado</small><b class="${proj >= 0 ? 'pos' : 'neg'}">${brl(proj)}</b></div>
    </div>
    <div class="card"><h3>DRE simplificado — ${MONTHS[new Date().getMonth()]}</h3>
      <div class="item"><span>(+) Receitas</span><b class="pos">${brl(receita)}</b></div>
      ${Object.entries(despCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="barrow"><span>${esc(c)}</span><div><div class="bar" style="width:${(v / max) * 100}%"></div></div><span>${brl(v)}</span></div>`).join('') || '<div class="note">Sem despesas pagas no mês.</div>'}
      <div class="item"><span>(−) Despesas</span><b class="neg">${brl(desp)}</b></div>
      <div class="item"><b>(=) Resultado</b><b class="${receita - desp >= 0 ? 'pos' : 'neg'}">${brl(receita - desp)}</b></div>
    </div>
    <div class="card"><h3>Próximos compromissos</h3>${prox.map(itemHTML).join('') || '<span class="note">Nada pendente.</span>'}</div>
    <div class="card"><h3>📲 Resumo matinal (WhatsApp)</h3>
      <textarea id="wa" readonly>${esc(whatsappText(list, saldo))}</textarea>
      <div class="actions"><button class="sm" id="wa-copy">Copiar</button>
        <a class="sm" id="wa-open" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(whatsappText(list, saldo))}">Abrir no WhatsApp ↗</a></div>
      <p class="note">No produto real, este texto é enviado automaticamente todo dia de manhã via WhatsApp Business API.</p></div>`;

  el.onclick = e => {
    const pay = e.target.closest('[data-pay]');
    if (pay) { db.tx.find(x => x.id === pay.dataset.pay).status = 'pago'; save(db); render(); return; }
    const del = e.target.closest('[data-del]');
    if (del) { removeTx(del.dataset.del); return; }
    if (e.target.id === 'wa-copy') { navigator.clipboard?.writeText($('#wa').value); toast('Resumo copiado'); }
  };
}

function whatsappText(list, saldo) {
  const t0 = todayISO(), lim = toISO(addDays(today(), 3));
  const line = t => `• ${t.desc} — ${brl(t.amount)}`;
  const open = list.filter(t => t.status !== 'pago');
  const hoje = open.filter(t => t.date <= t0);
  const prox = open.filter(t => t.date > t0 && t.date <= lim);
  const sec = (title, arr) => arr.length ? `\n${title}\n${arr.map(line).join('\n')}\n` : '';
  const d = parseISO(t0);
  return `☀️ Bom dia! Resumo FinIA (${ui.scope}) — ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}\n` +
    sec('🟡 A pagar hoje / atrasado:', hoje.filter(t => t.type === 'saida')) +
    sec('🟢 A receber hoje / atrasado:', hoje.filter(t => t.type === 'entrada')) +
    sec('📅 Próximos 3 dias:', prox) +
    `\n💰 Saldo atual: ${brl(saldo)}`;
}

/* ---------------- cobranças PIX ---------------- */
function renderPix() {
  const el = $('#view-pix');
  const s = db.settings;
  const charges = db.tx.filter(t => t.pix).sort((a, b) => b.date.localeCompare(a.date));
  el.innerHTML = `
    <div class="card"><h3>Nova cobrança PIX</h3>
      <form class="pix" id="pix-form">
        <div><label>Cliente</label><input name="client" required placeholder="Nome do cliente"></div>
        <div><label>Valor (R$)</label><input name="amount" required inputmode="decimal" placeholder="250,00"></div>
        <div><label>Vencimento</label><input name="due" type="date" required value="${toISO(addDays(today(), 3))}"></div>
        <div><label>Sua chave PIX</label><input name="key" required value="${esc(s.pixKey)}"></div>
        <div><label>Nome do recebedor</label><input name="name" required value="${esc(s.pixName)}"></div>
        <div><label>Cidade</label><input name="city" required value="${esc(s.pixCity)}"></div>
        <div style="align-self:end"><button class="primary" type="submit">Gerar QR Code</button></div>
      </form>
      <p class="note">⚠️ Use uma chave PIX sua para testar de verdade. A cobrança entra no calendário CNPJ como 🟡 e vira 🟢 quando paga.</p>
    </div>
    <div id="charges">${charges.map(t => {
      const c = colorOf(t);
      return `<div class="card charge" data-id="${t.id}">
        <div class="qr" data-qr="${t.id}"></div>
        <div style="flex:1;min-width:200px">
          <b>${esc(t.party)}</b> · ${brl(t.amount)}<br>
          <small class="note">Vence ${fmtBR(t.date)}</small><br>
          <span class="pill"><span class="dot ${c}"></span>${t.status === 'pago' ? 'Pago' : 'Aguardando pagamento'}</span>
          <div class="actions">
            <button class="sm" data-copy="${t.id}">Copiar PIX copia-e-cola</button>
            ${t.status !== 'pago' ? `<button class="sm" data-simpay="${t.id}">✅ Simular pagamento do cliente</button>` : ''}
          </div></div></div>`;
    }).join('') || '<div class="note">Nenhuma cobrança ainda.</div>'}</div>`;

  charges.forEach(t => {
    const box = el.querySelector(`[data-qr="${t.id}"]`);
    if (window.QRCode) new window.QRCode(box, { text: t.pix, width: 128, height: 128 });
    else box.textContent = 'QR indisponível offline';
  });

  $('#pix-form').onsubmit = e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const amount = parseAmount(f.amount.toLowerCase().replace(/\s/g, ''));
    if (!amount) { toast('Valor inválido'); return; }
    db.settings = { pixKey: f.key, pixName: f.name, pixCity: f.city };
    const payload = pixPayload({ key: f.key, name: f.name, city: f.city, amount, txid: 'FINIA' + uid() });
    db.tx.push({ id: uid(), scope: 'CNPJ', type: 'entrada', status: 'pendente', desc: `Cobrança PIX · ${f.client}`, amount, date: f.due, category: 'Vendas', party: f.client, pix: payload });
    save(db); toast('🟡 Cobrança criada e adicionada ao calendário CNPJ'); renderPix(); renderAlert();
  };
  el.onclick = e => {
    const cp = e.target.closest('[data-copy]');
    if (cp) { navigator.clipboard?.writeText(db.tx.find(x => x.id === cp.dataset.copy).pix); toast('Código PIX copiado'); }
    const sp = e.target.closest('[data-simpay]');
    if (sp) { const t = db.tx.find(x => x.id === sp.dataset.simpay); t.status = 'pago'; t.paidAt = new Date().toISOString(); save(db); toast('🟡 → 🟢 Pagamento confirmado: calendário atualizado'); render(); }
  };
}

/* ---------------- início ---------------- */
applyTheme(db.settings.theme || 'blue');
welcome();
applyRole();
