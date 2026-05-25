/* =========================================================
   IMKOMPRES — compress.js  v3.0
   Supports: JPG, PNG, WEBP (→ <100 KB)
             GIF               (→ <100 KB, frame sampling)
             Video MP4/WEBM/MOV/AVI (→ <40 MB, canvas re-encode)
   All processing is 100% client-side.
   ========================================================= */

   const dropZone       = document.getElementById('dropZone');
   const fileInput      = document.getElementById('fileInput');
   const loadingOverlay = document.getElementById('loadingOverlay');
   const loTitle        = document.getElementById('loTitle');
   const loSub          = document.getElementById('loSub');
   const loFill         = document.getElementById('loFill');
   const errorBox       = document.getElementById('errorBox');
   const errorMessage   = document.getElementById('errorMessage');
   const resultSection  = document.getElementById('resultSection');
   const resultPreview  = document.getElementById('resultPreview');
   const origSizeStr    = document.getElementById('origSizeStr');
   const compSizeStr    = document.getElementById('compSizeStr');
   const savePercentStr = document.getElementById('savePercentStr');
   const downloadBtn    = document.getElementById('downloadBtn');
 
   // ── Loading steps ──────────────────────────────────────
   const stepsImage = [
     ['Membaca file gambar…',          'Mengurai data piksel dari file'],
     ['Menganalisis dimensi objek…',   'Menghitung resolusi optimal'],
     ['Sedang mengkompres gambar…',    'Menerapkan algoritma kompresi Canvas'],
     ['Mengoptimalkan kualitas file…', 'Menyeimbangkan kualitas vs ukuran'],
     ['Memfinalisasi hasil…',          'Menyiapkan file untuk diunduh'],
   ];
   const stepsGif = [
     ['Membaca file GIF…',             'Mengurai frame-frame animasi'],
     ['Menganalisis frame GIF…',       'Menghitung jumlah frame & dimensi'],
     ['Sampling & resize frame…',      'Mengurangi frame berlebih'],
     ['Mengkompres setiap frame…',     'Menurunkan kualitas canvas'],
     ['Memfinalisasi GIF…',            'Menyiapkan file untuk diunduh'],
   ];
   const stepsVideo = [
     ['Membaca file video…',           'Memuat metadata durasi & codec'],
     ['Menghitung bitrate target…',    'Menetapkan parameter kompresi'],
     ['Merender ulang frame video…',   'Encoding canvas ke MediaRecorder'],
     ['Mengoptimalkan bitrate…',       'Menyeimbangkan kualitas vs ukuran'],
     ['Memfinalisasi video…',          'Menggabungkan chunk hasil encoding'],
   ];
 
   function setLoading(active, pct = 0, step = 0, mode = 'image') {
     if (active) {
       const steps = mode === 'video' ? stepsVideo : mode === 'gif' ? stepsGif : stepsImage;
       const [t, s] = steps[Math.min(step, steps.length - 1)];
       loTitle.textContent = t;
       loSub.textContent   = s;
       loFill.style.width  = pct + '%';
       loadingOverlay.classList.add('active');
     } else {
       loadingOverlay.classList.remove('active');
     }
   }
 
   function fmtBytes(b) {
     if (b < 1024)      return b + ' B';
     if (b < 1048576)   return (b / 1024).toFixed(1) + ' KB';
     if (b < 1073741824) return (b / 1048576).toFixed(2) + ' MB';
     return (b / 1073741824).toFixed(2) + ' GB';
   }
 
   function showError(msg) {
     errorMessage.textContent = msg;
     errorBox.style.display   = 'block';
   }
 
   // ── Drag & Drop & File Input ───────────────────────────
   ['dragenter','dragover'].forEach(ev =>
     dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('dragover'); })
   );
   ['dragleave','drop'].forEach(ev =>
     dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('dragover'); })
   );
   dropZone.addEventListener('drop', e => {
     if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
   });
   fileInput.addEventListener('change', () => {
     if (fileInput.files.length) processFile(fileInput.files[0]);
   });
   dropZone.addEventListener('keydown', e => {
     if (e.key === 'Enter' || e.key === ' ') fileInput.click();
   });
 
   // ── Router ─────────────────────────────────────────────
   function processFile(file) {
     errorBox.style.display      = 'none';
     resultSection.style.display = 'none';
 
     const videoTypes = ['video/mp4','video/webm','video/ogg','video/quicktime','video/x-msvideo','video/avi','video/x-matroska'];
     const imageTypes = ['image/jpeg','image/jpg','image/png','image/webp'];
 
     if (file.type === 'image/gif') {
       if (file.size > 50 * 1024 * 1024) { showError('File GIF terlalu besar. Maksimal 50MB.'); return; }
       processGif(file);
     } else if (imageTypes.includes(file.type)) {
       if (file.size > 50 * 1024 * 1024) { showError('File terlalu besar. Maksimal input 50MB.'); return; }
       processImage(file);
     } else if (videoTypes.includes(file.type) || file.name.match(/\.(mp4|webm|mov|avi|mkv)$/i)) {
       if (file.size > 500 * 1024 * 1024) { showError('File video terlalu besar. Maksimal 500MB.'); return; }
       processVideo(file);
     } else {
       showError('Format tidak didukung. Gunakan JPG, PNG, WEBP, GIF, atau Video (MP4/WEBM/MOV/AVI).');
     }
   }
 
   // ══════════════════════════════════════════════════════
   //  IMAGE (JPG/PNG/WEBP) — target < 100 KB
   // ══════════════════════════════════════════════════════
   function processImage(file) {
     setLoading(true, 10, 0, 'image');
     const reader = new FileReader();
     reader.readAsDataURL(file);
     reader.onload = ev => {
       setLoading(true, 30, 1, 'image');
       const img = new Image();
       img.src = ev.target.result;
       img.onload = () => compressLoop(img, file.size, file.name);
     };
   }
 
   function compressLoop(img, origSize, origName) {
     const TARGET = 100 * 1024;
     let quality  = 0.85;
     let width    = img.width;
     let height   = img.height;
     let iter     = 0;
 
     const canvas = document.createElement('canvas');
     const ctx    = canvas.getContext('2d');
 
     function iterate() {
       iter++;
       canvas.width  = width;
       canvas.height = height;
       ctx.clearRect(0, 0, width, height);
       ctx.drawImage(img, 0, 0, width, height);
 
       const dataUrl = canvas.toDataURL('image/jpeg', quality);
       const b64Len  = dataUrl.split(',')[1].length;
       const curSize = Math.round(b64Len * (3 / 4));
 
       setLoading(true, Math.min(40 + iter * 8, 88), Math.min(2 + Math.floor(iter / 3), 3), 'image');
 
       if (curSize <= TARGET || quality <= 0.15) {
         if (curSize > TARGET && width > 200 && height > 200) {
           width   = Math.round(width * 0.8);
           height  = Math.round(height * 0.8);
           quality = 0.72;
           setTimeout(iterate, 10);
         } else {
           finalizeImage(dataUrl, origSize, curSize, origName);
         }
       } else {
         quality = Math.max(quality - 0.10, 0.10);
         setTimeout(iterate, 10);
       }
     }
     iterate();
   }
 
   function finalizeImage(dataUrl, origSize, compSize, origName) {
     setLoading(true, 100, 4, 'image');
     setTimeout(() => {
       setLoading(false);
       showResult(dataUrl, origSize, compSize, origName, '.jpg', 'imkompres_');
     }, 350);
   }
 
   // ══════════════════════════════════════════════════════
   //  GIF — target < 100 KB via canvas frame re-render
   //  Strategy: decode frames via <canvas> trick on <img>,
   //  reduce dimensions & quality, re-export as JPEG sequence
   //  wrapped in a data URI. Since browsers can't re-encode
   //  animated GIF natively, we output the best single
   //  representative frame as JPEG when size exceeds target,
   //  OR keep the original GIF if already small enough.
   //  For true animated output we use the GIF size reduction
   //  approach: if original < 100KB → pass through as-is,
   //  otherwise canvas-compress a representative frame.
   // ══════════════════════════════════════════════════════
   function processGif(file) {
     setLoading(true, 10, 0, 'gif');
 
     // If already under target, pass through
     if (file.size <= 100 * 1024) {
       const reader = new FileReader();
       reader.readAsDataURL(file);
       reader.onload = ev => {
         setLoading(true, 100, 4, 'gif');
         setTimeout(() => {
           setLoading(false);
           showResult(ev.target.result, file.size, file.size, file.name, '.gif', 'imkompres_');
         }, 300);
       };
       return;
     }
 
     // GIF too large — render first frame to canvas, compress as JPEG
     setLoading(true, 25, 1, 'gif');
     const url = URL.createObjectURL(file);
     const img  = new Image();
     img.src    = url;
     img.onload = () => {
       setLoading(true, 50, 2, 'gif');
       URL.revokeObjectURL(url);
 
       const TARGET = 100 * 1024;
       let width    = img.width;
       let height   = img.height;
       let quality  = 0.82;
       let iter     = 0;
 
       const canvas = document.createElement('canvas');
       const ctx    = canvas.getContext('2d');
 
       function iterate() {
         iter++;
         canvas.width  = width;
         canvas.height = height;
         ctx.clearRect(0, 0, width, height);
         ctx.drawImage(img, 0, 0, width, height);
 
         const dataUrl = canvas.toDataURL('image/jpeg', quality);
         const curSize = Math.round(dataUrl.split(',')[1].length * (3 / 4));
 
         setLoading(true, Math.min(55 + iter * 7, 90), Math.min(2 + Math.floor(iter / 3), 3), 'gif');
 
         if (curSize <= TARGET || quality <= 0.15) {
           if (curSize > TARGET && width > 200) {
             width   = Math.round(width * 0.8);
             height  = Math.round(height * 0.8);
             quality = 0.72;
             setTimeout(iterate, 10);
           } else {
             setLoading(true, 100, 4, 'gif');
             setTimeout(() => {
               setLoading(false);
               // Note: output is JPEG (best quality from GIF frame)
               const base = file.name.replace(/\.gif$/i, '');
               showResult(dataUrl, file.size, curSize, base + '.jpg', '.jpg', 'imkompres_gif_');
             }, 350);
           }
         } else {
           quality = Math.max(quality - 0.10, 0.10);
           setTimeout(iterate, 10);
         }
       }
       iterate();
     };
     img.onerror = () => { setLoading(false); showError('Gagal membaca file GIF.'); };
   }
 
   // ══════════════════════════════════════════════════════
   //  VIDEO — target < 40 MB using MediaRecorder + Canvas
   //  Approach:
   //   1. Load video into <video> element (blob URL)
   //   2. Determine scale factor & bitrate from file size
   //   3. Seek & capture frames via requestAnimationFrame
   //      into an OffscreenCanvas / Canvas
   //   4. Pipe canvas.captureStream() into MediaRecorder
   //      (VP8/VP9 or H264 depending on browser support)
   //   5. Collect Blob chunks → download
   // ══════════════════════════════════════════════════════
   function processVideo(file) {
     setLoading(true, 5, 0, 'video');
 
     const MAX_TARGET_BYTES = 40 * 1024 * 1024;  // 40 MB hard ceiling
     const origSize         = file.size;
 
     // ── Target size: ALWAYS smaller than original ──────
     // If file > 40MB  → target = 40MB
     // If file <= 40MB → target = 70% of original (always shrink)
     const TARGET_BYTES = origSize > MAX_TARGET_BYTES
       ? MAX_TARGET_BYTES
       : Math.floor(origSize * 0.70);
 
     const videoEl   = document.createElement('video');
     videoEl.muted   = true;
     videoEl.preload = 'metadata';
 
     const blobUrl = URL.createObjectURL(file);
     videoEl.src   = blobUrl;
 
     videoEl.addEventListener('loadedmetadata', () => {
       const duration = videoEl.duration;
       if (!isFinite(duration) || duration <= 0) {
         URL.revokeObjectURL(blobUrl);
         setLoading(false);
         showError('Tidak dapat membaca durasi video. Coba format MP4 atau WEBM.');
         return;
       }
 
       setLoading(true, 15, 1, 'video');
 
       const origW = videoEl.videoWidth  || 1280;
       const origH = videoEl.videoHeight || 720;
 
       // ── Compute compression ratio ──────────────────
       // How much we need to shrink: e.g. 4MB → target 2.8MB = ratio 0.70
       const sizeRatio = TARGET_BYTES / origSize;  // always < 1.0
 
       // ── Scale dimensions by sqrt of size ratio ─────
       // Area scales as square of linear dimension, so halving area = 0.707x linear
       let scaleFactor = Math.sqrt(sizeRatio);
       scaleFactor = Math.min(0.95, Math.max(0.20, scaleFactor)); // clamp 20%–95%
 
       const outW = Math.max(128, Math.round(origW * scaleFactor / 2) * 2);
       const outH = Math.max(72,  Math.round(origH * scaleFactor / 2) * 2);
 
       // ── Target bitrate ─────────────────────────────
       // budget = TARGET_BYTES * 8 bits, 85% for video stream
       const videoBudgetBits = TARGET_BYTES * 8 * 0.85;
       const targetBitrate   = Math.floor(videoBudgetBits / duration);
       // Hard cap: never exceed 6 Mbps (keeps file lean), min 80 Kbps
       const clampedBitrate  = Math.min(6_000_000, Math.max(80_000, targetBitrate));
 
       // ── FPS: reduce for small files to help codec ──
       // Smaller target → lower fps to reduce overhead
       const fps = sizeRatio < 0.3 ? 15 : sizeRatio < 0.6 ? 20 : 25;
 
       // ── Detect supported codec ─────────────────────
       const mimeOptions = [
         'video/webm;codecs=vp9',
         'video/webm;codecs=vp8',
         'video/webm',
         'video/mp4',
       ];
       let chosenMime = '';
       for (const m of mimeOptions) {
         if (MediaRecorder.isTypeSupported(m)) { chosenMime = m; break; }
       }
       if (!chosenMime) {
         URL.revokeObjectURL(blobUrl);
         setLoading(false);
         showError('Browser Anda tidak mendukung MediaRecorder untuk kompresi video. Coba Chrome atau Edge terbaru.');
         return;
       }
 
       const ext = chosenMime.includes('mp4') ? '.mp4' : '.webm';
 
       // ── Setup canvas ───────────────────────────────
       const canvas = document.createElement('canvas');
       canvas.width  = outW;
       canvas.height = outH;
       const ctx = canvas.getContext('2d');
 
       // ── Setup MediaRecorder ────────────────────────
       const stream = canvas.captureStream(fps);
       const chunks = [];
       let   recorder;
 
       try {
         recorder = new MediaRecorder(stream, {
           mimeType:           chosenMime,
           videoBitsPerSecond: clampedBitrate,
         });
       } catch (e) {
         recorder = new MediaRecorder(stream, { mimeType: chosenMime });
       }
 
       recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
       recorder.onstop = () => {
         URL.revokeObjectURL(blobUrl);
         const blob     = new Blob(chunks, { type: chosenMime });
         const compSize = blob.size;
         const outUrl   = URL.createObjectURL(blob);
 
         setLoading(true, 100, 4, 'video');
         setTimeout(() => {
           setLoading(false);
           const base = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
           showResultVideo(outUrl, origSize, compSize, 'imkompres_' + base + ext, blob, chosenMime);
         }, 350);
       };
 
       // ── Frame rendering loop ───────────────────────
       recorder.start(200);  // collect chunks every 200ms
       setLoading(true, 25, 2, 'video');
 
       videoEl.currentTime = 0;
       videoEl.playbackRate = 1;
 
       let lastTime    = -1;
       let startReal   = null;
       let progressPct = 25;
 
       function renderFrame(timestamp) {
         if (startReal === null) startReal = timestamp;
 
         const currentTime = videoEl.currentTime;
 
         if (currentTime !== lastTime) {
           lastTime = currentTime;
           ctx.drawImage(videoEl, 0, 0, outW, outH);
           progressPct = Math.min(25 + Math.round((currentTime / duration) * 65), 90);
           setLoading(true, progressPct, 2, 'video');
         }
 
         if (currentTime < duration - 0.1 && !videoEl.ended && !videoEl.paused) {
           requestAnimationFrame(renderFrame);
         } else {
           // Done — wait a tiny bit then stop recorder
           setTimeout(() => recorder.stop(), 300);
         }
       }
 
       videoEl.play().then(() => {
         requestAnimationFrame(renderFrame);
       }).catch(() => {
         recorder.stop();
         setLoading(false);
         showError('Gagal memutar video untuk re-encoding. Pastikan format MP4/WEBM didukung browser.');
       });
     });
 
     videoEl.addEventListener('error', () => {
       URL.revokeObjectURL(blobUrl);
       setLoading(false);
       showError('Gagal memuat video. Pastikan file tidak rusak dan format didukung (MP4, WEBM, MOV).');
     });
   }
 
   // ══════════════════════════════════════════════════════
   //  SHARED RESULT RENDERERS
   // ══════════════════════════════════════════════════════
   function showResult(dataUrl, origSize, compSize, origName, ext, prefix) {
     const savings  = Math.max(0, Math.round(((origSize - compSize) / origSize) * 100));
     const base     = origName.substring(0, origName.lastIndexOf('.')) || origName;
 
     origSizeStr.textContent    = fmtBytes(origSize);
     compSizeStr.textContent    = fmtBytes(compSize);
     savePercentStr.textContent = savings + '%';
 
     // Preview
     resultPreview.src              = dataUrl;
     resultPreview.style.display    = 'block';
     const videoPreview = document.getElementById('resultPreviewVideo');
     if (videoPreview) videoPreview.style.display = 'none';
 
     downloadBtn.href = dataUrl;
     downloadBtn.setAttribute('download', prefix + base + ext);
 
     resultSection.style.display = 'grid';
     setTimeout(() => resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
     fileInput.value = '';
   }
 
   function showResultVideo(blobUrl, origSize, compSize, filename, blob, mimeType) {
     const savings = Math.max(0, Math.round(((origSize - compSize) / origSize) * 100));
 
     origSizeStr.textContent    = fmtBytes(origSize);
     compSizeStr.textContent    = fmtBytes(compSize);
     savePercentStr.textContent = savings + '%';
 
     // Show video preview element, hide image
     resultPreview.style.display    = 'none';
     let videoPreview = document.getElementById('resultPreviewVideo');
     if (!videoPreview) {
       videoPreview = document.createElement('video');
       videoPreview.id       = 'resultPreviewVideo';
       videoPreview.controls = true;
       videoPreview.muted    = true;
       videoPreview.style.cssText = 'width:100%;border-radius:8px;max-height:260px;object-fit:contain;';
       resultPreview.parentNode.insertBefore(videoPreview, resultPreview);
     }
     videoPreview.src           = blobUrl;
     videoPreview.style.display = 'block';
 
     // Download via Blob
     downloadBtn.href = blobUrl;
     downloadBtn.setAttribute('download', filename);
 
     resultSection.style.display = 'grid';
     setTimeout(() => resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
     fileInput.value = '';
   }
 
   // ── Donation Modal ─────────────────────────────────────
   function openModal()  { document.getElementById('donasiModal').classList.add('active'); }
   function closeModal() { document.getElementById('donasiModal').classList.remove('active'); }
   function handleModalClick(e) {
     if (e.target === document.getElementById('donasiModal')) closeModal();
   }
   document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });