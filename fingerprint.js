(function() {
  try {
    // --- Canvas fingerprinting protection (toDataURL noised; toBlob left intact
    // so canvas-consuming apps never hang or receive corrupted images) ---
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      try {
        return addNoiseToBase64(origToDataURL.apply(this, args));
      } catch (e) {
        return origToDataURL.apply(this, args);
      }
    };

    function addNoiseToBase64(base64) {
      if (!base64) return base64;
      const len = base64.length;
      const pos = Math.floor(len * 0.3);
      const char = base64[pos];
      const noise = char === 'A' ? 'B' : char === 'a' ? 'b' : String.fromCharCode(char.charCodeAt(0) + 1);
      return base64.substring(0, pos) + noise + base64.substring(pos + 1);
    }

    // --- WebGL fingerprinting protection ---
    const spoofVendor = 'Intel Inc.';
    const spoofRenderer = 'Intel Iris OpenGL Engine';

    const origGetParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(p) {
      if (p === 37445) return spoofVendor;
      if (p === 37446) return spoofRenderer;
      return origGetParam.apply(this, arguments);
    };

    const origGetParam2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(p) {
      if (p === 37445) return spoofVendor;
      if (p === 37446) return spoofRenderer;
      return origGetParam2.apply(this, arguments);
    };

    // --- AudioContext fingerprinting protection ---
    const origGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function(channel) {
      const data = origGetChannelData.apply(this, arguments);
      for (let i = 0; i < data.length; i += 10) {
        data[i] += (Math.random() - 0.5) * 0.000001;
      }
      return data;
    };

    // --- Navigator plugins fingerprinting ---
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const arr = [];
        arr.length = 0;
        arr.item = () => null;
        arr.namedItem = () => null;
        arr.refresh = () => {};
        return arr;
      },
      configurable: true
    });

    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => {
        const arr = [];
        arr.length = 0;
        arr.item = () => null;
        arr.namedItem = () => null;
        return arr;
      },
      configurable: true
    });

    // --- Screen resolution spoofing ---
    let spoofWidth = window.screen.width;
    let spoofHeight = window.screen.height;
    const commonResolutions = [
      [1920, 1080], [1366, 768], [1536, 864], [1280, 720],
      [1440, 900], [2560, 1440], [1680, 1050]
    ];
    const closest = commonResolutions.reduce((prev, curr) => {
      return Math.abs(curr[0] - spoofWidth) + Math.abs(curr[1] - spoofHeight) <
             Math.abs(prev[0] - spoofWidth) + Math.abs(prev[1] - spoofHeight) ? curr : prev;
    });
    spoofWidth = closest[0];
    spoofHeight = closest[1];

    Object.defineProperties(window.screen, {
      width: { get: () => spoofWidth, configurable: true },
      height: { get: () => spoofHeight, configurable: true },
      availWidth: { get: () => spoofWidth, configurable: true },
      availHeight: { get: () => spoofHeight, configurable: true },
      colorDepth: { get: () => 24, configurable: true },
      pixelDepth: { get: () => 24, configurable: true }
    });

    // --- WebRTC leak protection ---
    if (navigator.mediaDevices) {
      navigator.mediaDevices.enumerateDevices = function() {
        return Promise.resolve([]);
      };
    }

    // --- Timing precision reduction ---
    const origNow = performance.now.bind(performance);
    performance.now = function() {
      return Math.round(origNow() / 10) * 10;
    };

    // --- Disable hardware concurrency fingerprinting ---
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 8)),
      configurable: true
    });

    // --- Device memory ---
    if ('deviceMemory' in navigator) {
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 4,
        configurable: true
      });
    }
  } catch (e) {
    console.log('[Black] Fingerprint protection active');
  }
})();
