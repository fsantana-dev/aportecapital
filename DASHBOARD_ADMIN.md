# 📊 Dashboard Administrativo - Aporte Capital

## 🎯 Como Acessar o Dashboard

### **Método 1: Link no Email** ⭐ (Recomendado)
Todos os emails de solicitação agora incluem uma **seção administrativa azul** com um botão direto para o dashboard:

```
🔧 Área Administrativa - Aporte Capital
📊 Acessar Dashboard Administrativo
```

### **Método 2: Link Discreto no Site**
Na página principal (rodapé), há um link discreto **"🔧 Admin"** que leva ao dashboard.

### **Método 3: URL Direta**
Acesse diretamente: `http://localhost:3002/dashboard`

---

## 🔍 Funcionalidades do Dashboard

### **1. Consulta Manual de CNPJ**
- Digite qualquer CNPJ (com ou sem formatação)
- Máscara automática aplicada durante a digitação
- Validação em tempo real

### **2. Análise de Score Automática**
- **Score de 0-100** baseado em dados públicos
- **Classificação visual** com cores:
  - 🟢 **Verde**: Baixo Risco (70-100)
  - 🟡 **Amarelo**: Médio Risco (40-69)
  - 🔴 **Vermelho**: Alto Risco (0-39)

### **3. Relatório Detalhado**
- **Dados da empresa**: Razão social, situação, data de abertura, capital social
- **Recomendações personalizadas** baseadas no perfil
- **Fatores analisados**: Lista completa dos critérios avaliados
- **Breakdown da pontuação**: Detalhamento por categoria

---

## 📋 Critérios de Avaliação

### **Situação Cadastral** (30 pontos)
- ✅ **Ativa**: 30 pontos
- ⚠️ **Suspensa**: 15 pontos
- ❌ **Outras**: 0 pontos

### **Tempo de Atividade** (25 pontos)
- 🏆 **Mais de 10 anos**: 25 pontos
- 📈 **5-10 anos**: 20 pontos
- 🌱 **2-5 anos**: 15 pontos
- 🆕 **Menos de 2 anos**: 5 pontos

### **Capital Social** (20 pontos)
- 💰 **Acima de R$ 1 milhão**: 20 pontos
- 💵 **R$ 100k - R$ 1M**: 15 pontos
- 💸 **R$ 10k - R$ 100k**: 10 pontos
- 🪙 **Abaixo de R$ 10k**: 5 pontos

### **Atividade Principal** (15 pontos)
- 🏭 **Indústria/Tecnologia**: 15 pontos
- 🏪 **Comércio/Serviços**: 12 pontos
- 🏗️ **Construção**: 10 pontos
- 🌾 **Agropecuária**: 8 pontos
- 📋 **Outras**: 5 pontos

### **Endereço Completo** (10 pontos)
- ✅ **Endereço completo**: 10 pontos
- ❌ **Endereço incompleto**: 0 pontos

---

## 🎨 Interface do Dashboard

### **Design Moderno**
- Layout responsivo e limpo
- Cores consistentes com a identidade da Aporte Capital
- Navegação intuitiva

### **Elementos Visuais**
- **Score circular** com cor dinâmica
- **Cards organizados** para fácil leitura
- **Grid responsivo** para detalhes
- **Feedback visual** em tempo real

### **Experiência do Usuário**
- ⚡ **Consultas rápidas** (2-3 segundos)
- 🔄 **Loading states** informativos
- ❌ **Tratamento de erros** amigável
- 📱 **Totalmente responsivo**

---

## 🔧 Integração com o Sistema Existente

### **Emails Automatizados**
- Todos os emails de solicitação incluem automaticamente:
  - Seção de score (quando CNPJ é fornecido)
  - Link direto para o dashboard
  - Dados detalhados da avaliação

### **API Disponível**
- Endpoint: `GET /api/consulta-cnpj/:cnpj`
- Retorna dados completos em JSON
- Pode ser usado para integrações futuras

### **Logs Detalhados**
- Todas as consultas são registradas no console
- Facilita auditoria e monitoramento
- Inclui timestamps e dados consultados

---

## 🚀 Benefícios para a Aporte Capital

### **Agilidade na Análise**
- ⚡ Avaliação instantânea de CNPJs
- 📊 Score padronizado para comparações
- 🎯 Recomendações objetivas

### **Melhoria no Atendimento**
- 📧 Emails mais informativos
- 🔍 Dados verificados automaticamente
- 💼 Aparência mais profissional

### **Tomada de Decisão**
- 📈 Critérios objetivos de avaliação
- 🎯 Foco em empresas de baixo risco
- ⏰ Economia de tempo na triagem

---

## 📞 Suporte

Para dúvidas ou problemas com o dashboard:
1. Verifique se a aplicação está rodando em `localhost:3002`
2. Teste o link direto: `/dashboard`
3. Consulte os logs do servidor para erros

**Status atual**: ✅ Funcionando e integrado ao sistema existente