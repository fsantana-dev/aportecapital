const fs = require('fs');
const path = require('path');

// Função para copiar diretório recursivamente
function copyDir(src, dest) {
  // Criar diretório de destino se não existir
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Ler conteúdo do diretório fonte
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Executar cópia
try {
  console.log('🔨 Iniciando build...');
  
  // Remover diretório _site se existir
  if (fs.existsSync('_site')) {
    fs.rmSync('_site', { recursive: true, force: true });
  }
  
  // Copiar arquivos do public para _site
  copyDir('public', '_site');
  
  console.log('✅ Build concluído! Arquivos copiados para _site/');
} catch (error) {
  console.error('❌ Erro durante o build:', error.message);
  process.exit(1);
}