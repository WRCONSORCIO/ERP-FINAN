import { z } from 'zod';
import { deISO } from '@/lib/datas';
import { lerMoedaTexto, paraTexto } from '@/lib/dinheiro';

/** Campos comuns de formulário. Valores monetários chegam como TEXTO e viram Decimal — nunca number. */
export const zId = z.string().trim().min(1, 'Obrigatório').max(64);
export const zIdOpcional = z.string().trim().max(64).optional().transform((v) => (v ? v : null));
export const zTexto = (max = 200) => z.string().trim().min(1, 'Obrigatório').max(max);
export const zTextoOpcional = (max = 500) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
export const zMotivo = z.string().trim().min(3, 'Explique o motivo (mínimo 3 caracteres)').max(500);

export const zData = z
  .string()
  .trim()
  .refine((s) => deISO(s) !== null, 'Data inválida')
  .transform((s) => deISO(s) as Date);

export const zDataOpcional = z
  .string()
  .trim()
  .optional()
  .refine((s) => !s || deISO(s) !== null, 'Data inválida')
  .transform((s) => (s ? (deISO(s) as Date) : null));

/** Valor em reais digitado ("1.234,56" ou "1234.56") → texto decimal com 2 casas. */
export const zMoeda = z
  .string()
  .trim()
  .refine((s) => lerMoedaTexto(s) !== null, 'Valor inválido')
  .transform((s) => paraTexto((lerMoedaTexto(s) as NonNullable<ReturnType<typeof lerMoedaTexto>>).toDecimalPlaces(2)));

/** Percentual em pontos ("0,5" = 0,5%) → texto decimal com até 4 casas, 0..100. */
export const zPercentual = z
  .string()
  .trim()
  .transform((s) => lerMoedaTexto(s.replace('%', '')))
  .refine((d) => d !== null && !d.isNegative() && d.lte(100), 'Percentual entre 0 e 100')
  .transform((d) => paraTexto((d as NonNullable<typeof d>).toDecimalPlaces(4)));

export const zBooleano = z
  .union([z.literal('on'), z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0'), z.boolean()])
  .optional()
  .transform((v) => v === true || v === 'on' || v === 'true' || v === '1');
