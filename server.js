/**
 * ===== SERVIDOR BACKEND PARA FORMULÁRIO DE CONSULTORIA =====
 * 
 * Este servidor Node.js processa o formulário de consultoria,
 * recebe arquivos PDF e envia emails com os dados e anexos.
 * 
 * Funcionalidades:
 * - Recebe dados do formulário via POST
 * - Processa upload de arquivos PDF
 * - Envia email com dados e anexos
 * - Validação de dados e arquivos
 * - CORS habilitado para frontend
 */
// ===== IMPORTAÇÕES =====
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');

// ===== SISTEMA DE LINKS TEMPORÁRIOS =====
/**
 * Armazena informações dos links temporários de download
 * Estrutura: { linkId: { files, createdAt, downloads, maxDownloads, expiresAt } }
 */
const tempLinks = new Map();

/**
 * Gera um link temporário único para download de arquivos
 */
function generateTempLink(files, maxDownloads = 5, expirationHours = 48) {
    const linkId = crypto.randomBytes(8).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + (expirationHours * 60 * 60 * 1000));
    
    tempLinks.set(linkId, {
        files: files || [],
        createdAt: new Date(),
        downloads: 0,
        maxDownloads,
        expiresAt,
        active: true
    });
    
    console.log(`Link temporário criado: ${linkId} - Expira em: ${expiresAt.toLocaleString('pt-BR')}`);
    return linkId;
}

/**
 * Valida se um link temporário ainda é válido
 */
function validateTempLink(linkId) {
    const link = tempLinks.get(linkId);
    
    if (!link) {
        return { valid: false, reason: 'Link não encontrado' };
    }
    
    if (!link.active) {
        return { valid: false, reason: 'Link desativado' };
    }
    
    if (new Date() > link.expiresAt) {
        link.active = false;
        return { valid: false, reason: 'Link expirado' };
    }
    
    if (link.downloads >= link.maxDownloads) {
        link.active = false;
        return { valid: false, reason: 'Limite de downloads atingido' };
    }
    
    return { valid: true, link };
}

/**
 * Incrementa contador de downloads de um link
 */
function incrementDownload(linkId) {
    const link = tempLinks.get(linkId);
    if (link) {
        link.downloads++;
        console.log(`Download ${link.downloads}/${link.maxDownloads} para link ${linkId}`);
    }
}

/**
 * Limpa links expirados automaticamente
 */
function cleanupExpiredLinks() {
    const now = new Date();
    let cleaned = 0;
    
    for (const [linkId, link] of tempLinks.entries()) {
        if (now > link.expiresAt || !link.active) {
            // Remove arquivos físicos se ainda existirem
            if (link.files && Array.isArray(link.files)) {
                link.files.forEach(file => {
                    if (file.path && fs.existsSync(file.path)) {
                        try {
                            fs.unlinkSync(file.path);
                            console.log(`Arquivo removido: ${file.path}`);
                        } catch (error) {
                            console.error(`Erro ao remover arquivo ${file.path}:`, error.message);
                        }
                    }
                });
            }
            
            tempLinks.delete(linkId);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`${cleaned} links temporários expirados foram removidos`);
    }
}

// Executa limpeza de links expirados a cada hora
setInterval(cleanupExpiredLinks, 60 * 60 * 1000);

// ===== FUNÇÃO DE CONSULTA CNPJ =====
/**
 * Consulta dados oficiais do CNPJ usando múltiplas APIs
 * Prioriza APIs oficiais e usa fallbacks para garantir dados fidedignos
 */
async function consultarCNPJ(cnpj) {
    // Remove formatação do CNPJ (pontos, barras, hífens)
    const cnpjLimpo = cnpj.replace(/[^\d]/g, '');
    
    console.log(`Consultando CNPJ: ${cnpjLimpo}`);
    
    // Validação básica do CNPJ
    if (cnpjLimpo.length !== 14) {
        return {
            success: false,
            error: 'CNPJ deve ter 14 dígitos',
            source: 'validacao'
        };
    }
    
    const apis = [
        {
            name: 'BrasilAPI',
            url: `https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`,
            official: true
        },
        {
            name: 'ReceitaWS',
            url: `https://www.receitaws.com.br/v1/cnpj/${cnpjLimpo}`,
            official: false
        },
        {
            name: 'CNPJ.ws',
            url: `https://cnpj.ws/cnpj/${cnpjLimpo}`,
            official: false
        }
    ];
    
    for (const api of apis) {
        try {
            console.log(`Tentando API: ${api.name}`);
            
            const response = await fetch(api.url, {
                method: 'GET',
                headers: {
                    'User-Agent': 'AporteCapital/1.0',
                    'Accept': 'application/json'
                },
                timeout: 10000 // 10 segundos
            });
            
            if (!response.ok) {
                console.log(`API ${api.name} retornou status: ${response.status}`);
                continue;
            }
            
            const data = await response.json();
            
            // Verifica se retornou dados válidos
            if (!data || (data.status && data.status === 'ERROR')) {
                console.log(`API ${api.name} retornou erro:`, data);
                continue;
            }
            
            // Normaliza os dados independente da API
            const dadosNormalizados = normalizarDadosCNPJ(data, api.name);
            
            if (dadosNormalizados.success) {
                console.log(`Dados obtidos com sucesso via ${api.name}`);
                return {
                    ...dadosNormalizados,
                    source: api.name,
                    official: api.official,
                    consultedAt: new Date().toISOString()
                };
            }
            
        } catch (error) {
            console.log(`Erro na API ${api.name}:`, error.message);
            continue;
        }
    }
    
    // Se chegou aqui, nenhuma API funcionou
    return {
        success: false,
        error: 'Não foi possível consultar o CNPJ no momento. Todas as APIs estão indisponíveis.',
        source: 'todas_apis_falharam',
        consultedAt: new Date().toISOString()
    };
}

/**
 * Normaliza dados de diferentes APIs para um formato padrão
 */
function normalizarDadosCNPJ(data, apiName) {
    try {
        let normalized = {
            success: true,
            cnpj: '',
            razaoSocial: '',
            nomeFantasia: '',
            situacao: '',
            dataSituacao: '',
            motivoSituacao: '',
            dataAbertura: '',
            naturezaJuridica: '',
            porte: '',
            regimeTributario: '',
            capitalSocial: '',
            endereco: {
                logradouro: '',
                numero: '',
                complemento: '',
                bairro: '',
                municipio: '',
                uf: '',
                cep: ''
            },
            telefone: '',
            email: '',
            atividadePrincipal: '',
            atividadesSecundarias: [],
            socios: [],
            dataUltimaAtualizacao: ''
        };
        
        if (apiName === 'BrasilAPI') {
            normalized.cnpj = data.cnpj || '';
            normalized.razaoSocial = data.razao_social || data.company?.name || '';
            normalized.nomeFantasia = data.nome_fantasia || data.alias || '';
            normalized.situacao = data.descricao_situacao_cadastral || data.status || '';
            normalized.dataSituacao = data.data_situacao_cadastral || '';
            normalized.motivoSituacao = data.descricao_motivo_situacao_cadastral || '';
            normalized.dataAbertura = data.data_inicio_atividade || data.founded || '';
            normalized.naturezaJuridica = data.descricao_natureza_juridica || '';
            normalized.porte = data.descricao_porte || data.size || '';
            normalized.capitalSocial = data.capital_social || '';
            
            // Endereço
            normalized.endereco.logradouro = data.logradouro || '';
            normalized.endereco.numero = data.numero || '';
            normalized.endereco.complemento = data.complemento || '';
            normalized.endereco.bairro = data.bairro || '';
            normalized.endereco.municipio = data.municipio || '';
            normalized.endereco.uf = data.uf || '';
            normalized.endereco.cep = data.cep || '';
            
            // Contatos
            normalized.telefone = data.ddd_telefone_1 || '';
            normalized.email = data.email || '';
            
            // Atividades
            if (data.cnae_fiscal_principal) {
                normalized.atividadePrincipal = `${data.cnae_fiscal_principal.codigo} - ${data.cnae_fiscal_principal.descricao}`;
            }
            
            if (data.cnaes_secundarios && Array.isArray(data.cnaes_secundarios)) {
                normalized.atividadesSecundarias = data.cnaes_secundarios.map(cnae => 
                    `${cnae.codigo} - ${cnae.descricao}`
                );
            }
            
            // Sócios
            if (data.qsa && Array.isArray(data.qsa)) {
                normalized.socios = data.qsa.map(socio => ({
                    nome: socio.nome_socio || '',
                    qualificacao: socio.qualificacao_socio || '',
                    dataEntrada: socio.data_entrada_sociedade || ''
                }));
            }
            
        } else if (apiName === 'ReceitaWS') {
            normalized.cnpj = data.cnpj || '';
            normalized.razaoSocial = data.nome || '';
            normalized.nomeFantasia = data.fantasia || '';
            normalized.situacao = data.situacao || '';
            normalized.dataAbertura = data.abertura || '';
            normalized.naturezaJuridica = data.natureza_juridica || '';
            normalized.porte = data.porte || '';
            normalized.capitalSocial = data.capital_social || '';
            
            // Endereço
            normalized.endereco.logradouro = data.logradouro || '';
            normalized.endereco.numero = data.numero || '';
            normalized.endereco.complemento = data.complemento || '';
            normalized.endereco.bairro = data.bairro || '';
            normalized.endereco.municipio = data.municipio || '';
            normalized.endereco.uf = data.uf || '';
            normalized.endereco.cep = data.cep || '';
            
            // Contatos
            normalized.telefone = data.telefone || '';
            normalized.email = data.email || '';
            
            // Atividades
            if (data.atividade_principal && data.atividade_principal.length > 0) {
                const principal = data.atividade_principal[0];
                normalized.atividadePrincipal = `${principal.code} - ${principal.text}`;
            }
            
            if (data.atividades_secundarias && Array.isArray(data.atividades_secundarias)) {
                normalized.atividadesSecundarias = data.atividades_secundarias.map(ativ => 
                    `${ativ.code} - ${ativ.text}`
                );
            }
            
            // Sócios
            if (data.qsa && Array.isArray(data.qsa)) {
                normalized.socios = data.qsa.map(socio => ({
                    nome: socio.nome || '',
                    qualificacao: socio.qual || '',
                    dataEntrada: ''
                }));
            }
        }
        
        // Validação mínima - deve ter pelo menos razão social
        if (!normalized.razaoSocial) {
            return {
                success: false,
                error: 'Dados incompletos retornados pela API'
            };
        }
        
        return normalized;
        
    } catch (error) {
        console.error('Erro ao normalizar dados:', error);
        return {
            success: false,
            error: 'Erro ao processar dados da API'
        };
    }
}

