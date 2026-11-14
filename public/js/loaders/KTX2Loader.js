/**
 * ============================================================================
 * THREE.KTX2Loader (Basis Universal Transcoder Wrapper for Vanilla Three.js)
 * ============================================================================
 * Uses public/basis/basis_transcoder.js & basis_transcoder.wasm to decode
 * KHR_texture_basisu (.ktx2) embedded textures in glTF/GLB assets (such as
 * SpaceShip's astronaut_lod0.glb and astronaut_lod1.glb).
 */
(function (window) {
  "use strict";

  const TRANSCODER_FORMAT_RGBA32 = 13;

  class KTX2Loader extends window.THREE.Loader {
    constructor(manager) {
      super(manager);
      this.transcoderPath = "basis/";
      this.basisPromise = null;
    }

    setTranscoderPath(path) {
      this.transcoderPath = path.endsWith("/") ? path : path + "/";
      return this;
    }

    detectSupport(/* renderer */) {
      return this;
    }

    _ensureBasis() {
      if (this.basisPromise) return this.basisPromise;

      this.basisPromise = new Promise((resolve, reject) => {
        const initWithFactory = (BASISFactory) => {
          fetch(this.transcoderPath + "basis_transcoder.wasm")
            .then((res) => {
              if (!res.ok) throw new Error("Failed to load basis_transcoder.wasm");
              return res.arrayBuffer();
            })
            .then((wasmBinary) => BASISFactory({ wasmBinary }))
            .then((BasisModule) => {
              BasisModule.initializeBasis();
              resolve(BasisModule);
            })
            .catch(reject);
        };

        if (typeof window.BASIS === "function") {
          initWithFactory(window.BASIS);
          return;
        }

        const script = document.createElement("script");
        script.src = this.transcoderPath + "basis_transcoder.js";
        script.onload = () => {
          if (typeof window.BASIS === "function") {
            initWithFactory(window.BASIS);
          } else {
            reject(new Error("BASIS global not found after loading basis_transcoder.js"));
          }
        };
        script.onerror = (err) => reject(err);
        document.head.appendChild(script);
      });

      return this.basisPromise;
    }

    load(url, onLoad, onProgress, onError) {
      const fileLoader = new window.THREE.FileLoader(this.manager);
      fileLoader.setPath(this.path);
      fileLoader.setResponseType("arraybuffer");
      fileLoader.setWithCredentials(this.withCredentials);

      fileLoader.load(
        url,
        (buffer) => {
          this.parse(buffer, onLoad, onError);
        },
        onProgress,
        onError
      );
    }

    parse(buffer, onLoad, onError) {
      this._ensureBasis()
        .then((BasisModule) => {
          const ktx2File = new BasisModule.KTX2File(new Uint8Array(buffer));
          if (!ktx2File.isValid()) {
            ktx2File.close();
            ktx2File.delete();
            throw new Error("Invalid KTX2 texture buffer");
          }

          const width = ktx2File.getWidth();
          const height = ktx2File.getHeight();

          if (!ktx2File.startTranscoding()) {
            ktx2File.close();
            ktx2File.delete();
            throw new Error("KTX2 startTranscoding failed");
          }

          const byteSize = ktx2File.getImageTranscodedSizeInBytes(
            0,
            0,
            0,
            TRANSCODER_FORMAT_RGBA32
          );
          const rgbaBytes = new Uint8Array(byteSize);
          const status = ktx2File.transcodeImage(
            rgbaBytes,
            0,
            0,
            0,
            TRANSCODER_FORMAT_RGBA32,
            0,
            -1,
            -1
          );

          ktx2File.close();
          ktx2File.delete();

          if (!status) {
            throw new Error("KTX2 transcodeImage failed");
          }

          const tex = new window.THREE.DataTexture(
            rgbaBytes,
            width,
            height,
            window.THREE.RGBAFormat,
            window.THREE.UnsignedByteType
          );
          tex.minFilter = window.THREE.LinearMipmapLinearFilter;
          tex.magFilter = window.THREE.LinearFilter;
          tex.generateMipmaps = true;
          tex.flipY = false;
          tex.needsUpdate = true;

          if (onLoad) onLoad(tex);
        })
        .catch((err) => {
          console.error("[KTX2Loader] Error:", err);
          if (onError) onError(err);
        });
    }
  }

  if (window.THREE) {
    window.THREE.KTX2Loader = KTX2Loader;
  }
  window.KTX2Loader = KTX2Loader;
})(window);
