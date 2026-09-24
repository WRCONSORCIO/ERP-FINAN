import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ROTULO_PERFIL } from '@/lib/permissoes';
import { obterSessao } from '@/servidor/sessao';
import { Campo, Pagina, Secao } from '@/ui/base';
import { FormularioAcao } from '@/ui/formulario-acao';
import { trocarMinhaSenhaAcao } from './acoes';

export const metadata: Metadata = { title: 'Minha conta' };
export const dynamic = 'force-dynamic';

export default async function MinhaConta() {
  const s = await obterSessao();
  if (!s) redirect('/login');
  return (
    <Pagina titulo="Minha conta" descricao={`${s.nome} · ${s.email} · ${ROTULO_PERFIL[s.perfil]}`}>
      <Secao titulo="Trocar senha" descricao="Troque a senha provisória entregue pelo administrador. Mínimo de 10 caracteres.">
        <FormularioAcao acao={trocarMinhaSenhaAcao} rotulo="Trocar senha">
          <div className="grid max-w-3xl gap-2 sm:grid-cols-3">
            <Campo rotulo="Senha atual" nome="atual"><input id="atual" name="atual" type="password" autoComplete="current-password" className="campo" required /></Campo>
            <Campo rotulo="Nova senha" nome="nova"><input id="nova" name="nova" type="password" autoComplete="new-password" minLength={10} className="campo" required /></Campo>
            <Campo rotulo="Confirmação" nome="confirmacao"><input id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" minLength={10} className="campo" required /></Campo>
          </div>
        </FormularioAcao>
      </Secao>
    </Pagina>
  );
}