/**
 * Calcula um score estimado baseado em dados públicos do CNPJ
 * @param {Object} dadosCNPJ - Dados normalizados do CNPJ
 * @returns {Object} Score estimado com detalhes
 */
function calcularScoreEstimado(dadosCNPJ) {
    try {
        if (!dadosCNPJ || !dadosCNPJ.success) {
            return {
                score: 0,
                classificacao: 'Indisponível',
                fatores: ['Dados do CNPJ não disponíveis'],
                detalhes: {
                    situacao: 0,
                    tempo_atividade: 0,
                    capital_social: 0,
                    atividade_principal: 0,
                    endereco: 0
                }
            };
        }

        let pontuacao = 0;
        const fatores = [];
        const detalhes = {
            situacao: 0,
            tempo_atividade: 0,
            capital_social: 0,
            atividade_principal: 0,
            endereco: 0
        };

        // 1. Situação Cadastral (peso: 30 pontos)
        if (dadosCNPJ.situacao) {
            const situacao = dadosCNPJ.situacao.toLowerCase();
            if (situacao.includes('ativa')) {
                pontuacao += 30;
                detalhes.situacao = 30;
                fatores.push('✅ Situação cadastral ativa');
            } else if (situacao.includes('suspensa')) {
                pontuacao += 10;
                detalhes.situacao = 10;
                fatores.push('⚠️ Situação cadastral suspensa');
            } else {
                fatores.push('❌ Situação cadastral irregular');
            }
        }

        // 2. Tempo de Atividade (peso: 25 pontos)
        if (dadosCNPJ.dataAbertura) {
            const dataAbertura = new Date(dadosCNPJ.dataAbertura);
            const hoje = new Date();
            const anosAtividade = (hoje - dataAbertura) / (1000 * 60 * 60 * 24 * 365);
            
            if (anosAtividade >= 5) {
                pontuacao += 25;
                detalhes.tempo_atividade = 25;
                fatores.push(`✅ Empresa com ${Math.floor(anosAtividade)} anos de atividade`);
            } else if (anosAtividade >= 2) {
                pontuacao += 15;
                detalhes.tempo_atividade = 15;
                fatores.push(`⚠️ Empresa com ${Math.floor(anosAtividade)} anos de atividade`);
            } else if (anosAtividade >= 1) {
                pontuacao += 8;
                detalhes.tempo_atividade = 8;
                fatores.push(`⚠️ Empresa nova (${Math.floor(anosAtividade)} ano)`);
            } else {
                fatores.push('❌ Empresa muito recente (menos de 1 ano)');
            }
        }

        // 3. Capital Social (peso: 20 pontos)
        if (dadosCNPJ.capitalSocial) {
            const capital = parseFloat(dadosCNPJ.capitalSocial.toString().replace(/[^\d,]/g, '').replace(',', '.'));
            
            if (capital >= 1000000) { // 1 milhão ou mais
                pontuacao += 20;
                detalhes.capital_social = 20;
                fatores.push('✅ Capital social elevado (R$ 1M+)');
            } else if (capital >= 100000) { // 100 mil ou mais
                pontuacao += 15;
                detalhes.capital_social = 15;
                fatores.push('✅ Capital social adequado (R$ 100K+)');
            } else if (capital >= 10000) { // 10 mil ou mais
                pontuacao += 10;
                detalhes.capital_social = 10;
                fatores.push('⚠️ Capital social moderado (R$ 10K+)');
            } else if (capital > 0) {
                pontuacao += 5;
                detalhes.capital_social = 5;
                fatores.push('⚠️ Capital social baixo');
            } else {
                fatores.push('❌ Capital social não informado');
            }
        }

        // 4. Atividade Principal (peso: 15 pontos)
        if (dadosCNPJ.atividadePrincipal) {
            const atividade = dadosCNPJ.atividadePrincipal.toLowerCase();
            
            // Atividades consideradas de baixo risco
            const atividadesBaixoRisco = [
                'consultoria', 'tecnologia', 'software', 'educação', 'saúde',
                'engenharia', 'arquitetura', 'advocacia', 'contabilidade'
            ];
            
            // Atividades consideradas de médio risco
            const atividadesMedioRisco = [
                'comércio', 'varejo', 'atacado', 'indústria', 'construção',
                'transporte', 'logística', 'alimentação'
            ];
            
            if (atividadesBaixoRisco.some(palavra => atividade.includes(palavra))) {
                pontuacao += 15;
                detalhes.atividade_principal = 15;
                fatores.push('✅ Atividade de baixo risco');
            } else if (atividadesMedioRisco.some(palavra => atividade.includes(palavra))) {
                pontuacao += 10;
                detalhes.atividade_principal = 10;
                fatores.push('⚠️ Atividade de médio risco');
            } else {
                pontuacao += 5;
                detalhes.atividade_principal = 5;
                fatores.push('⚠️ Atividade requer análise específica');
            }
        }

        // 5. Endereço Completo (peso: 10 pontos)
        if (dadosCNPJ.endereco && dadosCNPJ.endereco.logradouro && dadosCNPJ.endereco.cep) {
            pontuacao += 10;
            detalhes.endereco = 10;
            fatores.push('✅ Endereço completo informado');
        } else if (dadosCNPJ.endereco && dadosCNPJ.endereco.logradouro) {
            pontuacao += 5;
            detalhes.endereco = 5;
            fatores.push('⚠️ Endereço parcialmente informado');
        } else {
            fatores.push('❌ Endereço incompleto');
        }

        // Determinar classificação
        let classificacao;
        let cor;
        if (pontuacao >= 80) {
            classificacao = 'Excelente';
            cor = '#28a745'; // Verde
        } else if (pontuacao >= 60) {
            classificacao = 'Bom';
            cor = '#17a2b8'; // Azul
        } else if (pontuacao >= 40) {
            classificacao = 'Regular';
            cor = '#ffc107'; // Amarelo
        } else if (pontuacao >= 20) {
            classificacao = 'Baixo';
            cor = '#fd7e14'; // Laranja
        } else {
            classificacao = 'Crítico';
            cor = '#dc3545'; // Vermelho
        }

        return {
            score: pontuacao,
            classificacao,
            cor,
            fatores,
            detalhes,
            recomendacao: gerarRecomendacao(pontuacao, classificacao),
            calculadoEm: new Date().toISOString()
        };

    } catch (error) {
        console.error('Erro ao calcular score:', error);
        return {
            score: 0,
            classificacao: 'Erro',
            fatores: ['Erro no cálculo do score'],
            detalhes: {},
            erro: error.message
        };
    }
}

/**
 * Gera recomendação baseada no score
 * @param {number} pontuacao - Pontuação obtida
 * @param {string} classificacao - Classificação do score
 * @returns {string} Recomendação
 */
