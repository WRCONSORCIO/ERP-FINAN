import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Cria o PRIMEIRO administrador (implantação). Sem senha padrão: exige ADMIN_EMAIL, ADMIN_NOME e ADMIN_SENHA.
 *   ADMIN_EMAIL=... ADMIN_NOME="..." ADMIN_SENHA="..." npm run db:criar-admin
 * Recusa se já houver administrador ativo — a partir daí, acessos são criados na tela Acessos.
 */
const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const nome = process.env.ADMIN_NOME?.trim();
  const senha = process.env.ADMIN_SENHA ?? '';
  if (!email || !nome) throw new Error('Informe ADMIN_EMAIL e ADMIN_NOME.');
  if (senha.length < 10) throw new Error('ADMIN_SENHA precisa de pelo menos 10 caracteres.');
  if (await prisma.usuario.count({ where: { perfil: 'ADMINISTRADOR', ativo: true } })) {
    throw new Error('Já existe administrador ativo. Crie novos acessos pela tela Acessos.');
  }
  const u = await prisma.usuario.create({ data: { email, nome, perfil: 'ADMINISTRADOR', senhaHash: await bcrypt.hash(senha, 12) } });
  await prisma.auditLog.create({ data: { acao: 'CRIACAO', entidade: 'Usuario', entidadeId: u.id, email, contexto: { origem: 'script criar-admin (implantação)' } } });
  console.log(`Administrador criado: ${email}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
