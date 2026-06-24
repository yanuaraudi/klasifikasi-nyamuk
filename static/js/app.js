// ==========================================================================
// 1. GLOBAL STATE MANAGEMENT
// ==========================================================================
let batchFiles = [];       
let currentActiveIdx = -1; 
let isProcessingQueue = false;
let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let startX, startY;
let deferredPrompt;

// ==========================================================================
// 2. DOM ELEMENT BINDINGS
// ==========================================================================
const previewArea = document.getElementById("previewArea");
const zoomContainer = document.getElementById("zoomContainer");
const zoomContent = document.getElementById("zoomContent");
const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const placeholder = document.getElementById('placeholderText');
const classifyBtn = document.getElementById("classifyBtn");
const downloadBtn = document.getElementById("downloadBtn");
// const clearQueueBtn = document.getElementById("clearQueueBtn");
const installBtn = document.getElementById('pwaInstallBtn');

const cameraInput = document.getElementById('cameraInput');
const mediaSelectorBtn = document.getElementById('mediaSelectorBtn');
const actionSheet = document.getElementById('actionSheet');
const chooseCameraBtn = document.getElementById('chooseCameraBtn');
const chooseGalleryBtn = document.getElementById('chooseGalleryBtn');
const closeActionSheetBtn = document.getElementById('closeActionSheetBtn');
const batchSection = document.querySelector('.batch-section');

// ==========================================================================
// 3. CORE UTILITY FUNCTIONS
// ==========================================================================
function updateButtons() {
    const hasImages = batchFiles.length > 0;
    const hasActiveResult = currentActiveIdx !== -1 && batchFiles[currentActiveIdx].hasResult;
    
    classifyBtn.disabled = !hasImages || isProcessingQueue;
    downloadBtn.disabled = !hasActiveResult || isProcessingQueue;
}

function updateTransform() {
    zoomContent.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}

