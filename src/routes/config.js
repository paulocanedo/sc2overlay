const express = require('express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

module.exports = function(configPath, config) {
    const router = express.Router();

    // Rota original do api.js - configuração segura para o cliente
    router.get('/', (req, res) => {
        // Enviar apenas configurações seguras (sem secrets)
        const clientConfig = {
            overlay: config.overlay,
            player: {
                id: config.player.id,
                name: config.player.name
            },
            stats: config.stats
        };

        // Garantir que a opacidade tenha um valor padrão se não estiver definida
        if (clientConfig.overlay && clientConfig.overlay.bg_opacity === undefined) {
            clientConfig.overlay.bg_opacity = 0.95; // Valor padrão
        }

        res.json(clientConfig);
    });

    // Obter configuração completa (incluindo valores sensíveis para edição)
    router.get('/full', (req, res) => {
        try {
            const configFile = fs.readFileSync(configPath, 'utf8');
            const config = yaml.load(configFile);
            res.json(config);
        } catch (error) {
            console.error('Erro ao ler configuração:', error);
            res.status(500).json({ error: 'Erro ao carregar configuração' });
        }
    });

    // Salvar configuração
    router.post('/save', express.json(), (req, res) => {
        try {
            const newConfig = req.body;

            // Validar configuração básica
            if (!newConfig.player || !newConfig.player.name) {
                return res.status(400).json({ error: 'Nome do jogador é obrigatório' });
            }

            // Converter para YAML
            const yamlStr = yaml.dump(newConfig, {
                indent: 2,
                lineWidth: -1,
                noRefs: true,
                sortKeys: false
            });

            // Fazer backup do arquivo atual
            const backupPath = configPath + '.backup';
            if (fs.existsSync(configPath)) {
                fs.copyFileSync(configPath, backupPath);
            }

            // Salvar nova configuração
            fs.writeFileSync(configPath, yamlStr, 'utf8');

            res.json({ success: true, message: 'Configuração salva com sucesso' });
        } catch (error) {
            console.error('Erro ao salvar configuração:', error);
            res.status(500).json({ error: 'Erro ao salvar configuração: ' + error.message });
        }
    });

    // Download do arquivo config.yaml
    router.get('/download', (req, res) => {
        try {
            if (!fs.existsSync(configPath)) {
                return res.status(404).json({ error: 'Arquivo de configuração não encontrado' });
            }

            res.download(configPath, 'config.yaml', (err) => {
                if (err) {
                    console.error('Erro ao fazer download:', err);
                    res.status(500).json({ error: 'Erro ao fazer download do arquivo' });
                }
            });
        } catch (error) {
            console.error('Erro ao processar download:', error);
            res.status(500).json({ error: 'Erro ao processar download' });
        }
    });

    // Validar configuração
    router.post('/validate', express.json(), (req, res) => {
        try {
            const config = req.body;
            const errors = [];
            const warnings = [];

            // Validações básicas
            if (!config.player || !config.player.name) {
                errors.push('Nome do jogador é obrigatório');
            }

            if (!config.sc2_client || !config.sc2_client.api_url) {
                errors.push('URL da API do SC2 é obrigatória');
            }

            if (config.server && config.server.port) {
                const port = parseInt(config.server.port);
                if (isNaN(port) || port < 1 || port > 65535) {
                    errors.push('Porta do servidor deve ser um número entre 1 e 65535');
                }
            }

            // Validações da Twitch
            if (config.twitch && config.twitch.enabled) {
                if (!config.twitch.channel_name) {
                    warnings.push('Nome do canal da Twitch não configurado');
                }
                if (!config.twitch.client_id || !config.twitch.client_secret) {
                    warnings.push('Credenciais da Twitch incompletas');
                }
            }

            res.json({
                valid: errors.length === 0,
                errors,
                warnings
            });
        } catch (error) {
            console.error('Erro ao validar configuração:', error);
            res.status(500).json({ error: 'Erro ao validar configuração' });
        }
    });

    return router;
};