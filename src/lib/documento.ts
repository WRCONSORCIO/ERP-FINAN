export type TipoDoc = 'CPF' | 'CNPJ';

export function somenteDigitos(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

export function cpfValido(cpf: string): boolean {
  const d = somenteDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const nums = d.split('').map(Number);
  for (const pos of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < pos; i++) soma += (nums[i] as number) * (pos + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== nums[pos]) return false;
  }
  return true;
}

export function cnpjValido(cnpj: string): boolean {
  const d = somenteDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const nums = d.split('').map(Number);
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, ...pesos1];
  for (const [pos, pesos] of [[12, pesos1], [13, pesos2]] as const) {
    let soma = 0;
    for (let i = 0; i < pos; i++) soma += (nums[i] as number) * (pesos[i] as number);
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== nums[pos]) return false;
  }
  return true;
}

export function tipoDoDocumento(doc: string): TipoDoc | null {
  const d = somenteDigitos(doc);
  if (d.length === 11) return 'CPF';
  if (d.length === 14) return 'CNPJ';
  return null;
}

export function documentoValido(doc: string): boolean {
  const t = tipoDoDocumento(doc);
  if (t === 'CPF') return cpfValido(doc);
  if (t === 'CNPJ') return cnpjValido(doc);
  return false;
}

export function formatarDocumento(doc: string | null | undefined): string {
  const d = somenteDigitos(doc);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return doc && doc.trim() !== '' ? doc : '—';
}

/** Mascara CPF de cliente em listas: ***.456.789-** */
export function mascararCpf(doc: string | null | undefined): string {
  const d = somenteDigitos(doc);
  if (d.length !== 11) return formatarDocumento(doc);
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}