function formatClassName(name) {
    return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ==========================================================================
// 4. IMAGE HANDLING & SOURCE SELECTION PIPELINE
// ==========================================================================
function handleIncomingFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    const validFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (validFiles.length === 0) {
        alert("Harap masukkan file citra gambar yang valid (.jpg, .png)!");
        return;
    }

    validFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = function (e) {
            const compressionImg = new Image();
            compressionImg.onload = function() {
                const maxDimension = 1280;
                let width = compressionImg.width;
                let height = compressionImg.height;

                if (width > maxDimension || height > maxDimension) {
                    if (width > height) { height *= maxDimension / width; width = maxDimension; }
                    else { width *= maxDimension / height; height = maxDimension; }
                }

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = width;
                tempCanvas.height = height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(compressionImg, 0, 0, width, height);

                tempCanvas.toBlob((blob) => {
                    const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.85);
                    
                    const fileRecord = {
                        name: file.name,
                        blob: blob,
                        src: dataUrl,
                        status: 'pending',
                        detections: [],
                        hasResult: false
                    };

                    batchFiles.push(fileRecord);
                    renderThumbnails();

                    if (batchFiles.length === 1 || currentActiveIdx === -1) {
                        switchActiveView(batchFiles.length - 1);
                    }
                }, 'image/jpeg', 0.85);
            };
            compressionImg.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function renderThumbnails() {
    const container = document.getElementById('thumbnailContainer');
    document.getElementById('batchCount').innerText = batchFiles.length;
    container.innerHTML = "";

    if (batchFiles.length > 1) {
        batchSection.style.display = 'flex';
    } else {
        batchSection.style.display = 'none';
    }

    batchFiles.forEach((record, index) => {
        const card = document.createElement('div');
        card.className = `thumb-card ${record.status}`;
        if (index === currentActiveIdx) card.classList.add('active');
        
        let statusLabel = "Antre";
        if (record.status === 'processing') statusLabel = "Proses...";
        if (record.status === 'done') statusLabel = "Selesai";
        if (record.status === 'failed') statusLabel = "Gagal";

        card.innerHTML = `
            <img src="${record.src}">
            <button class="thumb-delete-btn" title="Hapus gambar ini">&times;</button>
            <div class="thumb-status-badge">${statusLabel}</div>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('thumb-delete-btn')) return;
            if (!isProcessingQueue) switchActiveView(index);
        });

        const delBtn = card.querySelector('.thumb-delete-btn');
        if (delBtn) {
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                if (!isProcessingQueue) removeImageFromBatch(index);
            });
        }

        container.appendChild(card);
    });
    updateButtons();
}

function removeImageFromBatch(index) {
    if (index < 0 || index >= batchFiles.length || isProcessingQueue) return;
    batchFiles.splice(index, 1);

    if (batchFiles.length === 0) {
        currentActiveIdx = -1;
        preview.style.display = 'none';
        preview.src = '';
        placeholder.style.display = 'block';
        if (canvas && canvas.width) ctx.clearRect(0, 0, canvas.width, canvas.height);
        document.getElementById('resultsContainer').innerHTML = "";
    } else if (index === currentActiveIdx) {
        const newActiveIdx = Math.min(index, batchFiles.length - 1);
        switchActiveView(newActiveIdx);
    } else if (index < currentActiveIdx) {
        currentActiveIdx--;
    }

    renderThumbnails();
}

function switchActiveView(index) {
    if (index < 0 || index >= batchFiles.length) return;
    currentActiveIdx = index;
    const activeRecord = batchFiles[index];

    preview.onload = () => {
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        handleResize(); 
        
        if (activeRecord.hasResult) {
            drawDetections(activeRecord.detections);
            displayTextResults(activeRecord.detections);
        } else {
            if (canvas && canvas.width) ctx.clearRect(0, 0, canvas.width, canvas.height);
            document.getElementById('resultsContainer').innerHTML = "";
        }
        updateButtons();
    };
    preview.src = activeRecord.src;
    renderThumbnails();
}


function clearAllQueue() {
    if (isProcessingQueue) return;
    
    batchFiles = [];
    currentActiveIdx = -1;
    
    preview.style.display = 'none';
    preview.src = '';
    placeholder.style.display = 'block';
    
    if (canvas && canvas.width) ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('resultsContainer').innerHTML = "";
    
    fileInput.value = "";
    if (cameraInput) cameraInput.value = "";
    
    renderThumbnails();
}

fileInput.addEventListener('change', function () { handleIncomingFiles(this.files); });
if (cameraInput) { cameraInput.addEventListener('change', function () { handleIncomingFiles(this.files); }); }

if (mediaSelectorBtn) {
    mediaSelectorBtn.addEventListener('click', () => {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768);
        if (isMobile) {
            actionSheet.style.display = 'flex';
        } else {
            fileInput.click();
        }
    });
}

function closeSheet() { actionSheet.style.display = 'none'; }
if (closeActionSheetBtn) closeActionSheetBtn.addEventListener('click', closeSheet);
actionSheet.addEventListener('click', (e) => { if (e.target === actionSheet) closeSheet(); });
if (chooseGalleryBtn) chooseGalleryBtn.addEventListener('click', () => { fileInput.click(); closeSheet(); });
if (chooseCameraBtn) chooseCameraBtn.addEventListener('click', () => { cameraInput.click(); closeSheet(); });

function handleResize() {
    if (currentActiveIdx === -1 || !preview.naturalWidth) return;

    const containerW = previewArea.getBoundingClientRect().width;
    const containerH = previewArea.getBoundingClientRect().height;
    
    const imgW = preview.naturalWidth;
    const imgH = preview.naturalHeight;

    const scaleW = containerW / imgW;
    const scaleH = containerH / imgH;
    
    scale = Math.min(scaleW, scaleH);
    if (scale > 1) scale = 1; 
    scale *= 0.95;

    translateX = (containerW - (imgW * scale)) / 2;
    translateY = (containerH - (imgH * scale)) / 2;
    
    canvas.width = imgW;
    canvas.height = imgH;
    
    updateTransform();
    
    if (batchFiles[currentActiveIdx] && batchFiles[currentActiveIdx].hasResult) {
        drawDetections(batchFiles[currentActiveIdx].detections);
    }
}
window.addEventListener('resize', handleResize);

// ==========================================================================
// 5. INTERACTIVE ZOOM & DRAG ENGINE
// ==========================================================================
zoomContainer.addEventListener("wheel", (e) => {
    if (currentActiveIdx === -1) return;
    e.preventDefault();

    const rect = previewArea.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const targetX = (mouseX - translateX) / scale;
    const targetY = (mouseY - translateY) / scale;

    const zoomSpeed = 0.1;
    if (e.deltaY < 0) { scale *= (1 + zoomSpeed); } 
    else { scale /= (1 + zoomSpeed); }

    scale = Math.max(0.1, Math.min(scale, 20));
    translateX = mouseX - targetX * scale;
    translateY = mouseY - targetY * scale;

    updateTransform();
}, { passive: false });

zoomContainer.addEventListener("mousedown", (e) => {
    if (currentActiveIdx === -1) return;
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    zoomContainer.style.cursor = "grabbing";
});

window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateTransform();
});

window.addEventListener("mouseup", () => {
    isDragging = false;
    zoomContainer.style.cursor = "grab";
});

// ==========================================================================
// 6. SEQUENTIAL ML BATCH INFERENCE CONTROLLER
// ==========================================================================
async function processBatchQueue() {
    if (batchFiles.length === 0 || isProcessingQueue) return;
    
    isProcessingQueue = true;
    updateButtons();

    const resultsSummaryContainer = document.getElementById('resultsContainer');

    for (let i = 0; i < batchFiles.length; i++) {
        if (batchFiles[i].status === 'done') continue;

        batchFiles[i].status = 'processing';
        switchActiveView(i);
        resultsSummaryContainer.innerHTML = `<div class='result'>Memproses citra ${i + 1}/${batchFiles.length}...</div>`;

        try {
            const formData = new FormData();
            formData.append("image", batchFiles[i].blob, "upload.jpg");

            const response = await fetch("/predict", { method: "POST", body: formData });
            if (!response.ok) throw new Error("Inference execution anomaly detected");
            
            const data = await response.json();

            batchFiles[i].detections = data.detections;
            batchFiles[i].hasResult = true;
            batchFiles[i].status = 'done';

            if (i === currentActiveIdx) {
                drawDetections(data.detections);
                displayTextResults(data.detections);
            }
        } catch (err) {
            console.error(err);
            batchFiles[i].status = 'failed';
            if (i === currentActiveIdx) {
                resultsSummaryContainer.innerHTML = "<div class='result' style='color: red;'>Gagal memproses gambar ini</div>";
            }
        }
        renderThumbnails();
    }

    isProcessingQueue = false;
    if (currentActiveIdx !== -1) {
        displayTextResults(batchFiles[currentActiveIdx].detections);
    }
    updateButtons();
}

function displayTextResults(detections) {
    const container = document.getElementById('resultsContainer');
    container.innerHTML = "";

    if (detections.length > 0) {
        detections.forEach((det, index) => {
            const resultItem = document.createElement('div');
            resultItem.style.marginBottom = "12px";
            resultItem.style.borderBottom = "1px solid #eee";
            resultItem.style.paddingBottom = "8px";
            
            resultItem.innerHTML = `
                <div class="result">${index + 1}. ${formatClassName(det.class_name)}</div>
                <div class="confidence">Confidence (Kepercayaan): ${det.confidence}%</div>
            `;
            container.appendChild(resultItem);
        });
    } else {
        container.innerHTML = "<div class='result'>Tidak terdeteksi nyamuk</div>";
    }
}

function drawDetections(detections) {
    if (currentActiveIdx === -1) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);

    detections.forEach(det => {
        const [x1, y1, x2, y2] = det.box;
        const boxWidth = x2 - x1;
        const boxHeight = y2 - y1;
        const boxLength = Math.sqrt(boxWidth * boxHeight); 
        
        const strokeWidth = Math.max(2, Math.min(6, boxLength * 0.015));
        const fontSize = Math.max(12, Math.min(24, boxLength * 0.05));

        ctx.strokeStyle = "#ff0000";
        ctx.lineWidth = strokeWidth;
        ctx.strokeRect(x1, y1, boxWidth, boxHeight);

        const text = `${formatClassName(det.class_name)} ${det.confidence}%`;
        ctx.font = `bold ${fontSize}px Arial`;
        const textWidth = ctx.measureText(text).width;
        
        const paddingX = fontSize * 0.4;
        const paddingY = fontSize * 0.2;
        const bannerHeight = fontSize + (paddingY * 2);

        ctx.fillStyle = "rgba(255, 0, 0, 0.85)";
        ctx.fillRect(x1 - (strokeWidth / 2), y1 - bannerHeight, textWidth + (paddingX * 2), bannerHeight);

        ctx.fillStyle = "white";
        ctx.textBaseline = "top"; 
        ctx.fillText(text, x1 - (strokeWidth / 2) + paddingX, y1 - bannerHeight + paddingY);
    });
}

function downloadImage() {
    if (currentActiveIdx === -1 || !batchFiles[currentActiveIdx].hasResult) return;
    
    drawDetections(batchFiles[currentActiveIdx].detections);
    
    const link = document.createElement("a");
    link.download = `hasil_${batchFiles[currentActiveIdx].name || Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

// ==========================================================================
// 7. DIALOG MODAL CONTROLLERS
// ==========================================================================
function openModal() { document.getElementById("infoModal").style.display = "block"; }
function closeModal() { document.getElementById("infoModal").style.display = "none"; setTimeout(handleResize, 100); }

// ==========================================================================
// 8. SERVICE WORKER BOOT INITIALIZATION
// ==========================================================================
window.addEventListener("load", () => { openModal(); });

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW failed: ', err));
    });
}

// ==========================================================================
// 9. NATIVE PWA INSTALLATION INTERCEPTORS
// ==========================================================================
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = 'inline-flex';
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt = null;
        installBtn.style.display = 'none';
    });
}

// ==========================================================================
// 10. DRAG AND DROP DESKTOP LISTENER LOGIC
// ==========================================================================
const dropOverlay = document.getElementById('dropOverlay');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    previewArea.addEventListener(eventName, (e) => e.preventDefault(), false);
});

['dragenter', 'dragover'].forEach(eventName => {
    previewArea.addEventListener(eventName, () => {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768);
        if (!isMobile && dropOverlay) dropOverlay.style.display = 'flex';
    }, false);
});

previewArea.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null || !previewArea.contains(e.relatedTarget)) {
        if (dropOverlay) dropOverlay.style.display = 'none';
    }
}, false);

previewArea.addEventListener('drop', (e) => {
    if (dropOverlay) dropOverlay.style.display = 'none';
    handleIncomingFiles(e.dataTransfer.files);
}, false);