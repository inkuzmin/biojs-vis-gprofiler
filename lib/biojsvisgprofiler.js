
// biojs-vis-gprofiler
// https://github.com/tambeta/biojs-vis-gprofiler
//
// Copyright (c) 2014 Tambet Arak
// Licensed under the BSD license.

/**
 * Construct a BioJSVisGProfiler object.
 *
 * @constructor
 * @param {Object} attrs - Pass properties to the constructor via this object.
 *
 * @property {string} container - Container wherein the cloud will be rendered,
 *  in selector format. _required_
 * @property {int} width - Width of the rendered cloud, in pixels.
 * _default_: 300
 * @property {int} height - Height of the rendered cloud, in pixels.
 * _default_: 300
 * @property {int} maxN - Max number of strings to display.
 * @property {int} maxTermLen - Max length of a term description, keep this at a
 *  reasonable value to ensure all terms are displayed. No effect if useTerms
 *  is false.
 * @property {boolean} useTerms - Display whole functional terms instead of
 *  single words.
 * @property {boolean} warnings - Log rendering warnings to the console.
 * @property {boolean} showLogo - Set to false to suppress displaying the
 *  g:Profiler logo at the bottom right.
 * @property {boolean} showInfo - Set to false to suppress displaying the
 *  default tooltip upon clicking a string.
 * @property {renderCb} sizer - Callback function returning the point size of a
 *  string.
 * @property {renderCb} colorer - Callback function returning the color of a
 *  string.
 * @property {scorerCb} scorer - Callback function returning the score for a
 *  string. This is used for ordering to select `maxN` top strings and is passed
 *  to the `sizer` and `colorer` callbacks. Note that the scores are normalized
 *  to sum to 1.
 * @property {distillerCb} distiller - Callback function returning an array of
 *  strings to be rendered.
 *
 * @example
 * ```
 * var gp = require('biojs-vis-gprofiler');
 *
 * gp = new gp({
 *   container  : "#myContainer",
 *   width      : 600,
 *   height     : 600,
 * });
 *
 * gp.on("onrender", function() {
 *   console.log("caught render event");
 * });
 *
 * gp.render({
 *   query    : ["swi4", "swi6", "mbp1"],
 *   organism : "scerevisiae",
 * });
 * ```
 */

function BioJSVisGProfiler(attrs) {
  var swh = {};
  var $;

  // Load modules

  this.$ = $      = require('jquery-browserify').noConflict();
  this._          = require('underscore');
  this.d3         = require('d3-browserify');
  this.cloud      = require('./d3.layout.cloud');
  this.stopwords  = require('stopwords').english;
  this.events     = require('backbone-events-standalone');
  this.gp         = require('./gprofiler');
  this.gpdata     = require('./gprofiler-data');
  this.css        = require('./biojsvisgprofiler.css');

  // Attributes

  var defaults = {
    container     : null,
    width         : 300,
    height        : 300,
    maxN          : 0,
    maxTermLen    : 25,
    warnings      : false,
    useTerms      : false,
    showLogo      : true,
    showInfo      : true,
    sizer         : null,
    colorer       : null,
    scorer        : null,
    distiller     : null
  };

  var constants = {
    INFOBOX_ID  : '_gpvis_infobox',    
    LOGO_ID     : '_gpvis_logo'
  };

  attrs = $.extend({}, defaults, attrs);
  $.extend(this, attrs, constants);
  this.container = $(this.container);

  // Misc. setup

  if (!window.d3) // d3-cloud requires global d3
    window.d3 = this.d3;

  $.extend(this, this.events);

  $.each(this.stopwords, function(i, v) {
    swh[v] = 1; });
  this.stopwords = swh;
}

/**
 * Query g:Profiler and render a cloud.
 *
 * @function
 * @param {Object} attrs - Passed through to GProfiler.{@link GProfiler#query}.
 *
 * @fires BioJSVisGProfiler#onrender
 * @fires BioJSVisGProfiler#onclick
 */

BioJSVisGProfiler.prototype.render = function(attrs) {
  var gp = this.gp;
  var _this = this;

  gp.query(attrs, function(data) {
    _this.renderStored(data);
  });
};

/**
 * Render cloud based on an object previously returned by
 * GProfiler.{@link GProfiler#query}.
 *
 * @function
 * @param {Object} data - Object returned by GProfiler.{@link GProfiler#query}.
 *
 * @fires BioJSVisGProfiler#onrender
 * @fires BioJSVisGProfiler#onclick
 */