function gerarRecomendacao(pontuacao, classificacao) {
    if (pontuacao >= 80) {
        return 'Cliente com excelente perfil. Recomendado para aprovação com condições preferenciais.';
    } else if (pontuacao >= 60) {
        return 'Cliente com bom perfil. Recomendado para aprovação com condições padrão.';
    } else if (pontuacao >= 40) {
        return 'Cliente com perfil regular. Recomenda-se análise adicional e condições restritivas.';
    } else if (pontuacao >= 20) {
        return 'Cliente com perfil de risco. Recomenda-se análise criteriosa e garantias adicionais.';
    } else {
        return 'Cliente com perfil crítico. Não recomendado para aprovação sem análise presencial detalhada.';
    }
}

// ===== CONFIGURAÇÕES =====
const app = express();
const PORT = process.env.PORT || 10000;

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${timestamp}_${originalName}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 5 // Máximo 5 arquivos
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos PDF são permitidos'), false);
        }
    }
});

// ===== MIDDLEWARES =====
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3001', 'http://localhost:3002'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos (para testar o frontend)
app.use(express.static(path.join(__dirname, 'public')));

// ===== CONFIGURAÇÃO DE EMAIL =====
/**
 * Configuração do transporter de email
 * Para usar Gmail:
 * 1. Ative a verificação em duas etapas
 * 2. Gere uma senha de app: https://myaccount.google.com/apppasswords
 * 3. Use a senha de app no lugar da senha normal
 */
const emailConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true para 465, false para outras portas
    auth: {
        user: process.env.EMAIL_USER || 'seu-email@gmail.com',
        pass: process.env.EMAIL_PASS || 'sua-senha-de-app'
    }
};

const transporter = nodemailer.createTransport(emailConfig);

// Debug: Verificar se as variáveis de ambiente estão carregadas
console.log('=== DEBUG: Configuração de Email ===');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? 'Configurado' : 'NÃO CONFIGURADO');
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? 'Configurado' : 'NÃO CONFIGURADO');
console.log('RECIPIENT_EMAIL:', process.env.RECIPIENT_EMAIL ? 'Configurado' : 'NÃO CONFIGURADO');
console.log('SMTP_HOST:', process.env.SMTP_HOST || 'Usando padrão: smtp.gmail.com');
console.log('SMTP_PORT:', process.env.SMTP_PORT || 'Usando padrão: 587');
console.log('SMTP_SECURE:', process.env.SMTP_SECURE || 'Usando padrão: false');
console.log('=====================================');

// Testar conexão do transporter
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ Erro na configuração do email:', error.message);
        console.error('Verifique suas credenciais de email no arquivo .env');
    } else {
        console.log('✅ Servidor de email configurado corretamente!');
    }
});

// ===== FUNÇÕES AUXILIARES =====

/**
 * Valida os dados do formulário
 * @param {Object} data - Dados do formulário
 * @returns {Object} - Resultado da validação
 */
