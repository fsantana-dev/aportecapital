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
function generateEmailHTML(data, dadosCNPJ = null, downloadLink = null, files = null) {
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
        
        <h3 style="color: #0369a1; margin-top: 25px;">📍 Endereço Oficial</h3>
        <div class="field">
            <div class="label">🏠 Endereço Completo:</div>
            <div class="value">
                ${dadosCNPJ.endereco.logradouro} ${dadosCNPJ.endereco.numero}
                ${dadosCNPJ.endereco.complemento ? `, ${dadosCNPJ.endereco.complemento}` : ''}
                <br>${dadosCNPJ.endereco.bairro} - ${dadosCNPJ.endereco.municipio}/${dadosCNPJ.endereco.uf}
                <br>CEP: ${dadosCNPJ.endereco.cep}
            </div>
        </div>
        
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
        documentosInfo = `📋 *DOCUMENTOS ENVIADOS:*
✅ ${files.length} arquivo(s) enviado(s) por EMAIL
✅ Solicitação enviada com sucesso!

📧 Aguarde retorno da Aporte Capital
🕐 Resposta em até 24 horas úteis`;
    } else {
        documentosInfo = '📄 *DOCUMENTOS:* Nenhum documento anexado';
    }

    const message = `🏢 *APORTE CAPITAL - Solicitação Enviada*

✅ *SUA SOLICITAÇÃO FOI ENVIADA COM SUCESSO!*

👤 *DADOS CONFIRMADOS:*
• Nome: ${data.nomeCompleto}
• Email: ${data.email}
• Telefone: ${data.telefone}

🏭 *EMPRESA:*
• Razão Social: ${data.empresa}
• CNPJ: ${data.cnpj}
• Faturamento: ${data.faturamentoAnual}
• Tempo: ${data.tempoExistencia}

💼 *CONSULTORIA SOLICITADA:*
• Tipo: ${data.tipoConsultoria}
• Descrição: ${data.mensagem}

${documentosInfo}

🎯 *PRÓXIMOS PASSOS:*
• Nossa equipe analisará sua solicitação
• Entraremos em contato em breve
• Mantenha seu WhatsApp ativo

Obrigado por escolher a Aporte Capital! 🚀`;

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
• Serviço: ${data.tipoConsultoria}
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
        
        // Consulta dados oficiais do CNPJ
        let dadosCNPJ = null;
        if (req.body.cnpj) {
            console.log('Iniciando consulta do CNPJ...');
            try {
                dadosCNPJ = await consultarCNPJ(req.body.cnpj);
                if (dadosCNPJ.success) {
                    console.log('✅ CNPJ consultado com sucesso:', dadosCNPJ.razaoSocial);
                } else {
                    console.log('⚠️ Erro na consulta do CNPJ:', dadosCNPJ.error);
                }
            } catch (error) {
                console.error('❌ Erro ao consultar CNPJ:', error);
                dadosCNPJ = {
                    success: false,
                    error: 'Erro interno na consulta do CNPJ',
                    source: 'erro_interno',
                    consultedAt: new Date().toISOString()
                };
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
            html: generateEmailHTML(req.body, dadosCNPJ, downloadLink, req.files),
            attachments: attachments
        };
        
        // Envia o email
        console.log('📧 Tentando enviar email...');
        console.log('📧 Para:', mailOptions.to);
        console.log('📧 Assunto:', mailOptions.subject);
        
        const emailResult = await transporter.sendMail(mailOptions);
        console.log('✅ Email enviado com sucesso!', emailResult.messageId);
        
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