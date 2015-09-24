function CaptureClient(config) {
  if (config) {
    this.config = config;
  } else {
    config = {
      serverURL: undefined,
      clientID: undefined
    };

    var regex, camelCase;
    for (var x in config) {
      camelCase = x.replace(/^./, function(match) { return match.toUpperCase(); });
      regex = new RegExp("capture"+camelCase+"=([^&]*)");
      if (regex.test(window.location.search)) {
        config[x] = decodeURIComponent(regex.exec(window.location.search)[1]);
      }
    }

    this.config = config;
  }
};

CaptureClient.prototype.capture = function(endpoint, metadata) {
  var xhr = new XMLHttpRequest();
  xhr.open("POST", this.config.serverURL + endpoint, false);
  xhr.send();
}

CaptureClient.prototype.captureScreenshot = function(metadata) {
  return this.capture('screenshot', metadata);
}

var myCaptureClient = new CaptureClient();

Ember.run.backburner.options.render = {
  after: function() { myCaptureClient.captureScreenshot(); }
};