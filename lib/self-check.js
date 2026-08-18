// self-check: die fast so supervisor can resurrect
var opslog = require('./ops-log');

var SELF_CHECK_INTERVAL = 5000;
var LAG_THRESHOLD_MS = 3000;
var MEM_THRESHOLD_GB = 2;
var lagFails = 0;

function checkSelf() {
  // skip self-check when debugging — breakpoints look like event loop lag
  if (process.execArgv.some(function(a) { return a.indexOf('--inspect') === 0; })) return;
  // event loop lag — schedule immediate callback, measure real delay
  var t0 = Date.now();
  setImmediate(function() {
    var lag = Date.now() - t0;
    if (lag > LAG_THRESHOLD_MS) {
      lagFails++;
      if (lagFails >= 2) {
        opslog.error('self-check-suicide', 'event loop lag ' + lag + 'ms x' + lagFails + ', exiting(7)', { lag_ms: lag, consecutive: lagFails });
        process.exit(7);
      }
      opslog.info('self-check-lag', 'event loop lag ' + lag + 'ms', { lag_ms: lag });
    } else {
      lagFails = 0;
    }

    // memory
    var heapGB = process.memoryUsage().heapUsed / (1024 * 1024 * 1024);
    if (heapGB > MEM_THRESHOLD_GB) {
      opslog.error('self-check-suicide', 'heap ' + heapGB.toFixed(1) + 'GB > ' + MEM_THRESHOLD_GB + 'GB, exiting(7)', { heap_gb: heapGB });
      process.exit(7);
    }
  });
}

function start() {
  setInterval(checkSelf, SELF_CHECK_INTERVAL);
}

module.exports = { start: start };
