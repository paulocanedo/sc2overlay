// Estado da aplicação
const configState = {
    originalConfig: {},
    currentConfig: {},
    hasChanges: false,
    requiresRestart: false
};

// Campos que requerem reinicialização
const restartRequiredFields = new Set([
    'sc2_client.api_url',
    'sc2_client.poll_interval',
    'server.port',
    'twitch.enabled',
    'twitch.channel_name',
    'twitch.client_id',
    'twitch.client_secret',
    'storage.database_path'
]);

// Elementos DOM
const elements = {
    alertsContainer: document.getElementById('alerts-container'),
    saveBtn: document.getElementById('save-config'),
    resetBtn: document.getElementById('reset-config'),
    downloadBtn: document.getElementById('download-config'),
    addPanelBtn: document.getElementById('add-panel-btn'),
    panelsContainer: document.getElementById('panels-container'),
    twitchEnabled: document.getElementById('twitch-enabled'),
    twitchSettings: document.getElementById('twitch-settings'),
    opacitySlider: document.getElementById('overlay-bg-opacity'),
    opacityValue: document.getElementById('opacity-value')
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    loadConfiguration();
    setupEventListeners();
});

// Carregar configuração do servidor
async function loadConfiguration() {
    try {
        const response = await fetch('/api/config/full');

        if (!response.ok) {
            throw new Error('Erro ao carregar configuração');
        }

        const config = await response.json();
        configState.originalConfig = JSON.parse(JSON.stringify(config));
        configState.currentConfig = JSON.parse(JSON.stringify(config));

        populateForm(config);
        updateUI();

    } catch (error) {
        console.error('Erro ao carregar configuração:', error);
        showAlert('Erro ao carregar configuração do servidor', 'error');
    }
}

// Popular formulário com dados da configuração
function populateForm(config) {
    // Percorrer todos os campos de input
    document.querySelectorAll('[name]').forEach(input => {
        const fieldPath = input.name;
        const value = getNestedValue(config, fieldPath);

        if (value !== undefined) {
            if (input.type === 'checkbox') {
                input.checked = value;
            } else if (input.type === 'range') {
                input.value = value;
                updateOpacityDisplay(value);
            } else {
                input.value = value;
            }
        }
    });

    // Popular painéis personalizados
    if (config.overlay && config.overlay.panels) {
        config.overlay.panels.forEach(panel => {
            addPanelToUI(panel);
        });
    }

    // Mostrar/ocultar configurações da Twitch
    updateTwitchSettingsVisibility();
}

// Obter valor aninhado de objeto
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Definir valor aninhado em objeto
function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
        if (!current[key]) current[key] = {};
        return current[key];
    }, obj);
    target[lastKey] = value;
}

// Configurar event listeners
function setupEventListeners() {
    // Listener para mudanças em inputs
    document.querySelectorAll('[name]').forEach(input => {
        input.addEventListener('change', handleInputChange);
        input.addEventListener('input', handleInputChange);
    });

    // Botões de ação
    elements.saveBtn.addEventListener('click', saveConfiguration);
    elements.resetBtn.addEventListener('click', resetConfiguration);
    elements.downloadBtn.addEventListener('click', downloadConfiguration);
    elements.addPanelBtn.addEventListener('click', addNewPanel);

    // Toggle de senha
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', togglePasswordVisibility);
    });

    // Controle de opacidade
    elements.opacitySlider.addEventListener('input', (e) => {
        updateOpacityDisplay(e.target.value);
    });

    // Checkbox da Twitch
    elements.twitchEnabled.addEventListener('change', updateTwitchSettingsVisibility);
}

// Manipular mudanças em inputs
function handleInputChange(event) {
    const input = event.target;
    const fieldPath = input.name;

    if (!fieldPath) return;

    let value;
    if (input.type === 'checkbox') {
        value = input.checked;
    } else if (input.type === 'number') {
        value = parseFloat(input.value) || 0;
    } else {
        value = input.value;
    }

    // Atualizar configuração atual
    setNestedValue(configState.currentConfig, fieldPath, value);

    // Verificar se há mudanças
    checkForChanges();

    // Adicionar classe visual de mudança
    input.classList.add('has-changed');

    // Verificar se requer reinicialização
    if (input.classList.contains('requires-restart') || restartRequiredFields.has(fieldPath)) {
        configState.requiresRestart = true;
        updateUI();
    }
}

