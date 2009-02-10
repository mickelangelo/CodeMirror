/* CodeMirror main module
 *
 * Implements the CodeMirror constructor and prototype, which take care
 * of initializing the editor frame, and providing the outside interface.
 */

// The CodeMirrorConfig object is used to specify a default
// configuration. If you specify such an object before loading this
// file, the values you put into it will override the defaults given
// below. You can also assign to it after loading.
var CodeMirrorConfig = window.CodeMirrorConfig || {};

var CodeMirror = (function(){
  function setDefaults(object, defaults) {
    for (var option in defaults) {
      if (!object.hasOwnProperty(option))
        object[option] = defaults[option];
    }
  }
  function forEach(array, action) {
    for (var i = 0; i < array.length; i++)
      action(array[i]);
  }

  // These default options can be overridden by passing a set of
  // options to a specific CodeMirror constructor. See manual.html for
  // their meaning.
  setDefaults(CodeMirrorConfig, {
    stylesheet: "",
    path: "",
    parserfile: [],
    basefiles: ["util.js", "stringstream.js", "select.js", "undo.js", "editor.js", "tokenize.js"],
    linesPerPass: 15,
    passDelay: 200,
    continuousScanning: false,
    saveFunction: null,
    onChange: null,
    undoDepth: 50,
    undoDelay: 800,
    disableSpellcheck: true,
    textWrapping: true,
    readOnly: false,
    width: "100%",
    height: "300px",
    autoMatchParens: false,
    parserConfig: null,
    dumbTabs: false,
    normalTab: false,
    activeTokens: null,
    cursorActivity: null,
    lineNumbers: false
  });

  function wrapLineNumberDiv(place) {
    return function(node) {
      var container = document.createElement("DIV"),
          nums = document.createElement("DIV");
      nums.className = "CodeMirror-line-numbers";
      container.style.position = "relative";
      nums.style.position = "absolute";
      nums.style.height = "100%";
      if (nums.style.setExpression)
        nums.style.setExpression("height", "this.previousSibling.offsetHeight + 'px'");
      nums.style.top = "0px";
      nums.style.overflow = "hidden";
      place(container);
      container.appendChild(node);
      container.appendChild(nums);
    }
  }

  function nodeTop(node) {
    var accum = 0;
    while (node) {
      accum += node.offsetTop;
      node = node.offsetParent;
    }
    return accum;
  }

  function createStyleStub(document, selector, content) {
    var styleNode = document.createElement("STYLE");
    styleNode.type = "text/css";
    document.body.appendChild(styleNode);
    if (document.styleSheets.length == 0) return "wait";

    var sheet = (document.styleSheets[document.styleSheets.length - 1]);
    if (sheet.cssRules) {
      sheet.insertRule(selector + " {" + content + "}", 0);
      return sheet.cssRules[0].style;
    }
    else if (sheet.rules) {
      sheet.addRule(selector, content);
      return sheet.rules[0].style;
    }
  }

  var defaultWidth = "25px";

  function applyLineNumbers(frame) {
    var win = frame.contentWindow, doc = win.document,
        nums = frame.nextSibling, scroller = document.createElement("DIV"),
        style = createStyleStub(document, ".CodeMirror-line-numbers .CodeMirror-line-div", "height: auto");

    // Hack: Webkit sometimes doesn't initalise it's
    // document.styleSheets object right away, and when CodeMirror is
    // called directly from a script tag, it can end up seeing an
    // empty styleSheets array. In this case, retry later.
    if (style == "wait") {setTimeout(function(){applyLineNumbers(frame);}, 50); return;}
    nums.appendChild(scroller);

    // Look at actual DOM to find out how big the top margin and the
    // line height inside the editor are.
    function sampleSizes(c) {
      var width = nums.offsetWidth + "px";
      if (nums.offsetWidth <= 10) nums.style.width = width = defaultWidth;
      frame.parentNode.style.marginLeft = width;
      nums.style.left = "-" + width;

      var test = doc.createElement("DIV");
      test.style.position = "absolute"
      test.innerHTML = "<span>&nbsp;</span><br><span>&nbsp;</span>";
      doc.body.insertBefore(test, doc.body.firstChild);
      setTimeout(function() {
        scroller.style.paddingTop = nodeTop(test) + "px";
        style.height = (test.lastChild.offsetTop - test.firstChild.offsetTop) + "px";
        doc.body.removeChild(test);
        c();
      }, 0);
    }

    var nextNum = 1, prevHeight = null;
    function update() {
      if (doc.body.offsetHeight != prevHeight) {
        prevHeight = doc.body.offsetHeight;
        sampleSizes(function() {
          var diff = 20 + Math.max(doc.body.offsetHeight, frame.offsetHeight) - scroller.offsetHeight;
          for (var n = Math.ceil(diff / 10); n > 0; n--) {
            var div = document.createElement("DIV");
            div.className = "CodeMirror-line-div";
            div.appendChild(document.createTextNode(nextNum++));
            scroller.appendChild(div);
          }
        });
      }
      nums.scrollTop = doc.body.scrollTop || doc.documentElement.scrollTop || 0;
    }
    update();
    win.addEventHandler(win, "scroll", update);
    setInterval(update, 500);
  }

  function CodeMirror(place, options) {
    // Use passed options, if any, to override defaults.
    this.options = options = options || {};
    setDefaults(options, CodeMirrorConfig);

    var frame = this.frame = document.createElement("IFRAME");
    frame.frameBorder = 0;
    frame.src = "javascript:false;";
    frame.style.border = "0";
    frame.style.width = options.width;
    frame.style.height = options.height;
    // display: block occasionally suppresses some Firefox bugs, so we
    // always add it, redundant as it sounds.
    frame.style.display = "block";

    if (place.appendChild) {
      var node = place;
      place = function(n){node.appendChild(n);};
    }
    if (options.lineNumbers) place = wrapLineNumberDiv(place);
    place(frame);

    // Link back to this object, so that the editor can fetch options
    // and add a reference to itself.
    frame.CodeMirror = this;
    this.win = frame.contentWindow;

    if (typeof options.parserfile == "string")
      options.parserfile = [options.parserfile];
    if (typeof options.stylesheet == "string")
      options.stylesheet = [options.stylesheet];

    var html = ["<!DOCTYPE HTML PUBLIC \"-//W3C//DTD HTML 4.0 Transitional//EN\" \"http://www.w3.org/TR/html4/loose.dtd\"><html><head>"];
    forEach(options.stylesheet, function(file) {
      html.push("<link rel=\"stylesheet\" type=\"text/css\" href=\"" + file + "\"/>");
    });
    forEach(options.basefiles.concat(options.parserfile), function(file) {
      html.push("<script type=\"text/javascript\" src=\"" + options.path + file + "\"></script>");
    });
    html.push("</head><body style=\"border-width: 0;\" class=\"editbox\" spellcheck=\"" +
              (options.disableSpellcheck ? "false" : "true") + "\"></body></html>");

    var doc = this.win.document;
    doc.open();
    doc.write(html.join(""));
    doc.close();
  }

  CodeMirror.prototype = {
    init: function() {
      if (this.options.initCallback) this.options.initCallback(this);
      if (this.options.lineNumbers) applyLineNumbers(this.frame);
    },

    getCode: function() {return this.editor.getCode();},
    setCode: function(code) {this.editor.importCode(code);},
    selection: function() {return this.editor.selectedText();},
    reindent: function() {this.editor.reindent();},

    focus: function() {
      this.win.focus();
      if (this.editor.selectionSnapshot) // IE hack
        this.win.select.selectCoords(this.win, this.editor.selectionSnapshot);
    },
    replaceSelection: function(text) {
      this.focus();
      this.editor.replaceSelection(text);
      return true;
    },
    replaceChars: function(text, start, end) {
      this.editor.replaceChars(text, start, end);
    },
    getSearchCursor: function(string, fromCursor) {
      return this.editor.getSearchCursor(string, fromCursor);
    },

    undo: function() {this.editor.history.undo();},
    redo: function() {this.editor.history.redo();},
    historySize: function() {return this.editor.history.historySize();},

    cursorPosition: function(start) {
      if (this.win.select.ie_selection) this.focus();
      return this.editor.cursorPosition(start);
    },
    firstLine: function() {return this.editor.firstLine();},
    lastLine: function() {return this.editor.lastLine();},
    nextLine: function(line) {return this.editor.nextLine(line);},
    prevLine: function(line) {return this.editor.prevLine(line);},
    lineContent: function(line) {return this.editor.lineContent(line);},
    setLineContent: function(line, content) {this.editor.setLineContent(line, content);},
    insertIntoLine: function(line, position, content) {this.editor.insertIntoLine(line, position, content);},
    selectLines: function(startLine, startOffset, endLine, endOffset) {
      this.win.focus();
      this.editor.selectLines(startLine, startOffset, endLine, endOffset);
    },
    nthLine: function(n) {
      var line = this.firstLine();
      for (; n > 1 && line !== false; n--)
        line = this.nextLine(line);
      return line;
    },
    lineNumber: function(line) {
      var num = 0;
      while (line !== false) {
        num++;
        line = this.prevLine(line);
      }
      return num;
    },

    // Old number-based line interface
    jumpToLine: function(n) {
      this.selectLines(this.nthLine(n), 0);
      this.win.focus();
    },
    currentLine: function() {
      return this.lineNumber(this.cursorPosition().line);
    }
  };

  CodeMirror.InvalidLineHandle = {toString: function(){return "CodeMirror.InvalidLineHandle";}};

  CodeMirror.replace = function(element) {
    if (typeof element == "string")
      element = document.getElementById(element);
    return function(newElement) {
      element.parentNode.replaceChild(newElement, element);
    };
  };

  CodeMirror.fromTextArea = function(area, options) {
    if (typeof area == "string")
      area = document.getElementById(area);

    options = options || {};
    if (area.style.width) options.width = area.style.width;
    if (area.style.height) options.height = area.style.height;
    if (options.content == null) options.content = area.value;

    if (area.form) {
      function updateField() {
        area.value = mirror.getCode();
      }
      if (typeof area.form.addEventListener == "function")
        area.form.addEventListener("submit", updateField, false);
      else
        area.form.attachEvent("onsubmit", updateField);
    }

    function insert(frame) {
      if (area.nextSibling)
        area.parentNode.insertBefore(frame, area.nextSibling);
      else
        area.parentNode.appendChild(frame);
    }

    area.style.display = "none";
    var mirror = new CodeMirror(insert, options);
    return mirror;
  };

  CodeMirror.isProbablySupported = function() {
    // This is rather awful, but can be useful.
    var match;
    if (window.opera)
      return Number(window.opera.version()) >= 9.52;
    else if (/Apple Computers, Inc/.test(navigator.vendor) && (match = navigator.userAgent.match(/Version\/(\d+(?:\.\d+)?)\./)))
      return Number(match[1]) >= 3;
    else if (document.selection && window.ActiveXObject && (match = navigator.userAgent.match(/MSIE (\d+(?:\.\d*)?)\b/)))
      return Number(match[1]) >= 6;
    else if (match = navigator.userAgent.match(/gecko\/(\d{8})/i))
      return Number(match[1]) >= 20050901;
    else if (/Chrome\//.test(navigator.userAgent))
      return true;
    else
      return null;
  };

  return CodeMirror;
})();
