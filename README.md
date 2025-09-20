# 🚀 Aporte Capital - Landing Page

Uma landing page moderna e responsiva para captação de aportes financeiros, desenvolvida com HTML5, CSS3 e JavaScript vanilla.

## ✨ Características

- **Design Moderno**: Interface limpa e profissional
- **Totalmente Responsiva**: Funciona perfeitamente em todos os dispositivos
- **Formulário Inteligente**: Coleta de dados com validação
- **Upload de Arquivos**: Sistema para envio de documentos PDF
- **Envio de Email**: Integração com Nodemailer
- **Performance Otimizada**: Carregamento rápido e eficiente

## 🛠️ Tecnologias Utilizadas

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Email**: Nodemailer
- **Upload**: Multer
- **Estilo**: CSS Grid, Flexbox, Animações CSS

## 📦 Instalação Local

```bash
# Clone ou baixe o projeto
# Navegue até o diretório
cd aporte-capital-landing

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env
# Edite o arquivo .env com suas configurações

# Inicie o servidor de desenvolvimento
npm run dev

# Ou inicie o servidor de produção
npm start
```

## 🌐 Deploy em Plataformas

### **Render** (Recomendado)

1. **Acesse**: [render.com](https://render.com)
2. **Conecte** seu projeto (upload de arquivos ou conectar repositório)
3. **Configure**:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node.js
4. **Variáveis de Ambiente**: Configure no painel do Render
5. **Deploy**: Automático após configuração

### **Vercel**

1. **Acesse**: [vercel.com](https://vercel.com)
2. **Importe** seu projeto
3. **Configure**:
   - Framework Preset: Other
   - Build Command: `npm run vercel-build`
   - Output Directory: `public`
4. **Deploy**: Automático

### **Netlify**

1. **Acesse**: [netlify.com](https://netlify.com)
2. **Drag & Drop** da pasta do projeto
3. **Configure**:
   - Build Command: `npm run build`
   - Publish Directory: `public`
4. **Deploy**: Automático

### **Railway**

1. **Acesse**: [railway.app](https://railway.app)
2. **Deploy** from local directory
3. **Configure**:
   - Start Command: `npm start`
   - Port: 3001 (ou variável PORT)
4. **Deploy**: Automático

## ⚙️ Configuração

### **Variáveis de Ambiente (.env)**

```env
# Configurações do Servidor
PORT=3001
NODE_ENV=production

# Configurações de Email
EMAIL_USER=seu-email@gmail.com
EMAIL_PASS=sua-senha-de-app
EMAIL_TO=destino@empresa.com

# Configurações de Upload
MAX_FILE_SIZE=5242880
ALLOWED_EXTENSIONS=pdf,doc,docx
```

### **Scripts Disponíveis**

```bash
npm start          # Inicia servidor de produção
npm run dev        # Inicia servidor de desenvolvimento
npm run build      # Gera build para produção
npm run vercel-build # Build específico para Vercel
npm run render     # Comando para deploy no Render
```

## 📁 Estrutura do Projeto

```
aporte-capital-landing/
├── public/                 # Arquivos estáticos
│   ├── index.html         # Página principal
│   ├── styles.css         # Estilos CSS
│   ├── script.js          # JavaScript
│   └── images/            # Imagens e ícones
├── api/                   # APIs serverless
│   └── send-email.js      # Endpoint de email
├── uploads/               # Arquivos enviados
├── server.js              # Servidor Express
├── build.js               # Script de build
├── package.json           # Dependências
├── vercel.json            # Configuração Vercel
└── .env.example           # Exemplo de variáveis
```

## 🎨 Personalização

### **Cores e Estilo**

Edite o arquivo `public/styles.css` para personalizar:

```css
:root {
  --primary-color: #2c5aa0;
  --secondary-color: #1a365d;
  --accent-color: #3182ce;
  --text-color: #2d3748;
  --background-color: #ffffff;
}
```

### **Conteúdo**

Edite o arquivo `public/index.html` para alterar:
- Textos e títulos
- Informações da empresa
- Formulários
- Seções da página

### **Funcionalidades**

Edite o arquivo `public/script.js` para:
- Adicionar validações
- Modificar comportamentos
- Integrar com APIs externas

## 📧 Configuração de Email

### **Gmail**

1. Ative a verificação em 2 etapas
2. Gere uma senha de app
3. Use a senha de app no `.env`

### **Outros Provedores**

Configure SMTP no arquivo `api/send-email.js`:

```javascript
const transporter = nodemailer.createTransporter({
  host: 'smtp.seudominio.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
```

## 🔧 Solução de Problemas

### **Erro de Upload**

- Verifique o tamanho máximo do arquivo
- Confirme as extensões permitidas
- Verifique permissões da pasta uploads

### **Email não Enviado**

- Verifique as credenciais no `.env`
- Confirme configurações SMTP
- Teste com diferentes provedores

### **Deploy com Erro**

- Verifique as variáveis de ambiente
- Confirme comandos de build
- Verifique logs da plataforma

## 📱 Responsividade

A landing page é totalmente responsiva e funciona em:

- **Desktop**: 1920px+
- **Laptop**: 1024px - 1919px
- **Tablet**: 768px - 1023px
- **Mobile**: 320px - 767px

## 🚀 Performance

- **Lighthouse Score**: 95+
- **Carregamento**: < 3 segundos
- **Otimizações**: Imagens comprimidas, CSS minificado
- **SEO**: Meta tags otimizadas

## 📞 Suporte

Para dúvidas sobre implementação ou personalização:

- **Email**: suporte@aportecapital.com
- **Documentação**: Consulte este README
- **Logs**: Verifique console do navegador

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.

---

<div align="center">

**🚀 Desenvolvido com ❤️ para Aporte Capital**

**⭐ Landing Page Profissional para Captação de Investimentos**

</div>