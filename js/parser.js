// "IA" do protótipo: interpretador local de linguagem natural (pt-BR).
// Na versão real, este módulo é substituído por GPT-4o + validação Zod (ver README).
import { toISO, addDays, today } from './utils.js';

export const CATEGORIES = {
  entrada: ['Vendas', 'Serviços', 'Outros'],
  saida: {
    CNPJ: ['Fornecedor', 'Pró-labore', 'Folha', 'Aluguel', 'Energia/Água', 'Internet/Telefone', 'Impostos', 'Marketing', 'Transporte', 'Alimentação', 'Outros'],
    CPF: ['Moradia', 'Alimentação', 'Saúde', 'Educação', 'Transporte', 'Lazer', 'Cartão', 'Outros'],
  },
};

export const suggestions = (type, scope) =>
  type === 'entrada' ? ['Vendas', 'Serviços', 'Outros']
    : scope === 'CPF' ? ['Moradia', 'Alimentação', 'Outros']
      : ['Fornecedor', 'Pró-labore', 'Outros'];

const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const RULES = {
  saida: [
    ['Pró-labore', /pro-?\s?labore|retirada/],
    ['Folha', /salario|funcionari|folha|colaborador/],
    ['Aluguel', /aluguel|locacao/],
    ['Energia/Água', /\bluz\b|energia|\bagua\b|saneamento|enel|equatorial/],
    ['Internet/Telefone', /internet|telefone|celular|\bvivo\b|\bclaro\b|\btim\b|fibra/],
    ['Impostos', /\bdas\b|imposto|darf|simples|\binss\b|iptu|\bipva\b|\bfgts\b|taxa/],
    ['Marketing', /anuncio|\bads\b|instagram|marketing|trafego|google/],
    ['Transporte', /combustivel|gasolina|\buber\b|frete|pedagio|estacionamento/],
    ['Alimentação', /mercado|almoco|jantar|restaurante|ifood|padaria|lanche|supermercado/],
    ['Fornecedor', /fornecedor|mercadoria|estoque|material|atacado|insumo/],
    ['Saúde', /farmacia|medico|consulta|exame|plano de saude|dentista/],
    ['Educação', /escola|faculdade|curso|mensalidade/],
    ['Lazer', /cinema|viagem|streaming|netflix|spotify|lazer/],
    ['Cartão', /cartao|fatura/],
    ['Moradia', /condominio|moradia|financiamento/],
  ],
  entrada: [
    ['Vendas', /venda|vendi|vendas|balcao|pedido|loja/],
    ['Serviços', /servico|consultoria|projeto|diaria|atendimento|honorario/],
  ],
};

const rx = {
  entrada: /\b(recebi|receber|recebimento|vendi|venda|vendas|entrou|faturei|caiu|pagou|me pagou)\b/,
  saida: /\b(paguei|pago|pagar|pagamento|comprei|compra|gastei|saiu|despesa|boleto|conta|vence|vencimento|debito|transferi)\b/,
  futuro: /\b(vou|vai|vence|vencimento|a pagar|a receber|preciso|tenho que|tenho de|devo|vencera|proxim[oa])\b/,
  agendado: /\b(agendei|agendado|agendar|programei|programado)\b/,
  cpf: /\b(pessoal|casa|familia|filho|filha|mercado|farmacia|escola|cpf|cinema|lazer)\b/,
  cnpj: /\b(cnpj|empresa|cliente|fornecedor|loja|nota fiscal|nf)\b/,
};

const NUM = '(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';

function toNumber(raw, mil) {
  let v = raw;
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
  let n = parseFloat(v);
  if (mil) n *= 1000;
  return n > 0 ? n : null;
}

export function parseAmount(n) {
  const s = n.replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, ' ').replace(/\bdia\s+\d{1,2}\b/g, ' ');
  const tries = [
    new RegExp('r\\$\\s*' + NUM + '(\\s*mil\\b)?'),
    new RegExp(NUM + '(\\s*mil)?\\s*(?:reais|real|conto|contos)\\b'),
    new RegExp(NUM + '(\\s*mil\\b)?'),
  ];
  for (const r of tries) {
    const m = s.match(r);
    if (m) { const v = toNumber(m[1], m[2]); if (v) return v; }
  }
  return null;
}

export function parseDate(n, futureIntent, ref = today()) {
  if (/depois de amanha/.test(n)) return toISO(addDays(ref, 2));
  if (/\bamanha\b/.test(n)) return toISO(addDays(ref, 1));
  if (/\bontem\b/.test(n)) return toISO(addDays(ref, -1));
  if (/\bhoje\b/.test(n)) return toISO(ref);
  if (/semana que vem|proxima semana/.test(n)) return toISO(addDays(ref, 7));
  let m = n.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    let y = m[3] ? +m[3] : ref.getFullYear();
    if (y < 100) y += 2000;
    return toISO(new Date(y, +m[2] - 1, +m[1]));
  }
  m = n.match(/\bdia\s+(\d{1,2})\b/);
  if (m) {
    let d = new Date(ref.getFullYear(), ref.getMonth(), +m[1]);
    if (futureIntent && d < ref) d = new Date(ref.getFullYear(), ref.getMonth() + 1, +m[1]);
    if (!futureIntent && d > ref) d = new Date(ref.getFullYear(), ref.getMonth() - 1, +m[1]);
    return toISO(d);
  }
  return toISO(ref);
}

function extractParty(original) {
  const m = original.match(/(?:[Pp]aguei|[Pp]ago|[Pp]agar|pra|para|pro|ao|à|do|da|de|com)\s+(?:o|a|os|as)?\s*([A-ZÀ-Ú][\wÀ-ú]+(?:\s[A-ZÀ-Ú][\wÀ-ú]+)?)/);
  return m ? m[1] : '';
}

/** Interpreta uma frase livre e devolve um rascunho de lançamento. */
export function parseMessage(text, defaultScope = 'CNPJ', ref = today()) {
  const n = norm(text);
  const isEntrada = rx.entrada.test(n) && !/\b(paguei|comprei|gastei)\b/.test(n);
  const isSaida = rx.saida.test(n);
  const type = isEntrada ? 'entrada' : isSaida ? 'saida' : null;

  const futureIntent = rx.futuro.test(n) || rx.agendado.test(n);
  const date = parseDate(n, futureIntent, ref);
  const isFutureDate = date > toISO(ref);
  const status = rx.agendado.test(n) ? 'agendado' : (futureIntent || isFutureDate) ? 'pendente' : 'pago';

  const scope = rx.cpf.test(n) && !rx.cnpj.test(n) ? 'CPF' : rx.cnpj.test(n) ? 'CNPJ' : defaultScope;

  let category = null;
  if (type) for (const [cat, r] of RULES[type] || []) if (r.test(n)) { category = cat; break; }

  const party = type ? extractParty(text) : '';
  const verb = type === 'entrada' ? 'Recebimento' : 'Pagamento';
  const desc = party ? `${verb} · ${party}` : text.trim().replace(/^./, c => c.toUpperCase()).slice(0, 60);

  return { type, status, amount: parseAmount(n), date, category, party, desc, scope, original: text };
}
