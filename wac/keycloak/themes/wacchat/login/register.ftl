<!DOCTYPE html>
<html lang="<#if locale??>${locale.currentLanguageTag}<#else>en</#if>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${msg("registerTitle")}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="${url.resourcesPath}/css/login.css?v=2">
</head>
<body>

<div class="wac-wrap">
  <#include "wac-locale.ftl">
  <div class="wac-card wac-card--wide">

    <div class="wac-logo"><img src="${url.resourcesPath}/img/logo.png" alt="WacChat" class="wac-logo-img">WacChat</div>
    <p class="wac-page-subtitle">${msg("registerTitle")}</p>

    <#if message?has_content>
      <div class="wac-alert wac-alert-${message.type}" role="alert">
        ${kcSanitize(message.summary)?no_esc}
      </div>
    </#if>

    <form id="kc-register-form" action="${url.registrationAction}" method="post" novalidate>

      <div class="wac-row-2">
        <div class="wac-field">
          <label for="firstName">${msg("firstName")} <span class="wac-required">*</span></label>
          <input id="firstName" name="firstName" type="text"
                 value="${(register.formData.firstName!'')}"
                 autocomplete="given-name"
                 <#if messagesPerField.existsError('firstName')>class="wac-input-error"</#if>>
          <#if messagesPerField.existsError('firstName')>
            <span class="wac-field-msg wac-field-msg--error">
              ${kcSanitize(messagesPerField.get('firstName'))?no_esc}
            </span>
          </#if>
        </div>

        <div class="wac-field">
          <label for="lastName">${msg("lastName")} <span class="wac-required">*</span></label>
          <input id="lastName" name="lastName" type="text"
                 value="${(register.formData.lastName!'')}"
                 autocomplete="family-name"
                 <#if messagesPerField.existsError('lastName')>class="wac-input-error"</#if>>
          <#if messagesPerField.existsError('lastName')>
            <span class="wac-field-msg wac-field-msg--error">
              ${kcSanitize(messagesPerField.get('lastName'))?no_esc}
            </span>
          </#if>
        </div>
      </div>

      <#if !realm.registrationEmailAsUsername>
        <div class="wac-field">
          <label for="username">${msg("username")} <span class="wac-required">*</span></label>
          <input id="username" name="username" type="text"
                 value="${(register.formData.username!'')}"
                 autocomplete="username"
                 <#if messagesPerField.existsError('username')>class="wac-input-error"</#if>>
          <#if messagesPerField.existsError('username')>
            <span class="wac-field-msg wac-field-msg--error">
              ${kcSanitize(messagesPerField.get('username'))?no_esc}
            </span>
          </#if>
        </div>
      </#if>

      <div class="wac-field">
        <label for="email">${msg("email")} <span class="wac-required">*</span></label>
        <input id="email" name="email" type="email"
               value="${(register.formData.email!'')}"
               autocomplete="email"
               <#if messagesPerField.existsError('email')>class="wac-input-error"</#if>>
        <#if messagesPerField.existsError('email')>
          <span class="wac-field-msg wac-field-msg--error">
            ${kcSanitize(messagesPerField.get('email'))?no_esc}
          </span>
        </#if>
      </div>

      <#if passwordRequired??>
        <div class="wac-field">
          <label for="password">${msg("password")} <span class="wac-required">*</span></label>
          <div class="wac-password-wrap">
            <input id="password" name="password" type="password"
                   autocomplete="new-password"
                   <#if messagesPerField.existsError('password')>class="wac-input-error"</#if>>
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
          <#if messagesPerField.existsError('password')>
            <span class="wac-field-msg wac-field-msg--error">
              ${kcSanitize(messagesPerField.get('password'))?no_esc}
            </span>
          </#if>
        </div>

        <div class="wac-field">
          <label for="password-confirm">${msg("passwordConfirm")} <span class="wac-required">*</span></label>
          <div class="wac-password-wrap">
            <input id="password-confirm" name="password-confirm" type="password"
                   autocomplete="new-password"
                   <#if messagesPerField.existsError('password-confirm')>class="wac-input-error"</#if>>
            <button type="button" class="wac-pwd-toggle" data-target="password-confirm"
                    aria-label="${msg('showPassword')}">
              <svg class="wac-pwd-icon wac-pwd-icon--show" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
              </svg>
              <svg class="wac-pwd-icon wac-pwd-icon--hide" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" style="display:none">
                <path fill="currentColor" d="M3.28 2.22 2.22 3.28l4.02 4.02C3.6 8.94 1.98 11.28 1.5 12c0 0 3 7 10.5 7 2.02 0 3.72-.5 5.13-1.24l3.09 3.09 1.06-1.06L3.28 2.22zM12 17c-4.7 0-7.4-3.6-8.32-5 .5-.77 1.83-2.6 3.86-3.9l1.7 1.7A5 5 0 0 0 16 15.24l1.62 1.62A9.6 9.6 0 0 1 12 17zm0-10a5 5 0 0 1 5 5c0 .5-.09.97-.24 1.42l-1.53-1.53a3 3 0 0 0-3.62-3.62L9.9 6.55A9.6 9.6 0 0 1 12 7zm9.82 5c-.42.65-1.3 1.87-2.62 3.03l-1.06-1.06c1.02-.9 1.75-1.87 2.16-2.47-.92-1.4-3.62-5-8.3-5-.5 0-.98.04-1.44.11L9.1 5.15C10.02 4.87 11 4.7 12 4.7c7.5 0 10.5 7 10.5 7z"/>
              </svg>
            </button>
          </div>
          <#if messagesPerField.existsError('password-confirm')>
            <span class="wac-field-msg wac-field-msg--error">
              ${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}
            </span>
          </#if>
        </div>
      </#if>

      <button type="submit" class="wac-btn-primary" style="margin-top:0.75rem">
        ${msg("doRegister")}
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
