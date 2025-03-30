const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

// Função para determinar o caminho base (funciona tanto em desenvolvimento quanto empacotado)
function getBasePath() {
    // Se empacotado com PKG
    if (process.pkg) {
        return path.dirname(process.execPath);
    }
    // Em desenvolvimento
    return process.cwd();
}

// Função para carregar a configuração
function loadConfig() {
    const basePath = getBasePath();
    const configPath = path.join(basePath, 'config.yaml');

    try {
        // Verificar se o arquivo de configuração existe
        if (!fs.existsSync(configPath)) {
            // Se não existir, criar a partir do exemplo
            const examplePath = path.join(basePath, 'config.yaml.example');
            if (fs.existsSync(examplePath)) {
                fs.copyFileSync(examplePath, configPath);
                console.log('Arquivo config.yaml criado a partir do exemplo.');
            } else {
                throw new Error('Arquivo config.yaml.example não encontrado.');
            }
        }

        // Carregar o arquivo de configuração
        const configFile = fs.readFileSync(configPath, 'utf8');
        return yaml.load(configFile);
    } catch (error) {
        console.error('Erro ao carregar configuração:', error);
        process.exit(1);
    }
}

// Ajustar caminhos de armazenamento para funcionarem com o executável
function adjustStoragePaths(config) {
    const basePath = getBasePath();

    // Garantir que o diretório de dados exista
    const dataDir = path.join(basePath, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // Ajustar caminhos no config
    if (config.storage) {
        if (config.storage.stats_file) {
            config.storage.stats_file = path.join(basePath, config.storage.stats_file);
        }
        if (config.storage.database_path) {
            config.storage.database_path = path.join(basePath, config.storage.database_path);
        }
    }

    return config;
}

// Determinar o caminho da pasta public
function getPublicPath() {
    if (process.pkg) {
        // Em produção (executável), o diretório public está embutido no executável
        return path.join(__dirname, '../../public');
    }
    // Em desenvolvimento
    return path.join(process.cwd(), 'public');
}

module.exports = {
    getBasePath,
    loadConfig,
    adjustStoragePaths,
    getPublicPath
};