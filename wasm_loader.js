(function (global) {
  const api = {
    available: false,
    ready: null,
  };

  async function instantiateWasm() {
    if (!global.WebAssembly || !global.Go || !global.fetch) {
      return false;
    }
    try {
      const go = new global.Go();
      let result;
      if (WebAssembly.instantiateStreaming) {
        result = await WebAssembly.instantiateStreaming(
          fetch("mpln.wasm"),
          go.importObject,
        );
      } else {
        const response = await fetch("mpln.wasm");
        const bytes = await response.arrayBuffer();
        result = await WebAssembly.instantiate(bytes, go.importObject);
      }
      go.run(result.instance);
      api.available = true;
      return true;
    } catch (error) {
      console.warn("MPLN WASM unavailable, falling back to JavaScript core.", error);
      return false;
    }
  }

  api.ready = instantiateWasm();

  api.encodeImageData = async function encodeImageData(
    rgba,
    width,
    height,
    options,
  ) {
    if (!(await api.ready) || !global.mplnEncodeImageData) {
      return null;
    }
    const result = global.mplnEncodeImageData(
      rgba,
      width,
      height,
      JSON.stringify(options || {}),
    );
    if (!result.ok) {
      throw new Error(result.error || "WASM MPLN encode failed.");
    }
    return result.mpln;
  };

  api.renderMPLN = async function renderMPLN(mplnText) {
    if (!(await api.ready) || !global.mplnRenderMPLN) {
      return null;
    }
    const result = global.mplnRenderMPLN(mplnText);
    if (!result.ok) {
      throw new Error(result.error || "WASM MPLN render failed.");
    }
    return {
      height: result.height,
      rgba: result.rgba,
      width: result.width,
    };
  };

  global.MPLNWasm = api;
})(typeof window !== "undefined" ? window : globalThis);
