<!DOCTYPE html>
<html lang="<#if locale??>${locale.currentLanguageTag}<#else>en</#if>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${msg("emailVerifyTitle")}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>

<div class="wac-wrap">
  <#include "wac-locale.ftl">
  <div class="wac-card">

    <div class="wac-logo"><img src="${url.resourcesPath}/img/logo.png" alt="WacChat" class="wac-logo-img">WacChat</div>

    <div class="wac-verify-icon">
      <i class="fa fa-envelope-circle-check"></i>
    </div>

    <h2 class="wac-verify-title">${msg("emailVerifyTitle")}</h2>

    <p class="wac-verify-body">
      ${msg("emailVerifyInstruction1", user.email)}
    </p>

    <div class="wac-verify-resend">
      <p>${msg("emailVerifyInstruction2")}</p>
      <a href="${url.loginAction}" class="wac-btn-primary wac-btn-outline">
        ${msg("doClickHere")}
      </a>
      <p>${msg("emailVerifyInstruction3")}</p>
    </div>

  </div>
</div>

<div class="wac-disclaimer">
  <span>&#9888;</span>
  ${msg("wacDisclaimer")}
</div>

</body>
</html>
