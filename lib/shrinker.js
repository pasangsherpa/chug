var mime = require('./mime');
var chug;
setImmediate(function immediatelySetChug() {
  chug = require('../chug');
});


var shrinker = module.exports = {

  tokenCount: 0,

  tokens: {},

  replacementCharacters: 'abcdefghijklmnopqrstuvwxyz',

  reset: function reset() {
    shrinker.tokenCount = 0;
    shrinker.tokens = {};
  },

  createToken: function createToken(text) {
    shrinker.tokens[text] = {
      text: text,
      replacement: shrinker.getNextReplacement(),
      count: 0
    };
    return shrinker.tokens[text];
  },

  skipPattern: /^(|do|id|in|if|for|new|try|var|case|else|this|void|with)$/,

  getNextReplacement: function getNextReplacement() {
    var radix = shrinker.replacementCharacters.length;
    var replacement = '';
    while (shrinker.skipPattern.test(replacement)) {
      var number = shrinker.tokenCount++;
      replacement = shrinker.replacementCharacters[number % radix];
      while (number >= radix) {
        number = Math.floor(number / radix - 0.999);
        replacement = shrinker.replacementCharacters[number % radix] + replacement;
      }
    }
    return replacement;
  },

  shrink: function shrink(minified) {
    var isFunction = (typeof minified == 'function');
    var code = minified.toString();

    var shrunken = code.replace(/(^|[^A-Z0-9])(_[A-Z][_A-Z0-9]+)/g, function (match, first, text) {
      var token = shrinker.tokens[text] || shrinker.createToken(text);
      token.count++;
      return first + token.replacement;
    });
    if (isFunction) {
      eval('eval.f=' + shrunken); // jshint ignore: line
      shrunken = eval.f;
      var cache = minified.cache;
      if (cache) {
        cache.min = cache.min || {};
        // We must use "key" because function "name" is immutable.
        cache.min[minified.key] = shrunken;
        shrunken.cache = cache.min;
      }
    }
    return shrunken;
  }
};
