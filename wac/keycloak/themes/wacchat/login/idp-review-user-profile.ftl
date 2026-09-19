<!DOCTYPE html>
<html lang="<#if locale??>${locale.currentLanguageTag}<#else>en</#if>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${msg("loginIdpReviewProfileTitle")}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>

<div class="wac-wrap">
  <div class="wac-card wac-card--wide">

    <div class="wac-logo"><img src="${url.resourcesPath}/img/logo.png" alt="WacChat" class="wac-logo-img">WacChat</div>
    <p class="wac-page-subtitle">${msg("loginIdpReviewProfileTitle")}</p>

    <#if message?has_content>
      <div class="wac-alert wac-alert-${message.type}" role="alert">
        ${kcSanitize(message.summary)?no_esc}
      </div>
    </#if>

    <form id="kc-idp-review-profile-form" action="${url.loginAction}" method="post">

      <div class="wac-row-2">
        <div class="wac-field">
          <label for="firstName">${msg("firstName")} <span class="wac-required">*</span></label>
          <input id="firstName" name="firstName" type="text"
                 value="${(user.firstName!'')}"
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
                 value="${(user.lastName!'')}"
                 autocomplete="family-name"
                 <#if messagesPerField.existsError('lastName')>class="wac-input-error"</#if>>
          <#if messagesPerField.existsError('lastName')>
            <span class="wac-field-msg wac-field-msg--error">
              ${kcSanitize(messagesPerField.get('lastName'))?no_esc}
            </span>
          </#if>
        </div>
      </div>

      <div class="wac-field">
        <label for="email">${msg("email")} <span class="wac-required">*</span></label>
        <input id="email" name="email" type="email"
               value="${(user.email!'')}"
               autocomplete="email"
               <#if messagesPerField.existsError('email')>class="wac-input-error"</#if>>
        <#if messagesPerField.existsError('email')>
          <span class="wac-field-msg wac-field-msg--error">
            ${kcSanitize(messagesPerField.get('email'))?no_esc}
          </span>
        </#if>
      </div>

      <button type="submit" class="wac-btn-primary" style="margin-top:0.75rem">
        ${msg("doSubmit")}
      </button>

    </form>

  </div>
</div>

<div class="wac-disclaimer">
  <span>&#9888;</span>
  ${msg("wacDisclaimer")}
</div>

</body>
</html>
