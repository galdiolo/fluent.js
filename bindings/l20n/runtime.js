'use strict';

/* jshint -W104 */
/* global Context */
/* global loadINI */
/* global translateFragment, localizeElement */

var DEBUG = false;
var isPretranslated = false;
var rtlList = ['ar', 'he', 'fa', 'ps', 'ur'];

var ctx = new Context();
ctx.ready(onReady);

if (DEBUG) {
  ctx.addEventListener('error', logMessage.bind(null, 'error'));
  ctx.addEventListener('warning', logMessage.bind(null, 'warn'));
}


// Public API

navigator.mozL10n = {
  get: ctx.get.bind(ctx),
  localize: localizeElement,
  translate: function translate(element) {
    return translateFragment(element);
  },
  ready: ctx.ready.bind(ctx),
  get readyState() {
    return ctx.isReady ? 'complete' : 'loading';
  },
  language: {
    set code(lang) {
      ctx.requestLocales(lang);
    },
    get code() {
      return ctx.supportedLocales[0];
    },
    get direction() {
      return getDirection(ctx.supportedLocales[0]);
    }
  }
};

function getDirection(lang) {
  return (rtlList.indexOf(lang) >= 0) ? 'rtl' : 'ltr';
}

var readyStates = {
  'loading': 0,
  'interactive': 1,
  'complete': 2
};

function waitFor(state, callback) {
  state = readyStates[state];
  if (readyStates[document.readyState] >= state) {
    callback();
    return;
  }
  document.addEventListener('readystatechange', function l10n_onrsc() {
    if (readyStates[document.readyState] >= state) {
      document.removeEventListener('readystatechange', l10n_onrsc);
      callback();
    }
  });
}

if (window.document) {
  isPretranslated = (document.documentElement.lang === navigator.language);

  // this is a special case for netError bug
  if (document.documentElement.dataset.noCompleteBug) {
    pretranslate();
    return;
  }


  if (isPretranslated) {
    waitFor('complete', function() {
      window.setTimeout(initDocumentLocalization);
    });
  } else {
    if (document.readyState === 'complete') {
      window.setTimeout(initDocumentLocalization);
    } else {
      waitFor('interactive', pretranslate);
    }
  }

}

function pretranslate() {
  if (inlineLocalization()) {
    waitFor('interactive', function() {
      window.setTimeout(initDocumentLocalization);
    });
  } else {
    initDocumentLocalization();
  }
}

function inlineLocalization() {
  var script = document.documentElement
                       .querySelector('script[type="application/l10n"]' +
                       '[lang="' + navigator.language + '"]');
  if (!script) {
    return false;
  }
  var locale = ctx.getLocale(navigator.language);
  // the inline localization is happenning very early, when the ctx is not
  // yet ready and when the resources haven't been downloaded yet;  add the
  // inlined JSON directly to the current locale
  locale.addAST(JSON.parse(script.innerHTML));
  // localize the visible DOM
  translateFragment(null, locale);
  // the visible DOM is now pretranslated
  isPretranslated = true;
  return true;
}

function initDocumentLocalization() {
  var resLinks = document.head
                         .querySelectorAll('link[type="application/l10n"]');
  var iniLinks = [];
  var link;

  for (link of resLinks) {
    var url = link.getAttribute('href');
    var type = url.substr(url.lastIndexOf('.') + 1);
    if (type === 'ini') {
      iniLinks.push(url);
    }
    ctx.resLinks.push(url);
  }

  var iniLoads = iniLinks.length;
  if (iniLoads === 0) {
    initLocale();
    return;
  }

  function onIniLoaded(err) {
    if (err) {
      ctx._emitter.emit('error', err);
    }
    if (--iniLoads <= 0) {
      initLocale();
    }
  }

  for (link of iniLinks) {
    loadINI(link, onIniLoaded);
  }
}

function initLocale() {
  ctx.requestLocales(navigator.language);
  if (navigator.mozSettings) {
    navigator.mozSettings.addObserver('language.current', function(event) {
      navigator.mozL10n.language.code = event.settingValue;
    });
  }
}

function onReady() {
  if (!isPretranslated) {
    translateFragment();
  }
  isPretranslated = false;

  fireLocalizedEvent();
}

function fireLocalizedEvent() {
  var event = document.createEvent('Event');
  event.initEvent('localized', false, false);
  event.language = ctx.supportedLocales[0];
  window.dispatchEvent(event);
}

function logMessage(type, e) {
  if (DEBUG) {
    console[type](e);
  }
}
