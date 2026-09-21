export function legacyLoginDestination(params: Record<string, string | string[] | undefined>) {
  const role = params.role === 'doctor' || params.role === 'admin' ? params.role : 'patient';
  const lang = params.lang;
  const language = lang === 'en' || lang === 'es' || lang === 'pt' ? lang : null;
  return role === 'patient'
    ? `/?login=patient${language ? `&lang=${language}` : ''}`
    : `/login/${role}${language ? `?lang=${language}` : ''}`;
}