BioJSVisGProfiler.prototype.renderStored = function(data) {
  var _this = this;
  var $ = _this.$;
  var twords = [];
  var distiller = _this.distiller ||
    _this._getCallback('distiller');

  $.each(data, function(i, r) {
    $.each(distiller(r) || [], function(j, str) {
      twords.push([str, r]); });
  });

  _this._renderCloud(twords);
};

/**
 * Return an instance of {@link GProfiler}.
 */

BioJSVisGProfiler.prototype.getGProfiler = function() {
  return this.gp;
};

/**
 * Return the infobox element id attribute.
 */

BioJSVisGProfiler.prototype.getInfoboxId = function() {
  return this.INFOBOX_ID;
};

BioJSVisGProfiler.prototype._renderCloud = function(clels) {

  // Render the cloud. The argument is an array of cloud
  // elements (a string and the term structure from
  // g:Profiler). The cloud is visually scaled
  // proportionally to desired dimensions.

  var $ = this.$;
  var _this = this;
  var cloud = this.cloud;

  var w = this.width;
  var h = this.height;
  var scaling =
    (w + h) / 2 / 600;
  var clelScores;

  if (_this.container.length !== 1)
    throw new Error('the container parameter must specify a unique element');

  // clels becomes 1:n after collapse, i.e. a string may be related t
  // to multiple terms, but strings are unique.

  clels =
    _this._collapseClels(clels);
  clelScores =
    _this._scoreClels(clels);
  clels =
    _this._sortAndCapClels(clels, clelScores);

  // Log render warnings, if requested

  if (_this.warnings) {
    _this.on('onrender', function() {
      _this._renderWarn(clels, clelScores);
    });
  }

  // Init cloud

  cloud().size([w, h])
    .words(
      _this._renderTransformStr.apply(_this, [clels, clelScores, scaling])
    )
    .padding(scaling * 3)
    .rotate(0)
    .font('Impact')
    .fontSize(function(d) { return d.size; })
    .on('end', function(words) {
      _this._renderDraw.apply(_this, [words, scaling]);
    })
    .start();
};

BioJSVisGProfiler.prototype._renderTransformStr =
function(clels, clelScores, scaling) {

  // Transforms the cloud elements data structure (list of string +
  // term data pairs) into an object for the draw function.

  var _this = this;
  var $ = _this.$;
  var r;

  var sizer = this.sizer || this._getCallback('sizer');
  var colorer = this.colorer || this._getCallback('colorer');

  r = $.map(clels, function(v, i) {
    var str = v[0];
    var termdata = v[1];
    var score = clelScores[str];
    var cbattrs = {
      score : score,
      scaling : scaling,
      str : str,
      termdata : termdata
    };

    return {
      text      : str,
      size      : sizer(cbattrs),
      color     : colorer(cbattrs),
      termdata  : termdata
    };
  });

  return r;
};

BioJSVisGProfiler.prototype._renderDraw = function(words, scaling) {

  // The rendering function for d3-cloud

  var _this = this;
  var w = _this.width;
  var h = _this.height;
  var d3 = _this.d3;
  var $ = _this.$;
  var d3c = d3.select(_this.container.get(0));
  var logoh = _this._capValue(parseInt(20 * scaling), 12, 35);
  var gprofiler = _this.getGProfiler();

  // Render cloud

  d3c.append('svg')
      .attr('width', w)
      .attr('height', h)
    .append('g')
      .attr(
        'transform', 'translate(' + parseInt(w/2) + ',' +
        parseInt(h/2) + ')'
      )
    .selectAll('text')
    .data(words).enter().append('text')
      .style('font-size', function(d) { return d.size + 'px'; })
      .style('font-family', 'Impact')
      .style('fill', function(d, i) { return d.color; })
      .attr('text-anchor', 'middle')
      .attr('transform', function(d) {
        var s =
          'translate(' + [d.x, d.y] + ')' +
          'rotate(' + d.rotate + ')';
        return s;
      })
      .text(function(d) { return d.text; });

  // Render logo

  if (_this.showLogo) {
    var logo;

    d3c.select('svg > g').append('a')
        .attr('xlink:href', 'javascript:void(0);')
        .attr('id', _this.LOGO_ID)
      .append('image')
        .attr('x', 0 - parseInt(w / 2)).attr('y', parseInt(h / 2) - logoh)
        .attr('height', logoh).attr('width', w)
        .attr('preserveAspectRatio', 'xMaxYMid')
        .attr(
          'xlink:href',
          'data:image/png;base64,' + _this.gpdata.gpLogo
        );

    logo = d3c
      .select('#' + _this.LOGO_ID)
      .attr('xlink:href', gprofiler.getQueryURL() || gprofiler.getRootURL())
      .attr('target', '_blank');
  }

  // Apply click behavior

  d3.select('body').on('click', function() {
    $('#' + _this.INFOBOX_ID).hide();
  });

  d3c.selectAll('text')
    .style('cursor', 'pointer')
    .on('click', function(d) {
      var e = d3.event;
      if (_this.showInfo)
        _this._renderInfoBox(d, e);
      _this.trigger('onclick', d, e);
    });

  _this.trigger('onrender');
};

