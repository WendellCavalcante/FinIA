// Persistência local (localStorage). Na versão real: Supabase (ver supabase/schema.sql).
import { toISO, addDays, today, uid } from './utils.js';

const KEY = 'finia_proto_v1';

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignora */ }
  const db = { tx: seed(), settings: { pixKey: 'demo@finia.app', pixName: 'Minha Empresa', pixCity: 'Goiania' } };
  save(db);
  return db;
}

export function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignora */ }
}

export function reset() {
  localStorage.removeItem(KEY);
  return load();
}

export function seed() {
  const t = today();
  const d = n => toISO(addDays(t, n));
  const mk = (scope, type, status, desc, amount, off, category, party = '') =>
    ({ id: uid(), scope, type, status, desc, amount, date: d(off), category, party });
  return [
    mk('CNPJ', 'entrada', 'pago', 'Vendas balcão', 2400, -3, 'Vendas'),
    mk('CNPJ', 'entrada', 'pago', 'Recebimento · Marina', 1800, -6, 'Serviços', 'Marina'),
    mk('CNPJ', 'saida', 'pago', 'Pagamento · Atacado Silva', 950, -2, 'Fornecedor', 'Atacado Silva'),
    mk('CNPJ', 'saida', 'pago', 'Internet fibra', 129.9, -5, 'Internet/Telefone'),
    mk('CNPJ', 'saida', 'pendente', 'Energia elétrica (atrasada)', 410, -1, 'Energia/Água'),
    mk('CNPJ', 'entrada', 'pendente', 'Recebimento · Bruno', 1200, 1, 'Vendas', 'Bruno'),
    mk('CNPJ', 'saida', 'pendente', 'Aluguel da loja', 1800, 3, 'Aluguel'),
    mk('CNPJ', 'saida', 'pendente', 'DAS Simples Nacional', 324.5, 9, 'Impostos'),
    mk('CNPJ', 'saida', 'agendado', 'Folha de pagamento', 3200, 20, 'Folha'),
    mk('CPF', 'entrada', 'pago', 'Pró-labore', 3000, -8, 'Outros'),
    mk('CPF', 'saida', 'pago', 'Mercado do mês', 380, -1, 'Alimentação'),
    mk('CPF', 'saida', 'pendente', 'Fatura do cartão', 1250, 5, 'Cartão'),
    mk('CPF', 'saida', 'agendado', 'Mensalidade escola', 900, 18, 'Educação'),
  ];
}
