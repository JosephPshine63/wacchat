<!DOCTYPE html>
<html lang="<#if locale??>${locale.currentLanguageTag}<#else>en</#if>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${msg("wacTermsTab")}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="${url.resourcesPath}/css/login.css?v=2">
</head>
<body>

<div class="wac-wrap">
  <#include "wac-locale.ftl">
  <div class="wac-card wac-card--wide">

    <div class="wac-logo"><img src="${url.resourcesPath}/img/logo.png" alt="WacChat" class="wac-logo-img">WacChat</div>
    <p class="wac-page-subtitle">${msg("wacTermsTitle")}</p>

    <div class="wac-verify-body">
      <p>${msg("wacTermsIntro")}</p>
      <ul style="text-align:left; margin: 0.75rem 0 1rem 1.25rem; line-height: 1.6;">
        <li>${msg("wacTerm1")}</li>
        <li>${msg("wacTerm2")}</li>
        <li>${msg("wacTerm3")}</li>
        <li>${msg("wacTerm4")}</li>
        <li>${msg("wacTerm5")}</li>
      </ul>
      <p>
        ${msg("wacTermsFull")}
        <a href="${url.resourcesPath}/privacy.html" target="_blank" rel="noopener">${msg("wacPrivacyLink")}</a>.
      </p>
    </div>

    <form class="wac-terms-actions" action="${url.loginAction}" method="POST">
      <button class="wac-btn-primary" type="submit" name="accept" id="kc-accept" value="accept">
        ${msg("wacAccept")}
      </button>
      <button class="wac-btn-primary wac-btn-outline" type="submit" name="cancel" id="kc-decline" value="cancel">
        ${msg("wacDecline")}
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
