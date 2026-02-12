# avocado SaaS Starter

Template SaaS com:

- Next.js (App Router)
- Better Auth (email/senha)
- Multi-tenant por organizacao
- Convites e gestao de equipe
- Prisma + PostgreSQL

## Getting Started

1. Instale as dependencias:

```bash
npm install
```

2. Configure as variaveis de ambiente:
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_BASE_URL` (ex.: `http://localhost:3000`)
- `BETTER_AUTH_URL`
- `NEXT_PUBLIC_BETTER_AUTH_URL`
- `GOOGLE_CLIENT_ID` (opcional, para login social)
- `GOOGLE_CLIENT_SECRET` (opcional, para login social)
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `ABACATEPAY_API_KEY`
- `ABACATEPAY_WEBHOOK_SECRET`
- `ABACATEPAY_WEBHOOK_SIGNATURE_KEY`
- `ABACATEPAY_BASE_URL` (default: `https://api.abacatepay.com/v1`)
- `ABACATEPAY_ALLOWED_CHECKOUT_HOSTS` (opcional, default: `abacatepay.com`)
- `ABACATEPAY_WEBHOOK_ALLOWED_IPS` (opcional, lista de IPs separados por virgula)
- `ABACATEPAY_WEBHOOK_RATE_LIMIT_MAX` (opcional, default: `120`)
- `ABACATEPAY_WEBHOOK_RATE_LIMIT_WINDOW_SECONDS` (opcional, default: `60`)

3. Suba o PostgreSQL no Docker:

```bash
npm run db:up
```

4. Gere o client Prisma e sincronize schema:

```bash
npm run prisma:generate
npm run prisma:push
```

ou rode tudo de uma vez:

```bash
npm run db:setup
```

5. Rode o projeto:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Verificacao de e-mail

- O projeto exige verificacao de e-mail para login.
- No cadastro, o sistema envia automaticamente o link de verificacao.
- No login, se o e-mail nao estiver verificado, e possivel reenviar o link pela propria tela.
- Para envio de e-mail, configure `RESEND_API_KEY` e `RESEND_FROM_EMAIL`.

## Login com Google (opcional)

- O botao de login com Google ja fica disponivel em `/sign-in`.
- Para funcionar, configure `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.
- No Google Cloud Console, use esta URI de redirecionamento em desenvolvimento:
  - `http://localhost:3000/api/auth/callback/google`
- Em producao, use:
  - `https://seu-dominio.com/api/auth/callback/google`

## Banco com Docker

1. Copie `.env.example` para `.env`.
2. Ajuste usuário/senha/porta se necessário.
3. Comandos úteis:

```bash
npm run db:up
npm run db:logs
npm run db:down
```

Se a porta `5432` ja estiver em uso, rode com outra porta:

```bash
POSTGRES_PORT=5433 npm run db:up
```

e ajuste o `DATABASE_URL` para a mesma porta.

## Rotas principais

- `/sign-in`
- `/sign-up`
- `/forgot-password`
- `/reset-password`
- `/onboarding/company`
- `/dashboard`
- `/team` (somente admin)
- `/billing`
- `/profile`

## Billing / Webhooks

- O billing fica em `/billing` (planos, trial, upgrade/downgrade, cancelamento, reativacao, faturas).
- Webhook AbacatePay: `POST /api/webhooks/abacatepay` com header `X-Webhook-Secret: SEU_SEGREDO`
- O webhook valida `X-Webhook-Secret`, valida obrigatoriamente `X-Webhook-Signature` (HMAC SHA-256) e aplica idempotencia por `event.id`.
- O webhook aplica rate limit por IP e pode restringir origem com allowlist (`ABACATEPAY_WEBHOOK_ALLOWED_IPS`).
- O checkout so aceita redirecionamento para hosts confiaveis (default `*.abacatepay.com`), configuraveis por `ABACATEPAY_ALLOWED_CHECKOUT_HOSTS`.
