// ==========================================================================
// 1. GLOBAL STATE MANAGEMENT
// ==========================================================================
let hasImage = false;
let hasResult = false;
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
const installBtn = document.getElementById('pwaInstallBtn');

const cameraInput = document.getElementById('cameraInput');
const mediaSelectorBtn = document.getElementById('mediaSelectorBtn');
const actionSheet = document.getElementById('actionSheet');
const chooseCameraBtn = document.getElementById('chooseCameraBtn');
const chooseGalleryBtn = document.getElementById('chooseGalleryBtn');
const closeActionSheetBtn = document.getElementById('closeActionSheetBtn');

// ==========================================================================
// 3. CORE UTILITY FUNCTIONS
// ==========================================================================
function updateButtons() {
    classifyBtn.disabled = !hasImage;
    downloadBtn.disabled = !hasResult;
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
function handleImageFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        preview.src = e.target.result;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        
        preview.onload = () => {
            handleResize();
        };

        hasImage = true;
        hasResult = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        document.getElementById('resultsContainer').innerHTML = ""; 
        updateButtons();
    };
    reader.readAsDataURL(file);
}

// Listen for inputs from both slots
fileInput.addEventListener('change', function () {
    handleImageFile(this.files[0]);
});

if (cameraInput) {
    cameraInput.addEventListener('change', function () {
        handleImageFile(this.files[0]);
    });
}

// Action Sheet Open/Close UI Event Wiring
if (mediaSelectorBtn) {
    mediaSelectorBtn.addEventListener('click', () => {
        // Simple, robust mobile device detection check
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768);
        
        if (isMobile) {
            // Mobile user: Slide up the custom camera/gallery selection sheet
            actionSheet.style.display = 'flex';
        } else {
            // Desktop user: Bypass the menu and open the file explorer instantly
            fileInput.click();
        }
    });
}

function closeSheet() {
    actionSheet.style.display = 'none';
}

if (closeActionSheetBtn) closeActionSheetBtn.addEventListener('click', closeSheet);
actionSheet.addEventListener('click', (e) => {
    if (e.target === actionSheet) closeSheet();
});

// Trigger the hidden native inputs from our stylized sheet buttons
if (chooseGalleryBtn) {
    chooseGalleryBtn.addEventListener('click', () => {
        fileInput.click();
        closeSheet();
    });
}

if (chooseCameraBtn) {
    chooseCameraBtn.addEventListener('click', () => {
        cameraInput.click();
        closeSheet();
    });
}

window.addEventListener('resize', handleResize);

// ==========================================================================
// 5. INTERACTIVE ZOOM & DRAG ENGINE
// ==========================================================================
zoomContainer.addEventListener("wheel", (e) => {
    if (!hasImage) return;
    e.preventDefault();

    const rect = previewArea.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const targetX = (mouseX - translateX) / scale;
    const targetY = (mouseY - translateY) / scale;

    const zoomSpeed = 0.1;
    if (e.deltaY < 0) {
        scale *= (1 + zoomSpeed);
    } else {
        scale /= (1 + zoomSpeed);
    }

    scale = Math.max(0.1, Math.min(scale, 20));

    translateX = mouseX - targetX * scale;
    translateY = mouseY - targetY * scale;

    updateTransform();
}, { passive: false });

zoomContainer.addEventListener("mousedown", (e) => {
    if (!hasImage) return;
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
// 6. ML INFERENCE GATEWAY & INTERFACE DRAWING
// ==========================================================================
async function classifyImage() {
    if (!hasImage) return;
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append("image", file);

    const container = document.getElementById('resultsContainer');
    container.innerHTML = "<div class='result'>Memproses...</div>";
    
    try {
        const response = await fetch("/predict", { method: "POST", body: formData });
        const data = await response.json();
        
        drawDetections(data.detections);
        container.innerHTML = "";

        if (data.detections.length > 0) {
            data.detections.forEach((det, index) => {
                const resultItem = document.createElement('div');
                resultItem.style.marginBottom = "12px";
                resultItem.style.borderBottom = "1px solid #eee";
                resultItem.style.paddingBottom = "8px";
                
                resultItem.innerHTML = `
                    <div class="result">${index + 1}. ${formatClassName(det.class_name)}</div>
                    <div class="confidence">Confidence: ${det.confidence}%</div>
                `;
                container.appendChild(resultItem);
            });
        } else {
            container.innerHTML = "<div class='result'>Tidak terdeteksi nyamuk</div>";
        }
        
        hasResult = true;
        updateButtons();
    } catch (err) {
        container.innerHTML = "<div class='result' style='color: red;'>Gagal menghubungi server</div>";
    }
}

function drawDetections(detections) {
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
        ctx.fillRect(
            x1 - (strokeWidth / 2), 
            y1 - bannerHeight, 
            textWidth + (paddingX * 2), 
            bannerHeight
        );

        ctx.fillStyle = "white";
        ctx.textBaseline = "top"; 
        ctx.fillText(
            text, 
            x1 - (strokeWidth / 2) + paddingX, 
            y1 - bannerHeight + paddingY
        );
    });
}

function downloadImage() {
    if (!hasResult) return;
    const link = document.createElement("a");
    link.download = `hasil_${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

// ==========================================================================
// 7. DIALOG MODAL CONTROLLERS
// ==========================================================================
function openModal() {
    document.getElementById("infoModal").style.display = "block";
}

function closeModal() {
    document.getElementById("infoModal").style.display = "none";
    setTimeout(handleResize, 100); 
}

// ==========================================================================
// 8. SERVICE WORKER & APPLICATION CORE SYSTEM BOOT
// ==========================================================================
window.addEventListener("load", () => {
    openModal();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('PWA Service Worker registered safely from root scope!', reg))
            .catch(err => console.log('Service Worker registration failed: ', err));
    });
}

// ==========================================================================
// 9. NATIVE PWA BANNER INSTALLATION INTERCEPTORS
// ==========================================================================
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) {
        installBtn.style.display = 'inline-flex';
    }
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
      
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
        installBtn.style.display = 'none';
    });
}

window.addEventListener('appinstalled', (evt) => {
    console.log('PWA was successfully installed on the device.');
    if (installBtn) {
        installBtn.style.display = 'none';
    }
});