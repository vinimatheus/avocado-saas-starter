import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MarketingLanding } from "@/components/app/marketing-landing";
import { getTenantContext } from "@/lib/organization/tenant-context";
import { resolveSiteOrigin } from "@/lib/seo/site-url";

export const dynamic = "force-dynamic";

const siteOrigin = resolveSiteOrigin();
const homeTitle = "Next.js SaaS Starter pronto para producao";
const homeDescription =
  "Lance seu SaaS mais rapido com starter em Next.js com autenticacao, multi-tenant, planos e painel prontos.";
const homeSocialImage = `${siteOrigin}/img/social-card.png`;

const homeStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "Avocado SaaS Starter",
      url: siteOrigin,
      inLanguage: "pt-BR",
    },
    {
      "@type": "SoftwareApplication",
      name: "Avocado SaaS Starter",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: siteOrigin,
      description: homeDescription,
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "BRL",
        availability: "https://schema.org/InStock",
        url: `${siteOrigin}/sign-up`,
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Esse starter ja exige verificacao de e-mail no login?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sim. O fluxo bloqueia login sem verificacao e permite reenviar o link na tela de login.",
          },
        },
        {
          "@type": "Question",
          name: "Como funciona o multi-tenant por organizacao?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Cada usuario opera em uma organizacao ativa com alternador, convites e papeis de acesso controlados no servidor.",
          },
        },
        {
          "@type": "Question",
          name: "Planos e webhook ja estao prontos?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sim. O modulo de planos contempla periodo de teste, upgrade e webhook AbacatePay com assinatura HMAC.",
          },
        },
      ],
    },
  ],
};

export const metadata: Metadata = {
  title: homeTitle,
  description: homeDescription,
  keywords: [
    "nextjs saas starter",
    "next.js saas boilerplate",
    "saas starter com planos",
    "template saas multi-tenant",
    "better auth nextjs",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: homeTitle,
    description: homeDescription,
    type: "website",
    url: "/",
    images: [
      {
        url: homeSocialImage,
        width: 1200,
        height: 630,
        alt: "Logo do Avocado SaaS Starter em fundo branco",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: homeTitle,
    description: homeDescription,
    images: [homeSocialImage],
  },
};

export default async function HomePage() {
  const tenantContext = await getTenantContext();

  if (!tenantContext.session?.user) {
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(homeStructuredData) }}
        />
        <MarketingLanding />
      </>
    );
  }

  if (!tenantContext.organizationId) {
    redirect("/onboarding/company");
  }

  redirect("/dashboard");
}
