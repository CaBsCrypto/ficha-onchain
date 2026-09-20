import { notFound } from 'next/navigation';
import RoleLogin from '@/components/auth/RoleLogin';

export default async function LoginPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== 'patient' && role !== 'doctor' && role !== 'admin') notFound();
  return <RoleLogin activeRole={role} />;
}
