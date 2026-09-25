import { describe, expect, it } from 'vitest';
import { deBR, deISO, deslocarCompetencia, formatarData, periodoDoMes, periodoDosParametros, rotuloMesCurto, vigenteEm } from '@/lib/datas';
import { cnpjValido, cpfValido, formatarDocumento, mascararCpf, tipoDoDocumento } from '@/lib/documento';
import { iniciais, normalizarNome, ouTraco } from '@/lib/texto';

describe('datas', () => {
  it('lê datas brasileiras e recusa inválidas', () => {
    expect(formatarData(deBR('23/02/2026'))).toBe('23/02/2026');
    expect(deBR('31/02/2026')).toBeNull();
    expect(deISO('2026-13-01')).toBeNull();
    expect(formatarData(deBR('01/09/26'))).toBe('01/09/2026');
  });
  it('vigência inclusiva, fim nulo = aberta', () => {
    const de = deISO('2026-09-01') as Date;
    expect(vigenteEm(deISO('2026-09-01') as Date, de, null)).toBe(true);
    expect(vigenteEm(deISO('2026-08-31') as Date, de, null)).toBe(false);
    expect(vigenteEm(deISO('2026-09-30') as Date, de, deISO('2026-09-30'))).toBe(true);
    expect(vigenteEm(deISO('2026-10-01') as Date, de, deISO('2026-09-30'))).toBe(false);
  });
  it('competência e período', () => {
    const p = periodoDoMes('2026-02');
    expect(p && formatarData(p.ate)).toBe('28/02/2026');
    expect(deslocarCompetencia('2026-01', -1)).toBe('2025-12');
    expect(deslocarCompetencia('2025-12', 12)).toBe('2026-12');
    expect(rotuloMesCurto('2026-09')).toBe('Set/26');
    const livre = periodoDosParametros({ de: '2026-03-15', ate: '2026-06-30' });
    expect(livre.competencia).toBeNull();
    expect(periodoDosParametros({ mes: '2026-09' }).competencia).toBe('2026-09');
  });
});

describe('documentos', () => {
  it('valida CPF e CNPJ pelos dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(tipoDoDocumento('11222333000181')).toBe('CNPJ');
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25');
    expect(mascararCpf('52998224725')).toBe('***.982.247-**');
  });
});

describe('texto', () => {
  it('normaliza apenas acento, caixa e espaço duplo', () => {
    expect(normalizarNome('  José  da   Silva ')).toBe('JOSE DA SILVA');
    expect(normalizarNome('Érica Márcia')).toBe('ERICA MARCIA');
  });
  it('monograma ignora conectivos e números iniciais', () => {
    expect(iniciais('63.893.682 LUCIANA RIBEIRO')).toBe('LR');
    expect(iniciais('Verena da Silva de Oliveira')).toBe('VO');
    expect(iniciais('')).toBe('?');
  });
  it('nunca renderiza null/undefined/NaN', () => {
    expect(ouTraco(null)).toBe('—');
    expect(ouTraco('undefined')).toBe('—');
    expect(ouTraco(Number.NaN)).toBe('—');
  });
});
