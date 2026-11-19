(function (root) {
  const MAX_PAGES = 3;
  let workerPromise = null;
  let progressHook = function () {};
  let job = 0;

  function pageUrl(relative) {
    return new URL(relative, document.baseURI).href;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('无法加载识别组件')); };
      document.head.appendChild(script);
    });
  }

  async function ensureWorker() {
    if (!window.Tesseract) await loadScript('./vendor/tesseract/tesseract.min.js');
    if (!workerPromise) {
      workerPromise = window.Tesseract.createWorker('chi_sim+eng', 1, {
        workerPath: pageUrl('vendor/tesseract/worker.min.js'),
        corePath: pageUrl('vendor/tesseract/tesseract-core-simd-lstm.wasm.js'),
        langPath: pageUrl('vendor/tesseract/'),
        gzip: true,
        logger: function (message) { progressHook(message); }
      }).then(async (worker) => {
        await worker.setParameters({ tessedit_pageseg_mode: '11' });
        return worker;
      });
    }
    return workerPromise;
  }

  function cancel() {
    job += 1;
    progressHook = function () {};
    const pending = workerPromise;
    workerPromise = null;
    if (pending) pending.then((worker) => worker.terminate()).catch(function () {});
  }

  async function recognizeCanvas(canvas, onProgress) {
    const mine = ++job;
    progressHook = function (message) {
      if (mine !== job) return;
      if (onProgress) onProgress(message);
    };
    const worker = await ensureWorker();
    if (mine !== job) throw new Error('cancelled');
    try {
      const result = await worker.recognize(canvas);
      if (mine !== job) throw new Error('cancelled');
      return (result && result.data && result.data.text) || '';
    } catch (error) {
      if (mine !== job) throw new Error('cancelled');
      throw error;
    }
  }

  root.FENBAO_OCR = {
    MAX_PAGES: MAX_PAGES,
    recognizeCanvas: recognizeCanvas,
    cancel: cancel
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
