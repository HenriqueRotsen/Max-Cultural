import type { FormularioCampoDraft } from "@/lib/formularios/types";

export type FormularioModeloSeed = {
  tipo: "INSCRICAO" | "AVALIACAO";
  nome: string;
  tituloDefault: string;
  descricaoDefault: string;
  mensagemConfirmacao: string;
  capaUrlDefault: string;
  campos: FormularioCampoDraft[];
};

/** Template padrão de inscrição (campos SIGA de pessoa + seções). */
export function defaultInscricaoCampos(): FormularioCampoDraft[] {
  const rows: Array<Omit<FormularioCampoDraft, "ordem">> = [
    {
      rotulo: "Informações pessoais",
      descricao:
        "Preencha com atenção. Queremos conhecer um pouco sobre você.",
      obrigatorio: false,
      tipo: "SECTION",
      sigaColumn: null,
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Nome completo ou nome social",
      descricao:
        "ATENÇÃO SOBRE NOME SOCIAL: em conformidade com o Decreto Federal 8.727/2016. Não confundir com Nome Artístico.",
      obrigatorio: true,
      tipo: "NAME",
      sigaColumn: "Nome",
      opcoes: null,
      config: null,
    },
    {
      rotulo: "CPF",
      descricao:
        "Escreva somente os 11 números do seu CPF (inclusive os zeros), sem ponto e traço.",
      obrigatorio: true,
      tipo: "CPF",
      sigaColumn: "CPF",
      opcoes: null,
      config: null,
    },
    {
      rotulo: "E-mail",
      descricao: "",
      obrigatorio: true,
      tipo: "EMAIL",
      sigaColumn: "E-mail",
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Telefone celular / WhatsApp",
      descricao: "",
      obrigatorio: true,
      tipo: "PHONE_BR",
      sigaColumn: "Telefone",
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Data de nascimento",
      descricao: "",
      obrigatorio: true,
      tipo: "BIRTHDATE",
      sigaColumn: "Data_nascimento",
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Qual o seu gênero?",
      descricao: "",
      obrigatorio: true,
      tipo: "GENERO",
      sigaColumn: "Genero",
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Sobre cor/etnia, como você se autodeclara?",
      descricao: "",
      obrigatorio: true,
      tipo: "ETNIA",
      sigaColumn: "Etnia",
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Você é uma pessoa com deficiência?",
      descricao:
        "Podemos disponibilizar recursos de acessibilidade. Caso responda sim, descreva a necessidade.",
      obrigatorio: true,
      tipo: "SIM_NAO_DETALHE",
      sigaColumn: "Possui_deficiencia",
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Você possui alguma restrição alimentar?",
      descricao: 'Escreva "Não" ou "Sim, e descreva qual é a sua restrição alimentar".',
      obrigatorio: true,
      tipo: "SIM_NAO_DETALHE",
      sigaColumn: "RestricaoAlimentar",
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Redes sociais",
      descricao: "Instagram, Facebook — informe o @ ou link.",
      obrigatorio: false,
      tipo: "SHORT_TEXT",
      sigaColumn: "Redesocial",
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Escolaridade",
      descricao: "",
      obrigatorio: false,
      tipo: "DROPDOWN",
      sigaColumn: "Escolaridade",
      opcoes: [
        "Somente alfabetizado",
        "Ensino fundamental",
        "Ensino médio",
        "Curso técnico",
        "Superior graduação",
        "Especialização de nível superior",
        "Mestrado",
        "Doutorado",
      ],
      config: null,
    },
    {
      rotulo: "Endereço",
      descricao: "Informe o CEP para preencher automaticamente os demais campos.",
      obrigatorio: true,
      tipo: "ADDRESS_BR",
      sigaColumn: null,
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Território / comunidade",
      descricao: "Opcional — quilombo, assentamento, regional, etc.",
      obrigatorio: false,
      tipo: "SHORT_TEXT",
      sigaColumn: "Territorio",
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Como ficou sabendo do curso?",
      descricao: "",
      obrigatorio: false,
      tipo: "CHECKBOXES",
      sigaColumn: "Ficousabendo",
      opcoes: [
        "Amigos/familiares",
        "Carro de som",
        "Instituição de ensino",
        "Instituição de trabalho",
        "Jornais/revistas",
        "Rádio",
        "Rede social: Facebook",
        "Rede social: Instagram",
        "Rede social: WhatsApp",
        "Televisão",
        "Outros",
      ],
      config: null,
    },
    {
      rotulo: "Declarações e conformidade",
      descricao: "",
      obrigatorio: false,
      tipo: "SECTION",
      sigaColumn: null,
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Impedimentos de vínculo",
      descricao:
        "DECLARO QUE: NÃO SOU prestador de serviço / empregado(a) / funcionário(a) da realizadora do projeto, nem cônjuge ou parente em até segundo grau das situações citadas.",
      obrigatorio: true,
      tipo: "DECLARACAO",
      sigaColumn: null,
      opcoes: null,
      config: { checkboxLabel: "Declaro o cumprimento deste requisito." },
    },
    {
      rotulo: "Direitos autorais e de imagem/voz",
      descricao:
        "AUTORIZO, de forma gratuita e por prazo indeterminado, o uso de imagem, voz e dados pessoais captados durante as atividades, em conformidade com o Código Civil e a LGPD.",
      obrigatorio: true,
      tipo: "DECLARACAO",
      sigaColumn: null,
      opcoes: null,
      config: { checkboxLabel: "Declaro o cumprimento deste requisito." },
    },
  ];

  return rows.map((r, i) => ({ ...r, ordem: i }));
}

