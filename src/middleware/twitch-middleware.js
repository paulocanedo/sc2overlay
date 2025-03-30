const { createErrorHtml } = require('../utils/html-utils');

// Middleware para verificar se a Twitch está configurada
function checkTwitchConfig(config) {
    return (req, res, next) => {
        if (!config.twitch || !config.twitch.enabled) {
            return res.status(403).json({ error: 'Integração com a Twitch não está habilitada. Verifique o arquivo config.yaml.' });
        }

        if (!config.twitch.client_id || !config.twitch.client_secret) {
            return res.status(403).json({ error: 'Credenciais da Twitch não configuradas. Verifique o arquivo config.yaml.' });
        }

        next();
    };
}

// Validar estado da autenticação
function validateAuthState(req, res, state, authStates) {
    if (!state || !authStates.has(state)) {
        return res.status(400).send(createErrorHtml(
            'Erro de Autenticação',
            'Estado de autenticação inválido. Isso pode ser uma tentativa de falsificação.'
        ));
    }

    const stateData = authStates.get(state);
    if (stateData.expiresAt < Date.now()) {
        authStates.delete(state);
        return res.status(400).send(createErrorHtml(
            'Erro de Autenticação',
            'O código de autorização expirou. Por favor, tente novamente.'
        ));
    }

    return null; // Sem erro
}

// Middleware para tratar erros em rotas assíncronas
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = {
    checkTwitchConfig,
    validateAuthState,
    asyncHandler
};