function validateFormData(data) {
    const errors = [];
    
    // Validação de informações pessoais
    if (!data.nomeCompleto || data.nomeCompleto.trim().length < 2) {
        errors.push('Nome completo é obrigatório e deve ter pelo menos 2 caracteres');
    }
    
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.push('Email válido é obrigatório');
    }
    
    if (!data.telefone || data.telefone.trim().length < 10) {
        errors.push('Telefone válido é obrigatório');
    }
    
    if (!data.empresa || data.empresa.trim().length < 2) {
        errors.push('Nome da empresa é obrigatório');
    }
    
    // Validação de dados empresariais
    if (!data.cnpj || data.cnpj.trim().length < 14) {
        errors.push('CNPJ é obrigatório e deve ser válido');
    } else {
        // Validação básica de formato CNPJ (remove caracteres especiais)
        const cnpjNumbers = data.cnpj.replace(/\D/g, '');
        if (cnpjNumbers.length !== 14) {
            errors.push('CNPJ deve conter 14 dígitos');
        }
    }
    
    if (!data.tempoExistencia) {
        errors.push('Tempo de existência da empresa é obrigatório');
    }
    
    if (!data.faturamentoAnual) {
        errors.push('Faturamento anual é obrigatório');
    }
    
    // Validação de consultoria
    if (!data.tipoConsultoria) {
        errors.push('Tipo de consultoria é obrigatório');
    }
    
    if (!data.mensagem || data.mensagem.trim().length < 5) {
        errors.push('Descrição do projeto é obrigatória e deve ter pelo menos 5 caracteres');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Gera o HTML do email
 * @param {Object} data - Dados do formulário
 * @returns {string} - HTML do email
 */
function generateEmailHTML(data, dadosCNPJ = null, downloadLink = null, files = null, scoreEstimado = null) {
    // Gera seção de dados do CNPJ se disponível
    const secaoCNPJ = dadosCNPJ && dadosCNPJ.success ? `
        <h2 style="color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;">📊 DADOS OFICIAIS DO CNPJ</h2>
        <div style="background: #ecfdf5; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 12px; color: #065f46;">
                <strong>Fonte:</strong> ${dadosCNPJ.source} ${dadosCNPJ.official ? '(Oficial)' : '(Terceiros)'} | 
                <strong>Consultado em:</strong> ${new Date(dadosCNPJ.consultedAt).toLocaleString('pt-BR')}
            </p>
        </div>
        
        <div class="field">
            <div class="label">🏢 Razão Social:</div>
            <div class="value" style="font-weight: bold; color: #059669;">${dadosCNPJ.razaoSocial}</div>
        </div>
        
        ${dadosCNPJ.nomeFantasia ? `
        <div class="field">
            <div class="label">🏪 Nome Fantasia:</div>
            <div class="value">${dadosCNPJ.nomeFantasia}</div>
        </div>
        ` : ''}
        
        <div class="field">
            <div class="label">📋 Situação Cadastral:</div>
            <div class="value" style="color: ${dadosCNPJ.situacao?.toLowerCase().includes('ativa') ? '#059669' : '#dc2626'}; font-weight: bold;">
                ${dadosCNPJ.situacao}
                ${dadosCNPJ.dataSituacao ? ` (desde ${dadosCNPJ.dataSituacao})` : ''}
            </div>
        </div>
        
        ${dadosCNPJ.motivoSituacao ? `
        <div class="field">
            <div class="label">📝 Motivo da Situação:</div>
            <div class="value">${dadosCNPJ.motivoSituacao}</div>
        </div>
        ` : ''}
        
        <div class="field">
            <div class="label">📅 Data de Abertura:</div>
            <div class="value">${dadosCNPJ.dataAbertura}</div>
        </div>
        
        ${dadosCNPJ.naturezaJuridica ? `
        <div class="field">
            <div class="label">⚖️ Natureza Jurídica:</div>
            <div class="value">${dadosCNPJ.naturezaJuridica}</div>
        </div>
        ` : ''}
        
        ${dadosCNPJ.porte ? `
        <div class="field">
            <div class="label">📏 Porte da Empresa:</div>
            <div class="value">${dadosCNPJ.porte}</div>
        </div>
        ` : ''}
        
        ${dadosCNPJ.capitalSocial ? `
        <div class="field">
            <div class="label">💰 Capital Social:</div>
            <div class="value">R$ ${dadosCNPJ.capitalSocial}</div>
        </div>
        ` : ''}
        
        ${dadosCNPJ.endereco ? `
        <h3 style="color: #0369a1; margin-top: 25px;">📍 Endereço Oficial</h3>
        <div class="field">
            <div class="label">🏠 Endereço Completo:</div>
            <div class="value">
                ${dadosCNPJ.endereco.logradouro || 'Não informado'} ${dadosCNPJ.endereco.numero || ''}
                ${dadosCNPJ.endereco.complemento ? `, ${dadosCNPJ.endereco.complemento}` : ''}
                <br>${dadosCNPJ.endereco.bairro || 'Não informado'} - ${dadosCNPJ.endereco.municipio || 'Não informado'}/${dadosCNPJ.endereco.uf || 'Não informado'}
                <br>CEP: ${dadosCNPJ.endereco.cep || 'Não informado'}
            </div>
        </div>
        ` : ''}
        
        ${dadosCNPJ.telefone || dadosCNPJ.email ? `
        <h3 style="color: #0369a1; margin-top: 25px;">📞 Contatos Oficiais</h3>
        ${dadosCNPJ.telefone ? `
        <div class="field">
            <div class="label">📱 Telefone:</div>
            <div class="value">${dadosCNPJ.telefone}</div>
        </div>
        ` : ''}
        ${dadosCNPJ.email ? `
        <div class="field">
            <div class="label">📧 Email:</div>
            <div class="value">${dadosCNPJ.email}</div>
        </div>
        ` : ''}
        ` : ''}
        
        ${dadosCNPJ.atividadePrincipal ? `
        <h3 style="color: #0369a1; margin-top: 25px;">🎯 Atividade Econômica</h3>
        <div class="field">
            <div class="label">🏭 Atividade Principal:</div>
            <div class="value">${dadosCNPJ.atividadePrincipal}</div>
        </div>
        ` : ''}
        
        ${dadosCNPJ.atividadesSecundarias && dadosCNPJ.atividadesSecundarias.length > 0 ? `
        <div class="field">
            <div class="label">🔧 Atividades Secundárias:</div>
            <div class="value">
                ${dadosCNPJ.atividadesSecundarias.slice(0, 5).map(ativ => `• ${ativ}`).join('<br>')}
                ${dadosCNPJ.atividadesSecundarias.length > 5 ? `<br><em>... e mais ${dadosCNPJ.atividadesSecundarias.length - 5} atividades</em>` : ''}
            </div>
        </div>
        ` : ''}
        
        ${dadosCNPJ.socios && dadosCNPJ.socios.length > 0 ? `
        <h3 style="color: #0369a1; margin-top: 25px;">👥 Quadro Societário</h3>
        <div class="field">
            <div class="label">🤝 Sócios/Administradores:</div>
            <div class="value">
                ${dadosCNPJ.socios.slice(0, 10).map(socio => `
                    <strong>${socio.nome}</strong><br>
                    <em>${socio.qualificacao}</em>
                    ${socio.dataEntrada ? `<br><small>Entrada: ${socio.dataEntrada}</small>` : ''}
                `).join('<br><br>')}
                ${dadosCNPJ.socios.length > 10 ? `<br><br><em>... e mais ${dadosCNPJ.socios.length - 10} sócios</em>` : ''}
            </div>
        </div>
        ` : ''}
        
    ` : (dadosCNPJ && !dadosCNPJ.success ? `
        <h2 style="color: #dc2626;">⚠️ CONSULTA CNPJ</h2>
        <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #dc2626;">
            <p style="margin: 0; color: #991b1b;">
                <strong>Erro na consulta:</strong> ${dadosCNPJ.error}<br>
                <small>Fonte: ${dadosCNPJ.source} | Consultado em: ${new Date(dadosCNPJ.consultedAt).toLocaleString('pt-BR')}</small>
            </p>
        </div>
    ` : '');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 700px; margin: 0 auto; padding: 20px; }
                .header { background: #3b82f6; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f9f9f9; }
                .field { margin-bottom: 15px; }
                .label { font-weight: bold; color: #555; }
                .value { margin-top: 5px; padding: 10px; background: white; border-radius: 5px; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
                .cnpj-section { background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 20px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Nova Solicitação de Consultoria</h1>
                </div>
                
                <div class="content">
                    <h2>Dados do Solicitante</h2>
                    
                    <div class="field">
                        <div class="label">Nome:</div>
                        <div class="value">${data.nomeCompleto}</div>
                    </div>
                    
                    <div class="field">
                        <div class="label">Email:</div>
                        <div class="value">${data.email}</div>
                    </div>
                    
                    <div class="field">
                        <div class="label">Telefone:</div>
                        <div class="value">${data.telefone}</div>
                    </div>
                    
                    <div class="field">
                        <div class="label">Empresa:</div>
                        <div class="value">${data.empresa}</div>
                    </div>
                    
                    <h2>Dados Empresariais Informados</h2>
                    
                    <div class="field">
                        <div class="label">CNPJ:</div>
                        <div class="value">${data.cnpj}</div>
                    </div>
                    
                    <div class="field">
                        <div class="label">Faturamento Anual:</div>
                        <div class="value">${data.faturamentoAnual}</div>
                    </div>
                    
                    <div class="field">
                        <div class="label">Tempo de Existência:</div>
                        <div class="value">${data.tempoExistencia}</div>
                    </div>
                    
                    ${secaoCNPJ}
                    
                    ${scoreEstimado ? `
                    <h2 style="color: #7c3aed; border-bottom: 2px solid #7c3aed; padding-bottom: 10px;">📊 AVALIAÇÃO PRELIMINAR</h2>
                    <div style="background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #d1d5db;">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <div style="display: inline-block; background: ${scoreEstimado.cor}; color: white; padding: 15px 30px; border-radius: 50px; font-size: 24px; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                                ${scoreEstimado.score}/100
                            </div>
                            <div style="margin-top: 10px; font-size: 18px; font-weight: bold; color: ${scoreEstimado.cor};">
                                ${scoreEstimado.classificacao}
                            </div>
                        </div>
                        
                        <div style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 10px 0; color: #374151;">🎯 Recomendação:</h4>
                            <p style="margin: 0; color: #6b7280; font-style: italic;">${scoreEstimado.recomendacao}</p>
                        </div>
                        
                        <div style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 10px 0; color: #374151;">📋 Fatores Analisados:</h4>
                            <div style="color: #6b7280;">
                                ${scoreEstimado.fatores.map(fator => `<div style="margin-bottom: 5px;">• ${fator}</div>`).join('')}
                            </div>
                        </div>
                        
                        <div style="background: white; padding: 15px; border-radius: 8px;">
                            <h4 style="margin: 0 0 10px 0; color: #374151;">📊 Detalhamento da Pontuação:</h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px;">
                                <div>• Situação Cadastral: <strong>${scoreEstimado.detalhes.situacao}/30</strong></div>
                                <div>• Tempo de Atividade: <strong>${scoreEstimado.detalhes.tempo_atividade}/25</strong></div>
                                <div>• Capital Social: <strong>${scoreEstimado.detalhes.capital_social}/20</strong></div>
                                <div>• Atividade Principal: <strong>${scoreEstimado.detalhes.atividade_principal}/15</strong></div>
                                <div>• Endereço Completo: <strong>${scoreEstimado.detalhes.endereco}/10</strong></div>
                                <div style="grid-column: 1 / -1; text-align: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e5e7eb;">
                                    <strong style="color: ${scoreEstimado.cor};">Total: ${scoreEstimado.score}/100</strong>
                                </div>
                            </div>
                        </div>
                        
                        <div style="text-align: center; margin-top: 15px; font-size: 12px; color: #9ca3af;">
                            Avaliação calculada em: ${new Date(scoreEstimado.calculadoEm).toLocaleString('pt-BR')}
                        </div>
                    </div>
                    ` : ''}
                    
                    <h2>Detalhes da Consultoria</h2>
                    
                    <div class="field">
                        <div class="label">Tipo de Consultoria:</div>
                        <div class="value">${data.tipoConsultoria}</div>
                    </div>
                    
                    <div class="field">
                        <div class="label">Descrição do Projeto:</div>
                        <div class="value">${data.mensagem ? data.mensagem.replace(/\n/g, '<br>') : 'Não informado'}</div>
                    </div>
                    
                    ${data.outrosDocumentos ? `
                    <div class="field">
                        <div class="label">Outros Documentos:</div>
                        <div class="value">${data.outrosDocumentos.replace(/\n/g, '<br>')}</div>
                    </div>
                    ` : ''}
                    
                    ${files && files.length > 0 ? `
                    <h2 style="color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;">📎 DOCUMENTOS ANEXADOS</h2>
                    <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #0ea5e9;">
                        <div class="field">
                            <div class="label">📄 Arquivos Enviados:</div>
                            <div class="value">
                                ${files.map(file => `
                                    <div style="margin-bottom: 10px; padding: 10px; background: white; border-radius: 5px; border: 1px solid #e5e7eb;">
                                        <strong>📋 ${file.originalname}</strong><br>
                                        <small style="color: #6b7280;">Tamanho: ${(file.size / 1024).toFixed(1)} KB</small>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        
                        ${downloadLink ? `
                        <div class="field" style="margin-top: 20px;">
                            <div class="label">🔗 Link para Download:</div>
                            <div class="value">
                                <a href="${process.env.BASE_URL || 'http://localhost:3001'}/download/${downloadLink}" 
                                   style="background: #059669; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                                    📥 Acessar Documentos
                                </a>
                                <br><br>
                                <small style="color: #6b7280;">
                                    ⏰ <strong>Link válido por 48 horas</strong><br>
                                    🔢 <strong>Máximo 5 downloads</strong><br>
                                    🔒 <strong>Acesso seguro e temporário</strong>
                                </small>
                            </div>
                        </div>
                        ` : ''}
                        
                        <div style="background: #fef3c7; padding: 10px; border-radius: 5px; margin-top: 15px; border-left: 4px solid #f59e0b;">
                            <small style="color: #92400e;">
                                <strong>📋 Instruções:</strong><br>
                                • Os documentos também foram anexados diretamente neste e-mail<br>
                                • Use o link acima para download individual ou em lote<br>
                                • Guarde os documentos em local seguro após o download
                            </small>
                        </div>
                    </div>
                    ` : ''}
                </div>
                
                <!-- Seção Administrativa -->
                <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 25px; border-radius: 12px; margin: 30px 0; text-align: center;">
                    <h3 style="margin: 0 0 15px 0; color: #ffffff;">🔧 Área Administrativa - Aporte Capital</h3>
                    <p style="margin: 0 0 20px 0; color: #ffffff; opacity: 0.9;">Acesse o dashboard para consultas detalhadas de CNPJ e análises de score</p>
                    
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${process.env.BASE_URL || 'http://localhost:3001'}/dashboard" 
                           style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); 
                                  color: #ffffff; 
                                  padding: 18px 40px; 
                                  text-decoration: none; 
                                  border-radius: 12px; 
                                  display: inline-block; 
                                  font-weight: bold; 
                                  font-size: 16px;
                                  box-shadow: 0 8px 20px rgba(30, 64, 175, 0.3);
                                  border: 2px solid transparent;
                                  transition: all 0.3s ease;
                                  text-transform: uppercase;
                                  letter-spacing: 0.5px;">
                            📊 Acessar Dashboard Administrativo
                        </a>
                    </div>
                    
                    <div style="margin-top: 20px; font-size: 14px; color: #ffffff;">
                        <div style="margin-bottom: 8px; color: #ffffff;"><span style="color: #ffffff;">🔍</span> <strong>Funcionalidades disponíveis:</strong></div>
                        <div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 15px; margin-top: 10px;">
                            <span style="background: #ffffff; color: #1e40af; padding: 8px 15px; border-radius: 20px; font-size: 13px; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">✅ Consulta manual de CNPJ</span>
                            <span style="background: #ffffff; color: #1e40af; padding: 8px 15px; border-radius: 20px; font-size: 13px; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">📊 Análise de score em tempo real</span>
                            <span style="background: #ffffff; color: #1e40af; padding: 8px 15px; border-radius: 20px; font-size: 13px; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">📋 Relatórios detalhados</span>
                        </div>
                    </div>
                </div>

                <div class="footer">
                    <p>Esta solicitação foi enviada através do formulário de consultoria do site.</p>
                    <p>Data: ${new Date().toLocaleString('pt-BR')}</p>
                    ${dadosCNPJ && dadosCNPJ.success ? '<p><strong>✅ Dados do CNPJ verificados automaticamente</strong></p>' : ''}
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Remove arquivos temporários
 * @param {Array} files - Lista de arquivos para remover
 */
function cleanupFiles(files) {
    if (!files || files.length === 0) return;
    
    files.forEach(file => {
        try {
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
                console.log(`Arquivo removido: ${file.path}`);
            }
        } catch (error) {
            console.error(`Erro ao remover arquivo ${file.path}:`, error);
        }
    });
}

/**
 * Gera mensagem formatada para WhatsApp
 */
// Função para gerar mensagem do WhatsApp para o CLIENTE (sem link de download)
function generateWhatsAppMessageForClient(data, files = null) {
    let documentosInfo = '';
    
    if (files && files.length > 0) {
        documentosInfo = `📋 *DOCUMENTOS:*
✅ ${files.length} arquivo(s) enviados por email`;
    } else {
        documentosInfo = '📄 *DOCUMENTOS:* Nenhum documento anexado';
    }

    const message = `🏢 Olá, *Aporte Capital*!

Estou entrando em contato para solicitar uma análise de crédito e consultoria financeira.

👤 *MEUS DADOS:*
• Nome: ${data.nomeCompleto}
• Email: ${data.email}
• Telefone: ${data.telefone}

🏭 *DADOS DA EMPRESA:*
• Razão Social: ${data.empresa}
• CNPJ: ${data.cnpj}
• Faturamento Mensal: ${data.faturamentoAnual}
• Tempo de Atividade: ${data.tempoExistencia}

💼 *TIPO DE CONSULTORIA:*
• Modalidade: ${mapearTipoConsultoria(data.tipoConsultoria)}
• Observações: ${data.mensagem}

${documentosInfo}

Aguardo retorno para darmos continuidade ao processo.

Atenciosamente,
*${data.nomeCompleto}*`;

    return message;
}

// Função para gerar mensagem do WhatsApp para a APORTE CAPITAL (com link de download)
function generateWhatsAppMessage(data, downloadLink = null, files = null) {
    let documentosInfo = '';
    
    if (files && files.length > 0) {
        // Em desenvolvimento, usar IP local para permitir acesso via celular
        // Em produção, usar o domínio real da empresa
        const baseUrl = process.env.NODE_ENV === 'production' 
            ? 'https://aportecapital.com.br' 
            : 'http://192.168.0.18:3001';
            
        documentosInfo = `📋 *DOCUMENTOS ENVIADOS:*
✅ ${files.length} arquivo(s) enviado(s) por EMAIL
✅ Disponíveis para download em:
🔗 ${baseUrl}/download/${downloadLink}

⏰ Link válido por 48 horas
🔒 Acesso seguro e criptografado
🔢 Máximo 5 downloads

📧 Verifique também seu email para detalhes completos!`;
    } else {
        documentosInfo = '📄 *DOCUMENTOS:* Nenhum documento anexado';
    }

    const message = `🏢 *APORTE CAPITAL - NOVA SOLICITAÇÃO*

🚨 *ATENÇÃO EQUIPE:* Nova solicitação recebida!

👤 *DADOS DO SOLICITANTE:*
• Nome: ${data.nomeCompleto}
• Email: ${data.email}
• Telefone: ${data.telefone}

🏭 *INFORMAÇÕES DA EMPRESA:*
• Razão Social: ${data.empresa}
• CNPJ: ${data.cnpj}
• Faturamento Anual: ${data.faturamentoAnual}
• Tempo de Existência: ${data.tempoExistencia}

💼 *TIPO DE CONSULTORIA:*
• Serviço: ${mapearTipoConsultoria(data.tipoConsultoria)}
• Descrição: ${data.mensagem}

${documentosInfo}

⚡ *AÇÃO NECESSÁRIA:*
• Analisar solicitação
• Baixar documentos (se houver)
• Entrar em contato em até 24h

⏰ *Enviado em:* ${new Date().toLocaleString('pt-BR')}

---
*Mensagem automática - Aporte Capital*`;

    return message;
}

/**
 * Gera URL do WhatsApp com mensagem pré-preenchida
 */
function generateWhatsAppURL(phoneNumber, message) {
    // Remove caracteres especiais do número
    const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
    
    // Adiciona código do país se não tiver (assume Brasil +55)
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    
    // Codifica a mensagem para URL
    const encodedMessage = encodeURIComponent(message);
    
    return `https://wa.me/${fullPhone}?text=${encodedMessage}`;
}

/**
 * Mapeia valores do tipo de consultoria para exibição completa
 * @param {string} tipoConsultoria - Valor do tipo de consultoria
 * @returns {string} Texto completo do tipo de consultoria
 */
function mapearTipoConsultoria(tipoConsultoria) {
    const mapeamento = {
        'capital-giro': 'Capital de Giro',
        'expansao': 'Expansão de Negócio',
        'modernizacao': 'Modernização',
        'investimento': 'Investimento em Equipamentos',
        'outros': 'Outros'
    };
    
    return mapeamento[tipoConsultoria] || tipoConsultoria;
}

/**
 * Gera template de email de confirmação automático para o cliente
 * @param {Object} data - Dados do formulário
 * @param {Array} files - Arquivos enviados (opcional)
 * @returns {string} HTML do email de confirmação
 */
function generateConfirmationEmailHTML(data, files = null) {
    const currentDate = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    let documentosInfo = '';
    if (files && files.length > 0) {
        documentosInfo = `
        <div style="background-color: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #2e7d32; margin: 0 0 10px 0; font-size: 16px;">📋 Documentos Recebidos</h3>
            <p style="margin: 0; color: #2e7d32;">✅ ${files.length} arquivo(s) anexado(s) com sucesso</p>
        </div>`;
    }

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirmação de Solicitação - Aporte Capital</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 30px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 300; display: flex; align-items: center; justify-content: center; gap: 10px;">
                    <img src="cid:logo" alt="Aporte Capital" style="height: 40px; margin-right: 10px; width: auto; vertical-align: middle;" />
                    Aporte Capital
                </h1>
                <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">
                    Consultoria Financeira Especializada
                </p>
            </div>

            <!-- Content -->
            <div style="padding: 40px 30px;">
                
                <!-- Success Message -->
                <div style="text-align: center; margin-bottom: 30px;">
                    <div style="background-color: #4caf50; color: white; padding: 15px; border-radius: 50px; display: inline-block; margin-bottom: 20px;">
                        ✅ Solicitação Recebida com Sucesso!
                    </div>
                    <h2 style="color: #333; margin: 0; font-size: 24px;">Olá, ${data.nomeCompleto}!</h2>
                    <p style="color: #666; margin: 10px 0 0 0; font-size: 16px;">
                        Recebemos sua solicitação de consultoria financeira e nossa equipe já está analisando.
                    </p>
                </div>

                <!-- Client Data Summary -->
                <div style="background-color: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0;">
                    <h3 style="color: #1e3c72; margin: 0 0 20px 0; font-size: 18px; border-bottom: 2px solid #1e3c72; padding-bottom: 10px;">
                        📋 Resumo da Solicitação
                    </h3>
                    
                    <div style="margin-bottom: 15px;">
                        <strong style="color: #333;">Empresa:</strong> ${data.empresa}<br>
                        <strong style="color: #333;">CNPJ:</strong> ${data.cnpj}<br>
                        <strong style="color: #333;">Tipo de Consultoria:</strong> ${mapearTipoConsultoria(data.tipoConsultoria)}<br>
                        <strong style="color: #333;">Data da Solicitação:</strong> ${currentDate}
                    </div>
                </div>

                ${documentosInfo}

                <!-- Next Steps -->
                <div style="background-color: #fff3e0; padding: 25px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #ff9800;">
                    <h3 style="color: #e65100; margin: 0 0 15px 0; font-size: 18px;">🎯 Próximos Passos</h3>
                    <ul style="color: #333; margin: 0; padding-left: 20px; line-height: 1.6;">
                        <li>Nossa equipe especializada analisará sua solicitação</li>
                        <li>Entraremos em contato em até <strong>24 horas úteis</strong></li>
                        <li>Mantenha seus contatos atualizados para facilitar o retorno</li>
                        <li>Prepare documentação adicional que possa ser solicitada</li>
                    </ul>
                </div>

                <!-- Contact Info -->
                <div style="text-align: center; margin: 30px 0;">
                    <p style="color: #666; margin: 0 0 15px 0;">
                        Dúvidas? Entre em contato conosco:
                    </p>
                    <div style="background-color: #25d366; color: white; padding: 12px 25px; border-radius: 25px; display: inline-block; text-decoration: none; margin: 10px;">
                        📱 WhatsApp: (92) 99988-9392
                    </div>
                </div>

            </div>

            <!-- Footer -->
            <div style="background-color: #1e3c72; padding: 25px; text-align: center;">
                <div style="margin-bottom: 15px;">
                    <h3 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 300; display: flex; align-items: center; justify-content: center; gap: 10px;">
                        <img src="cid:logo" alt="Aporte Capital" style="height: 28px; margin-right: 10px; width: auto; vertical-align: middle;" />
                        Aporte Capital
                    </h3>
                    <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">
                        Transformando empresas através de soluções financeiras inteligentes
                    </p>
                </div>
                
                <div style="border-top: 1px solid #2a5298; padding-top: 15px;">
                    <p style="color: #b3d9ff; margin: 0; font-size: 12px;">
                        Este é um email automático. Por favor, não responda diretamente a esta mensagem.
                    </p>
                    <p style="color: #b3d9ff; margin: 5px 0 0 0; font-size: 12px;">
                        © 2024 Aporte Capital - Todos os direitos reservados
                    </p>
                </div>
            </div>

        </div>
    </body>
    </html>`;
}

// ===== ROTAS =====

/**
 * Rota principal - serve o index.html
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * Rota de teste para verificar se o servidor está funcionando
 */
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Servidor funcionando corretamente',
        timestamp: new Date().toISOString()
    });
});

/**
 * Rota para exibir página de download de arquivos temporários
 */
app.get('/download/:linkId', (req, res) => {
    const { linkId } = req.params;
    const validation = validateTempLink(linkId);
    
    if (!validation.valid) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Link Inválido - Aporte Capital</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
                    .container { background: white; padding: 2rem; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); text-align: center; max-width: 500px; }
                    .error-icon { font-size: 4rem; color: #e74c3c; margin-bottom: 1rem; }
                    h1 { color: #2c3e50; margin-bottom: 1rem; }
                    p { color: #7f8c8d; margin-bottom: 1.5rem; }
                    .btn { background: #3498db; color: white; padding: 12px 24px; border: none; border-radius: 8px; text-decoration: none; display: inline-block; transition: background 0.3s; }
                    .btn:hover { background: #2980b9; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="error-icon">🔒</div>
                    <h1>Link Inválido</h1>
                    <p><strong>Motivo:</strong> ${validation.reason}</p>
                    <p>Este link pode ter expirado ou atingido o limite de downloads.</p>
                    <a href="/" class="btn">Voltar ao Site</a>
                </div>
            </body>
            </html>
        `);
    }
    
    const link = validation.link;
    const timeRemaining = Math.max(0, link.expiresAt - new Date());
    const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    
    // Gera HTML da página de download
    const downloadPageHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Download Seguro - Aporte Capital</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
                .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); overflow: hidden; }
                .header { background: linear-gradient(135deg, #2c3e50, #3498db); color: white; padding: 2rem; text-align: center; }
                .header h1 { margin-bottom: 0.5rem; }
                .header p { opacity: 0.9; }
                .content { padding: 2rem; }
                .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
                .info-card { background: #f8f9fa; padding: 1rem; border-radius: 8px; border-left: 4px solid #3498db; }
                .info-card h3 { color: #2c3e50; margin-bottom: 0.5rem; font-size: 0.9rem; text-transform: uppercase; }
                .info-card p { color: #7f8c8d; font-weight: bold; }
                .files-section { margin-bottom: 2rem; }
                .files-section h2 { color: #2c3e50; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
                .file-list { background: #f8f9fa; border-radius: 8px; overflow: hidden; }
                .file-item { display: flex; align-items: center; justify-content: space-between; padding: 1rem; border-bottom: 1px solid #e9ecef; }
                .file-item:last-child { border-bottom: none; }
                .file-info { display: flex; align-items: center; gap: 1rem; }
                .file-icon { font-size: 1.5rem; }
                .file-details h4 { color: #2c3e50; margin-bottom: 0.25rem; }
                .file-details p { color: #7f8c8d; font-size: 0.9rem; }
                .download-btn { background: #27ae60; color: white; padding: 8px 16px; border: none; border-radius: 6px; text-decoration: none; font-size: 0.9rem; transition: background 0.3s; }
                .download-btn:hover { background: #229954; }
                .download-all { text-align: center; margin-top: 1.5rem; }
                .download-all .btn { background: #3498db; color: white; padding: 12px 24px; border: none; border-radius: 8px; text-decoration: none; font-size: 1rem; transition: background 0.3s; }
                .download-all .btn:hover { background: #2980b9; }
                .warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 1rem; border-radius: 8px; margin-top: 1rem; }
                .warning strong { display: block; margin-bottom: 0.5rem; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔒 Download Seguro</h1>
                    <p>Aporte Capital - Documentos Temporários</p>
                </div>
                
                <div class="content">
                    <div class="info-grid">
                        <div class="info-card">
                            <h3>📋 Código da Solicitação</h3>
                            <p>#${linkId}</p>
                        </div>
                        <div class="info-card">
                            <h3>📅 Criado em</h3>
                            <p>${link.createdAt.toLocaleString('pt-BR')}</p>
                        </div>
                        <div class="info-card">
                            <h3>⏰ Expira em</h3>
                            <p>${hoursRemaining}h ${minutesRemaining}min</p>
                        </div>
                        <div class="info-card">
                            <h3>🔢 Downloads</h3>
                            <p>${link.downloads}/${link.maxDownloads}</p>
                        </div>
                    </div>
                    
                    <div class="files-section">
                        <h2>📁 Documentos Disponíveis</h2>
                        <div class="file-list">
                            ${link.files.map(file => `
                                <div class="file-item">
                                    <div class="file-info">
                                        <div class="file-icon">📄</div>
                                        <div class="file-details">
                                            <h4>${file.originalname}</h4>
                                            <p>${(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                        </div>
                                    </div>
                                    <a href="/download/${linkId}/file/${encodeURIComponent(file.originalname)}" class="download-btn">📥 Baixar</a>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="download-all">
                            <a href="/download/${linkId}/zip" class="btn">📦 Baixar Todos (ZIP)</a>
                        </div>
                    </div>
                    
                    <div class="warning">
                        <strong>⚠️ Importante:</strong>
                        Este link é temporário e expirará automaticamente. Faça o download dos arquivos necessários antes do prazo limite.
                        Após ${link.maxDownloads} downloads, o link será desativado por segurança.
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
    
    res.send(downloadPageHTML);
});

/**
 * Rota para download de arquivo individual
 */
app.get('/download/:linkId/file/:filename', (req, res) => {
    const { linkId, filename } = req.params;
    const validation = validateTempLink(linkId);
    
    if (!validation.valid) {
        return res.status(404).json({ error: validation.reason });
    }
    
    const link = validation.link;
    const file = link.files.find(f => f.originalname === decodeURIComponent(filename));
    
    if (!file) {
        return res.status(404).json({ error: 'Arquivo não encontrado' });
    }
    
    if (!fs.existsSync(file.path)) {
        return res.status(404).json({ error: 'Arquivo não existe no servidor' });
    }
    
    // Incrementa contador de downloads
    incrementDownload(linkId);
    
    // Envia o arquivo
    res.download(file.path, file.originalname, (err) => {
        if (err) {
            console.error('Erro no download:', err);
            res.status(500).json({ error: 'Erro no download do arquivo' });
        }
    });
});

/**
 * Rota para download de todos os arquivos em ZIP
 */
app.get('/download/:linkId/zip', (req, res) => {
    const { linkId } = req.params;
    const validation = validateTempLink(linkId);
    
    if (!validation.valid) {
        return res.status(404).json({ error: validation.reason });
    }
    
    const link = validation.link;
    
    // Incrementa contador de downloads
    incrementDownload(linkId);
    
    // Por simplicidade, vamos enviar os arquivos individualmente
    // Em uma implementação completa, usaríamos uma biblioteca como 'archiver' para criar ZIP
    res.json({ 
        message: 'Download em lote não implementado ainda. Use downloads individuais.',
        files: link.files.map(f => ({
            name: f.originalname,
            downloadUrl: `/download/${linkId}/file/${encodeURIComponent(f.originalname)}`
        }))
    });
});

/**
 * Rota principal para processar o formulário de consultoria
 */
app.post('/api/consultoria', upload.array('documentos', 5), async (req, res) => {
    try {
        console.log('Recebendo solicitação de consultoria...');
        console.log('Dados:', req.body);
        console.log('Arquivos:', req.files?.map(f => ({ name: f.originalname, size: f.size })));
        
        // Valida os dados do formulário
        const validation = validateFormData(req.body);
        if (!validation.isValid) {
            // Remove arquivos se houver erro de validação
            if (req.files) {
                cleanupFiles(req.files);
            }
            
            return res.status(400).json({
                success: false,
                message: 'Dados inválidos',
                errors: validation.errors
            });
        }
        
        // Consulta dados oficiais do CNPJ e calcula score
        let dadosCNPJ = null;
        let scoreEstimado = null;
        if (req.body.cnpj) {
            console.log('Iniciando consulta do CNPJ...');
            try {
                dadosCNPJ = await consultarCNPJ(req.body.cnpj);
                if (dadosCNPJ.success) {
                    console.log('✅ CNPJ consultado com sucesso:', dadosCNPJ.razaoSocial);
                    
                    // Calcula score estimado baseado nos dados do CNPJ
                    console.log('📊 Calculando score estimado...');
                    scoreEstimado = calcularScoreEstimado(dadosCNPJ);
                    console.log(`📊 Score calculado: ${scoreEstimado.score}/100 - ${scoreEstimado.classificacao}`);
                } else {
                    console.log('⚠️ Erro na consulta do CNPJ:', dadosCNPJ.error);
                    // Calcula score com dados limitados
                    scoreEstimado = calcularScoreEstimado(null);
                }
            } catch (error) {
                console.error('❌ Erro ao consultar CNPJ:', error);
                dadosCNPJ = {
                    success: false,
                    error: 'Erro interno na consulta do CNPJ',
                    source: 'erro_interno',
                    consultedAt: new Date().toISOString()
                };
                scoreEstimado = calcularScoreEstimado(null);
            }
        }
        
        // Prepara os anexos
        const attachments = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                attachments.push({
                    filename: file.originalname,
                    path: file.path,
                    contentType: 'application/pdf'
                });
            });
        }
        
        // Gera link temporário para download dos arquivos (se houver)
        let downloadLink = null;
        if (req.files && req.files.length > 0) {
            downloadLink = generateTempLink(req.files, 5, 48); // 5 downloads, 48 horas
            console.log('Link temporário gerado:', downloadLink);
        }

        // Configura o email com dados enriquecidos do CNPJ
        const subjectSuffix = dadosCNPJ && dadosCNPJ.success ? ` - ${dadosCNPJ.situacao}` : '';
        const mailOptions = {
            from: `"Formulário de Consultoria" <${emailConfig.auth.user}>`,
            // to: process.env.RECIPIENT_EMAIL || 'contato@aportecapitalcred.com.br', 
            to: process.env.RECIPIENT_EMAIL ,
            subject: `Nova Solicitação de Consultoria - ${req.body.empresa}${subjectSuffix}`,
            html: generateEmailHTML(req.body, dadosCNPJ, downloadLink, req.files, scoreEstimado),
            attachments: attachments
        };
        
        // Envia o email
        console.log('📧 Tentando enviar email...');
        console.log('📧 Para:', mailOptions.to);
        console.log('📧 Assunto:', mailOptions.subject);
        
        const emailResult = await transporter.sendMail(mailOptions);
        console.log('✅ Email enviado com sucesso!', emailResult.messageId);
        
        // Envia email de confirmação automático para o cliente
        try {
            const confirmationMailOptions = {
                from: `"Aporte Capital" <${emailConfig.auth.user}>`,
                to: req.body.email,
                subject: 'Confirmação de Solicitação - Aporte Capital',
                html: generateConfirmationEmailHTML(req.body, req.files),
                attachments: [
                    {
                        filename: 'logo.png',
                        path: path.join(__dirname, 'public', 'images', 'logo.png'),
                        cid: 'logo' // Content-ID para referenciar no HTML
                    }
                ]
            };
            
            console.log('📧 Enviando email de confirmação para o cliente...');
            const confirmationResult = await transporter.sendMail(confirmationMailOptions);
            console.log('✅ Email de confirmação enviado com sucesso!', confirmationResult.messageId);
        } catch (confirmationError) {
            console.error('⚠️ Erro ao enviar email de confirmação (não crítico):', confirmationError.message);
            // Não interrompe o fluxo principal se o email de confirmação falhar
        }
        
        // Gera duas mensagens do WhatsApp diferentes:
        // 1. Para o CLIENTE (sem link de download - mais limpa)
        const whatsappMessageForClient = generateWhatsAppMessageForClient(req.body, req.files);
        const whatsappNumber = process.env.WHATSAPP_NUMBER || '5592999889392';
        const whatsappURLForClient = generateWhatsAppURL(whatsappNumber, whatsappMessageForClient);
        
        // 2. Para a APORTE CAPITAL (com link de download - completa)
        const whatsappMessageForCompany = generateWhatsAppMessage(req.body, downloadLink, req.files);
        const whatsappURLForCompany = generateWhatsAppURL(whatsappNumber, whatsappMessageForCompany);
        
        // NÃO remove arquivos temporários se há link de download
        // Os arquivos serão removidos automaticamente quando o link expirar
        if (!downloadLink && req.files) {
            cleanupFiles(req.files);
        }
        
        console.log('Email enviado com sucesso!');
        console.log('Link WhatsApp para CLIENTE gerado:', whatsappURLForClient);
        console.log('Link WhatsApp para APORTE CAPITAL gerado:', whatsappURLForCompany);
        if (downloadLink) {
            console.log('Link de download disponível:', `${req.protocol}://${req.get('host')}/download/${downloadLink}`);
        }
        
        res.json({
            success: true,
            message: 'Solicitação enviada com sucesso! Entraremos em contato em breve.',
            whatsappURL: whatsappURLForClient, // Cliente recebe a versão sem link
            whatsappURLForCompany: whatsappURLForCompany, // Para logs/debug da empresa
            downloadLink: downloadLink ? `${req.protocol}://${req.get('host')}/download/${downloadLink}` : null,
            hasFiles: req.files && req.files.length > 0
        });
        
    } catch (error) {
        console.error('❌ Erro ao processar solicitação:', error);
        console.error('❌ Stack trace:', error.stack);
        console.error('❌ Tipo do erro:', error.name);
        console.error('❌ Código do erro:', error.code);
        
        // Remove arquivos em caso de erro
        if (req.files) {
            cleanupFiles(req.files);
        }
        
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor. Tente novamente mais tarde.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            errorDetails: process.env.NODE_ENV === 'production' ? {
                name: error.name,
                code: error.code,
                message: error.message
            } : undefined
        });
    }
});

/**
 * Middleware de tratamento de erros do multer
 */
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'Arquivo muito grande. Tamanho máximo: 10MB'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Muitos arquivos. Máximo: 5 arquivos'
            });
        }
    }
    
    if (error.message === 'Apenas arquivos PDF são permitidos') {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
    
    console.error('Erro não tratado:', error);
    res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
    });
});

/**
 * Endpoint para consulta manual de CNPJ (Dashboard Administrativo)
 */
app.get('/api/consulta-cnpj/:cnpj', async (req, res) => {
    try {
        const cnpj = req.params.cnpj;
        
        // Valida formato básico do CNPJ
        if (!cnpj || cnpj.length < 14) {
            return res.status(400).json({
                success: false,
                message: 'CNPJ inválido'
            });
        }
        
        console.log(`📊 Consulta manual de CNPJ: ${cnpj}`);
        
        // Consulta dados do CNPJ
        const dadosCNPJ = await consultarCNPJ(cnpj);
        
        // Calcula score estimado
        const scoreEstimado = calcularScoreEstimado(dadosCNPJ);
        
        res.json({
            success: true,
            cnpj: cnpj,
            dados: dadosCNPJ,
            score: scoreEstimado,
            consultadoEm: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Erro na consulta manual:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Endpoint de teste para verificar email
 */
app.get('/test-email', (req, res) => {
    const testData = {
        nome: 'Teste Dashboard',
        email: 'teste@teste.com',
        telefone: '(11) 99999-9999',
        empresa: 'Empresa Teste',
        cnpj: '11.222.333/0001-81',
        faturamento: '500k-1M',
        tempo: '2-5-anos',
        tipo: 'expansao',
        descricao: 'Teste do dashboard'
    };
    
    const testCNPJ = {
        success: true,
        nome: 'EMPRESA TESTE LTDA',
        situacao: 'ATIVA',
        cnpj: '11.222.333/0001-81',
        abertura: '01/01/2020',
        capital: '100000',
        porte: 'PEQUENO',
        natureza_juridica: 'SOCIEDADE EMPRESÁRIA LIMITADA',
        telefone: '(11) 3333-4444',
        email: 'contato@empresateste.com.br',
        endereco: {
            logradouro: 'RUA TESTE',
            numero: '123',
            complemento: 'SALA 1',
            bairro: 'CENTRO',
            municipio: 'SÃO PAULO',
            uf: 'SP',
            cep: '01000-000'
        }
    };
    
    const emailHTML = generateEmailHTML(testData, testCNPJ, null, null, 750);
    res.send(emailHTML);
});

/**
 * Página do Dashboard Administrativo
 */
app.get('/dashboard', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dashboard - Aporte Capital</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8fafc; }
                .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; text-align: center; }
                .card { background: white; border-radius: 12px; padding: 25px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .form-group { margin-bottom: 20px; }
                label { display: block; margin-bottom: 8px; font-weight: 600; color: #1f2937; font-size: 14px; }
                input { width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 16px; }
                input:focus { outline: none; border-color: #3b82f6; }
                .btn { background: #3b82f6; color: white; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 600; }
                .btn:hover { background: #2563eb; }
                .btn:disabled { background: #9ca3af; cursor: not-allowed; }
                .result { margin-top: 30px; }
                .score-display { text-align: center; margin: 20px 0; }
                .score-circle { display: inline-block; padding: 20px 40px; border-radius: 50px; color: white; font-size: 28px; font-weight: bold; }
                .score-label { margin-top: 10px; font-size: 18px; font-weight: 600; }
                .details-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
                .detail-card { background: #f9fafb; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6; color: #374151; }
                .detail-card p { color: #1f2937; margin: 5px 0; }
                .detail-card strong { color: #1f2937; }
                .loading { text-align: center; padding: 40px; color: #6b7280; }
                .error { background: #fef2f2; color: #dc2626; padding: 15px; border-radius: 8px; border-left: 4px solid #dc2626; }
                .success { background: #f0fdf4; color: #059669; padding: 15px; border-radius: 8px; border-left: 4px solid #059669; }
                h2 { color: #1f2937; margin-bottom: 20px; font-size: 24px; }
                h3 { color: #374151; margin: 25px 0 15px 0; font-size: 20px; }
                h4 { color: #4b5563; margin-bottom: 8px; font-size: 16px; font-weight: 600; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📊 Dashboard Administrativo</h1>
                    <p>Consulta e Avaliação de CNPJs</p>
                </div>
                
                <div class="card">
                    <h2>🔍 Consultar CNPJ</h2>
                    <form id="consultaForm">
                        <div class="form-group">
                            <label for="cnpj">CNPJ:</label>
                            <input type="text" id="cnpj" placeholder="00.000.000/0000-00" maxlength="18">
                        </div>
                        <button type="submit" class="btn" id="consultarBtn">Consultar</button>
                    </form>
                </div>
                
                <div id="resultado" class="result"></div>
            </div>
            
            <script>
                // Máscara para CNPJ
                document.getElementById('cnpj').addEventListener('input', function(e) {
                    let value = e.target.value.replace(/\\D/g, '');
                    value = value.replace(/(\\d{2})(\\d)/, '$1.$2');
                    value = value.replace(/(\\d{3})(\\d)/, '$1.$2');
                    value = value.replace(/(\\d{3})(\\d)/, '$1/$2');
                    value = value.replace(/(\\d{4})(\\d)/, '$1-$2');
                    e.target.value = value;
                });
                
                // Formulário de consulta
                document.getElementById('consultaForm').addEventListener('submit', async function(e) {
                    e.preventDefault();
                    
                    const cnpj = document.getElementById('cnpj').value.replace(/\\D/g, '');
                    const btn = document.getElementById('consultarBtn');
                    const resultado = document.getElementById('resultado');
                    
                    if (cnpj.length !== 14) {
                        resultado.innerHTML = '<div class="error">CNPJ deve ter 14 dígitos</div>';
                        return;
                    }
                    
                    btn.disabled = true;
                    btn.textContent = 'Consultando...';
                    resultado.innerHTML = '<div class="loading">🔄 Consultando dados do CNPJ...</div>';
                    
                    try {
                        const response = await fetch(\`/api/consulta-cnpj/\${cnpj}\`);
                        const data = await response.json();
                        
                        if (data.success) {
                            exibirResultado(data);
                        } else {
                            resultado.innerHTML = \`<div class="error">❌ \${data.message}</div>\`;
                        }
                    } catch (error) {
                        resultado.innerHTML = '<div class="error">❌ Erro na consulta</div>';
                    } finally {
                        btn.disabled = false;
                        btn.textContent = 'Consultar';
                    }
                });
                
                function exibirResultado(data) {
                    const { dados, score } = data;
                    
                    let html = '<div class="card">';
                    
                    // Score
                    html += \`
                        <div class="score-display">
                            <div class="score-circle" style="background: \${score.cor}">
                                \${score.score}/100
                            </div>
                            <div class="score-label" style="color: \${score.cor}">
                                \${score.classificacao}
                            </div>
                        </div>
                        
                        <div class="detail-card">
                            <h4>🎯 Recomendação:</h4>
                            <p>\${score.recomendacao}</p>
                        </div>
                    \`;
                    
                    if (dados.success) {
                        html += \`
                            <h3>📊 Dados da Empresa</h3>
                            <div class="details-grid">
                                <div class="detail-card">
                                    <h4>🏢 Razão Social</h4>
                                    <p>\${dados.razaoSocial}</p>
                                </div>
                                <div class="detail-card">
                                    <h4>📋 Situação</h4>
                                    <p>\${dados.situacao}</p>
                                </div>
                                <div class="detail-card">
                                    <h4>📅 Data Abertura</h4>
                                    <p>\${dados.dataAbertura}</p>
                                </div>
                                <div class="detail-card">
                                    <h4>💰 Capital Social</h4>
                                    <p>R$ \${dados.capitalSocial}</p>
                                </div>
                            </div>
                        \`;
                    }
                    
                    html += \`
                        <h3>📋 Fatores Analisados</h3>
                        <div class="detail-card">
                            \${score.fatores.map(fator => \`<div>• \${fator}</div>\`).join('')}
                        </div>
                        
                        <h3>📊 Detalhamento da Pontuação</h3>
                        <div class="details-grid">
                            <div class="detail-card">Situação Cadastral: <strong>\${score.detalhes.situacao}/30</strong></div>
                            <div class="detail-card">Tempo de Atividade: <strong>\${score.detalhes.tempo_atividade}/25</strong></div>
                            <div class="detail-card">Capital Social: <strong>\${score.detalhes.capital_social}/20</strong></div>
                            <div class="detail-card">Atividade Principal: <strong>\${score.detalhes.atividade_principal}/15</strong></div>
                            <div class="detail-card">Endereço Completo: <strong>\${score.detalhes.endereco}/10</strong></div>
                        </div>
                    \`;
                    
                    html += '</div>';
                    
                    document.getElementById('resultado').innerHTML = html;
                }
            </script>
        </body>
        </html>
    `);
});

/**
 * Rota 404 - não encontrado
 */
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Rota não encontrada'
    });
});

// ===== INICIALIZAÇÃO DO SERVIDOR =====
app.listen(PORT, () => {
    console.log(`
    ===== SERVIDOR DE CONSULTORIA =====
    🚀 Servidor rodando na porta ${PORT}
    🌐 Acesse: http://localhost:${PORT}
    📧 Email remetente: ${emailConfig.auth.user}
    📨 Email destinatário: ${process.env.RECIPIENT_EMAIL || 'contato@aportecapitalcred.com.br'}
    📁 Uploads salvos em: ${path.join(__dirname, 'uploads')}
    🔧 Ambiente: ${process.env.NODE_ENV || 'development'}

    Para configurar o email:
    1. Edite o arquivo .env com suas credenciais:
       - EMAIL_USER: seu email do Gmail
       - EMAIL_PASS: senha de app do Gmail
       - RECIPIENT_EMAIL: email que receberá as solicitações

    2. Para produção, altere RECIPIENT_EMAIL para: contato@aportecapitalcred.com.br
    =====================================
    `);
});

// ===== TRATAMENTO DE SINAIS =====
process.on('SIGTERM', () => {
    console.log('Servidor sendo encerrado...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Servidor sendo encerrado...');
    process.exit(0);
});