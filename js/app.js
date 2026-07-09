/* SHADER_LAB engine: WebGL2 rendering + auto-generated parameter UI. */
(() => {
  "use strict";

  const canvas = document.getElementById("gl");
  const gl = canvas.getContext("webgl2", { antialias: true });

  if (!gl) {
    document.getElementById("gl-error").hidden = false;
    return;
  }

  const HEADER = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 u_resolution;
uniform float u_time;
`;

  // Fullscreen triangle, no buffers needed.
  const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  gl.bindVertexArray(gl.createVertexArray());

  // ---------- shader compilation ----------

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error("Shader compile error:\n" + log);
    }
    return sh;
  }

  function buildProgram(fragBody) {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, HEADER + fragBody));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Program link error:\n" + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  // ---------- state ----------

  let current = null;      // { def, program, locations, values }
  let time = 0;
  let playing = true;
  let lastFrame = performance.now();

  // fps
  let fpsAccum = 0, fpsFrames = 0, fpsLast = performance.now();

  const $ = (id) => document.getElementById(id);
  const select = $("shader-select");
  const paramsEl = $("params");

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // ---------- mouse (u_mouse uniform, gl_FragCoord space) ----------

  let mouse = [-1e5, -1e5]; // offscreen until the cursor enters

  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    mouse = [(e.clientX - r.left) * dpr, canvas.height - (e.clientY - r.top) * dpr];
  });
  canvas.addEventListener("pointerleave", () => { mouse = [-1e5, -1e5]; });

  // last few clicks as (x, y, shaderTime) — shaders can ripple from them
  const clicks = [];
  canvas.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    clicks.push([(e.clientX - r.left) * dpr, canvas.height - (e.clientY - r.top) * dpr, time]);
    if (clicks.length > 4) clicks.shift();
  });
  const clicksBuf = new Float32Array(12);

  // ---------- user image (sampler uniform, e.g. Dither) ----------

  let imageTex = null;
  let imageSize = [1, 1];
  let imageName = null;

  // 1x1 fallback so the sampler always has a complete texture bound
  const blankTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, blankTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                new Uint8Array([0, 0, 0, 255]));

  function setImage(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (!imageTex) imageTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, imageTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      imageSize = [img.width, img.height];
      imageName = file.name;
      buildParamsUI(current.def);
    };
    img.src = url;
  }

  function clearImage() {
    imageName = null;
    buildParamsUI(current.def);
  }

  function loadShader(def) {
    const program = buildProgram(def.frag);
    const locations = { u_time: gl.getUniformLocation(program, "u_time"),
                        u_resolution: gl.getUniformLocation(program, "u_resolution") };
    for (const extra of ["u_image", "u_hasImage", "u_imageSize", "u_mouse"]) {
      locations[extra] = gl.getUniformLocation(program, extra);
    }
    // array uniforms resolve as "name[0]" on some drivers
    locations.u_clicks = gl.getUniformLocation(program, "u_clicks")
                      || gl.getUniformLocation(program, "u_clicks[0]");
    const values = {};
    for (const p of def.params) {
      locations[p.key] = gl.getUniformLocation(program, p.key);
      values[p.key] = p.value;
    }
    if (current) gl.deleteProgram(current.program);
    current = { def, program, locations, values };
    buildParamsUI(def);
  }

  // ---------- parameter UI ----------

  function formatValue(p, v) {
    return p.step >= 1 ? String(Math.round(v)) : Number(v).toFixed(p.step < 0.01 ? 3 : 2);
  }

  function buildParamsUI(def) {
    paramsEl.innerHTML = "";
    for (const p of def.params) {
      const row = document.createElement("div");
      row.className = "param";

      if (p.type === "range") {
        // The whole row is the slider: a fill layer shows the value,
        // label and readout sit inside the field.
        row.classList.add("slider-param");
        row.tabIndex = 0;
        row.setAttribute("role", "slider");
        row.setAttribute("aria-label", p.label);
        row.setAttribute("aria-valuemin", p.min);
        row.setAttribute("aria-valuemax", p.max);
        row.innerHTML = `
          <div class="fill"></div>
          <span class="param-name">${p.label}</span>
          <span class="param-value"></span>`;
        const fill = row.querySelector(".fill");
        const readout = row.querySelector(".param-value");

        const update = () => {
          const v = current.values[p.key];
          fill.style.width = `${((v - p.min) / (p.max - p.min)) * 100}%`;
          readout.textContent = formatValue(p, v);
          row.setAttribute("aria-valuenow", v);
        };

        const setValue = (v) => {
          v = Math.round((v - p.min) / p.step) * p.step + p.min;
          current.values[p.key] = Math.min(p.max, Math.max(p.min, +v.toFixed(6)));
          update();
        };

        row.addEventListener("pointerdown", (e) => {
          row.setPointerCapture(e.pointerId);
          const r = row.getBoundingClientRect();
          setValue(p.min + ((e.clientX - r.left) / r.width) * (p.max - p.min));
        });
        row.addEventListener("pointermove", (e) => {
          if (!row.hasPointerCapture(e.pointerId)) return;
          const r = row.getBoundingClientRect();
          setValue(p.min + ((e.clientX - r.left) / r.width) * (p.max - p.min));
        });
        row.addEventListener("keydown", (e) => {
          const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1
                    : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          setValue(current.values[p.key] + dir * p.step);
        });

        update();
      } else if (p.type === "toggle") {
        row.innerHTML = `
          <div class="param-color">
            <span class="param-name">${p.label}</span>
            <button class="toggle" role="switch" aria-label="${p.label}"></button>
          </div>`;
        const btn = row.querySelector(".toggle");
        const sync = () => {
          const on = current.values[p.key] >= 0.5;
          btn.classList.toggle("on", on);
          btn.setAttribute("aria-checked", on);
        };
        sync();
        btn.addEventListener("click", () => {
          current.values[p.key] = current.values[p.key] >= 0.5 ? 0 : 1;
          sync();
        });
      } else if (p.type === "select") {
        row.innerHTML = `
          <div class="param-row"><span class="param-name">${p.label}</span></div>
          <div class="chips"></div>`;
        const chips = row.querySelector(".chips");
        p.options.forEach((name, i) => {
          const b = document.createElement("button");
          b.className = "chip" + (current.values[p.key] === i ? " active" : "");
          b.textContent = name;
          b.addEventListener("click", () => {
            current.values[p.key] = i;
            chips.querySelectorAll(".chip").forEach((c, j) => c.classList.toggle("active", j === i));
          });
          chips.appendChild(b);
        });
      } else if (p.type === "image") {
        row.innerHTML = `
          <div class="param-color">
            <span class="param-name">${p.label}</span>
            <span class="color-ctrl">
              <button class="ghost-btn file-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span>${imageName ? imageName : "UPLOAD"}</span>
              </button>
              ${imageName ? `<button class="icon-btn clear-btn" title="Remove image" aria-label="Remove image">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
              </button>` : ""}
              <input type="file" accept="image/*" hidden>
            </span>
          </div>`;
        const fileInput = row.querySelector("input[type=file]");
        row.querySelector(".file-btn").addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", () => {
          if (fileInput.files[0]) setImage(fileInput.files[0]);
        });
        const clearBtn = row.querySelector(".clear-btn");
        if (clearBtn) clearBtn.addEventListener("click", clearImage);
      } else if (p.type === "color") {
        row.innerHTML = `
          <div class="param-color">
            <span class="param-name">${p.label}</span>
            <span class="color-ctrl">
              <span class="color-well"><input type="color"></span>
              <span class="color-hex"></span>
            </span>
          </div>`;
        const input = row.querySelector("input");
        const well = row.querySelector(".color-well");
        const hex = row.querySelector(".color-hex");
        const apply = (v) => {
          well.style.background = v;
          hex.textContent = v.slice(1).toUpperCase();
        };
        input.value = current.values[p.key];
        apply(current.values[p.key]);
        input.addEventListener("input", () => {
          current.values[p.key] = input.value;
          apply(input.value);
        });
      }

      paramsEl.appendChild(row);
    }
  }

  function syncUIFromValues() {
    buildParamsUI(current.def);
  }

  // ---------- controls ----------

  for (const def of SHADERS) {
    const opt = document.createElement("option");
    opt.value = def.id;
    opt.textContent = def.name;
    select.appendChild(opt);
  }

  select.addEventListener("change", () => {
    loadShader(SHADERS.find((s) => s.id === select.value));
  });

  $("btn-reset").addEventListener("click", () => {
    for (const p of current.def.params) current.values[p.key] = p.value;
    syncUIFromValues();
  });

  $("btn-random").addEventListener("click", () => {
    // Colors come from a curated palette so the stops always form a
    // coherent ramp; only the ramp stops (u_c0..u_c5) are recolored —
    // other color params (e.g. a background picker) keep their value.
    const stopParams = current.def.params.filter((p) => /^u_c\d$/.test(p.key));
    const currentRamp = stopParams.map((p) => current.values[p.key]).join();
    const candidates = PALETTES.filter((pal) => pal.join() !== currentRamp);
    const palette = candidates[Math.floor(Math.random() * candidates.length)];
    stopParams.forEach((p, i) => { current.values[p.key] = palette[i % palette.length]; });

    for (const p of current.def.params) {
      if (p.type === "range") {
        const steps = Math.round((p.max - p.min) / p.step);
        current.values[p.key] = p.min + Math.round(Math.random() * steps) * p.step;
      }
    }
    syncUIFromValues();
  });

  const ICONS = {
    pause: `<svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="2.6" height="10" rx="0.8"/><rect x="9.4" y="3" width="2.6" height="10" rx="0.8"/></svg>`,
    play: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.2v9.6c0 .66.73 1.06 1.28.7l7.2-4.8a.85.85 0 0 0 0-1.4l-7.2-4.8A.85.85 0 0 0 5 3.2z"/></svg>`,
    copy: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.2A1.3 1.3 0 0 0 9.2 2H3.8a1.3 1.3 0 0 0-1.3 1.3v5.4a1.3 1.3 0 0 0 1.3 1.3h.2"/></svg>`,
    check: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5 6.5 12 13 4.5"/></svg>`,
  };

  const playBtn = $("btn-play");
  playBtn.innerHTML = ICONS.pause;
  playBtn.addEventListener("click", () => {
    playing = !playing;
    playBtn.innerHTML = playing ? ICONS.pause : ICONS.play;
    playBtn.title = playBtn.ariaLabel = playing ? "Pause" : "Play";
  });

  const copyBtn = $("btn-copy");
  copyBtn.innerHTML = ICONS.copy;
  let copyTimer = null;
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(HEADER + current.def.frag.trim() + "\n");
      copyBtn.innerHTML = ICONS.check;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { copyBtn.innerHTML = ICONS.copy; }, 1200);
    } catch {
      copyBtn.title = "Clipboard unavailable";
    }
  });

  $("btn-collapse").addEventListener("click", () => document.body.classList.add("collapsed"));
  $("btn-expand").addEventListener("click", () => document.body.classList.remove("collapsed"));

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "SELECT") {
      e.preventDefault();
      playBtn.click();
    }
  });

  // ---------- resize ----------

  const stage = canvas.parentElement;
  const statRes = $("stat-res");

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(stage.clientWidth * dpr);
    const h = Math.round(stage.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      statRes.textContent = `${w}×${h}`;
    }
  }

  new ResizeObserver(resize).observe(stage);
  resize();

  // ---------- render loop ----------

  const statFps = $("stat-fps");

  function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    if (playing) time += dt;

    // fps readout (updated twice a second)
    fpsAccum += dt;
    fpsFrames++;
    if (now - fpsLast > 500) {
      statFps.textContent = `${Math.round(fpsFrames / fpsAccum)} FPS`;
      fpsAccum = 0; fpsFrames = 0; fpsLast = now;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(current.program);
    gl.uniform1f(current.locations.u_time, time);
    gl.uniform2f(current.locations.u_resolution, canvas.width, canvas.height);

    for (const p of current.def.params) {
      const loc = current.locations[p.key];
      if (!loc || p.type === "image") continue;
      if (p.type === "color") {
        const [r, g, b] = hexToRgb(current.values[p.key]);
        gl.uniform3f(loc, r, g, b);
      } else {
        gl.uniform1f(loc, current.values[p.key]);
      }
    }

    if (current.locations.u_mouse) {
      gl.uniform2f(current.locations.u_mouse, mouse[0], mouse[1]);
    }

    if (current.locations.u_clicks) {
      clicksBuf.fill(0);
      for (let i = 0; i < 4; i++) {
        const c = clicks[i] || [0, 0, -1e5];
        clicksBuf.set(c, i * 3);
      }
      gl.uniform3fv(current.locations.u_clicks, clicksBuf);
    }

    if (current.locations.u_image) {
      const active = imageName && imageTex;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, active ? imageTex : blankTex);
      gl.uniform1i(current.locations.u_image, 0);
      gl.uniform1f(current.locations.u_hasImage, active ? 1 : 0);
      gl.uniform2f(current.locations.u_imageSize, imageSize[0], imageSize[1]);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  }

  loadShader(SHADERS[0]);
  requestAnimationFrame(frame);
})();
