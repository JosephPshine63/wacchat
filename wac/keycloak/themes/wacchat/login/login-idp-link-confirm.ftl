<!DOCTYPE html>
<html lang="<#if locale??>${locale.currentLanguageTag}<#else>en</#if>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${msg("confirmLinkIdpTitle")}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>

<div class="wac-wrap">
  <div class="wac-card">

    <div class="wac-logo"><img src="${url.resourcesPath}/img/logo.png" alt="WacChat" class="wac-logo-img">WacChat</div>

    <div class="wac-idp-info-box">
      <div class="wac-idp-info-icon">&#9432;</div>
      <p>${msg("confirmLinkIdpTitle")}</p>
    </div>

    <p class="wac-idp-subtitle">
      ${msg("emailLinkIdp1", idpDisplayName, brokerContext.username, realm.displayName!'')}
    </p>

    <form id="kc-register-form" action="${url.loginAction}" method="post">
      <div class="wac-idp-actions">
        <button type="submit" name="submitAction" value="linkAccount" class="wac-btn-primary">
          ${msg("confirmLinkIdpContinue", idpDisplayName)}
        </button>
        <button type="submit" name="submitAction" value="updateProfile" class="wac-btn-secondary">
          ${msg("confirmLinkIdpReviewProfile")}
        </button>
      </div>
    </form>

  </div>
</div>

<div class="wac-disclaimer">
  <span>&#9888;</span>
  ${msg("wacDisclaimer")}
</div>

</body>
</html>