BioJSVisGProfiler.prototype._renderInfoBox = function(d, event) {
  var _this = this;
  var $ = _this.$;
  var box = $('#' + _this.INFOBOX_ID);
  var html = '';

  // Append infobox DOM node if not present

  if (!box.length) {
    html =
      '<div id="' + _this.INFOBOX_ID + '"></div>';

    $('body').append(html);
    box = $('#' + _this.INFOBOX_ID);
    if (!box.length)
      return;
  }

  // Generate and position infobox

  $.each(d.termdata, function(i, v) {
    html +=
      v['term_id'] + ' - ' + v['term_name'] +
      ' (<i>p = ' + parseFloat(v['p_value']).toExponential() + '</i>)<hr/>';
  });

  html =
    html.replace(/<hr\/>$/, '');
  box
    .css('top', event.pageY).css('left', event.pageX)
    .html(html).show();

  // Prevent some events from bubbling up to body as
  // that would close the infobox

  event.stopPropagation();
  box.click(function(e) {
    e.stopPropagation();
  });
};

BioJSVisGProfiler.prototype._renderWarn = function(clels, clelScores) {

  // Log rendering warnings to the console.

  var _this = this;
  var $ = _this.$;

  var rendered = {};
  var n = clels.length;
  var nnot = 0;
  var pc;

  if (!(console && typeof(console) === 'object' && console.warn))
    return;

  _this.container.find('svg text').each(function() {
    var textel = $(this);
    rendered[textel.html()] = 1;
  });

  $.each(clels, function(i, v) {
    var str = v[0];
    var score = parseFloat(clelScores[str]).toExponential(3);

    if (!rendered[str]) {
      console.warn(
        'String "' + str + '" not rendered! ' +
        '(score == ' + score + ')'
      );
      nnot++;
    }
  });

  pc = parseInt(nnot / n * 100);

  if (pc) {
    console.warn(
      nnot + ' out of ' + n + ' strings (' + pc + '%) not rendered! ' +
      'Consider modifying the sizer function.'
    );
  }
};

/*
 * Auxiliary routines
 */

BioJSVisGProfiler.prototype._getCallback = function(name) {
  var defcb = this._defaultCallbacks();
  var suffix = this.useTerms ?
    'Term' :
    'Word' ;
  var cbname = name + suffix;
  var r = defcb[cbname];

  if (typeof(r) !== 'function')
    throw new Error('No such callback: "' + cbname + '"');
  return r;
};

BioJSVisGProfiler.prototype._defaultCallbacks = function() {
  var _this = this;
  var $ = _this.$;
  var cb = {};

  this._defaultSizeCallbacks(cb);
  this._defaultColorCallbacks(cb);
  this._defaultDistillCallbacks(cb);
  this._defaultScoreCallbacks(cb);

  return cb;
};

BioJSVisGProfiler.prototype._defaultSizeCallbacks = function(cb) {
  var _this = this;

  var cap = function(s, scaling) {
    var minS = 12;
    var maxS = 72 * scaling;

    return _this._capValue(s, minS, maxS);
  };

  cb.sizerWord = function(attrs) {
    var score = attrs.score;
    var scaling = attrs.scaling;
    var s = _this._logBase(2, score * 600 + 1) * 12 * scaling;
    return cap(s, scaling);
  };

  cb.sizerTerm = function(attrs) {
    var score = attrs.score;
    var scaling = attrs.scaling;
    var s = score * 800 * scaling;
    return cap(s, scaling);
  };
};

BioJSVisGProfiler.prototype._defaultColorCallbacks = function(cb) {
  var _this = this;
  var $ = _this.$;
  var fill10 = _this.d3.scale.category10();
  var fill20 = _this.d3.scale.category20();
  var filli = 0;

  var domainColor = {
    BP        : fill10(1),
    MF        : fill10(2),
    CC        : fill10(3),
    multiple  : fill10(4)
  };

  cb.colorerWord = function(attrs) {
    return fill20(++filli);
  };

  cb.colorerTerm = function(attrs) {
    var ts = attrs.termdata;
    var multiple = false;
    var domain;

    $.each(ts, function(i, v) {
      if (!domain) {
        domain = v.domain;
      }
      else if (domain !== v.domain) {
        multiple = true;
        return false;
      }
    });

    if (!multiple)
      return domainColor[domain];
    else
      return domainColor.multiple;
  };
};

