export function legacyLoginDestination(params: Record<string, string | string[] | undefined>) {
  const role = params.role === 'doctor' || params.role === 'admin' ? params.role : 'patient';
  const lang = params.lang;
  return `/login/${role}${lang === 'en' || lang === 'es' || lang === 'pt' ? `?lang=${lang}` : ''}`;
}
