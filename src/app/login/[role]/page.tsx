import { notFound, redirect } from 'next/navigation';
import { legacyLoginDestination } from '@/lib/auth/login-route';
import RoleLogin from '@/components/auth/RoleLogin';

export default async function LoginPage({ params, searchParams }: {
  params: Promise<{ role: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { role } = await params;
  if (role !== 'patient' && role !== 'doctor' && role !== 'admin') notFound();
  if (role === 'patient') redirect(legacyLoginDestination({ ...(await searchParams), role }));
  return <RoleLogin activeRole={role} />;
}
