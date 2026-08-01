/* Black QR encoder — self-contained, byte mode, EC level M, versions 1-10.
   Exposes: QRCode.toCanvas(canvas, text, opts, cb)
   No dependencies, no network. */
(function () {
  'use strict';

  var GF_EXP = new Array(512);
  var GF_LOG = new Array(256);
  (function initGalois() {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) GF_EXP[j] = GF_EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  // Version data: total codewords + M-level blocks [dataPerBlock, ecPerBlock, numBlocks]
  var VERSIONS = {
    1:  [26, [[16, 10, 1]]],
    2:  [44, [[28, 16, 1]]],
    3:  [70, [[44, 26, 1]]],
    4:  [100, [[32, 18, 2]]],
    5:  [134, [[43, 24, 2]]],
    6:  [172, [[27, 16, 4]]],
    7:  [196, [[31, 18, 4]]],
    8:  [242, [[38, 22, 2], [39, 22, 2]]],
    9:  [292, [[36, 22, 3], [37, 22, 2]]],
    10: [346, [[43, 26, 4], [44, 26, 1]]]
  };

  var ALIGN = {
    2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };

  function rsGeneratorPoly(degree) {
    var gen = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(gen.length + 1).fill(0);
      for (var j = 0; j < gen.length; j++) {
        next[j] ^= gen[j];
        next[j + 1] ^= gfMul(gen[j], GF_EXP[i]);
      }
      gen = next;
    }
    return gen;
  }

  function rsRemainder(data, gen) {
    var res = data.slice();
    for (var i = 0; i < data.length; i++) {
      var factor = res[i];
      if (factor !== 0) {
        for (var j = 1; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], factor);
        }
      }
    }
    return res.slice(data.length);
  }

  function bitGet(data, i) {
    return (data[i >>> 3] >>> (7 - (i & 7))) & 1;
  }

  function bitSet(data, i, val) {
    var byte = data[i >>> 3];
    byte &= ~(1 << (7 - (i & 7)));
    byte |= (val & 1) << (7 - (i & 7));
    data[i >>> 3] = byte;
  }

  function interleaveBlocks(blocks, ecPerBlock, numBlocks) {
    var result = [];
    var dataLen = blocks.length;
    for (var i = 0; i < dataLen; i++) {
      result.push.apply(result, blocks[i].data);
    }
    // EC bytes
    var out = new Array(result.length);
    // Round-robin data then EC
    var maxLen = 0;
    for (var b = 0; b < dataLen; b++) maxLen = Math.max(maxLen, blocks[b].data.length);
    var seq = [];
    for (var col = 0; col < maxLen; col++) {
      for (var bi = 0; bi < dataLen; bi++) {
        if (col < blocks[bi].data.length) seq.push(blocks[bi].data[col]);
      }
    }
    var seqEc = [];
    for (var colEc = 0; colEc < ecPerBlock; colEc++) {
      for (var biEc = 0; biEc < dataLen; biEc++) {
        seqEc.push(blocks[biEc].ec[colEc]);
      }
    }
    return seq.concat(seqEc);
  }

  function makeCodewords(text, version) {
    var bytes = new TextEncoder().encode(text);
    var info = VERSIONS[version];
    var blocks = info[1];
    var totalData = 0;
    blocks.forEach(function (blk) { totalData += blk[0] * blk[2]; });

    var countBits = version < 10 ? 8 : 16;
    var bits = [];
    // Mode indicator: byte = 0100
    bits.push(0, 1, 0, 0);
    // Character count
    for (var i = countBits - 1; i >= 0; i--) bits.push((bytes.length >>> i) & 1);
    // Data bytes
    for (var c = 0; c < bytes.length; c++) {
      for (var b = 7; b >= 0; b--) bits.push((bytes[c] >>> b) & 1);
    }
    // Terminator (up to 4 zero bits)
    var capBits = totalData * 8;
    if (bits.length + 4 <= capBits) bits.push(0, 0, 0, 0);
    // Align to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);
    // Pad codewords (0xEC 0x11 alternating) up to capacity
    var data = [];
    for (var k = 0; k < bits.length; k += 8) {
      var byte = 0;
      for (var j = 0; j < 8; j++) byte = (byte << 1) | bits[k + j];
      data.push(byte);
    }
    var pad = [0xec, 0x11];
    var p = 0;
    while (data.length < totalData) { data.push(pad[p % 2]); p++; }

    // Split into blocks + EC
    var outBlocks = [];
    var idx = 0;
    blocks.forEach(function (blk) {
      var dPer = blk[0], ecPer = blk[1], n = blk[2];
      for (var i = 0; i < n; i++) {
        var chunk = data.slice(idx, idx + dPer);
        idx += dPer;
        var gen = rsGeneratorPoly(ecPer);
        var ec = rsRemainder(chunk, gen);
        outBlocks.push({ data: chunk, ec: ec });
      }
    });
    return interleaveBlocks(outBlocks, blocks[0][1], blocks[0][2]);
  }

  function chooseVersion(text) {
    var bytes = new TextEncoder().encode(text);
    for (var v = 1; v <= 10; v++) {
      var totalData = 0;
      VERSIONS[v][1].forEach(function (blk) { totalData += blk[0] * blk[2]; });
      var countBits = v < 10 ? 8 : 16;
      var needed = 4 + countBits + bytes.length * 8;
      if (needed <= totalData * 8) return v;
    }
    return 0;
  }

  function maskCondition(mask, y, x) {
    switch (mask) {
      case 0: return (y + x) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (y + x) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return ((y * x) % 2 + (y * x) % 3) === 0;
      case 6: return (((y * x) % 2 + (y * x) % 3) % 2) === 0;
      case 7: return (((y + x) % 2 + (y * x) % 3) % 2) === 0;
    }
    return false;
  }

  function makeMatrix(text, version, mask) {
    var size = 17 + 4 * version;
    var isFunc = [];
    var modules = [];
    for (var y = 0; y < size; y++) {
      isFunc.push(new Array(size).fill(false));
      modules.push(new Array(size).fill(0));
    }

    function setFunc(r, c) { if (r >= 0 && r < size && c >= 0 && c < size) isFunc[r][c] = true; }

    // Finder + separators
    for (var f = 0; f < size; f++) {
      for (var g = 0; g < size; g++) {
        if ((f < 8 && g < 8) || (f < 8 && g >= size - 8) || (f >= size - 8 && g < 8)) setFunc(f, g);
      }
    }
    // Timing
    for (var t = 8; t < size - 8; t++) { setFunc(6, t); setFunc(t, 6); }
    // Alignment
    if (version >= 2) {
      var centers = ALIGN[version];
      centers.forEach(function (cy) {
        centers.forEach(function (cx) {
          var atCorner = (cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6);
          if (atCorner) return;
          for (var dy = -2; dy <= 2; dy++)
            for (var dx = -2; dx <= 2; dx++) setFunc(cy + dy, cx + dx);
        });
      });
    }
    // Format areas (row 8: cols 0-7 & size-8..size-1; col 8: rows 0-8 & size-8..size-1)
    for (var i = 0; i <= 5; i++) { setFunc(8, i); setFunc(i, 8); }
    setFunc(8, 7); setFunc(7, 8); setFunc(8, 8);
    for (var i9 = size - 8; i9 <= size - 1; i9++) { setFunc(8, i9); setFunc(i9, 8); }
    // Version areas
    if (version >= 7) {
      for (var v = 0; v < 18; v++) {
        var a = size - 11 + v % 3;
        var b = Math.floor(v / 3);
        setFunc(a, b); setFunc(b, a);
      }
    }

    // Place data
    var data = makeCodewords(text, version);
    var bitLen = data.length * 8;
    var bitPos = 0;
    var right = size - 1;
    while (right >= 1) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!isFunc[y][x] && bitPos < bitLen) {
            modules[y][x] = bitGet(data, bitPos);
            bitPos++;
          }
        }
      }
      right -= 2;
    }

    // Mask
    for (var my = 0; my < size; my++)
      for (var mx = 0; mx < size; mx++)
        if (!isFunc[my][mx] && maskCondition(mask, my, mx)) modules[my][mx] ^= 1;

    // Draw finder patterns
    function drawFinder(fy, fx) {
      for (var dy = -3; dy <= 3; dy++)
        for (var dx = -3; dx <= 3; dx++) {
          var yy = fy + dy, xx = fx + dx;
          if (yy < 0 || yy >= size || xx < 0 || xx >= size) continue;
          var on = dy === -3 || dy === 3 || dx === -3 || dx === 3 || (dy >= -1 && dy <= 1 && dx >= -1 && dx <= 1);
          modules[yy][xx] = on ? 1 : 0;
        }
    }
    drawFinder(3, 3);
    drawFinder(3, size - 4);
    drawFinder(size - 4, 3);

    // Timing
    for (var tm = 8; tm < size - 8; tm++) {
      var val = tm % 2 === 0 ? 1 : 0;
      modules[6][tm] = val;
      modules[tm][6] = val;
    }

    // Alignment
    if (version >= 2) {
      var cents = ALIGN[version];
      cents.forEach(function (cy) {
        cents.forEach(function (cx) {
          var atCorner = (cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6);
          if (atCorner) return;
          for (var dy = -2; dy <= 2; dy++)
            for (var dx = -2; dx <= 2; dx++) {
              var on = Math.max(Math.abs(dy), Math.abs(dx)) !== 1;
              modules[cy + dy][cx + dx] = on ? 1 : 0;
            }
        });
      });
    }

    // Format info (layout mirrors the qrcode npm reference)
    var dataBits = (0x00 << 3) | mask; // EC level M = 00
    var rem = dataBits;
    for (var ri = 0; ri < 10; ri++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var fmt = ((dataBits << 10) | rem) ^ 0x5412;
    function fmtBit(i) { return (fmt >>> i) & 1; }
    for (var fi = 0; fi < 15; fi++) {
      var fmod = fmtBit(fi);
      if (fi < 6) modules[fi][8] = fmod;
      else if (fi < 8) modules[fi + 1][8] = fmod;
      else modules[size - 15 + fi][8] = fmod;
      if (fi < 8) modules[8][size - 1 - fi] = fmod;
      else if (fi < 9) modules[8][7] = fmod;
      else modules[8][15 - fi - 1] = fmod;
    }
    modules[size - 8][8] = 1; // dark module

    // Version info
    if (version >= 7) {
      var vrem = version;
      for (var vr = 0; vr < 12; vr++) vrem = (vrem << 1) ^ ((vrem >>> 11) * 0x1f25);
      var vbits = (version << 12) | vrem;
      for (var vi = 0; vi < 18; vi++) {
        var col = (vbits >>> vi) & 1;
        var a = size - 11 + vi % 3;
        var b = Math.floor(vi / 3);
        modules[a][b] = col;
        modules[b][a] = col;
      }
    }

    return modules;
  }

  function penalty(modules) {
    var size = modules.length;
    var score = 0;

    function runPenalty(runLen) { return runLen >= 5 ? 3 + (runLen - 5) : 0; }

    // Rule 1: runs
    for (var y = 0; y < size; y++) {
      var run1 = 1;
      for (var x = 1; x < size; x++) {
        if (modules[y][x] === modules[y][x - 1]) { run1++; } else { score += runPenalty(run1); run1 = 1; }
      }
      score += runPenalty(run1);
    }
    for (var x2 = 0; x2 < size; x2++) {
      var run2 = 1;
      for (var y2 = 1; y2 < size; y2++) {
        if (modules[y2][x2] === modules[y2 - 1][x2]) { run2++; } else { score += runPenalty(run2); run2 = 1; }
      }
      score += runPenalty(run2);
    }
    // Rule 2: 2x2 blocks
    for (var by = 0; by < size - 1; by++)
      for (var bx = 0; bx < size - 1; bx++) {
        var v = modules[by][bx];
        if (v === modules[by][bx + 1] && v === modules[by + 1][bx] && v === modules[by + 1][bx + 1]) score += 3;
      }
    // Rule 3: 1011101 with 4 light on each side
    var pattern = [1, 0, 1, 1, 1, 0, 1];
    for (var py = 0; py < size; py++) {
      for (var px = 0; px <= size - 7; px++) {
        var matches = true;
        for (var pk = 0; pk < 7; pk++) if (modules[py][px + pk] !== pattern[pk]) { matches = false; break; }
        if (matches) {
          var beforeOk = px >= 4 && modules[py][px - 1] === 0 && modules[py][px - 2] === 0 && modules[py][px - 3] === 0 && modules[py][px - 4] === 0;
          var afterOk = px + 7 < size - 4 && modules[py][px + 7] === 0 && modules[py][px + 8] === 0 && modules[py][px + 9] === 0 && modules[py][px + 10] === 0;
          if (beforeOk || afterOk) score += 40;
        }
      }
    }
    for (var px2 = 0; px2 < size; px2++) {
      for (var py2 = 0; py2 <= size - 7; py2++) {
        var matches2 = true;
        for (var pk2 = 0; pk2 < 7; pk2++) if (modules[py2 + pk2][px2] !== pattern[pk2]) { matches2 = false; break; }
        if (matches2) {
          var beforeOk2 = py2 >= 4 && modules[py2 - 1][px2] === 0 && modules[py2 - 2][px2] === 0 && modules[py2 - 3][px2] === 0 && modules[py2 - 4][px2] === 0;
          var afterOk2 = py2 + 7 < size - 4 && modules[py2 + 7][px2] === 0 && modules[py2 + 8][px2] === 0 && modules[py2 + 9][px2] === 0 && modules[py2 + 10][px2] === 0;
          if (beforeOk2 || afterOk2) score += 40;
        }
      }
    }
    // Rule 4: dark proportion
    var dark = 0;
    for (var dy = 0; dy < size; dy++)
      for (var dx = 0; dx < size; dx++) dark += modules[dy][dx];
    var percent = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;
    return score;
  }

  function encode(text) {
    var version = chooseVersion(text);
    if (!version) throw new Error('Text too long to encode as QR code');
    var best = null, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var m = makeMatrix(text, version, mask);
      var s = penalty(m);
      if (s < bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  function draw(canvas, modules, opts) {
    opts = opts || {};
    var size = modules.length;
    var margin = opts.margin == null ? 1 : opts.margin;
    var color = opts.color || {};
    var dark = color.dark || '#000000';
    var light = color.light || '#ffffff';
    var ctx = canvas.getContext('2d');
    var total = size + margin * 2;
    var px = Math.floor(canvas.width / total);
    var off = Math.floor((canvas.width - total * px) / 2);
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = dark;
    for (var y = 0; y < size; y++)
      for (var x = 0; x < size; x++)
        if (modules[y][x]) ctx.fillRect(off + (x + margin) * px, off + (y + margin) * px, px, px);
  }

  window.QRCode = {
    toCanvas: function (canvas, text, opts, cb) {
      try {
        var modules = encode(String(text));
        draw(canvas, modules, opts);
        if (cb) cb(null);
      } catch (e) {
        if (cb) cb(e);
      }
    }
  };
})();
