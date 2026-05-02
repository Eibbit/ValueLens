const btnStartCapture = document.getElementById('btn-start-capture');
const btnConfirmCrop = document.getElementById('btn-confirm-crop');
const btnCancelCrop = document.getElementById('btn-cancel-crop');
const btnReselect = document.getElementById('btn-reselect');

const setupView = document.getElementById('setup-view');
const previewView = document.getElementById('preview-view');
const cropContainer = document.getElementById('crop-container');
const instructions = document.querySelector('.instructions');

const video = document.getElementById('source-video');
const cropOverlay = document.getElementById('crop-overlay');
const cropBox = document.getElementById('crop-box');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');

let mediaStream = null;
let animationFrameId = null;

// Crop State
let isDragging = false;
let isResizing = false;
let startX, startY;
let startBoxLeft, startBoxTop, startBoxWidth, startBoxHeight;
let activeHandle = null;

// The actual cropped area in video coordinates
let cropRect = { x: 0, y: 0, w: 100, h: 100 };

btnStartCapture.addEventListener('click', async () => {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            alert("Error: Screen Capture API is not available. If you are opening this file directly (file://), it might be blocked. Please run a local server (e.g., Live Server).");
            return;
        }
        
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: { 
                cursor: "always"
            },
            audio: false
        });
        
        video.srcObject = mediaStream;
        
        video.onloadedmetadata = () => {
            video.play().catch(e => console.error("Play failed:", e));
            instructions.style.display = 'none';
            cropContainer.classList.remove('hidden');
            
            // Set initial crop box
            cropBox.style.left = '20%';
            cropBox.style.top = '20%';
            cropBox.style.width = '150px';
            cropBox.style.height = '150px';
        };

        // Handle stream ending from outside (e.g. browser UI "Stop sharing" button)
        mediaStream.getVideoTracks()[0].onended = () => {
            resetApp();
        };

    } catch (err) {
        console.error("Error: ", err);
        // Only alert if it's not a user cancellation
        if (err.name !== 'NotAllowedError') {
            alert("Failed to capture screen: " + err.message);
        }
    }
});

btnCancelCrop.addEventListener('click', () => {
    resetApp();
});

btnConfirmCrop.addEventListener('click', () => {
    setupView.classList.remove('active');
    previewView.classList.add('active');
    
    // Calculate crop rectangle relative to video dimensions
    calculateCropRect();
    
    // Start drawing loop
    startPreview();
});

btnReselect.addEventListener('click', () => {
    stopPreview();
    previewView.classList.remove('active');
    setupView.classList.add('active');
});

function calculateCropRect() {
    const videoRect = video.getBoundingClientRect();
    const boxRect = cropBox.getBoundingClientRect();
    
    // Calculate scaling between actual video resolution and displayed size
    const scaleX = video.videoWidth / videoRect.width;
    const scaleY = video.videoHeight / videoRect.height;
    
    // Calculate relative coordinates
    const relX = boxRect.left - videoRect.left;
    const relY = boxRect.top - videoRect.top;
    
    // Set crop rect
    cropRect = {
        x: relX * scaleX,
        y: relY * scaleY,
        w: boxRect.width * scaleX,
        h: boxRect.height * scaleY
    };
    
    // Set canvas size matching the cropped area size
    canvas.width = cropRect.w;
    canvas.height = cropRect.h;
    
    // Set visual dimensions, maintaining aspect ratio
    const maxSize = 450;
    if (cropRect.w > maxSize || cropRect.h > maxSize) {
        if (cropRect.w > cropRect.h) {
            canvas.style.width = maxSize + 'px';
            canvas.style.height = (maxSize * (cropRect.h / cropRect.w)) + 'px';
        } else {
            canvas.style.height = maxSize + 'px';
            canvas.style.width = (maxSize * (cropRect.w / cropRect.h)) + 'px';
        }
    } else {
        canvas.style.width = cropRect.w + 'px';
        canvas.style.height = cropRect.h + 'px';
    }
}

function startPreview() {
    function draw() {
        if (!mediaStream) return;
        
        ctx.drawImage(
            video, 
            cropRect.x, cropRect.y, cropRect.w, cropRect.h, // Source rect
            0, 0, canvas.width, canvas.height // Dest rect
        );
        
        animationFrameId = requestAnimationFrame(draw);
    }
    draw();
}

