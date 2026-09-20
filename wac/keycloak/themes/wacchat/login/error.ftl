<!DOCTYPE html>
<html lang="<#if locale??>${locale.currentLanguageTag}<#else>en</#if>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${msg("errorTitle")} — WacChat</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>

<div class="wac-wrap">
  <#include "wac-locale.ftl">
  <div class="wac-card">

    <div class="wac-logo"><img src="${url.resourcesPath}/img/logo.png" alt="WacChat" class="wac-logo-img">WacChat</div>

    <div class="wac-alert wac-alert-error" role="alert">
      <span>${message.summary}</span>
    </div>

    <#if client?? && client.baseUrl?has_content>
      <div class="wac-register-link">
        <a id="backToApplication" href="${client.baseUrl}">&laquo; ${kcSanitize(msg("backToApplication"))?no_esc}</a>
      </div>
    </#if>

  </div>
</div>

</body>
</html>
