import { redirect } from 'next/navigation';
import { legacyLoginDestination } from '@/lib/auth/login-route';
export default async function LoginPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyLoginDestination(await searchParams));
}
