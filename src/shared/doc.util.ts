export type DocKey = 'cpf' | 'cnpj';

export function normalizeDoc(raw?: string): { key: DocKey; value: string } {
  const value = String(raw ?? '').replace(/\D/g, '');
  const key: DocKey = value.length === 14 ? 'cnpj' : 'cpf';
  return { key, value };
}

export function pdfPasswordFromDoc(raw?: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.slice(0, 5) || '00000';
}