/** Template padrão de avaliação pós-oficina. */
export function defaultAvaliacaoCampos(): FormularioCampoDraft[] {
  const rows: Array<Omit<FormularioCampoDraft, "ordem">> = [
    {
      rotulo: "Identificação",
      descricao:
        "Precisamos do seu CPF para localizar sua inscrição nesta oficina.",
      obrigatorio: false,
      tipo: "SECTION",
      sigaColumn: null,
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Nome completo ou nome social",
      descricao: "",
      obrigatorio: true,
      tipo: "NAME",
      sigaColumn: "Nome",
      opcoes: null,
      config: null,
    },
    {
      rotulo: "CPF",
      descricao: "Somente os 11 dígitos, sem ponto e traço.",
      obrigatorio: true,
      tipo: "CPF",
      sigaColumn: "CPF",
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Sobre a oficina",
      descricao: "Conte como foi sua experiência.",
      obrigatorio: false,
      tipo: "SECTION",
      sigaColumn: null,
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Como você avalia a oficina no geral?",
      descricao: "",
      obrigatorio: true,
      tipo: "MULTIPLE_CHOICE",
      sigaColumn: null,
      opcoes: ["Excelente", "Boa", "Regular", "Ruim"],
      config: null,
    },
    {
      rotulo: "O conteúdo atendeu às suas expectativas?",
      descricao: "",
      obrigatorio: true,
      tipo: "MULTIPLE_CHOICE",
      sigaColumn: null,
      opcoes: ["Sim, totalmente", "Em parte", "Não"],
      config: null,
    },
    {
      rotulo: "Como você avalia a facilitação / professor(a)?",
      descricao: "",
      obrigatorio: true,
      tipo: "MULTIPLE_CHOICE",
      sigaColumn: null,
      opcoes: ["Excelente", "Boa", "Regular", "Ruim"],
      config: null,
    },
    {
      rotulo: "O que mais gostou?",
      descricao: "",
      obrigatorio: false,
      tipo: "LONG_TEXT",
      sigaColumn: null,
      opcoes: null,
      config: null,
    },
    {
      rotulo: "O que poderia melhorar?",
      descricao: "",
      obrigatorio: false,
      tipo: "LONG_TEXT",
      sigaColumn: null,
      opcoes: null,
      config: null,
    },
    {
      rotulo: "Recomendaria esta oficina a outras pessoas?",
      descricao: "",
      obrigatorio: true,
      tipo: "MULTIPLE_CHOICE",
      sigaColumn: null,
      opcoes: ["Sim", "Talvez", "Não"],
      config: null,
    },
    {
      rotulo: "Autorização de uso de depoimento",
      descricao:
        "AUTORIZO o uso do meu depoimento (texto) para divulgação institucional do projeto, em conformidade com a LGPD.",
      obrigatorio: true,
      tipo: "DECLARACAO",
      sigaColumn: null,
      opcoes: null,
      config: { checkboxLabel: "Declaro o cumprimento deste requisito." },
    },
  ];

  return rows.map((r, i) => ({ ...r, ordem: i }));
}

export function defaultFormularioModelos(): FormularioModeloSeed[] {
  return [
    {
      tipo: "INSCRICAO",
      nome: "Inscrição",
      tituloDefault: "Inscrição na oficina",
      descricaoDefault:
        "Preencha com atenção. Queremos conhecer um pouco sobre você.",
      mensagemConfirmacao:
        "Inscrição enviada com sucesso. Aguarde o contato da equipe.",
      capaUrlDefault: "",
      campos: defaultInscricaoCampos(),
    },
    {
      tipo: "AVALIACAO",
      nome: "Avaliação",
      tituloDefault: "Avaliação da oficina",
      descricaoDefault:
        "Sua opinião é muito importante para aprimorarmos as próximas edições.",
      mensagemConfirmacao:
        "Avaliação enviada. Obrigado por participar e contribuir!",
      capaUrlDefault: "",
      campos: defaultAvaliacaoCampos(),
    },
  ];
}
