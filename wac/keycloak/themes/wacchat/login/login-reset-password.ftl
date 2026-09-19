<!DOCTYPE html>
<html lang="<#if locale??>${locale.currentLanguageTag}<#else>en</#if>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${msg("emailForgotTitle")}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>

<div class="wac-wrap">
  <div class="wac-card">

    <div class="wac-logo"><img src="${url.resourcesPath}/img/logo.png" alt="WacChat" class="wac-logo-img">WacChat</div>
    <p class="wac-page-subtitle">${msg("emailForgotTitle")}</p>

    <#if message?has_content>
      <div class="wac-alert wac-alert-${message.type}" role="alert">
        ${kcSanitize(message.summary)?no_esc}
      </div>
    </#if>

    <p class="wac-page-subtitle" style="margin-bottom:1.25rem">
      ${msg("wacResetIntro")}
      <br>${kcSanitize(msg("wacResetWarning"))?no_esc}
    </p>

    <form id="kc-reset-password-form" action="${url.loginAction}" method="post">
      <div class="wac-field">
        <label for="username">${msg("wacResetEmailLabel")}</label>
        <input id="username" name="username" type="text"
               value="${(auth.attemptedUsername!'')}"
               autofocus
               <#if messagesPerField.existsError('username')>class="wac-input-error"</#if>>
        <#if messagesPerField.existsError('username')>
          <span class="wac-field-msg wac-field-msg--error">
            ${kcSanitize(messagesPerField.get('username'))?no_esc}
          </span>
        </#if>
      </div>

      <button type="submit" class="wac-btn-primary" style="margin-top:0.75rem">
        ${msg("doSubmit")}
      </button>
    </form>

    <div class="wac-register-link">
      <a href="${url.loginUrl}">${kcSanitize(msg("backToLogin"))?no_esc}</a>
    </div>

  </div>
</div>

<div class="wac-disclaimer">
  <span>&#9888;</span>
  ${msg("wacDisclaimer")}
</div>

</body>
</html>
