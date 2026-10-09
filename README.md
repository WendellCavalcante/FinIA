# 💸 FinIA — Co-piloto Financeiro para Pequenos Negócios

Protótipo funcional (front-end puro, sem build) do MVP descrito na especificação.
Roda direto no navegador e pode ser publicado no **GitHub Pages**.

## O que já funciona

| Módulo | No protótipo |
|---|---|
| **1. Leitura inteligente** | Texto, voz (🎙️ Web Speech API, pt-BR) e foto (📷). Entradas vagas como *"Paguei o João"* geram um **card com botões** (`Fornecedor` · `Pró-labore` · `Outros`), campos editáveis e pergunta de ajuste ("Qual foi o valor?"). |
| **2. Calendário colorido** | 🔴 saída paga · 🟡 a vencer em até 15 dias (ou atrasado) · 🟢 entrada recebida · 🔵 agendado/futuro. Alternância **CPF / CNPJ**. |
| **3. Painel e alertas** | Saldo, a receber/pagar (15 dias), capital de giro projetado, DRE simplificado do mês e texto do **resumo matinal de WhatsApp** (botão abre `wa.me`). |
| **4. Contas e cobranças** | Perfil **Gestor** (tudo) × **Operacional** (só envia notas/comprovantes). **Cobrança PIX** com QR Code e *copia-e-cola* (BR Code com CRC16); ao "simular pagamento" o item vai de 🟡 para 🟢. |

## O que é simulado (e como evoluir)

- **IA**: `js/parser.js` é um interpretador por regras. Na versão real, troque por GPT-4o com saída validada por Zod:
  ```ts
  const Lancamento = z.object({
    tipo: z.enum(['entrada', 'saida']).nullable(),
    valor: z.number().positive().nullable(),
    data: z.string().date(),
    categoria: z.string().nullable(),
    contraparte: z.string().nullable(),
    status: z.enum(['pago', 'pendente', 'agendado']),
    confianca: z.number().min(0).max(1),
  });
  // confianca < 0.8 ou campos null  ->  mostrar card de confirmação (já implementado no front)
  ```
- **Foto/OCR**: o protótipo só abre o card para preenchimento; produção → GPT-4o Vision.
- **Banco**: `localStorage` no protótipo; o esquema real (tabelas + RLS + trigger do PIX) está em [`supabase/schema.sql`](supabase/schema.sql).
- **DDA / WhatsApp automático / assinaturas**: exigem backend e contratos (banco/agregador, WhatsApp Business API, Mercado Pago/Stripe) — fora do protótipo.
- **Autenticação**: o seletor Gestor/Operacional é só demonstração visual; a segurança real vem das policies RLS.

## Rodar localmente

```bash
npm start        # serve a pasta (precisa de Node)  -> http://localhost:3000
npm test         # testes do parser, cores e PIX
```
> Abra via servidor (não `file://`), pois o app usa módulos ES.

## Publicar no GitHub Pages

1. Crie o repositório e envie os arquivos:
   ```bash
   git init && git add . && git commit -m "FinIA protótipo"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/finia.git
   git push -u origin main
   ```
2. No GitHub: **Settings → Pages → Source: GitHub Actions**.
3. O workflow `.github/workflows/pages.yml` roda os testes e publica em
   `https://SEU_USUARIO.github.io/finia/`.

## Estrutura

```
index.html
css/styles.css
js/app.js       # UI: chat, cards de confirmação, calendário, painel, PIX
js/parser.js    # "IA" local (substituível por GPT-4o + Zod)
js/utils.js     # datas, moeda, regra de cores, gerador de PIX
js/store.js     # persistência local + dados de demonstração
test/           # node --test
supabase/schema.sql
```

## Próximos passos sugeridos

1. Portar a UI para **Next.js + Tailwind** (os módulos de `js/` já são puros e reaproveitáveis).
2. Trocar `store.js` por `@supabase/supabase-js` + Auth.
3. Criar a rota `/api/interpretar` (Node + OpenAI + Zod) no lugar do `parser.js`.
4. App **Expo** reutilizando a mesma API; piloto com usuários reais para validar o fluxo de voz e botões.
