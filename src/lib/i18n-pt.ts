/** Brazilian Portuguese for the public landing, waitlist and entry points. */
export const publicPortuguese = {
  nav: {
    problem: 'Problema', solution: 'Solução', how: 'Como funciona', roadmap: 'Roadmap',
    legal: 'Jurídico', traction: 'Resultados', verify: 'Verificar', cta: 'Entrar na lista',
    demoPatient: 'Demo do paciente', demoDoctor: 'Demo do médico', pharmacy: 'Portal da farmácia',
  },
  hero: {
    badge: 'Histórico clínico digital', title: 'Seu histórico clínico completo,', titleAccent: 'nas suas mãos.',
    subtitle: 'A TrustLeaf leva seu histórico clínico à blockchain — verificável, portátil e sob seu controle. Chega de perder registros ao trocar de médico.',
    cta: 'Entrar na lista de espera', secondary: 'Veja como funciona',
    card: { name: 'Ana García', badge: 'Prontuário verificado', issued: 'Histórico clínico completo', hash: '0x7f3a...c891', network: 'Stellar' },
  },
  problem: {
    kicker: 'O problema', title: 'Seu histórico médico está espalhado por toda parte',
    subtitle: 'Sua história de saúde está dividida entre clínicas que não se comunicam. Quando mais importa, ninguém — nem você — consegue ver o quadro completo.',
    cards: [
      { title: 'Registros fragmentados', stat: '10+', statLabel: 'clínicas que não compartilham seus dados', desc: 'Cada clínica, hospital e aplicativo guarda uma parte do seu histórico. Não há um registro único e completo, nem continuidade no atendimento.' },
      { title: 'Histórico preso', stat: '0', statLabel: 'fronteiras que seus registros atravessam', desc: 'Você troca de médico, muda de cidade ou viaja para outro país e seu histórico fica para trás — preso em um sistema que não pode levar consigo.' },
      { title: 'Não está nas suas mãos', stat: '∞', statLabel: 'etapas para obter seus próprios registros', desc: 'Buscar documentos, ligar para clínicas e esperar semanas pelos seus arquivos. Seus dados de saúde ficam com todos, menos com você.' },
    ],
  },
  solution: {
    kicker: 'A solução', title: 'Um prontuário, sob seu controle',
    subtitle: 'Seu histórico médico na Stellar Soroban — completo, portátil e verificável. Você decide quem pode acessá-lo.',
    steps: [
      { title: 'Os médicos contribuem', desc: 'Cada consulta, receita e resultado é assinado na blockchain e adicionado ao seu prontuário.' },
      { title: 'Ele acompanha você', desc: 'Seu histórico completo no seu bolso — onde quer que esteja, sem taxas.' },
      { title: 'Você autoriza o acesso', desc: 'Um médico pode consultar seu histórico verificado em segundos — somente com sua autorização.' },
    ],
  },
  how: {
    kicker: 'Como funciona', title: 'Seu prontuário, onde você for atendido', subtitle: 'Sem precisar entender de cripto — para você e seus médicos.',
    steps: [
      { step: '01', title: 'Seu prontuário é construído', desc: 'Os médicos assinam cada consulta e receita com uma passkey biométrica. O registro é adicionado ao seu histórico na Soroban.' },
      { step: '02', title: 'Ele fica com você', desc: 'Sem precisar de cripto. Seu prontuário fica na sua carteira, sem taxas, com um relayer que patrocina cada transação.' },
      { step: '03', title: 'Você compartilha nos seus termos', desc: 'Autorize o acesso de médicos ou farmácias com uma leitura. Eles consultam um histórico verificável; você mantém o controle.' },
    ],
  },
  audience: {
    kicker: 'Para todos os envolvidos', title: 'Seu prontuário. Todos na mesma página.',
    doctors: { title: 'Para médicos', points: [
      'Consulte o histórico completo e verificado do paciente — com seu consentimento.',
      'Assine consultas e receitas com uma passkey biométrica — sem frases de recuperação.',
      'Contribua para um registro permanente e auditável vinculado ao seu registro profissional.',
      'Chega de buscar documentos e reconstruir prontuários fragmentados.',
    ] },
    patients: { title: 'Para pacientes', points: [
      'Tenha controle sobre seu histórico médico completo — ele acompanha você.',
      'Troque de médico, cidade ou país; seu prontuário vai junto.',
      'Conceda e revogue o acesso — ninguém consulta seu histórico sem você.',
      'Sem configurar carteiras, sem jargão cripto e sem taxas.',
    ] },
  },
  roadmap: {
    kicker: 'Roadmap', title: 'De receitas verificáveis ao seu histórico completo',
    phases: [
      { phase: 'Fase 0', title: 'Receitas verificáveis', desc: 'Receitas vinculadas ao paciente, emitidas por médicos autorizados e registradas na blockchain.', status: 'Em andamento' },
      { phase: 'Fase 1', title: 'Seu prontuário', desc: 'Seu histórico médico completo baseado em FHIR — portátil e sob seu controle.', status: 'A seguir' },
      { phase: 'Fase 2', title: 'Agente de saúde com IA', desc: 'Um assistente privado que utiliza seu histórico verificado.', status: 'Planejado' },
      { phase: 'Fase 3', title: 'Ecossistema e integrações', desc: 'Clínicas, farmácias, laboratórios e seguradoras conectados ao seu prontuário.', status: 'Planejado' },
    ],
  },
  waitlist: {
    kicker: 'Acesso antecipado', title: 'Assuma o controle da sua saúde',
    subtitle: 'Entre na lista de espera para acompanhar um prontuário completo, portátil e sob seu controle.',
    placeholder: 'voce@email.com', cta: 'Entrar na lista', success: 'Você está na lista. Entraremos em contato.',
    invalid: 'Digite um endereço de e-mail válido.', socialProof: 'Junte-se a {count} médicos e pacientes na lista.',
  },
  footer: {
    tagline: 'Construído na Stellar Soroban', built: 'Construído na Stellar Soroban', rights: 'Todos os direitos reservados.',
    columns: {
      product: { title: 'Produto', links: ['Problema', 'Solução', 'Como funciona', 'Roadmap', 'Verificar'] },
      company: { title: 'Empresa', links: ['Sobre', 'Contato', 'Trabalhe conosco'] },
      legal: { title: 'Jurídico', links: ['Privacidade', 'Termos', 'Segurança'] },
    },
  },
} as const;
