import { FormularioAcao } from '@/ui/formulario-acao';
import { decidirConferenciaAcao } from './acoes';

/** Pagar / Não pagar uma parcela que a WR não recebe da administradora (ex.: 2ª do Iniciante). */
export function DecidirConferencia({ cotaId, parcela }: { cotaId: string; parcela: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      <FormularioAcao acao={decidirConferenciaAcao} rotulo="Pagar" emLinha confirmacao={`Libera a comissão da ${parcela}ª parcela para a próxima folha. Fica registrado quem decidiu e por quê.`}>
        <input type="hidden" name="cotaId" value={cotaId} /><input type="hidden" name="parcela" value={parcela} /><input type="hidden" name="decisao" value="PAGAR" />
        <input name="motivo" aria-label="Motivo" placeholder="Motivo (ex.: cliente pagou a 2ª)" className="campo w-52" required />
      </FormularioAcao>
      <FormularioAcao acao={decidirConferenciaAcao} rotulo="Não pagar" emLinha confirmacao={`A comissão da ${parcela}ª parcela deste vendedor não será paga. Fica registrado quem decidiu e por quê.`}>
        <input type="hidden" name="cotaId" value={cotaId} /><input type="hidden" name="parcela" value={parcela} /><input type="hidden" name="decisao" value="NAO_PAGAR" />
        <input name="motivo" aria-label="Motivo" placeholder="Por que não pagar" className="campo w-52" required />
      </FormularioAcao>
      <FormularioAcao acao={decidirConferenciaAcao} rotulo="Ainda não pagou" emLinha confirmacao="Sai da lista agora e volta sozinho quando a base mostrar mais uma parcela paga pelo cliente (ex.: foi antecipação, não a parcela da sequência).">
        <input type="hidden" name="cotaId" value={cotaId} /><input type="hidden" name="parcela" value={parcela} /><input type="hidden" name="decisao" value="AGUARDAR" />
        <input name="motivo" aria-label="Motivo" placeholder="Ex.: foi antecipação" defaultValue="Ainda não pagou a parcela da sequência" className="campo w-52" required />
      </FormularioAcao>
    </div>
  );
}