// Verificar se há mudanças na configuração
function checkForChanges() {
    const original = JSON.stringify(configState.originalConfig);
    const current = JSON.stringify(configState.currentConfig);

    configState.hasChanges = original !== current;
    updateUI();
}

// Atualizar interface baseado no estado
function updateUI() {
    // Habilitar/desabilitar botões
    elements.saveBtn.disabled = !configState.hasChanges;
    elements.resetBtn.disabled = !configState.hasChanges;

    // Mostrar aviso de reinicialização se necessário
    if (configState.requiresRestart && configState.hasChanges) {
        showRestartWarning();
    }
}

// Salvar configuração
async function saveConfiguration() {
    if (!configState.hasChanges) return;

    try {
        // Coletar configuração dos painéis
        const panels = collectPanelsData();
        if (!configState.currentConfig.overlay) {
            configState.currentConfig.overlay = {};
        }
        configState.currentConfig.overlay.panels = panels;

        const response = await fetch('/api/config/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(configState.currentConfig)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erro ao salvar configuração');
        }

        // Atualizar estado
        configState.originalConfig = JSON.parse(JSON.stringify(configState.currentConfig));
        configState.hasChanges = false;

        // Limpar indicadores visuais
        document.querySelectorAll('.has-changed').forEach(input => {
            input.classList.remove('has-changed');
        });

        showAlert('Configuração salva com sucesso!', 'success');

        if (configState.requiresRestart) {
            showAlert('Algumas mudanças requerem reinicialização do servidor para ter efeito.', 'warning', 10000);
            configState.requiresRestart = false;
        }

        updateUI();

    } catch (error) {
        console.error('Erro ao salvar configuração:', error);
        showAlert(`Erro ao salvar: ${error.message}`, 'error');
    }
}

// Resetar configuração
function resetConfiguration() {
    if (!configState.hasChanges) return;

    if (confirm('Deseja realmente descartar todas as alterações?')) {
        configState.currentConfig = JSON.parse(JSON.stringify(configState.originalConfig));
        configState.hasChanges = false;
        configState.requiresRestart = false;

        populateForm(configState.originalConfig);

        // Limpar indicadores visuais
        document.querySelectorAll('.has-changed').forEach(input => {
            input.classList.remove('has-changed');
        });

        // Limpar alertas
        elements.alertsContainer.innerHTML = '';

        showAlert('Alterações descartadas', 'info');
        updateUI();
    }
}

