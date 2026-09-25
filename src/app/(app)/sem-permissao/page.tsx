import { Pagina, EstadoVazio } from '@/ui/base';

export default function SemPermissao() {
  return (
    <Pagina titulo="Sem permissão" descricao="Seu perfil não tem acesso a esta área. O padrão do sistema é negar: acesso só existe quando está na matriz de permissões.">
      <div className="cartao"><EstadoVazio titulo="Acesso não permitido" icone="cadeado">Se você precisa desta área, peça ao administrador para revisar o seu perfil em Acessos.</EstadoVazio></div>
    </Pagina>
  );
}
