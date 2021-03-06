/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
"use strict";
var EXPORTED_SYMBOLS = ["dumpex", "dumpStack", "dumpo", "slUtils"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
const scriptableStream = Cc["@mozilla.org/scriptableinputstream;1"].getService(Ci.nsIScriptableInputStream);

Cu.import("resource://gre/modules/Services.jsm");

var slUtils = {};

function dumpo(obj, indent) {
    if (typeof obj != 'object') {
        dump(""+obj+"\n")
        return
    }
    let i = indent || "";
    dump(i+"{\n");
    for(let p in obj) {
        dump(p+": ");
        dumpo(obj[p], i+"   ")
        dump(",\n")
    }
    dump(i+"}\n")
}

function dumpex(ex, msg) {
    if (msg)
        dump (msg);
    if ( (typeof ex) == 'object') {
        dump('[Exception] '+ex);
        if ('fileName' in ex) {
            dump ('  filename:'+ex.fileName);
        }
        if ('lineNumber' in ex) {
            dump ('  line:'+ex.lineNumber);
        }
        dump('\n');
    }
    else {
        dump('[Exception] '+ex+'\n');
    }
}

function dumpStack(aStack) {
    let stackText = "\nStack trace:\n";
    let count = 0;
    let stack = aStack || Components.stack.caller;
    while(stack) {
        stackText += count++ + ":" + stack +"\n";
        stack = stack.caller;
    }
    dump(stackText);
}

/**
 * @param string path
 * @param nsIFile basepath
 */
slUtils.getMozFile = function getMozFile(path, basepath) {
    var file = basepath.clone();
    var pathElements = path.split(/[\\\/]/);
    var first = pathElements[0];
    if (pathElements.length == 1) {
        if (first)
            file.append(first);
        return file;
    }

    if (first.match(/\:$/) || first == '') {
        file = Cc['@mozilla.org/file/local;1']
                  .createInstance(Ci.nsILocalFile);
        file.initWithPath(path);
        return file;
    }
    while(pathElements.length) {
        first = pathElements.shift();
        if (first == '.' || first == '')
            continue;
        if (first == '..') {
            if (file.parent)
                file = file.parent;
            continue;
        }
        file.append(first);
    }
    return file;
}

slUtils.readSyncStringFromFile = function readSyncStringFromFile (file) {
    let fstream = Cc["@mozilla.org/network/file-input-stream;1"].
                   createInstance(Ci.nsIFileInputStream);
    let cstream = Cc["@mozilla.org/intl/converter-input-stream;1"].
                  createInstance(Ci.nsIConverterInputStream);
    fstream.init(file, -1, 0, 0);
    cstream.init(fstream, "UTF-8", 0, 0);
    let data = '';
    let (str = {}) {
      let read = 0;
      do {
        read = cstream.readString(0xffffffff, str); // read as much as we can and put it in str.value
        data += str.value;
      } while (read != 0);
    }
    cstream.close(); // this closes fstream
    return data;
}

slUtils.readChromeFile = function readChromeFile(url) {
    let channel = ioService.newChannel(url,null,null);
    let input = channel.open();

    scriptableStream.init(input);
    let str = scriptableStream.read(input.available());
    scriptableStream.close();
    input.close();
    return str;
}

slUtils.getWebpageFromContentWindow = function getWebpageFromContentWindow(contentWin) {
    let browser = slUtils.getBrowserFromContentWindow(contentWin);
    if (browser)
        return browser.webpage;
    return null;
}

slUtils.getBrowserFromContentWindow = function getBrowserFromContentWindow(contentWin) {
    try {
        /*
        let win = contentWin.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                        .getInterface(Components.interfaces.nsIWebNavigation)
                        .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
                        .rootTreeItem
                        .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                        .getInterface(Components.interfaces.nsIDOMWindow);

        */
        var docShell = contentWin.top.QueryInterface(Ci.nsIInterfaceRequestor)
                         .getInterface(Ci.nsIWebNavigation)
                         .QueryInterface(Ci.nsIDocShell);
        return slUtils.getBrowserFromDocShell(docShell);
    }
    catch(e) {
        return null;
    }
}

slUtils.getWebpageFromDocShell = function getWebpageFromDocShell(docShell) {
    let browser = slUtils.getBrowserFromDocShell(docShell)
    if (browser)
        return browser.webpage;
    return null;
}

slUtils.getBrowserFromDocShell = function getBrowserFromDocShell(docShell) {
    try {
        var browser= docShell.chromeEventHandler;
        if (!browser) {
            return null;
        }
        if (browser.getAttribute('id') != 'webpage') {
            return null;
        }

        if (browser.ownerDocument.documentElement.getAttribute("windowtype") != 'slimerpage') {
            return null;
        }
        return browser;
    }
    catch(e) {
        return null;
    }
}



function nsSimpleEnumerator(items) {
  this._items = items;
  this._nextIndex = 0;
}
nsSimpleEnumerator.prototype = {
  hasMoreElements: function() {
    return this._nextIndex < this._items.length;
  },
  getNext: function() {
    if (!this.hasMoreElements())
      throw Cr.NS_ERROR_NOT_AVAILABLE;

    return this._items[this._nextIndex++];
  },
  QueryInterface: function(aIID) {
    if (Ci.nsISimpleEnumerator.equals(aIID) ||
        Ci.nsISupports.equals(aIID))
      return this;

    throw Cr.NS_ERROR_NO_INTERFACE;
  }
};


slUtils.sleep = function sleep(time, wakeupFunc) {
    let ready = false;
    let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    timer.initWithCallback(function(){ready = true;}, time, timer.TYPE_ONE_SHOT);
    let thread = Services.tm.currentThread;
    let wakeup = false;
    while (!ready && !wakeup) {
        thread.processNextEvent(true);
        if (wakeupFunc)
            wakeup = wakeupFunc();
    }
}

slUtils.createSimpleEnumerator = function createSimpleEnumerator (anArray) {
    return new nsSimpleEnumerator(anArray);
}

