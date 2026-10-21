// Runs before first paint (loaded twice: before and after the stylesheets) so there is no flash.
(function () { try {
  var t = localStorage.getItem('aurora_estates_theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.style.colorScheme = t;
  var l = document.getElementById('aurora-app-css'); if (l) l.disabled = t !== 'light';   // purple app look = light mode only
} catch (e) {} })();
