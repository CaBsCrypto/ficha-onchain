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
    "kicker": "Nossa visão",
    "title": "Um prontuário, sob seu controle",
    "subtitle": "Estamos construindo um histórico conectado, com acesso privado e registros verificáveis. Hoje, começamos pelas receitas na Stellar Testnet.",
    "steps": [
      {
        "title": "Atendimento conectado",
        "desc": "Queremos reunir consultas, receitas e resultados em um mesmo histórico."
      },
      {
        "title": "Um histórico que acompanha você",
        "desc": "Buscamos continuidade no atendimento entre profissionais e lugares."
      },
      {
        "title": "Acesso sob seu controle",
        "desc": "A autorização do paciente está no centro dessa visão."
      }
    ]
  },
  how: {
    "kicker": "Hoje · Demo na Stellar Testnet",
    "title": "Uma receita privada, um registro verificável",
    "subtitle": "Dados sintéticos · Sem uso clínico. Entre com Privy; a TrustLeaf cobre as taxas da Testnet.",
    "steps": [
      {
        "step": "01",
        "title": "O paciente autoriza",
        "desc": "O paciente autoriza a emissão da receita, separadamente da confirmação de presença."
      },
      {
        "step": "02",
        "title": "O médico emite",
        "desc": "Um médico autorizado assina a emissão e a ativação. Cada transação confirmada tem seu comprovante."
      },
      {
        "step": "03",
        "title": "Leitura privada e registro verificável",
        "desc": "O paciente e o médico emissor abrem o documento privado. Os comprovantes podem ser consultados no Stellar Expert."
      }
    ]
  },
  audience: {
    "kicker": "Aonde queremos chegar",
    "title": "Mais continuidade para pacientes e médicos",
    "doctors": {
      "title": "Para médicos",
      "points": [
        "Reunir informações relevantes com autorização do paciente.",
        "Reduzir o tempo gasto reconstruindo históricos fragmentados.",
        "Hoje: testar o fluxo de receitas com dados sintéticos."
      ]
    },
    "patients": {
      "title": "Para pacientes",
      "points": [
        "Levar seu histórico entre diferentes serviços de saúde.",
        "Decidir quem pode acessar suas informações.",
        "Hoje: autorizar a emissão e ler suas receitas privadas de demonstração."
      ]
    }
  },
  roadmap: {
    "kicker": "Roadmap",
    "title": "De receitas a um histórico conectado",
    "phases": [
      {
        "phase": "Hoje",
        "title": "Receitas verificáveis",
        "desc": "Emissão, ativação e revogação com documentos privados e comprovantes na Stellar Testnet.",
        "status": "Demo"
      },
      {
        "phase": "Próximas etapas",
        "title": "Seu prontuário",
        "desc": "Explorar um histórico portátil baseado em FHIR. Escopo e validação ainda serão definidos.",
        "status": "Proposta"
      },
      {
        "phase": "Visão futura",
        "title": "Assistente de saúde com IA",
        "desc": "Explorar um assistente privado baseado em informações de saúde autorizadas.",
        "status": "Exploração"
      },
      {
        "phase": "Visão futura",
        "title": "Ecossistema conectado",
        "desc": "Explorar integrações com clínicas, farmácias e laboratórios.",
        "status": "Exploração"
      }
    ]
  },
  waitlist: {
    kicker: 'Acesso antecipado', title: 'Assuma o controle da sua saúde',
    subtitle: 'Entre na lista de espera para acompanhar um prontuário completo, portátil e sob seu controle.',
    placeholder: 'voce@email.com', cta: 'Entrar na lista', success: 'Você está na lista. Entraremos em contato.',
    invalid: 'Digite um endereço de e-mail válido.', socialProof: 'Junte-se a {count} médicos e pacientes na lista.',
  },
  footer: {
    "tagline": "Construído na Stellar Soroban",
    "built": "Construído na Stellar Soroban",
    "rights": "Todos os direitos reservados.",
    "columns": {
      "product": {
        "title": "Explorar",
        "links": [
          {
            "label": "Problema",
            "href": "#problem"
          },
          {
            "label": "Nossa visão",
            "href": "#solution"
          },
          {
            "label": "Como funciona",
            "href": "#how"
          },
          {
            "label": "Roadmap",
            "href": "#roadmap"
          }
        ]
      },
      "legal": {
        "title": "Vamos manter contato",
        "links": [
          {
            "label": "Lista de interesse",
            "href": "#waitlist"
          },
          {
            "label": "Privacidade do registro de interesse",
            "href": "#waitlist"
          }
        ]
      }
    }
  },
} as const;
