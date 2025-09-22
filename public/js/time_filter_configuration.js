// Controle para as configurações de filtro de tempo das estatísticas
document.addEventListener('DOMContentLoaded', function() {
    const timeFilterEnabled = document.getElementById('stats-time-filter-enabled');
    const timeFilterSettings = document.getElementById('stats-time-filter-settings');
    const timeFilterType = document.getElementById('stats-time-filter-type');
    const timeValueSetting = document.getElementById('time-value-setting');
    const customPeriodSetting = document.getElementById('custom-period-setting');
    const timeFilterValue = document.getElementById('stats-time-filter-value');

    // Controlar visibilidade das configurações de filtro de tempo
    function toggleTimeFilterSettings() {
        if (timeFilterEnabled && timeFilterSettings) {
            timeFilterSettings.style.display = timeFilterEnabled.checked ? 'block' : 'none';
        }
    }

    // Controlar visibilidade dos campos baseado no tipo de filtro
    function toggleFilterTypeOptions() {
        if (!timeFilterType) return;
        
        const type = timeFilterType.value;
        
        if (timeValueSetting) {
            timeValueSetting.style.display = (type === 'last_days' || type === 'last_hours') ? 'block' : 'none';
        }
        
        if (customPeriodSetting) {
            customPeriodSetting.style.display = type === 'custom_period' ? 'block' : 'none';
        }

        // Atualizar label do campo quantidade baseado no tipo
        if (timeFilterValue) {
            const labelElement = timeValueSetting ? timeValueSetting.querySelector('label') : null;
            
            if (labelElement) {
                if (type === 'last_days') {
                    labelElement.innerHTML = `
                        Quantidade de Dias
                        <span class="tooltip" data-tooltip="Número de dias a considerar">
                            <i class="fas fa-question-circle"></i>
                        </span>
                    `;
                    timeFilterValue.setAttribute('max', '365');
                    timeFilterValue.setAttribute('min', '1');
                    timeFilterValue.value = Math.min(timeFilterValue.value || 7, 365);
                } else if (type === 'last_hours') {
                    labelElement.innerHTML = `
                        Quantidade de Horas
                        <span class="tooltip" data-tooltip="Número de horas a considerar">
                            <i class="fas fa-question-circle"></i>
                        </span>
                    `;
                    timeFilterValue.setAttribute('max', '8760'); // 365 * 24
                    timeFilterValue.setAttribute('min', '1');
                    timeFilterValue.value = Math.min(timeFilterValue.value || 24, 8760);
                }
            }
        }
    }

    // Inicializar campos de data/hora com valores padrão
    function initializeDateTimeFields() {
        const startDateField = document.getElementById('stats-time-filter-start');
        const endDateField = document.getElementById('stats-time-filter-end');
        
        if (startDateField && !startDateField.value) {
            // Definir data de início como uma semana atrás
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            startDateField.value = formatDateTimeLocal(weekAgo);
        }
        
        if (endDateField && !endDateField.value) {
            // Definir data de fim como agora
            const now = new Date();
            endDateField.value = formatDateTimeLocal(now);
        }
    }

    // Função auxiliar para formatar data/hora para input datetime-local
    function formatDateTimeLocal(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    // Adicionar event listeners
    if (timeFilterEnabled) {
        timeFilterEnabled.addEventListener('change', toggleTimeFilterSettings);
        toggleTimeFilterSettings(); // Executar inicialmente
    }

    if (timeFilterType) {
        timeFilterType.addEventListener('change', function() {
            toggleFilterTypeOptions();
            if (timeFilterType.value === 'custom_period') {
                initializeDateTimeFields();
            }
        });
        toggleFilterTypeOptions(); // Executar inicialmente
    }

    // Executar inicialização
    initializeDateTimeFields();
});
