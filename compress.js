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

    const steps = [
      ['Membaca file gambar…',          'Mengurai data piksel dari file'],
      ['Menganalisis dimensi objek…',   'Menghitung resolusi optimal'],
      ['Sedang mengkompres gambar…',    'Menerapkan algoritma kompresi Canvas'],
      ['Mengoptimalkan kualitas file…', 'Menyeimbangkan kualitas vs ukuran'],
      ['Memfinalisasi hasil…',          'Menyiapkan file untuk diunduh'],
    ];

    function setLoading(active, pct = 0, step = 0) {
      if (active) {
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
      if (b < 1024)    return b + ' B';
      if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
      return (b / 1048576).toFixed(2) + ' MB';
    }

    function showError(msg) {
      errorMessage.textContent = msg;
      errorBox.style.display   = 'block';
    }

    ['dragenter','dragover'].forEach(ev =>
      dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('dragover'); })
    );
    ['dragleave','drop'].forEach(ev =>
      dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('dragover'); })
    );
    dropZone.addEventListener('drop', e => {
      if (e.dataTransfer.files.length) processImage(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) processImage(fileInput.files[0]);
    });
    dropZone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') fileInput.click();
    });

    function processImage(file) {
      errorBox.style.display      = 'none';
      resultSection.style.display = 'none';

      const allowed = ['image/jpeg','image/jpg','image/png','image/webp'];
      if (!allowed.includes(file.type)) {
        showError('Format tidak didukung. Gunakan JPG, PNG, atau WEBP.');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        showError('File terlalu besar. Maksimal input 50MB.');
        return;
      }

      setLoading(true, 10, 0);

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = ev => {
        setLoading(true, 30, 1);
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

        const dataUrl  = canvas.toDataURL('image/jpeg', quality);
        const b64Len   = dataUrl.split(',')[1].length;
        const curSize  = Math.round(b64Len * (3 / 4));

        setLoading(true, Math.min(40 + iter * 8, 88), Math.min(2 + Math.floor(iter / 3), 3));

        if (curSize <= TARGET || quality <= 0.15) {
          if (curSize > TARGET && width > 200 && height > 200) {
            width   = Math.round(width * 0.8);
            height  = Math.round(height * 0.8);
            quality = 0.72;
            setTimeout(iterate, 10);
          } else {
            finalize(dataUrl, origSize, curSize, origName);
          }
        } else {
          quality = Math.max(quality - 0.10, 0.10);
          setTimeout(iterate, 10);
        }
      }
      iterate();
    }

    function finalize(dataUrl, origSize, compSize, origName) {
      setLoading(true, 100, 4);
      setTimeout(() => {
        setLoading(false);

        const savings  = Math.max(0, Math.round(((origSize - compSize) / origSize) * 100));
        const base     = origName.substring(0, origName.lastIndexOf('.')) || origName;

        origSizeStr.textContent    = fmtBytes(origSize);
        compSizeStr.textContent    = fmtBytes(compSize);
        savePercentStr.textContent = savings + '%';

        resultPreview.src = dataUrl;
        downloadBtn.href  = dataUrl;
        downloadBtn.setAttribute('download', 'imkompres_' + base + '.jpg');

        resultSection.style.display = 'grid';
        setTimeout(() => resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);

        fileInput.value = '';
      }, 350);
    }

    function openModal()  { document.getElementById('donasiModal').classList.add('active'); }
    function closeModal() { document.getElementById('donasiModal').classList.remove('active'); }
    function handleModalClick(e) {
      if (e.target === document.getElementById('donasiModal')) closeModal();
    }
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });