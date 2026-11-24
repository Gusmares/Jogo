const { app, nativeImage } = require('electron'); const fs = require('fs');
app.whenReady().then(() => {
  try {
    const av = process.argv.slice(process.argv.findIndex(x => /diff\.js$/.test(x)) + 1), a = av[0], b = av[1], outp = av[2];
    const A = nativeImage.createFromPath(a), B = nativeImage.createFromPath(b), sa = A.getSize(), sb = B.getSize();
    if (sa.width !== sb.width || sa.height !== sb.height) { console.log('TAMANHOS DIFERENTES', JSON.stringify(sa), JSON.stringify(sb)); app.exit(1); return; }
    const pa = A.toBitmap(), pb = B.toBitmap(); let n = 0, big = 0, sum = 0, max = 0, minx = 1e9, maxx = -1, miny = 1e9, maxy = -1; const N = sa.width * sa.height, o = Buffer.alloc(N * 4);
    for (let i = 0; i < N; i++) {
      const d = Math.max(Math.abs(pa[i * 4] - pb[i * 4]), Math.abs(pa[i * 4 + 1] - pb[i * 4 + 1]), Math.abs(pa[i * 4 + 2] - pb[i * 4 + 2]));
      if (d > 0) { n++; sum += d; } if (d > max) max = d;
      if (d > 12) { big++; const x = i % sa.width, y = (i / sa.width) | 0; minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
      const v = d > 12 ? 255 : d > 3 ? 110 : 0; o[i * 4] = v; o[i * 4 + 1] = d > 12 ? 0 : v; o[i * 4 + 2] = d > 12 ? 0 : v; o[i * 4 + 3] = 255;
    }
    if (outp) fs.writeFileSync(outp, nativeImage.createFromBitmap(o, { width: sa.width, height: sa.height }).toPNG());
    console.log(JSON.stringify({ pixels: N, diferentes: n, pctDif: +(100 * n / N).toFixed(3), maiorQue12: big, pctMaiorQue12: +(100 * big / N).toFixed(4), difMax: max, difMediaNosDiferentes: n ? +(sum / n).toFixed(2) : 0, caixaDifGrande: big ? [minx, miny, maxx, maxy] : null }));
  } catch (e) { console.log('ERRO', e.message); }
  app.exit(0);
});
