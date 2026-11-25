'use strict';
// A clock that keeps running when the page is not in view (see net.js). It does nothing but tick.
setInterval(function () { postMessage(0); }, 50);
