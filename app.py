from flask import Flask, request, jsonify, render_template, send_from_directory
from ultralytics import YOLO
from PIL import Image
import io
import os
import torch
import time

app = Flask(__name__)

model = YOLO("best.pt")
if torch.cuda.is_available():
    model.to("cuda")
else:
    print("CUDA not available. Running on CPU.")

@app.route('/')
def home():
    return render_template("index.html")

@app.route('/sw.js')
def serve_sw():
    return send_from_directory(os.path.join(app.root_path, 'static'), 'sw.js', mimetype='application/javascript')

import time

@app.route('/predict', methods=["POST"])
def predict():
    
    if "image" not in request.files:
        print("[ERROR] Request failed: No image file found in payload.")
        return jsonify({"error": "No image uploaded"}), 400
    
    file = request.files["image"]
    print(f"Received filename: '{file.filename}'")
    
    start_time = time.time()
    
    image_bytes = file.read()
    image_rgb = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    print(f"Original Resolution: {image_rgb.width}x{image_rgb.height} pixels (RGB Channel Mode)")
    
    # print("Converting image matrix to Grayscale (L-mode)...")
    # image_gray = image_rgb.convert("L")
    
    print("Forwarding RGB image matrix to Hybrid YOLO11+ResNet18 Model...")
    inference_start = time.time()
    results = model(image_rgb)
    inference_duration = time.time() - inference_start
    print(f"Inference complete in {inference_duration:.4f} seconds.")
    
    detections = []
    print("Parsing bounding box structural layers...")
    
    for idx, box in enumerate(results[0].boxes):
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        xyxy = box.xyxy[0].tolist()
        class_name = model.names[cls_id]
        confidence_percentage = round(conf * 100, 2)
        
        print(f"   🔹 Object #{idx+1} Detected -> Species: {class_name} | Confidence: {confidence_percentage}% | Box: {[round(c, 1) for c in xyxy]}")
        
        detections.append({
            "class_id": cls_id,
            "class_name": class_name,
            "confidence": confidence_percentage,
            "box": xyxy
        })
        
    total_duration = time.time() - start_time
    print("-"*50)
    print(f"Found {len(detections)} mosquito object(s) in {total_duration:.4f} seconds total.")
    print("="*50 + "\n")
    
    return jsonify({
        "detections": detections
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7860, debug=True)