function stopPreview() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function resetApp() {
    stopPreview();
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    video.srcObject = null;
    
    previewView.classList.remove('active');
    setupView.classList.add('active');
    instructions.style.display = 'block';
    cropContainer.classList.add('hidden');
}

// ---- Draggable and Resizable Logic ----
cropOverlay.addEventListener('mousedown', (e) => {
    if (e.target === cropBox) {
        isDragging = true;
    } else if (e.target.classList.contains('handle')) {
        isResizing = true;
        activeHandle = Array.from(e.target.classList).find(c => c !== 'handle');
    } else {
        return; // Clicked outside box
    }
    
    startX = e.clientX;
    startY = e.clientY;
    startBoxLeft = parseInt(cropBox.style.left || cropBox.offsetLeft);
    startBoxTop = parseInt(cropBox.style.top || cropBox.offsetTop);
    startBoxWidth = parseInt(cropBox.style.width || cropBox.offsetWidth);
    startBoxHeight = parseInt(cropBox.style.height || cropBox.offsetHeight);
    
    // Prevent default selection behavior while dragging
    e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging && !isResizing) return;
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    const overlayRect = cropOverlay.getBoundingClientRect();
    
    if (isDragging) {
        let newLeft = startBoxLeft + dx;
        let newTop = startBoxTop + dy;
        
        // Bounds checking
        if (newLeft < 0) newLeft = 0;
        if (newTop < 0) newTop = 0;
        if (newLeft + startBoxWidth > overlayRect.width) newLeft = overlayRect.width - startBoxWidth;
        if (newTop + startBoxHeight > overlayRect.height) newTop = overlayRect.height - startBoxHeight;
        
        cropBox.style.left = newLeft + 'px';
        cropBox.style.top = newTop + 'px';
    } else if (isResizing) {
        let newLeft = startBoxLeft;
        let newTop = startBoxTop;
        let newWidth = startBoxWidth;
        let newHeight = startBoxHeight;
        
        if (activeHandle.includes('e')) newWidth += dx;
        if (activeHandle.includes('s')) newHeight += dy;
        if (activeHandle.includes('w')) {
            newWidth -= dx;
            newLeft += dx;
        }
        if (activeHandle.includes('n')) {
            newHeight -= dy;
            newTop += dy;
        }
        
        // Min size
        if (newWidth < 50) { newWidth = 50; }
        if (newHeight < 50) { newHeight = 50; }
        
        // Adjust top/left if dragged from north/west to maintain correct position
        if (activeHandle.includes('w')) {
            newLeft = startBoxLeft + startBoxWidth - newWidth;
        }
        if (activeHandle.includes('n')) {
            newTop = startBoxTop + startBoxHeight - newHeight;
        }
        
        // Prevent resizing outside bounds
        if (newLeft < 0) { 
            newLeft = 0; 
            newWidth = startBoxLeft + startBoxWidth; 
            if(activeHandle.includes('n')) newTop = startBoxTop + startBoxHeight - newHeight;
        }
        if (newTop < 0) { 
            newTop = 0; 
            newHeight = startBoxTop + startBoxHeight; 
            if(activeHandle.includes('w')) newLeft = startBoxLeft + startBoxWidth - newWidth;
        }
        if (newLeft + newWidth > overlayRect.width) { 
            newWidth = overlayRect.width - newLeft; 
            if(activeHandle.includes('n')) newTop = startBoxTop + startBoxHeight - newHeight;
        }
        if (newTop + newHeight > overlayRect.height) { 
            newHeight = overlayRect.height - newTop; 
            if(activeHandle.includes('w')) newLeft = startBoxLeft + startBoxWidth - newWidth;
        }

        cropBox.style.left = newLeft + 'px';
        cropBox.style.top = newTop + 'px';
        cropBox.style.width = newWidth + 'px';
        cropBox.style.height = newHeight + 'px';
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
    activeHandle = null;
});

// Handle resize when window size changes
window.addEventListener('resize', () => {
    if (previewView.classList.contains('active')) {
        // Recalculate if window resizes, though strictly we might need to reset
        // To be safe and simple, let's just keep the canvas drawing from the same coordinates
    }
});
