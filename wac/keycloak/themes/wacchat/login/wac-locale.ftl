<#-- Language links shown on every auth page; rendered only when the realm has internationalization on. -->
<#if realm.internationalizationEnabled && locale?? && locale.supported?size gt 1>
  <nav class="wac-lang">
    <#list locale.supported?sort_by("languageTag") as l>
      <a href="${l.url}" lang="${l.languageTag}" hreflang="${l.languageTag}" title="${l.label}"<#if l.languageTag == locale.currentLanguageTag> class="active" aria-current="true"</#if>>${l.languageTag?upper_case}</a>
    </#list>
  </nav>
</#if>
