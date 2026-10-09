import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage, parseAmount } from '../js/parser.js';
import { colorOf, pixPayload, crc16 } from '../js/utils.js';

const REF = new Date(2026, 9, 8); // 08/10/2026

test('"Paguei o João" é ambíguo: sem valor e sem categoria', () => {
  const p = parseMessage('Paguei o João', 'CNPJ', REF);
  assert.equal(p.type, 'saida');
  assert.equal(p.party, 'João');
  assert.equal(p.category, null);
  assert.equal(p.amount, null);
  assert.equal(p.status, 'pago');
});

test('Recebi venda com valor', () => {
  const p = parseMessage('Recebi R$ 1.500,50 da venda de hoje', 'CNPJ', REF);
  assert.equal(p.type, 'entrada');
  assert.equal(p.amount, 1500.5);
  assert.equal(p.category, 'Vendas');
  assert.equal(p.status, 'pago');
});

test('Pagamento futuro vira pendente', () => {
  const p = parseMessage('Vou pagar 800 de aluguel dia 20', 'CNPJ', REF);
  assert.equal(p.status, 'pendente');
  assert.equal(p.date, '2026-10-20');
  assert.equal(p.category, 'Aluguel');
  assert.equal(p.amount, 800);
});

test('Valores com "mil" e "reais"', () => {
  assert.equal(parseAmount('recebi 2 mil'), 2000);
  assert.equal(parseAmount('paguei 45 reais'), 45);
});

test('Escopo pessoal é detectado', () => {
  assert.equal(parseMessage('Gastei 200 no mercado', 'CNPJ', REF).scope, 'CPF');
});

test('Regras de cores do calendário', () => {
  const ref = '2026-10-08';
  assert.equal(colorOf({ type: 'saida', status: 'pago', date: ref }, ref), 'red');
  assert.equal(colorOf({ type: 'entrada', status: 'pago', date: ref }, ref), 'green');
  assert.equal(colorOf({ type: 'saida', status: 'pendente', date: '2026-10-15' }, ref), 'yellow');
  assert.equal(colorOf({ type: 'saida', status: 'pendente', date: '2026-11-30' }, ref), 'blue');
  assert.equal(colorOf({ type: 'saida', status: 'agendado', date: '2026-10-09' }, ref), 'blue');
});

test('Payload PIX termina com CRC válido', () => {
  const p = pixPayload({ key: 'a@b.com', name: 'Loja', city: 'Goiania', amount: 10, txid: 'ABC123' });
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
  assert.ok(p.startsWith('000201'));
});