BioJSVisGProfiler.prototype._defaultDistillCallbacks = function(cb) {
  var _this = this;

  cb.distillerWord = function(r) {
    var rt = [];
    var normalizeWord = function(w) {
      if (w !== w.toUpperCase())
        w = w.toLowerCase();
      return w.replace(/[\.\:,;]+$/g, '');
    };

    r['term_name'].split(/\s+/).map(function(w) {
      w = normalizeWord(w);
      if (!_this.stopwords[w] && (w.length > 1))
        rt.push(w);
    });

    return rt;
  };

  cb.distillerTerm = function(r) {
    var rt = [];
    var maxLen = _this.maxTermLen;
    var tstr;

    tstr = r['term_name'];
    if (tstr.length > maxLen)
      tstr = tstr.substr(0, maxLen - 1) + '…';
    rt.push(tstr);

    return rt;
  };
};

BioJSVisGProfiler.prototype._defaultScoreCallbacks = function(cb) {
  var _this = this;
  var $ = _this.$;

  cb.scorerTerm = cb.scorerWord = function(attrs) {
    var score = 0.0;

    $.each(attrs.termdata, function(i, t) {
      score += Math.abs(_this._logBase(10, t['p_value'])); });
    return score;
  };
};

BioJSVisGProfiler.prototype._logBase = function(b, x) {
  return Math.log(x) / Math.log(b);
};

BioJSVisGProfiler.prototype._capValue = function(x, minx, maxx) {
  if (x < minx) x = minx;
  else if (x > maxx) x = maxx;
  return x;
};

BioJSVisGProfiler.prototype._collapseClels = function(clels) {

  // Return clels collapsed into unique strings, i.e.
  // pairs [str, term] to pairs [str, [t1, t2, ..., tn]].

  var _this = this;
  var _ = _this._;
  var $ = _this.$;
  var h = {};

  // Collapse clels

  $.each(clels, function(k, v) {
    var str = v[0];
    var t = v[1];

    if (!h[str])
      h[str] = [str, [t]];
    else
      h[str][1].push(t);
  });

  return _.values(h);
};

BioJSVisGProfiler.prototype._scoreClels = function(clels) {

  // Calculate scores for each clel, summing abslogs of p-values
  // and normalizing to total score == 1.

  var _this = this;
  var $ = _this.$;
  var clelScores = {};
  var totalScore = 0.0;
  var scorer = _this.scorer ||
    _this._getCallback('scorer');

  $.each(clels, function(i, cel) {
    var str = cel[0];
    var terms = cel[1];
    var score = scorer.apply(_this, [{
      str : str,
      termdata : terms
    }]);

    clelScores[str] = score;
    totalScore += score;
  });

  $.each(clelScores, function(k, v) {
    clelScores[k] = clelScores[k] / totalScore; });

  return clelScores;
};

BioJSVisGProfiler.prototype._sortAndCapClels = function(clels, clelScores) {

  // Return clels sorted by score and capped to at most
  // maxN elements.

  clels.sort(function(a, b) {
    return clelScores[a[0]] < clelScores[b[0]]; });
  if (this.maxN)
    clels = clels.slice(0, this.maxN);

  return clels;
};

module.exports = BioJSVisGProfiler;

/**
 * @callback renderCb
 * @param {Object} attrs - Pass properties via this object.
 *
 * @property {float} score - A score for the string (sum of all scores == 1).
 * @property {int} scaling - A constant scaling value proportional to the size
 *  of the container.
 * @property {string} str - The string being rendered.
 * @property {Array} termdata - Array of data structures returned from
 *  g:Profiler per functional category associated with the current string.
 */

/**
 * @callback distillerCb
 * @param {Object} termdata - The data structure returned from g:Profiler for
 *  a functional category.
 * @return {Array|null} - An array of strings associated with the current term.
 *  Return `null` to discard the term.
 */

/**
 * @callback scorerCb
 * @param {Object} attrs - Pass properties via this object.
 *
 * @property {string} str - The string being rendered.
 * @property {Array} termdata - Array of data structures returned from
 *  g:Profiler per functional category associated with the current string.
 *
 * @return {float}
 */

/**
 * Fired when cloud rendering has completed.
 *
 * @event BioJSVisGProfiler#onrender
 */

 /**
 * Fired upon click on a cloud element
 *
 * @event BioJSVisGProfiler#onclick
 * @param {Array} termdata - Array of data structures returned from
 *  g:Profiler per functional category associated with the clicked string.
 * @param {Event} event
 */
