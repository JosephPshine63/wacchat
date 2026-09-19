<!DOCTYPE html>
<html lang="<#if locale??>${locale.currentLanguageTag}<#else>en</#if>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${msg("loginTitle",(realm.displayName!''))}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>

<div class="wac-wrap">
  <div class="wac-card">

    <div class="wac-logo"><img src="${url.resourcesPath}/img/logo.png" alt="WacChat" class="wac-logo-img">WacChat</div>

    <#if message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
      <div class="wac-alert wac-alert-${message.type}" role="alert">
        ${kcSanitize(message.summary)?no_esc}
      </div>
    </#if>

    <#if social.providers?? && social.providers?has_content>
      <div class="wac-social">
        <#list social.providers as p>
          <a id="social-${p.alias}" href="${p.loginUrl}" class="wac-social-btn">
            <#if p.alias == 'google'>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            </#if>
            <span>${p.displayName}</span>
          </a>
        </#list>
      </div>
      <#if realm.password>
        <div class="wac-divider"><span>${msg("wacOr")}</span></div>
      </#if>
    </#if>

    <#if realm.password>
      <form id="kc-form-login" action="${url.loginAction}" method="post">

        <div class="wac-field">
          <label for="username">
            <#if !realm.loginWithEmailAllowed>${msg("username")}
            <#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}
            <#else>${msg("email")}</#if>
          </label>
          <input id="username" name="username" type="text"
                 value="${(login.username!'')}"
                 autofocus
                 autocomplete="username"
                 <#if usernameEditDisabled??>disabled</#if>>
        </div>

        <div class="wac-field">
          <label for="password">${msg("password")}</label>
          <div class="wac-password-wrap">
            <input id="password" name="password" type="password"
                   autocomplete="current-password">
            <button type="button" class="wac-pwd-toggle" data-target="password"
                    aria-label="${msg('showPassword')}">
              <svg class="wac-pwd-icon wac-pwd-icon--show" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
              </svg>
              <svg class="wac-pwd-icon wac-pwd-icon--hide" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" style="display:none">
                <path fill="currentColor" d="M3.28 2.22 2.22 3.28l4.02 4.02C3.6 8.94 1.98 11.28 1.5 12c0 0 3 7 10.5 7 2.02 0 3.72-.5 5.13-1.24l3.09 3.09 1.06-1.06L3.28 2.22zM12 17c-4.7 0-7.4-3.6-8.32-5 .5-.77 1.83-2.6 3.86-3.9l1.7 1.7A5 5 0 0 0 16 15.24l1.62 1.62A9.6 9.6 0 0 1 12 17zm0-10a5 5 0 0 1 5 5c0 .5-.09.97-.24 1.42l-1.53-1.53a3 3 0 0 0-3.62-3.62L9.9 6.55A9.6 9.6 0 0 1 12 7zm9.82 5c-.42.65-1.3 1.87-2.62 3.03l-1.06-1.06c1.02-.9 1.75-1.87 2.16-2.47-.92-1.4-3.62-5-8.3-5-.5 0-.98.04-1.44.11L9.1 5.15C10.02 4.87 11 4.7 12 4.7c7.5 0 10.5 7 10.5 7z"/>
              </svg>
            </button>
          </div>
        </div>

        <#if messagesPerField.existsError('username','password')>
          <div class="wac-field-error">
            ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
          </div>
        </#if>

        <div class="wac-options">
          <#if realm.rememberMe && !usernameEditDisabled??>
            <label class="wac-checkbox">
              <input type="checkbox" name="rememberMe" <#if login.rememberMe??>checked</#if>>
              <span>${msg("rememberMe")}</span>
            </label>
          </#if>
          <#if realm.resetPasswordAllowed>
            <a href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
          </#if>
        </div>

        <input type="hidden" name="credentialId"
               value="<#if auth.selectedCredential?has_content>${auth.selectedCredential}</#if>">

        <button type="submit" id="kc-login" name="login" class="wac-btn-primary">
          ${msg("doLogIn")}
        </button>

      </form>
    </#if>

    <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
      <div class="wac-register-link">
        <span>${msg("noAccount")}</span>
        <a href="${url.registrationUrl}">${msg("doRegister")}</a>
      </div>
    </#if>

  </div>
</div>

<div class="wac-disclaimer">
  <span>&#9888;</span>
  ${msg("wacDisclaimer")}
  <a href="${url.resourcesPath}/privacy.html" target="_blank" rel="noopener">${msg("wacPrivacyLink")}</a>
</div>

<script>
  document.querySelectorAll('.wac-pwd-toggle').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var input = document.getElementById(btn.dataset.target);
      var showIcon = btn.querySelector('.wac-pwd-icon--show');
      var hideIcon = btn.querySelector('.wac-pwd-icon--hide');
      if (input.type === 'password') {
        input.type = 'text';
        showIcon.style.display = 'none';
        hideIcon.style.display = '';
      } else {
        input.type = 'password';
        showIcon.style.display = '';
        hideIcon.style.display = 'none';
      }
    });
  });
</script>

</body>
</html>
