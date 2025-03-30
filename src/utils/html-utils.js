// Utilitário para criar HTML de resposta de erro
function createErrorHtml(title, message, buttonText = 'Voltar ao Início') {
    return `
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
          .error { color: #e53935; }
          .button { display: inline-block; margin-top: 20px; padding: 10px 20px; 
                   background-color: #6441a5; color: white; text-decoration: none; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h2>${title}</h2>
        <p class="error">${message}</p>
        <a class="button" href="/">${buttonText}</a>
      </body>
    </html>
  `;
}

// Utilitário para criar HTML de resposta de sucesso
function createSuccessHtml(title, message, buttonText = 'Voltar ao Início', autoClose = true) {
    return `
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
          .success { color: #43a047; }
          .button { display: inline-block; margin-top: 20px; padding: 10px 20px; 
                   background-color: #6441a5; color: white; text-decoration: none; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h2>${title}</h2>
        <p class="success">${message}</p>
        <a class="button" href="/">${buttonText}</a>
        ${autoClose ? `
        <script>
          setTimeout(() => {
            if (window.opener) {
              window.opener.postMessage('twitch-auth-success', '*');
              window.close();
            }
          }, 5000);
        </script>
        ` : ''}
      </body>
    </html>
  `;
}

module.exports = {
    createErrorHtml,
    createSuccessHtml
};