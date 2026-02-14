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
pnpm install
```

2. Configure as variaveis de ambiente:
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_BASE_URL` (ex.: `http://localhost:3000`)
- `BETTER_AUTH_URL`
- `NEXT_PUBLIC_BETTER_AUTH_URL`
- `NEXT_PUBLIC_SITE_URL` (URL canonica do site para metadata/SEO, ex.: `https://seu-dominio.com`)
- `EMAIL_ASSET_BASE_URL` (opcional, URL base publica para imagens nos e-mails, ex.: `https://app.seudominio.com`)
- `GOOGLE_CLIENT_ID` (opcional, para login social)
- `GOOGLE_CLIENT_SECRET` (opcional, para login social)
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `ABACATEPAY_API_KEY`
- `ABACATEPAY_WEBHOOK_SECRET`
- `ABACATEPAY_WEBHOOK_SIGNATURE_KEY` (ou `ABACATEPAY_PUBLIC_KEY`)
- `ABACATEPAY_BASE_URL` (default: `https://api.abacatepay.com/v1`)
- `ABACATEPAY_TIMEOUT_MS` (opcional, default: `10000`)
- `ABACATEPAY_BILLING_LIST_TIMEOUT_MS` (opcional, default: `20000`)
- `ABACATEPAY_BILLING_LIST_RETRIES` (opcional, default: `1`)
- `CHECKOUT_PENDING_TIMEOUT_MINUTES` (opcional, default: `20`)
- `ABACATEPAY_ALLOWED_CHECKOUT_HOSTS` (opcional, default: `abacatepay.com`)
- `ABACATEPAY_WEBHOOK_ALLOWED_IPS` (opcional, lista de IPs separados por virgula)
- `ABACATEPAY_WEBHOOK_RATE_LIMIT_MAX` (opcional, default: `120`)
- `ABACATEPAY_WEBHOOK_RATE_LIMIT_WINDOW_SECONDS` (opcional, default: `60`)

3. Suba o PostgreSQL no Docker:

```bash
pnpm run db:up
```

4. Gere o client Prisma e sincronize schema:

```bash
pnpm run prisma:generate
pnpm run prisma:push
```

ou rode tudo de uma vez:

```bash
pnpm run db:setup
```

5. Rode o projeto:

```bash
pnpm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Deploy na Vercel

1. Importe o repositorio na Vercel e mantenha framework como `Next.js`.
2. Configure variaveis em `Project Settings > Environment Variables`:
- `DATABASE_URL` (recomendado: banco gerenciado com pool de conexoes)
- `BETTER_AUTH_SECRET` (minimo de 32 caracteres)
- `BETTER_AUTH_URL` e `NEXT_PUBLIC_BETTER_AUTH_URL` (ex.: `https://app.seudominio.com`)
- `NEXT_PUBLIC_SITE_URL` (dominio canonico publico, ex.: `https://app.seudominio.com`)
- `TRUSTED_ORIGINS` (dominios permitidos, separados por virgula)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `ABACATEPAY_API_KEY`, `ABACATEPAY_WEBHOOK_SECRET` e opcionalmente `ABACATEPAY_WEBHOOK_SIGNATURE_KEY` (ou `ABACATEPAY_PUBLIC_KEY`)
- `ABACATEPAY_TIMEOUT_MS` (opcional), `ABACATEPAY_BILLING_LIST_TIMEOUT_MS` (opcional), `ABACATEPAY_BILLING_LIST_RETRIES` (opcional)
- `CHECKOUT_PENDING_TIMEOUT_MINUTES` (opcional)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `CLOUDINARY_PROFILE_FOLDER` (opcional), `CLOUDINARY_ORGANIZATION_FOLDER` (opcional)
3. O build ja esta preparado para Vercel:
- `pnpm run build` executa `prisma generate` antes do `next build`.
- `postinstall` tambem executa `prisma generate` para evitar client Prisma desatualizado em cache de build.
4. Para mudancas de schema em producao, prefira migracoes:

```bash
pnpm run prisma:migrate:deploy
```

5. Fallback de URL na Vercel:
- Se `BETTER_AUTH_URL` nao estiver definida, o projeto tenta usar variaveis de sistema da Vercel (`VERCEL_URL` e relacionadas).
- Em producao com dominio proprio, mantenha `BETTER_AUTH_URL` explicita para evitar callback incorreto em auth.

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
pnpm run db:up
pnpm run db:logs
pnpm run db:down
```

Se a porta `5432` ja estiver em uso, rode com outra porta:

```bash
POSTGRES_PORT=5433 pnpm run db:up
```

e ajuste o `DATABASE_URL` para a mesma porta.

## Rotas principais

- `/sign-in`
- `/sign-up`
- `/forgot-password`
- `/reset-password`
- `/onboarding/company`
- `/dashboard`
- `/billing`
- `/profile`

## Billing / Webhooks

- O billing fica em `/billing` (planos por organizacao, trial, upgrade/downgrade, cancelamento, reativacao, faturas).
- Webhook AbacatePay: `POST /api/webhooks/abacatepay` com header `X-Webhook-Secret: SEU_SEGREDO`
- O webhook valida `X-Webhook-Secret`, valida obrigatoriamente `X-Webhook-Signature` (HMAC SHA-256) e aplica idempotencia por `event.id`.
- Se `ABACATEPAY_WEBHOOK_SIGNATURE_KEY`/`ABACATEPAY_PUBLIC_KEY` nao estiver configurada, o webhook valida apenas o secret (modo compatibilidade).
- O webhook aplica rate limit por IP e pode restringir origem com allowlist (`ABACATEPAY_WEBHOOK_ALLOWED_IPS`).
- O checkout so aceita redirecionamento para hosts confiaveis (default `*.abacatepay.com`), configuraveis por `ABACATEPAY_ALLOWED_CHECKOUT_HOSTS`.
