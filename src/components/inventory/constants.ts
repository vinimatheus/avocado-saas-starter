export const PALLET_STATUSES = [
  { value: "DISPONIVEL", label: "Disponivel" },
  { value: "OCUPADO", label: "Ocupado" },
  { value: "BLOQUEADO", label: "Bloqueado" },
  { value: "MANUTENCAO", label: "Manutencao" },
] as const;

export const READING_TIPS = [
  "Use prefixos LOC- e PAL- para manter padrao.",
  "Aponte o QR para a camera por 1-2 segundos.",
  "Confira o inventario por data para validar leituras.",
] as const;