// Baixar configuração
async function downloadConfiguration() {
    try {
        const response = await fetch('/api/config/download');

        if (!response.ok) {
            throw new Error('Erro ao baixar configuração');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'config.yaml';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showAlert('Arquivo config.yaml baixado com sucesso!', 'success');

    } catch (error) {
        console.error('Erro ao baixar configuração:', error);
        showAlert('Erro ao baixar arquivo de configuração', 'error');
    }
}

// Adicionar novo painel
function addNewPanel() {
    const panel = {
        id: `panel_${Date.now()}`,
        content: 'Novo painel',
        icon: 'fas fa-info-circle',
        accent_color: 'blue'
    };

    addPanelToUI(panel);

    // Marcar como alterado
    configState.hasChanges = true;
    updateUI();
}

// Adicionar painel à interface
function addPanelToUI(panel) {
    const panelId = panel.id || `panel_${Date.now()}`;
    const panelHtml = `
    <div class="panel-item" data-panel-id="${panelId}">
      <div class="panel-header-controls">
        <span class="panel-title">Painel Personalizado</span>
        <button type="button" class="remove-panel-btn" onclick="removePanel('${panelId}')">
          <i class="fas fa-trash"></i>
        </button>
      </div>
      <div class="panel-fields">
        <div class="panel-field">
          <label>Conteúdo do Painel</label>
          <textarea 
            class="panel-content" 
            placeholder="Use variáveis como $subscribers, $viewers, etc."
          >${panel.content || ''}</textarea>
          <small>Variáveis disponíveis: $subscribers, $viewers, $lastSubscriber, $channelTitle, $gameName, $followerCount, $lastFollower, $streamUptime</small>
        </div>
        <div class="panel-field">
          <label>Ícone (classe Font Awesome)</label>
          <input 
            type="text" 
            class="panel-icon" 
            placeholder="fas fa-users"
            value="${panel.icon || 'fas fa-info-circle'}"
          />
        </div>
        <div class="panel-field">
          <label>Cor do Acento</label>
          <select class="panel-accent-color">
            <option value="purple" ${panel.accent_color === 'purple' ? 'selected' : ''}>Roxo (Twitch)</option>
            <option value="blue" ${panel.accent_color === 'blue' ? 'selected' : ''}>Azul</option>
            <option value="green" ${panel.accent_color === 'green' ? 'selected' : ''}>Verde</option>
            <option value="red" ${panel.accent_color === 'red' ? 'selected' : ''}>Vermelho</option>
          </select>
        </div>
      </div>
    </div>
  `;

    elements.panelsContainer.insertAdjacentHTML('beforeend', panelHtml);

    // Adicionar listeners aos novos campos
    const newPanel = elements.panelsContainer.lastElementChild;
    newPanel.querySelectorAll('input, select, textarea').forEach(input => {
        input.addEventListener('change', () => {
            configState.hasChanges = true;
            updateUI();
        });
    });
}

// Remover painel
window.removePanel = function(panelId) {
    if (confirm('Deseja realmente remover este painel?')) {
        const panelElement = document.querySelector(`[data-panel-id="${panelId}"]`);
        if (panelElement) {
            panelElement.remove();
            configState.hasChanges = true;
            updateUI();
        }
    }
};

// Coletar dados dos painéis
function collectPanelsData() {
    const panels = [];

    document.querySelectorAll('.panel-item').forEach(panelElement => {
        const panelId = panelElement.dataset.panelId;
        const content = panelElement.querySelector('.panel-content').value;
        const icon = panelElement.querySelector('.panel-icon').value;
        const accentColor = panelElement.querySelector('.panel-accent-color').value;

        if (content.trim()) {
            panels.push({
                id: panelId,
                content: content,
                icon: icon || 'fas fa-info-circle',
                accent_color: accentColor || 'blue'
            });
        }
    });

    return panels;
}

// Toggle visibilidade de senha
function togglePasswordVisibility(event) {
    const button = event.currentTarget;
    const targetId = button.dataset.target;
    const input = document.getElementById(targetId);
    const icon = button.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Atualizar display de opacidade
function updateOpacityDisplay(value) {
    elements.opacityValue.textContent = parseFloat(value).toFixed(2);
}

// Atualizar visibilidade das configurações da Twitch
function updateTwitchSettingsVisibility() {
    if (elements.twitchEnabled.checked) {
        elements.twitchSettings.style.display = 'block';
    } else {
        elements.twitchSettings.style.display = 'none';
    }
}

// Mostrar alerta
function showAlert(message, type = 'info', duration = 5000) {
    const alertId = `alert-${Date.now()}`;
    const alertHtml = `
    <div class="alert alert-${type} fade-in" id="${alertId}">
      <i class="fas ${getAlertIcon(type)}"></i>
      <span>${message}</span>
    </div>
  `;

    elements.alertsContainer.insertAdjacentHTML('beforeend', alertHtml);

    // Remover alerta após duração
    setTimeout(() => {
        const alert = document.getElementById(alertId);
        if (alert) {
            alert.style.opacity = '0';
            setTimeout(() => alert.remove(), 300);
        }
    }, duration);
}

// Obter ícone para tipo de alerta
function getAlertIcon(type) {
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    return icons[type] || icons.info;
}

// Mostrar aviso de reinicialização
function showRestartWarning() {
    const existingWarning = document.querySelector('.alert-warning');
    if (!existingWarning || !existingWarning.textContent.includes('reinicialização')) {
        showAlert('Algumas alterações requerem reinicialização do servidor para ter efeito.', 'warning', 0);
    }
}