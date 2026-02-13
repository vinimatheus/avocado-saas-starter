function normalizeErrorMessage(message: string): string {
  return message.trim().toLowerCase();
}

function includesSome(message: string, patterns: string[]): boolean {
  return patterns.some((pattern) => message.includes(pattern));
}

export function isEmailNotVerifiedErrorMessage(message: string): boolean {
  const normalized = normalizeErrorMessage(message);

  return includesSome(normalized, [
    "email not verified",
    "e-mail not verified",
    "email nao verificado",
    "e-mail nao verificado",
  ]);
}

export function localizeAuthErrorMessage(message: string): string {
  const normalized = normalizeErrorMessage(message);
  if (!normalized) {
    return message;
  }

  if (includesSome(normalized, ["invalid email or password", "invalid credentials"])) {
    return "E-mail ou senha invalidos.";
  }

  if (isEmailNotVerifiedErrorMessage(message)) {
    return "Seu e-mail ainda nao foi verificado.";
  }

  if (includesSome(normalized, ["email already exists", "user already exists"])) {
    return "Ja existe uma conta com este e-mail.";
  }

  if (includesSome(normalized, ["invalid email"])) {
    return "E-mail invalido.";
  }

  if (includesSome(normalized, ["incorrect password", "wrong password", "invalid password"])) {
    return "Senha invalida.";
  }

  if (
    includesSome(normalized, [
      "password too short",
      "password must be at least",
      "password is too short",
      "password length",
    ])
  ) {
    return "A senha nao atende aos requisitos minimos.";
  }

  if (includesSome(normalized, ["password too long", "password is too long"])) {
    return "A senha excede o tamanho maximo permitido.";
  }

  if (includesSome(normalized, ["invalid token", "token invalid"])) {
    return "Token invalido.";
  }

  if (includesSome(normalized, ["token expired", "expired token"])) {
    return "Token expirado.";
  }

  if (includesSome(normalized, ["invalid backup code"])) {
    return "Codigo de backup invalido.";
  }

  if (includesSome(normalized, ["invalid totp", "invalid otp", "one-time password", "invalid 2fa"])) {
    return "Codigo de seguranca invalido.";
  }

  if (includesSome(normalized, ["two factor not enabled", "2fa not enabled"])) {
    return "A autenticacao em dois fatores nao esta ativa.";
  }

  if (includesSome(normalized, ["session not found", "invalid session"])) {
    return "Sessao invalida. Faca login novamente.";
  }

  if (includesSome(normalized, ["user not found"])) {
    return "Usuario nao encontrado.";
  }

  if (includesSome(normalized, ["invitation not found", "invalid invitation"])) {
    return "Convite invalido ou expirado.";
  }

  if (includesSome(normalized, ["invitation already accepted", "invitation already rejected"])) {
    return "Este convite ja foi processado.";
  }

  if (
    includesSome(normalized, [
      "provider is disabled",
      "oauth provider disabled",
      "social provider disabled",
    ])
  ) {
    return "Provedor de autenticacao indisponivel no momento.";
  }

  if (includesSome(normalized, ["account already linked", "social account already linked"])) {
    return "Esta conta social ja esta vinculada a outro usuario.";
  }

  if (includesSome(normalized, ["too many requests", "rate limit"])) {
    return "Muitas tentativas. Aguarde alguns instantes e tente novamente.";
  }

  if (
    includesSome(normalized, [
      "unauthorized",
      "unauthenticated",
      "authentication required",
      "not authenticated",
    ])
  ) {
    return "Voce precisa fazer login para continuar.";
  }

  if (includesSome(normalized, ["forbidden", "access denied", "permission denied", "not allowed"])) {
    return "Voce nao tem permissao para esta acao.";
  }

  if (includesSome(normalized, ["failed to fetch", "network error"])) {
    return "Erro de conexao. Verifique sua internet e tente novamente.";
  }

  return message;
}
