import { afterEach, describe, expect, it } from "vitest";

import { isTrustedAbacateCheckoutUrl } from "@/lib/billing/abacatepay";

const ORIGINAL_ALLOWED_HOSTS = process.env.ABACATEPAY_ALLOWED_CHECKOUT_HOSTS;

afterEach(() => {
  if (ORIGINAL_ALLOWED_HOSTS === undefined) {
    delete process.env.ABACATEPAY_ALLOWED_CHECKOUT_HOSTS;
    return;
  }

  process.env.ABACATEPAY_ALLOWED_CHECKOUT_HOSTS = ORIGINAL_ALLOWED_HOSTS;
});

describe("isTrustedAbacateCheckoutUrl", () => {
  it("aceita HTTPS no host padrao do provedor", () => {
    delete process.env.ABACATEPAY_ALLOWED_CHECKOUT_HOSTS;

    expect(isTrustedAbacateCheckoutUrl("https://app.abacatepay.com/checkout/123")).toBe(true);
  });

  it("rejeita URL sem HTTPS", () => {
    delete process.env.ABACATEPAY_ALLOWED_CHECKOUT_HOSTS;

    expect(isTrustedAbacateCheckoutUrl("http://app.abacatepay.com/checkout/123")).toBe(false);
  });

  it("rejeita host fora da allowlist", () => {
    delete process.env.ABACATEPAY_ALLOWED_CHECKOUT_HOSTS;

    expect(isTrustedAbacateCheckoutUrl("https://checkout.evil.com/123")).toBe(false);
  });

  it("respeita allowlist customizada via ambiente", () => {
    process.env.ABACATEPAY_ALLOWED_CHECKOUT_HOSTS = "checkout.exemplo.com";

    expect(isTrustedAbacateCheckoutUrl("https://checkout.exemplo.com/abc")).toBe(true);
    expect(isTrustedAbacateCheckoutUrl("https://sub.checkout.exemplo.com/abc")).toBe(true);
    expect(isTrustedAbacateCheckoutUrl("https://app.abacatepay.com/checkout/abc")).toBe(false);
  });
});
